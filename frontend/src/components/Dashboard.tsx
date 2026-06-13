import React, { useCallback, useEffect, useRef, useState } from 'react';
import { socketService } from '../services/socket.service';
import { useLockStore, ProductSnapshot } from '../store/useLockStore';
import { useAuthStore, USER_PRESETS, PRESET_ORDER, PresetKey } from '../store/useAuthStore';
import { useDraftStore } from '../store/useDraftStore';
import Sidebar from './Sidebar';
import { ProductEditModal } from './ProductEditModal';
import { ReviewDraftModal } from './ReviewDraftModal';
import { Bell, Search, Package, Clock, Lock, Unlock, ShieldAlert, ShieldCheck, ChevronDown } from 'lucide-react';

// No demo products array required - fetching dynamically

// ─── Profile colour helpers ───────────────────────────────────────────────────

const COLOR_STYLES: Record<string, { pill: string; avatar: string; badge: string; border: string }> = {
    indigo: {
        pill: 'bg-indigo-500/10 border-indigo-500/25 hover:bg-indigo-500/18 hover:border-indigo-400/40',
        avatar: 'bg-indigo-500/25 text-indigo-200',
        badge: 'bg-indigo-500/25 text-indigo-400',
        border: 'border-indigo-500/40',
    },
    violet: {
        pill: 'bg-violet-500/10 border-violet-500/25 hover:bg-violet-500/18 hover:border-violet-400/40',
        avatar: 'bg-violet-500/25 text-violet-200',
        badge: 'bg-violet-500/25 text-violet-400',
        border: 'border-violet-500/40',
    },
    amber: {
        pill: 'bg-amber-500/10 border-amber-500/25 hover:bg-amber-500/18 hover:border-amber-400/40',
        avatar: 'bg-amber-500/25 text-amber-200',
        badge: 'bg-amber-500/25 text-amber-400',
        border: 'border-amber-500/40',
    },
};

// ─── Profile Selector (3-option dropdown) ────────────────────────────────────

const AuthSwitcher: React.FC = () => {
    const currentUser = useAuthStore((s) => s.currentUser);
    const currentPreset = useAuthStore((s) => s.currentPresetKey);
    const switchToPreset = useAuthStore((s) => s.switchToPreset);
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const colors = COLOR_STYLES[currentUser.color];

    return (
        <div ref={ref} className="relative">
            {/* Trigger button */}
            <button
                onClick={() => setOpen(o => !o)}
                className={`group flex items-center gap-2 pl-1.5 pr-2.5 py-1.5 rounded-xl border
                    transition-all duration-200 select-none ${colors.pill}`}
            >
                {/* Avatar */}
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${colors.avatar}`}>
                    {currentUser.initials}
                </div>
                {/* Label */}
                <div className="flex flex-col items-start leading-none">
                    <span className="text-[10px] text-white/35 font-medium">Viewing as</span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`text-xs font-semibold text-white/80`}>{currentUser.name}</span>
                        <span className={`px-1.5 py-px rounded text-[9px] font-bold uppercase tracking-wide ${colors.badge}`}>
                            {currentUser.role}
                        </span>
                    </div>
                </div>
                <ChevronDown size={12} className={`text-white/30 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown */}
            {open && (
                <div className="absolute right-0 top-full mt-2 z-50 w-56
                    glass-card rounded-xl shadow-2xl border border-white/10
                    flex flex-col overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
                    <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-white/30 border-b border-white/8">
                        Switch Profile
                    </p>
                    {PRESET_ORDER.map((key: PresetKey) => {
                        const preset = USER_PRESETS[key];
                        const pc = COLOR_STYLES[preset.color];
                        const active = key === currentPreset;
                        return (
                            <button
                                key={key}
                                onClick={() => { switchToPreset(key); setOpen(false); }}
                                className={`flex items-center gap-3 px-3 py-2.5 text-left
                                    transition-colors duration-150
                                    ${active ? 'bg-white/8' : 'hover:bg-white/5'}`}
                            >
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 ${pc.avatar}`}>
                                    {preset.initials}
                                </div>
                                <div className="flex flex-col gap-0.5 min-w-0">
                                    <span className="text-xs font-semibold text-white/90">{preset.name}</span>
                                    <div className="flex items-center gap-1.5">
                                        <span className={`px-1.5 py-px rounded text-[9px] font-bold uppercase tracking-wide ${pc.badge}`}>
                                            {preset.role}
                                        </span>
                                        <span className="text-[10px] text-white/30 font-mono">{preset.id}</span>
                                    </div>
                                </div>
                                {active && (
                                    <span className="ml-auto text-[10px] text-white/40 shrink-0">active</span>
                                )}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

// ─── Product Card ─────────────────────────────────────────────────────────────

interface ProductCardProps {
    id: string;
    initialName: string;
    category: string;
    currentUserId: string;
    currentUserRole: 'user' | 'admin';
    onOpenModal: (id: string) => void;
    onReviewDraft: (id: string) => void;
}

const ProductCard: React.FC<ProductCardProps> = ({
    id,
    initialName,
    category,
    currentUserId,
    currentUserRole,
    onOpenModal,
    onReviewDraft,
}) => {
    const isLocked = useLockStore((s) => s.isLocked(id));
    const owner = useLockStore((s) => s.getOwner(id));
    const isMine = owner === currentUserId;
    const isLockedByOther = isLocked && !isMine;

    const snapshot = useLockStore((s) => s.getProduct(id));
    const liveName = snapshot?.name ?? initialName;
    const liveVersion = snapshot?.version ?? 1;

    const pendingDraft = useDraftStore((s) => s.pendingDrafts[id]);
    const isPendingAdminReview = !!pendingDraft && currentUserRole === 'admin';
    const isLockedForReview = !!pendingDraft && currentUserRole !== 'admin';

    const [isWaiting, setIsWaiting] = useState(false);

    useEffect(() => {
        if (isWaiting && isMine) {
            setIsWaiting(false);
            onOpenModal(id);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isWaiting, isMine, id]);

    const handleToggle = () => {
        if (!isLocked) {
            setIsWaiting(true);
            socketService.requestLock(id, currentUserId, currentUserRole);
        } else if (isMine) {
            socketService.releaseLock(id, currentUserId, currentUserRole);
        }
    };

    const handleForceUnlock = () => {
        socketService.forceUnlock(id, currentUserId, currentUserRole);
    };

    // Determine card border style
    const cardClass = `glass-card p-5 flex flex-col gap-4 transition-all duration-300
    ${(isLockedByOther && currentUserRole !== 'admin') || isLockedForReview
            ? 'opacity-60'
            : 'hover:border-white/[0.14] hover:shadow-[0_8px_40px_rgba(0,0,0,0.45)]'}`;

    return (
        <div className={cardClass}>

            {/* Header */}
            <div className="flex items-start justify-between gap-2">
                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/20 shrink-0">
                    <Package size={18} className="text-indigo-400" />
                </div>
                <div className="flex items-center gap-1.5">
                    {isPendingAdminReview ? (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/25 text-amber-400 text-[10px] font-semibold">
                            <ShieldAlert size={9} />Pending Draft
                        </span>
                    ) : isLockedForReview ? (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/40 text-[10px] font-semibold">
                            <Lock size={9} />Locked for Review
                        </span>
                    ) : isLocked ? (
                        <span className="badge-locked"><Lock size={10} />
                            {isMine ? 'Locked by you' : 'Locked'}
                        </span>
                    ) : (
                        <span className="badge-free"><Unlock size={10} />Available</span>
                    )}
                    {/* Admin indicator on cards locked by others */}
                    {isLockedByOther && currentUserRole === 'admin' && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full
              bg-amber-500/15 border border-amber-500/25 text-amber-400 text-[10px] font-semibold">
                            <ShieldAlert size={9} />Admin
                        </span>
                    )}
                </div>
            </div>

            {/* Body */}
            <div>
                <p className="text-sm font-semibold text-white leading-snug">{liveName}</p>
                <p className="text-xs text-white/40 mt-0.5">{category} · ID #{id} · v{liveVersion}</p>
                {isLockedByOther && (
                    <p className="text-[11px] text-rose-300/80 mt-2 flex items-center gap-1">
                        <Clock size={11} /> Held by <span className="font-mono ml-1">{owner}</span>
                    </p>
                )}
            </div>

            {/* Action buttons */}
            <div className="flex flex-col gap-2">
                {isPendingAdminReview ? (
                    <button
                        onClick={() => onReviewDraft(id)}
                        className="w-full py-2 rounded-xl text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 transition-all flex justify-center items-center gap-2"
                    >
                        <ShieldAlert size={14} /> Review Draft
                    </button>
                ) : isLockedForReview ? (
                    <button
                        disabled
                        className="w-full py-2 rounded-xl text-xs font-semibold transition-all duration-200 bg-white/5 text-white/20 border border-white/5 cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        <Lock size={14} />
                        Locked for Review
                    </button>
                ) : (
                    <>
                        {/* Primary action */}
                        <button
                            onClick={handleToggle}
                            disabled={isLockedByOther}
                            className={`w-full py-2 rounded-xl text-xs font-semibold transition-all duration-200
                    ${isLocked && isMine
                                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30'
                                    : isLockedByOther
                                        ? 'bg-white/5 text-white/20 border border-white/5 cursor-not-allowed'
                                        : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/30 active:scale-95'
                                }`}
                        >
                            {isLocked && isMine ? '🔓 Release Lock' : isLockedByOther ? '🔒 Read-Only' : '🔒 Acquire Lock'}
                        </button>

                        {/* Force Unlock — Admin only, shown on cards locked by someone else */}
                        {isLockedByOther && currentUserRole === 'admin' && (
                            <button
                                onClick={handleForceUnlock}
                                className="w-full py-2 rounded-xl text-xs font-semibold transition-all duration-200
                      flex items-center justify-center gap-1.5
                      bg-red-600/20 text-red-300 border border-red-500/35
                      hover:bg-red-600/35 hover:border-red-400/50 active:scale-95"
                            >
                                <ShieldAlert size={12} />
                                Force Unlock
                            </button>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

// ─── Dashboard ────────────────────────────────────────────────────────────────

interface DashboardProps {
    currentView?: 'dashboard' | 'activity';
    onNavigate?: (view: 'dashboard' | 'activity') => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ currentView = 'dashboard', onNavigate }) => {
    const [connected, setConnected] = useState(false);
    const totalLocks = useLockStore((s) => Object.keys(s.locks).length);
    const products = useLockStore((s) => s.products);
    const pendingDrafts = useDraftStore((s) => s.pendingDrafts);

    // ── Auth from store (replaces old random useState) ──
    const currentUser = useAuthStore((s) => s.currentUser);

    const [editingProductId, setEditingProductId] = useState<string | null>(null);
    const [reviewDraftId, setReviewDraftId] = useState<string | null>(null);
    const updateProductInStore = useLockStore((s) => s.updateProductInStore);

    const handleOpenModal = useCallback((id: string) => setEditingProductId(id), []);
    const handleReviewDraft = useCallback((id: string) => setReviewDraftId(id), []);

    /**
     * Called by ProductEditModal after a successful DB write.
     * Re-fetches the canonical product from Postgres so the Dashboard card
     * shows the persisted data (not just the optimistic local state).
     */
    const handleSaved = useCallback(async (snapshot: ProductSnapshot) => {
        try {
            const res = await fetch(`http://localhost:3000/products/${snapshot.id}`);
            if (!res.ok) return;
            const fresh = await res.json();
            updateProductInStore({
                id: String(fresh.id),
                name: fresh.name,
                description: fresh.description,
                version: fresh.version,
                lastEditedBy: fresh.lastEditedBy,
            });
        } catch {
            // Non-fatal: optimistic snapshot from the modal is already in store
        }
    }, [updateProductInStore]);

    // ── Fetch Pending Drafts ──
    const fetchDrafts = useCallback(async () => {
        try {
            const res = await fetch('http://localhost:3000/products/drafts/pending');
            if (res.ok) {
                const drafts = await res.json();
                useDraftStore.getState().setPendingDrafts(drafts);
            }
        } catch { /* ignore */ }
    }, [currentUser.role]);

    useEffect(() => {
        fetchDrafts();
        socketService.onEvent('draftPendingReview', fetchDrafts);
        socketService.onEvent('entityDraftUpdated', fetchDrafts);

        // Listen to the local EventBus emitted by ReviewDraftModal
        const onLocalRefresh = () => fetchDrafts();
        window.addEventListener('forceDashboardRefresh', onLocalRefresh);

        // Listen for global database PUT commits to passively update the React grid
        const onEntityUpdated = async (payload: { entityId: string }) => {
            try {
                const res = await fetch(`http://localhost:3000/products/${payload.entityId}`);
                if (res.ok) {
                    const fresh = await res.json();
                    updateProductInStore({
                        id: String(fresh.id),
                        name: fresh.name,
                        description: fresh.description,
                        version: fresh.version,
                        lastEditedBy: fresh.lastEditedBy,
                    });
                }
            } catch { /* ignore */ }
        };
        socketService.onEvent('entityUpdated', onEntityUpdated);

        return () => {
            socketService.offEvent('draftPendingReview', fetchDrafts);
            socketService.offEvent('entityDraftUpdated', fetchDrafts);
            window.removeEventListener('forceDashboardRefresh', onLocalRefresh);
            socketService.offEvent('entityUpdated', onEntityUpdated);
        };
    }, [fetchDrafts, updateProductInStore]);

    // ── Initial Fetch ──
    useEffect(() => {
        let active = true;
        const fetchAllProducts = async () => {
            try {
                const res = await fetch(`http://localhost:3000/products`);
                if (!res.ok) return;
                const productsArray = await res.json();

                if (active && Array.isArray(productsArray)) {
                    productsArray.forEach((json: any) => {
                        updateProductInStore({
                            id: String(json.id),
                            name: json.name,
                            description: json.description,
                            version: json.version,
                            lastEditedBy: json.lastEditedBy,
                        });
                    });
                }
            } catch (error) {
                console.error('Failed to fetch dynamic products', error);
            }
        };
        fetchAllProducts();
        return () => { active = false; };
    }, [updateProductInStore]);

    // ── Socket initialization — one-time connection ──
    useEffect(() => {
        if (!currentUser.id) return;
        socketService.connect(currentUser.id, currentUser.role);

        const onConnect = () => setConnected(true);
        const onDisconnect = () => setConnected(false);

        setConnected(socketService.isConnected);
        socketService.onEvent('connect', onConnect);
        socketService.onEvent('disconnect', onDisconnect);

        return () => {
            socketService.offEvent('connect', onConnect);
            socketService.offEvent('disconnect', onDisconnect);
        };
        // Empty dependency list stops "super-fast refresh" by binding socket strictly once
    }, []);

    const isAdmin = currentUser.role === 'admin';

    return (
        <div className="flex h-screen overflow-hidden dark">

            {/* ── Sidebar ─────────────────────────────────── */}
            <Sidebar connected={connected} currentView={currentView} onNavigate={onNavigate} />

            {/* ── Main content ────────────────────────────── */}
            <main className="flex-1 flex flex-col overflow-hidden">

                {/* Top bar */}
                <header className="flex items-center justify-between px-8 py-5 border-b border-white/[0.06] shrink-0">
                    <div>
                        <h1 className="text-xl font-bold text-white tracking-tight">Product Dashboard</h1>
                        <p className="text-xs text-white/40 mt-0.5 flex items-center gap-1.5">
                            Real-time entity locking · you are
                            <span className={`font-mono font-semibold ${isAdmin ? 'text-amber-300' : 'text-indigo-300'}`}>
                                {currentUser.name}
                            </span>
                            {isAdmin && (
                                <span className="flex items-center gap-0.5 text-amber-400">
                                    <ShieldCheck size={11} /> Admin
                                </span>
                            )}
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Auth role switcher */}
                        <AuthSwitcher />

                        <div className="flex items-center gap-2 px-3 py-2 glass-card rounded-xl text-white/40 text-xs">
                            <Search size={14} />
                            <span>Search entities…</span>
                        </div>
                        <div className="relative flex items-center justify-center w-9 h-9 glass-card rounded-xl cursor-pointer hover:border-white/[0.14] transition-all">
                            <Bell size={16} className="text-white/50" />
                            {totalLocks > 0 && (
                                <span className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center
                                 bg-indigo-500 rounded-full text-[9px] font-bold text-white">
                                    {totalLocks}
                                </span>
                            )}
                        </div>
                    </div>
                </header>

                {/* Stats strip */}
                <div className="flex gap-4 px-8 py-5 border-b border-white/[0.06] shrink-0">
                    {[
                        { label: 'Total Entities', value: Object.keys(products).length, color: 'text-white' },
                        { label: 'Locked', value: totalLocks, color: 'text-rose-300' },
                        { label: 'Available', value: Object.keys(products).length - totalLocks, color: 'text-emerald-300' },
                        {
                            label: 'Your Locks',
                            value: Object.values(useLockStore.getState().locks).filter(l => l.owner === currentUser.id).length,
                            color: 'text-indigo-300',
                        },
                    ].map((stat) => (
                        <div key={stat.label} className="glass-card px-5 py-3 rounded-xl flex flex-col gap-0.5 min-w-[120px]">
                            <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                            <p className="text-[11px] text-white/40">{stat.label}</p>
                        </div>
                    ))}
                </div>

                {/* Role banner for Admin mode */}
                {isAdmin && (
                    <div className="mx-8 mt-4 px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25
            flex items-center justify-between gap-2 text-xs text-amber-300 shrink-0">
                        <div className="flex items-center gap-2">
                            <ShieldAlert size={14} className="shrink-0" />
                            <span>
                                <strong>Admin mode active.</strong> You can force-unlock any card held by other users.
                                Red <strong>Force Unlock</strong> buttons are visible only to you.
                            </span>
                        </div>
                        <button
                            onClick={async () => {
                                if (confirm('Are you sure you want to clear the environment? This deletes all drafts/logs and resets products to v1.')) {
                                    await fetch('http://localhost:3000/products/reset', { method: 'POST' });
                                    window.location.reload();
                                }
                            }}
                            className="px-3 py-1.5 rounded bg-red-500/20 text-red-300 border border-red-500/40 hover:bg-red-500/30 transition-colors font-bold tracking-wide"
                        >
                            Clear Environment
                        </button>
                    </div>
                )}

                {/* Product grid */}
                <div className="flex-1 overflow-y-auto px-8 py-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                        {Object.values(products).map((p) => (
                            <ProductCard
                                key={p.id}
                                id={p.id}
                                initialName={p.name}
                                category={p.category || 'Uncategorized'}
                                currentUserId={currentUser.id}
                                currentUserRole={currentUser.role}
                                onOpenModal={handleOpenModal}
                                onReviewDraft={handleReviewDraft}
                            />
                        ))}
                    </div>
                </div>
            </main>

            {editingProductId && (
                <ProductEditModal
                    productId={editingProductId}
                    currentUser={currentUser.id}
                    isOpen={true}
                    onClose={() => setEditingProductId(null)}
                    onSaved={handleSaved}
                />
            )}

            {reviewDraftId && (
                <ReviewDraftModal
                    draft={pendingDrafts[reviewDraftId]!}
                    originalProduct={useLockStore.getState().getProduct(reviewDraftId) || {
                        id: reviewDraftId,
                        name: products[reviewDraftId]?.name || 'Unknown',
                        description: '',
                        version: 1,
                        lastEditedBy: 'system'
                    }}
                    onClose={() => {
                        setReviewDraftId(null);
                        handleSaved({ id: reviewDraftId, name: '', description: '', version: 0, lastEditedBy: '' }); // Trigger DB re-fetch
                    }}
                />
            )}
        </div>
    );
};
