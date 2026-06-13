import React, { useCallback, useEffect, useRef, useState } from 'react';
import { socketService } from '../services/socket.service';
import { useLockStore, ProductSnapshot } from '../store/useLockStore';
import { useAuthStore } from '../store/useAuthStore';
import {
    AlertTriangle, CheckCircle, Clock, GitMerge,
    Loader2, Save, ShieldAlert, X, Undo2, FileText,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProductEditModalProps {
    productId: string;
    currentUser: string;
    isOpen: boolean;
    onClose: () => void;
    onSaved?: (updated: ProductSnapshot) => void;
}

interface ProductData {
    name: string;
    description: string;
    version: number;
}

interface ConflictSnapshot {
    serverName: string;
    serverDescription: string;
    serverVersion: number;
}

interface DraftInfo {
    draftName: string;
    draftDescription: string;
    baseVersion: number;
    savedAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

// ─── Sub-component: Countdown Timer ──────────────────────────────────────────

interface CountdownProps {
    timeLeft: number;
}
const Countdown: React.FC<CountdownProps> = ({ timeLeft }) => {
    const color =
        timeLeft < 120 ? 'text-red-400' :
            timeLeft < 600 ? 'text-amber-400' :
                'text-emerald-400';
    return (
        <span className={`flex items-center gap-1 text-xs font-mono font-semibold ${color} transition-colors duration-500`}>
            <Clock size={12} />
            {formatTime(timeLeft)}
        </span>
    );
};

// ─── Sub-component: 3-Way Merge Row ──────────────────────────────────────────

interface MergeRowProps {
    label: string;
    baseValue: string;
    yourValue: string;
    serverValue: string;
    resolved: string | null;
    onPick: (value: string) => void;
}

const MergeRow: React.FC<MergeRowProps> = ({
    label, baseValue, yourValue, serverValue, resolved, onPick,
}) => {
    const isSameField = yourValue === serverValue;
    return (
        <div className="flex flex-col gap-1.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">{label}</p>
            <div className={`grid gap-2 ${isSameField ? 'grid-cols-1' : 'grid-cols-3'}`}>
                {/* Base (original when you opened) */}
                <div className="flex flex-col gap-1">
                    <p className="text-[9px] font-semibold text-white/30 uppercase">Base</p>
                    <div className="px-2.5 py-2 rounded-lg bg-white/5 border border-white/8 text-xs text-white/50 min-h-[40px]">
                        {baseValue || <em className="text-white/20">empty</em>}
                    </div>
                </div>

                {!isSameField && (
                    <>
                        {/* Yours */}
                        <div className="flex flex-col gap-1">
                            <p className="text-[9px] font-semibold text-indigo-400 uppercase">Yours</p>
                            <button
                                onClick={() => onPick(yourValue)}
                                className={`px-2.5 py-2 rounded-lg border text-xs text-left min-h-[40px] transition-all duration-150
                  ${resolved === yourValue
                                        ? 'bg-indigo-500/25 border-indigo-400/50 text-indigo-200'
                                        : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-300 hover:bg-indigo-500/20'
                                    }`}
                            >
                                {yourValue || <em className="text-indigo-300/40">empty</em>}
                            </button>
                        </div>

                        {/* Server */}
                        <div className="flex flex-col gap-1">
                            <p className="text-[9px] font-semibold text-amber-400 uppercase">Server</p>
                            <button
                                onClick={() => onPick(serverValue)}
                                className={`px-2.5 py-2 rounded-lg border text-xs text-left min-h-[40px] transition-all duration-150
                  ${resolved === serverValue
                                        ? 'bg-amber-500/25 border-amber-400/50 text-amber-200'
                                        : 'bg-amber-500/10 border-amber-500/20 text-amber-300 hover:bg-amber-500/20'
                                    }`}
                            >
                                {serverValue || <em className="text-amber-300/40">empty</em>}
                            </button>
                        </div>
                    </>
                )}
            </div>
            {isSameField && (
                <p className="text-[10px] text-emerald-400/70 flex items-center gap-1">
                    <CheckCircle size={10} /> No conflict — values are identical
                </p>
            )}
        </div>
    );
};

// ─── Main Modal ───────────────────────────────────────────────────────────────

const LOCK_TTL = 1800; // 30 minutes in seconds
const DRAFT_INTERVAL = 120_000; // 2 minutes in ms

export const ProductEditModal: React.FC<ProductEditModalProps> = ({
    productId,
    currentUser,
    isOpen,
    onClose,
    onSaved,
}) => {
    const [data, setData] = useState<ProductData>({ name: '', description: '', version: 1 });
    // Remember the values as they were when we first fetched (for the "Base" column)
    const baseDataRef = useRef<ProductData>({ name: '', description: '', version: 1 });

    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saveSuccess, setSaveSuccess] = useState(false);

    // ── Kill switch ──────────────────────────────────────────────────────────
    const [killed, setKilled] = useState(false);

    // ── 3-Way Merge ─────────────────────────────────────────────────────────
    const [conflict, setConflict] = useState<ConflictSnapshot | null>(null);
    const [resolvedName, setResolvedName] = useState<string | null>(null);
    const [resolvedDesc, setResolvedDesc] = useState<string | null>(null);

    // ── Draft & restore banner ───────────────────────────────────────────────
    const [foundDraft, setFoundDraft] = useState<DraftInfo | null>(null);
    const [draftDismissed, setDraftDismissed] = useState(false);

    // ── Countdown timer ──────────────────────────────────────────────────────
    const [timeLeft, setTimeLeft] = useState(LOCK_TTL);

    const [isSavingDraft, setIsSavingDraft] = useState(false);
    const [draftSaved, setDraftSaved] = useState(false);
    const [lastAutoSaveTime, setLastAutoSaveTime] = useState<string | null>(null);

    const handleSaveDraft = async (isKillSwitchRescue: boolean = true) => {
        setIsSavingDraft(true);
        try {
            const draftObject = {
                userId: currentUser,
                ownerName: useAuthStore.getState().currentUser.name,
                draftName: data.name,
                draftDescription: data.description,
                baseVersion: data.version,
                isKillSwitchRescue,
            };
            console.log('Sending Draft:', draftObject);
            const res = await fetch(`http://localhost:3000/products/${productId}/draft`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(draftObject),
            });
            if (res.ok) {
                setDraftSaved(true);
                setLastAutoSaveTime(new Date().toLocaleTimeString());
            } else {
                const error = await res.json();
                throw new Error(JSON.stringify(error));
            }
        } catch (err) {
            console.error("Error saving draft:", err);
            // best-effort
        } finally {
            setIsSavingDraft(false);
        }
    };

    const isSavingRef = useRef(false);
    const setSavingState = useCallback((v: boolean) => {
        isSavingRef.current = v;
        setIsSaving(v);
    }, []);

    const currentUserRole = useAuthStore((s) => s.currentUser.role);
    const updateLockMeta = useLockStore((s) => s.updateLockMeta);
    const updateProductInStore = useLockStore((s) => s.updateProductInStore);

    // ── Reset everything when modal opens ────────────────────────────────────
    useEffect(() => {
        if (isOpen) {
            setKilled(false);
            setConflict(null);
            setResolvedName(null);
            setResolvedDesc(null);
            setFoundDraft(null);
            setDraftDismissed(false);
            setTimeLeft(LOCK_TTL);
        }
    }, [isOpen, productId]);

    // ── Kill Switch & Emergency Disconnect listeners ─────────────────────────
    useEffect(() => {
        if (!isOpen) return;

        const handleEntityUnlocked = (payload: { entityId: string }) => {
            if (payload?.entityId !== productId) return;
            if (!isSavingRef.current) {
                setKilled(true);
                setSavingState(false);
                setError(null);
                setSaveSuccess(false);
            }
        };

        const handleDisconnect = async () => {
            if (!isSavingRef.current) {
                console.warn("[Emergency Socket Drop] Triggering immediate protective save-as-draft");
                // The socket died, which means our ping failed. Trigger explicit disconnect draft payload.
                await handleSaveDraft(true);
                onClose(); // Prevent user from continuing on dropped UI
            }
        };

        socketService.onEvent('entityUnlocked', handleEntityUnlocked);
        socketService.onEvent('disconnect', handleDisconnect);
        return () => {
            socketService.offEvent('entityUnlocked', handleEntityUnlocked);
            socketService.offEvent('disconnect', handleDisconnect);
        };
    }, [isOpen, productId, setSavingState, onClose]);

    // ── Countdown timer ──────────────────────────────────────────────────────
    useEffect(() => {
        if (!isOpen || killed) return;
        const t = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    setKilled(true); // lock expired
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(t);
    }, [isOpen, killed]);

    // ── Fetch initial data + check for existing draft ─────────────────────────
    useEffect(() => {
        if (!isOpen) return;
        let mounted = true;
        setLoading(true);
        setError(null);
        setSaveSuccess(false);
        setSavingState(false);

        Promise.all([
            fetch(`http://localhost:3000/products/${productId}`).then(r => r.json()),
            fetch(`http://localhost:3000/products/${productId}/draft?userId=${encodeURIComponent(currentUser)}`).then(r => r.json()),
        ]).then(([productJson, draftJson]) => {
            if (!mounted) return;
            const productData: ProductData = {
                name: productJson.name ?? '',
                description: productJson.description ?? '',
                version: productJson.version ?? 1,
            };
            setData(productData);
            baseDataRef.current = productData;

            // Check if a draft exists and differs from the DB values
            if (
                draftJson?.draftName !== undefined &&
                draftJson?.draftName !== null &&
                draftJson?.savedAt &&
                (draftJson.draftName !== productData.name ||
                    draftJson.draftDescription !== productData.description)
            ) {
                setFoundDraft({
                    draftName: draftJson.draftName,
                    draftDescription: draftJson.draftDescription,
                    baseVersion: draftJson.baseVersion,
                    savedAt: draftJson.savedAt,
                });
            }
            setLoading(false);
        }).catch(err => {
            if (!mounted) return;
            setError(err.message);
            setLoading(false);
        });

        return () => { mounted = false; };
    }, [isOpen, productId, currentUser, setSavingState]);

    // ── Heartbeat (60s) — resets countdown on success ────────────────────────
    useEffect(() => {
        if (!isOpen || killed) return;
        const t = setInterval(() => {
            socketService.heartbeat(productId, currentUser);
            // Reset countdown — heartbeat extends Redis TTL to 30min again
            setTimeLeft(LOCK_TTL);
        }, 60_000);
        return () => clearInterval(t);
    }, [isOpen, productId, currentUser, killed]);

    // ── Auto-save draft every 2 minutes ──────────────────────────────────────
    useEffect(() => {
        if (!isOpen || loading || killed) return;
        const t = setInterval(async () => {
            try {
                const res = await fetch(`http://localhost:3000/products/${productId}/draft`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        userId: currentUser,
                        ownerName: useAuthStore.getState().currentUser.name,
                        draftName: data.name,
                        draftDescription: data.description,
                        baseVersion: data.version,
                    }),
                });
                if (res.ok) {
                    setLastAutoSaveTime(new Date().toLocaleTimeString());
                }
            } catch {
                // Non-fatal — draft saves are best-effort
            }
        }, DRAFT_INTERVAL);
        return () => clearInterval(t);
    }, [isOpen, loading, killed, productId, currentUser, data]);

    // ── Restore draft ────────────────────────────────────────────────────────
    const handleRestoreDraft = useCallback(() => {
        if (!foundDraft) return;
        setData(d => ({ ...d, name: foundDraft.draftName, description: foundDraft.draftDescription }));
        setFoundDraft(null);
        setDraftDismissed(true);
    }, [foundDraft]);

    // ── Cancel / X ───────────────────────────────────────────────────────────
    const handleCancel = useCallback(() => {
        if (isSavingRef.current) return;
        if (!killed) socketService.releaseLock(productId, currentUser, currentUserRole);
        onClose();
    }, [productId, currentUser, currentUserRole, onClose, killed]);

    // ── User explicitly closes the "Force Unlocked" modal window WITHOUT clicking Save As Draft
    const handleKilledClose = useCallback(() => {
        if (isSavingRef.current) return;

        // They gave up their work. Inform the server to drop any pending draft for this UUID.
        fetch(`http://localhost:3000/products/${productId}/draft?userId=${encodeURIComponent(currentUser)}`, {
            method: 'DELETE'
        }).catch(() => { });

        onClose();
    }, [productId, currentUser, onClose]);

    // ── Dismiss conflict, go back to editing ─────────────────────────────────
    const handleDismissConflict = useCallback(() => {
        setConflict(null);
        setResolvedName(null);
        setResolvedDesc(null);
    }, []);

    // ── Save with resolved conflict values ────────────────────────────────────
    const handleSaveResolved = useCallback(async () => {
        if (!conflict || resolvedName === null || resolvedDesc === null) return;
        setSavingState(true);
        setError(null);

        try {
            const res = await fetch(`http://localhost:3000/products/${productId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: resolvedName,
                    description: resolvedDesc,
                    version: conflict.serverVersion,        // use the server's version
                    lastEditedBy: currentUser,
                }),
            });

            let body: any = {};
            try { body = await res.json(); } catch { /* empty body */ }

            if (res.status === 403) { setKilled(true); return; }
            if (!res.ok) throw new Error(body?.message ?? `Server error (HTTP ${res.status})`);

            const snapshot: ProductSnapshot = {
                id: String(productId),
                name: body.name ?? resolvedName,
                description: body.description ?? resolvedDesc,
                version: body.version ?? conflict.serverVersion + 1,
                lastEditedBy: body.lastEditedBy ?? currentUser,
            };

            setData({ name: snapshot.name, description: snapshot.description, version: snapshot.version });
            updateProductInStore(snapshot);
            updateLockMeta(productId, { version: snapshot.version });
            onSaved?.(snapshot);
            setSaveSuccess(true);
            setConflict(null);

            // Clear draft after successful save
            fetch(`http://localhost:3000/products/${productId}/draft?userId=${encodeURIComponent(currentUser)}`,
                { method: 'DELETE' }
            ).catch(() => { });

            socketService.releaseLock(productId, currentUser, currentUserRole);
            onClose();
        } catch (err: any) {
            setError(err.message ?? 'An unexpected error occurred.');
        } finally {
            setSavingState(false);
        }
    }, [conflict, resolvedName, resolvedDesc, productId, currentUser, currentUserRole,
        updateLockMeta, updateProductInStore, onSaved, onClose, setSavingState]);

    // ── Main Save ─────────────────────────────────────────────────────────────
    const handleSave = useCallback(async () => {
        if (isSavingRef.current || loading || killed) return;
        setSavingState(true);
        setError(null);
        setSaveSuccess(false);

        try {
            const res = await fetch(`http://localhost:3000/products/${productId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: data.name,
                    description: data.description,
                    version: data.version,
                    lastEditedBy: currentUser,
                }),
            });

            let body: any = {};
            try { body = await res.json(); } catch { /* empty */ }

            // ── 409 Conflict → enter 3-way merge ──────────────────────────────
            if (res.status === 409) {
                setConflict({
                    serverName: body?.serverName ?? '',
                    serverDescription: body?.serverDescription ?? '',
                    serverVersion: body?.serverVersion ?? data.version,
                });
                // Auto-pick fields that are identical between yours and server
                if (data.name === body?.serverName) setResolvedName(data.name);
                if (data.description === body?.serverDescription) setResolvedDesc(data.description);
                return;
            }

            // ── 403 Forbidden → kill switch ───────────────────────────────────
            if (res.status === 403) { setKilled(true); return; }

            // ── Other errors ──────────────────────────────────────────────────
            if (!res.ok) throw new Error(body?.message ?? `Server error (HTTP ${res.status})`);

            // ── Success ───────────────────────────────────────────────────────
            const snapshot: ProductSnapshot = {
                id: String(productId),
                name: body.name ?? data.name,
                description: body.description ?? data.description,
                version: body.version ?? data.version + 1,
                lastEditedBy: body.lastEditedBy ?? currentUser,
            };

            setData({ name: snapshot.name, description: snapshot.description, version: snapshot.version });
            updateProductInStore(snapshot);
            updateLockMeta(productId, { version: snapshot.version });
            onSaved?.(snapshot);
            setSaveSuccess(true);

            // Clear draft
            fetch(`http://localhost:3000/products/${productId}/draft?userId=${encodeURIComponent(currentUser)}`,
                { method: 'DELETE' }
            ).catch(() => { });

            socketService.releaseLock(productId, currentUser, currentUserRole);
            onClose();

        } catch (err: any) {
            setError(err.message ?? 'An unexpected error occurred. Please try again.');
        } finally {
            setSavingState(false);
        }
    }, [loading, killed, productId, currentUser, currentUserRole, data,
        updateLockMeta, updateProductInStore, onSaved, onClose, setSavingState]);

    if (!isOpen) return null;

    const isDisabled = isSaving || killed || !!conflict;
    const mergeAllResolved = resolvedName !== null && resolvedDesc !== null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className={`glass-card w-full max-w-xl p-6 flex flex-col gap-5 relative shadow-2xl transition-all duration-300
                ${killed
                    ? 'ring-2 ring-red-500/60'
                    : conflict
                        ? 'ring-2 ring-amber-500/60'
                        : 'ring-1 ring-white/10'}`}>

                {/* ── Header ── */}
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className={`text-xl font-bold tracking-tight ${killed ? 'text-red-300' : conflict ? 'text-amber-300' : 'text-white'}`}>
                            {killed ? 'Session Terminated' : conflict ? 'Conflict Detected' : 'Edit Product'}
                        </h2>
                        <p className="text-xs text-indigo-300 mt-1 font-mono">
                            ID:&nbsp;{productId}&nbsp;·&nbsp;v{data.version}
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        {/* Countdown timer */}
                        {!killed && !conflict && <Countdown timeLeft={timeLeft} />}
                        <button
                            onClick={killed ? handleKilledClose : handleCancel}
                            disabled={isSaving && !killed}
                            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/50 hover:text-white
                                       transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* ── Kill Switch Banner ── */}
                {killed && (
                    <div className="flex items-start gap-3 p-4 rounded-xl bg-red-600/15 border border-red-500/40 text-red-300">
                        <ShieldAlert size={20} className="shrink-0 mt-0.5 text-red-400" />
                        <div>
                            <p className="text-sm font-bold text-red-300">Force-Unlock Detected</p>
                            <p className="text-xs text-red-300/80 leading-relaxed mt-0.5">
                                An administrator has released this lock. You may now Save as Draft for administrative review.
                            </p>
                        </div>
                    </div>
                )}

                {/* ── Draft Found Banner ── */}
                {foundDraft && !draftDismissed && !conflict && !killed && (
                    <div className="flex items-start gap-3 p-3.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30">
                        <FileText size={16} className="shrink-0 mt-0.5 text-indigo-400" />
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-indigo-300">Unsaved Draft Found</p>
                            <p className="text-[11px] text-white/50 mt-0.5">
                                Auto-saved {new Date(foundDraft.savedAt).toLocaleTimeString()} — restore your previous edits?
                            </p>
                        </div>
                        <div className="flex gap-2 shrink-0">
                            <button
                                onClick={handleRestoreDraft}
                                className="px-2.5 py-1 text-[11px] font-semibold rounded-lg
                                           bg-indigo-500/20 text-indigo-300 border border-indigo-500/30
                                           hover:bg-indigo-500/30 transition-all"
                            >
                                <Undo2 size={11} className="inline mr-1" />Restore
                            </button>
                            <button
                                onClick={() => { setFoundDraft(null); setDraftDismissed(true); }}
                                className="px-2.5 py-1 text-[11px] font-semibold rounded-lg
                                           bg-white/5 text-white/40 border border-white/10
                                           hover:bg-white/10 transition-all"
                            >
                                Dismiss
                            </button>
                        </div>
                    </div>
                )}

                {/* ── 3-Way Merge View ── */}
                {conflict && !killed && (
                    <div className="flex flex-col gap-4">
                        <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25">
                            <GitMerge size={16} className="text-amber-400 shrink-0" />
                            <div>
                                <p className="text-xs font-bold text-amber-300">Conflict Resolution Required</p>
                                <p className="text-[11px] text-amber-300/70 mt-0.5">
                                    Another user saved while you were editing. Click the value you want to keep for each field.
                                </p>
                            </div>
                        </div>

                        <MergeRow
                            label="Name"
                            baseValue={baseDataRef.current.name}
                            yourValue={data.name}
                            serverValue={conflict.serverName}
                            resolved={resolvedName}
                            onPick={setResolvedName}
                        />
                        <MergeRow
                            label="Description"
                            baseValue={baseDataRef.current.description}
                            yourValue={data.description}
                            serverValue={conflict.serverDescription}
                            resolved={resolvedDesc}
                            onPick={setResolvedDesc}
                        />

                        <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
                            <button
                                onClick={handleDismissConflict}
                                className="px-4 py-2 text-sm font-medium text-white/60 hover:text-white
                                           rounded-lg hover:bg-white/5 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveResolved}
                                disabled={!mergeAllResolved || isSaving}
                                className="flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-lg
                                           bg-amber-500 hover:bg-amber-600 text-black
                                           shadow-[0_0_15px_rgba(245,158,11,0.35)]
                                           disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                            >
                                {isSaving
                                    ? <><Loader2 size={16} className="animate-spin" />&nbsp;Saving…</>
                                    : <><GitMerge size={16} />&nbsp;Save Resolved</>
                                }
                            </button>
                        </div>
                    </div>
                )}

                {/* ── Normal editing form ── */}
                {!conflict && (
                    <>
                        {/* Success flash */}
                        {saveSuccess && !killed && (
                            <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10
                                            border border-emerald-500/20 text-emerald-300 text-sm">
                                <CheckCircle size={16} className="shrink-0" />
                                <span>Saved — releasing lock…</span>
                            </div>
                        )}

                        {/* Error */}
                        {error && !killed && (
                            <div className="flex items-start gap-3 p-3 rounded-lg bg-rose-500/10
                                            border border-rose-500/20 text-rose-300 text-sm">
                                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                                <p>{error}</p>
                            </div>
                        )}

                        {/* Form / Loading skeleton */}
                        {loading ? (
                            <div className="py-12 flex justify-center">
                                <div className="w-6 h-6 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                            </div>
                        ) : (
                            <div className="flex flex-col gap-4">
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">Name</label>
                                    <input
                                        type="text"
                                        value={data.name}
                                        onChange={e => setData(d => ({ ...d, name: e.target.value }))}
                                        disabled={isDisabled}
                                        className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2.5
                                                   text-white text-sm focus:outline-none focus:border-indigo-500/50
                                                   focus:bg-white/5 transition-all
                                                   disabled:opacity-40 disabled:cursor-not-allowed disabled:select-none"
                                        placeholder="Product Name"
                                    />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">Description</label>
                                    <textarea
                                        value={data.description}
                                        onChange={e => setData(d => ({ ...d, description: e.target.value }))}
                                        disabled={isDisabled}
                                        rows={3}
                                        className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2.5
                                                   text-white text-sm focus:outline-none focus:border-indigo-500/50
                                                   focus:bg-white/5 transition-all resize-none
                                                   disabled:opacity-40 disabled:cursor-not-allowed disabled:select-none"
                                        placeholder="Product description…"
                                    />
                                </div>
                            </div>
                        )}

                        {/* Footer */}
                        <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
                            {killed ? (
                                <>
                                    <button
                                        onClick={() => handleSaveDraft(true)}
                                        disabled={isSavingDraft || draftSaved}
                                        className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white rounded-lg
                                                   bg-indigo-500/30 border border-indigo-500/40 hover:bg-indigo-500/45 transition-all
                                                   disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isSavingDraft ? <><Loader2 size={16} className="animate-spin" />&nbsp;Saving…</>
                                            : draftSaved ? <><CheckCircle size={16} className="text-emerald-400" />&nbsp;Draft Saved!</>
                                                : <><Save size={16} />&nbsp;Save as Draft</>}
                                    </button>
                                    <button
                                        onClick={onClose}
                                        disabled={isSavingDraft}
                                        className="px-5 py-2 text-sm font-semibold text-white rounded-lg
                                                   bg-red-600/30 border border-red-500/40 hover:bg-red-600/45 transition-all
                                                   disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        Close
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button
                                        onClick={handleCancel}
                                        disabled={isSaving}
                                        className="px-4 py-2 text-sm font-medium text-white/70 hover:text-white
                                                   rounded-lg hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleSave}
                                        disabled={loading || isSaving}
                                        className="flex items-center gap-2 px-5 py-2 bg-indigo-500 hover:bg-indigo-600 text-white
                                                   text-sm font-semibold rounded-lg shadow-[0_0_15px_rgba(99,102,241,0.4)]
                                                   disabled:opacity-50 disabled:cursor-not-allowed transition-all min-w-[135px] justify-center"
                                    >
                                        {isSaving
                                            ? <><Loader2 size={16} className="animate-spin" />&nbsp;Saving…</>
                                            : <><Save size={16} />&nbsp;Save Changes</>
                                        }
                                    </button>
                                </>
                            )}
                        </div>
                        {/* Auto-Save Last Time Footer */}
                        {lastAutoSaveTime && !conflict && !killed && !loading && (
                            <div className="absolute bottom-1 right-6 text-[10px] text-white/30 font-mono tracking-widest uppercase">
                                Draft auto-saved at <span className="text-white/40 font-bold">{lastAutoSaveTime}</span>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};
