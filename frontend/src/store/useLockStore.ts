import { create } from 'zustand';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LockEntry {
    entityId: string;
    owner: string;
    lockedAt: string;
    version?: number;
}

export interface ProductSnapshot {
    id: string;
    name: string;
    description: string;
    version: number;
    lastEditedBy?: string | null;
    category?: string; // Opt-in property passed by the backend schema since Phase 11
}

interface LockState {
    // ── Lock map ─────────────────────────────────────────────────────────────
    locks: Record<string, LockEntry>;
    syncLocks: (locks: Record<string, LockEntry>) => void;
    setLock: (entityId: string, owner: string) => void;
    clearLock: (entityId: string) => void;
    isLocked: (entityId: string) => boolean;
    getOwner: (entityId: string) => string | null;
    updateLockMeta: (entityId: string, meta: Partial<LockEntry>) => void;

    // ── Product snapshot map ──────────────────────────────────────────────────
    // Populated after a successful PUT so the Dashboard can show fresh data
    // without waiting for a full socket round-trip.
    products: Record<string, ProductSnapshot>;

    /**
     * Write (or overwrite) the local product snapshot immediately after a
     * successful DB save, BEFORE the lock is released. This guarantees that
     * when the parent re-renders after receiving entityUnlocked, it already
     * has the correct name/description/version in the store.
     */
    updateProductInStore: (product: ProductSnapshot) => void;

    /** Read the in-store snapshot for a given entity. */
    getProduct: (entityId: string) => ProductSnapshot | null;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useLockStore = create<LockState>((set, get) => ({
    // ── Lock actions ──────────────────────────────────────────────────────────
    locks: {},

    syncLocks: (locks) => set({ locks }),

    setLock: (entityId, owner) => {
        if (!entityId) return;
        set((state) => ({
            locks: {
                ...state.locks,
                [entityId]: { entityId, owner, lockedAt: new Date().toISOString() },
            },
        }));
    },

    clearLock: (entityId) =>
        set((state) => {
            const { [entityId]: _removed, ...rest } = state.locks;
            return { locks: rest };
        }),

    isLocked: (entityId) => entityId in get().locks,

    getOwner: (entityId) => get().locks[entityId]?.owner ?? null,

    updateLockMeta: (entityId, meta) =>
        set((state) => {
            const existing = state.locks[entityId];
            if (!existing) return state;
            return { locks: { ...state.locks, [entityId]: { ...existing, ...meta } } };
        }),

    // ── Product snapshot actions ──────────────────────────────────────────────
    products: {},

    updateProductInStore: (product) =>
        set((state) => ({
            products: { ...state.products, [product.id]: product },
        })),

    getProduct: (entityId) => get().products[entityId] ?? null,
}));
