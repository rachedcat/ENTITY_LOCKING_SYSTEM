import React, { useEffect, useState } from 'react';
import { Pickaxe, Save, X, Trash2, Loader2, FileText, AlertTriangle } from 'lucide-react';
import { useDraftStore, PendingDraftSummary } from '../store/useDraftStore';
import { useAuthStore } from '../store/useAuthStore';
import { ProductSnapshot } from '../store/useLockStore';

interface ReviewDraftModalProps {
    draft: PendingDraftSummary;
    originalProduct: ProductSnapshot;
    onClose: () => void;
}

export const ReviewDraftModal: React.FC<ReviewDraftModalProps> = ({ draft, originalProduct, onClose }) => {
    const currentUser = useAuthStore((s) => s.currentUser);
    const clearActiveDraft = useDraftStore((s) => s.clearActiveDraft);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [success, setSuccess] = useState<string | null>(null);

    // Hydration State
    const [isLoading, setIsLoading] = useState(true);
    const [hydratedDraft, setHydratedDraft] = useState<{ draftName: string | null; draftDescription: string | null } | null>(null);

    // Handlers mapped to the 3-column UI selections
    const [finalName, setFinalName] = useState(originalProduct.name);
    const [finalDescription, setFinalDescription] = useState(originalProduct.description);

    useEffect(() => {
        let mounted = true;
        const fetchDraftData = async () => {
            try {
                const res = await fetch(`http://localhost:3000/products/${draft.productId}/draft?userId=${draft.userId}`);
                if (!res.ok) throw new Error('Failed to fetch draft full payload');
                const data = await res.json();

                if (!mounted) return;

                if (data.draftName !== undefined) {
                    setHydratedDraft(data);
                    setFinalName(data.draftName !== null ? data.draftName : originalProduct.name);
                    setFinalDescription(data.draftDescription !== null ? data.draftDescription : originalProduct.description);
                } else {
                    setHydratedDraft(null); // Explicitly mark as empty
                }
            } catch (err) {
                console.error('Data hydration failed:', err);
                if (mounted) setHydratedDraft(null);
            } finally {
                if (mounted) setIsLoading(false);
            }
        };
        fetchDraftData();
        return () => { mounted = false; };
    }, [draft?.productId, draft?.userId, originalProduct]);

    // -- GUARD CLAUSE: Prevents 'blank' white screen unmount crashes --
    if (!draft) return null;

    const handleResolve = async (action: 'commit' | 'discard') => {
        setIsSubmitting(true);
        try {
            if (action === 'commit') {
                const putRes = await fetch(`http://localhost:3000/products/${draft.productId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: finalName,
                        description: finalDescription,
                        version: originalProduct.version, // Use base version
                        lastEditedBy: currentUser.id, // Current Admin asserting changes
                        userRole: 'admin', // The kill-switch override flag
                    }),
                });
                if (!putRes.ok) throw new Error('Failed to commit product changes');
            }

            // After product save (or if discarding), call DELETE explicitly to drop the draft row immediately
            const res = await fetch(`http://localhost:3000/products/${draft.productId}/draft?userId=${decodeURIComponent(draft.userId)}`, {
                method: 'DELETE',
            });

            if (res.ok) {
                // Step A: Clear draft natively from memory so the component isn't holding dead logic
                clearActiveDraft(draft.productId.toString());

                // Step C (queued): Drop the Dashboard UI badge actively in the background
                window.dispatchEvent(new Event('forceDashboardRefresh'));

                // Show Brief Success UI
                setSuccess(action === 'commit' ? 'Successfully Committed!' : 'Draft Discarded.');

                // Step B: Set Open False (Unmount) dynamically.
                setTimeout(() => {
                    onClose();
                }, 1250);
            } else {
                throw new Error('Failed to resolve draft');
            }
        } catch (error) {
            console.error(error);
            setIsSubmitting(false); // Only re-enable forms on error
        }
    };

    if (isLoading) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 size={32} className="animate-spin text-amber-500" />
                    <p className="text-white/60 font-semibold text-sm">Hydrating Draft Payload...</p>
                </div>
            </div>
        );
    }

    if (success) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                <div className="glass-card shadow-2xl rounded-2xl p-8 flex flex-col items-center gap-4 border border-emerald-500/20 bg-emerald-500/5 min-w-[300px]">
                    <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex flex-col items-center justify-center text-emerald-400">
                        <Save size={28} />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-emerald-300 text-center">{success}</h3>
                        <p className="text-xs text-emerald-300/60 mt-2 text-center">Changes have been synced to the database.</p>
                    </div>
                </div>
            </div>
        );
    }

    // Compute conflict state natively
    const hasConflict = draft.baseVersion != null && originalProduct.version > draft.baseVersion;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className={`glass-card w-full ${hasConflict ? 'max-w-6xl' : 'max-w-5xl'} rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border ${hasConflict ? 'border-rose-500/30' : 'border-amber-500/20'}`}>
                {/* Header */}
                <div className={`flex items-center justify-between px-6 py-4 border-b border-white/5 ${hasConflict ? 'bg-rose-500/10' : 'bg-amber-500/5'}`}>
                    <div className="flex items-center gap-3">
                        <div className={`flex items-center justify-center w-10 h-10 rounded-xl border ${hasConflict ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' : 'bg-amber-500/10 border-amber-500/20 text-amber-400'}`}>
                            {hasConflict ? <AlertTriangle size={18} /> : <Pickaxe size={18} />}
                        </div>
                        <div>
                            <h2 className="text-sm font-semibold text-white">
                                {hasConflict ? 'Resolve Version Conflict (3-Way Merge)' : 'Review Force-Unlocked Draft'}
                            </h2>
                            <p className="text-xs text-white/50 mt-0.5 flex items-center gap-1.5">
                                Authored by {draft.ownerName} (ID: {draft.userId}) — Product #{draft.productId}
                                {draft.lockDuration && (
                                    <span className="ml-2 font-mono bg-white/10 px-1.5 py-0.5 rounded text-[10px] text-white/60">
                                        Time Spent: {Math.floor(draft.lockDuration / 60)}:{String(draft.lockDuration % 60).padStart(2, '0')}
                                    </span>
                                )}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} disabled={isSubmitting} className="p-2 mr-[-8px] text-white/40 hover:text-white transition-colors hover:bg-white/5 rounded-lg active:scale-95 disabled:opacity-50">
                        <X size={18} />
                    </button>
                </div>

                {/* Body (3-cols) */}
                <div className="p-6 overflow-y-auto flex-1 custom-scrollbar space-y-8">
                    {/* Intro text */}
                    {hydratedDraft === null ? (
                        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-xs text-red-200/90 leading-relaxed">
                            <strong className="text-red-300">Draft found but contains no changes.</strong> The user either
                            did not type anything before being unlocked, or the draft data was lost. You may discard this safely.
                        </div>
                    ) : (
                        <div className={`border rounded-xl p-4 text-xs leading-relaxed ${hasConflict ? 'bg-rose-500/10 border-rose-500/20 text-rose-200/90' : 'bg-amber-500/10 border-amber-500/20 text-amber-200/90'}`}>
                            {hasConflict ? (
                                <>
                                    <strong className="text-rose-300">Version Conflict Detected!</strong> The live database was updated to v{originalProduct.version} while this user was editing from v{draft.baseVersion}.
                                    Please merge carefully. Select the final values you wish to persist on the right and click <strong>Commit Draft</strong>.
                                </>
                            ) : (
                                <>
                                    This user was force-unlocked while editing. Their auto-saved draft is shown below. Select the values
                                    you wish to keep and click <strong>Commit Draft</strong>, or <strong>Discard Draft</strong> to delete their work permanently.
                                </>
                            )}
                        </div>
                    )}

                    <div className="space-y-6 flex-1">
                        <MergeRow
                            label="Product Name"
                            original={originalProduct.name}
                            drafted={draft.draftName || ''}
                            selected={finalName}
                            onSelect={setFinalName}
                            hasConflict={hasConflict}
                            baseVersion={draft.baseVersion}
                            liveVersion={originalProduct.version}
                        />
                        <MergeRow
                            label="Description"
                            original={originalProduct.description || ''}
                            drafted={draft.draftDescription || ''}
                            selected={finalDescription}
                            onSelect={setFinalDescription}
                            hasConflict={hasConflict}
                            baseVersion={draft.baseVersion}
                            liveVersion={originalProduct.version}
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-white/5 bg-white/5 flex items-center justify-between">
                    <button
                        onClick={() => handleResolve('discard')}
                        disabled={isSubmitting}
                        className="px-4 py-2 rounded-xl text-xs font-semibold
                                 bg-red-500/10 border border-red-500/20 text-red-400
                                 hover:bg-red-500/20 active:scale-95 transition-all
                                 flex items-center gap-2
                                 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isSubmitting && !success ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                        Discard Draft
                    </button>

                    <button
                        onClick={() => handleResolve('commit')}
                        disabled={isSubmitting || hydratedDraft === null}
                        className={`px-6 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed
                                 ${hasConflict ? 'bg-indigo-500 text-white shadow-[0_0_15px_rgba(99,102,241,0.4)] hover:bg-indigo-600'
                                : 'bg-amber-500/20 border border-amber-500/30 text-amber-300 hover:bg-amber-500/30'}`}
                    >
                        {isSubmitting && !success ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        {hasConflict ? 'Commit Merge Resolution' : 'Commit Selected Changes'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─── Sub-component: MergeRow ──────────────────────────────────────────────────

function MergeRow({ label, original, drafted, selected, onSelect, hasConflict, baseVersion, liveVersion }: {
    label: string, original: string, drafted: string, selected: string, onSelect: (val: string) => void,
    hasConflict: boolean, baseVersion: number | null, liveVersion: number
}) {
    const isOriginalSelected = selected === original;
    const isDraftSelected = selected === drafted;
    const isIdentical = original === drafted;

    return (
        <div className="space-y-2">
            <p className="text-xs font-semibold text-white/50 pl-1">{label}</p>
            <div className={`grid ${hasConflict ? 'grid-cols-3' : 'grid-cols-2'} gap-4`}>

                {/* Column 1 (if conflict): Baseline Marker */}
                {hasConflict && (
                    <div className="flex flex-col p-4 rounded-xl border border-white/5 bg-black/20 opacity-60">
                        <div className="text-[10px] uppercase font-bold text-white/30 tracking-wider mb-2">
                            Baseline (v{baseVersion})
                        </div>
                        <div className="text-sm text-white/30 italic mt-auto min-h-[40px] flex items-center justify-start whitespace-pre-wrap">
                            [Historical Data Unavailable]
                        </div>
                    </div>
                )}

                {/* Column 2 (or 1): DB State or User Draft */}
                {!hasConflict && (
                    <button
                        onClick={() => onSelect(original)}
                        className={`text-left p-4 rounded-xl border transition-all relative
                            ${isOriginalSelected
                                ? 'bg-emerald-500/10 border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.15)] ring-1 ring-emerald-500/50'
                                : 'bg-white/5 border-white/10 hover:border-white/20'}`}
                    >
                        <div className="absolute top-2 right-3 text-[10px] uppercase font-bold text-white/30 tracking-wider">
                            Current DB (v{liveVersion})
                        </div>
                        <div className="text-sm text-white/90 font-medium break-words mt-4 pr-12 min-h-[40px] whitespace-pre-wrap">
                            {original || <span className="text-white/20 italic">Empty</span>}
                        </div>
                    </button>
                )}

                {/* Column 2/3: User's Draft */}
                {isIdentical && !hasConflict ? (
                    <div className="flex items-center justify-center p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                        <p className="text-xs font-semibold text-emerald-400/80 flex items-center gap-2">
                            No conflict (Identical values)
                        </p>
                    </div>
                ) : (
                    <button
                        onClick={() => onSelect(drafted)}
                        className={`text-left p-4 rounded-xl border transition-all relative
                            ${isDraftSelected
                                ? 'bg-amber-500/20 border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.2)] ring-1 ring-amber-500/50 text-amber-50'
                                : 'bg-amber-500/5 border-amber-500/20 hover:border-amber-500/40 hover:bg-amber-500/10 text-amber-100/70'}`}
                    >
                        <div className="absolute top-2 right-3 text-[10px] uppercase font-bold text-amber-500/50 tracking-wider flex items-center gap-1.5">
                            <FileText size={10} /> User's Draft
                        </div>
                        <div className="text-sm text-amber-100 font-medium break-words mt-4 pr-24 min-h-[40px] whitespace-pre-wrap">
                            {drafted || <span className="text-white/20 italic">Empty</span>}
                        </div>
                    </button>
                )}

                {/* Column 3: Live DB (if conflict mapped here) */}
                {hasConflict && (
                    <button
                        onClick={() => onSelect(original)}
                        className={`text-left p-4 rounded-xl border transition-all relative
                            ${isOriginalSelected
                                ? 'bg-indigo-500/10 border-indigo-500/40 shadow-[0_0_15px_rgba(99,102,241,0.15)] ring-1 ring-indigo-500/50'
                                : 'bg-white/5 border-white/10 hover:border-white/20'}`}
                    >
                        <div className="absolute top-2 right-3 text-[10px] uppercase font-bold text-white/30 tracking-wider">
                            Live DB (v{liveVersion})
                        </div>
                        <div className="text-sm text-white/90 font-medium break-words mt-4 pr-12 min-h-[40px] whitespace-pre-wrap">
                            {original || <span className="text-white/20 italic">Empty</span>}
                        </div>
                    </button>
                )}

            </div>
        </div>
    );
}
