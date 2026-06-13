import { create } from 'zustand';

export interface PendingDraftSummary {
    productId: number;
    userId: string;
    ownerName: string;
    draftName: string | null;
    draftDescription: string | null;
    baseVersion: number | null;
    adminId: string | null;
    lockDuration: number | null;
    savedAt: string;
}

interface DraftState {
    pendingDrafts: Record<string, PendingDraftSummary>; // keyed by productId
    setPendingDrafts: (drafts: PendingDraftSummary[]) => void;
    removePendingDraft: (productId: string) => void;
    clearActiveDraft: (productId: string) => void;
}

export const useDraftStore = create<DraftState>((set) => ({
    pendingDrafts: {},
    setPendingDrafts: (drafts) => {
        const map: Record<string, PendingDraftSummary> = {};
        for (const d of drafts) {
            map[d.productId.toString()] = d;
        }
        set({ pendingDrafts: map });
    },
    removePendingDraft: (productId) => {
        set((state) => {
            const drafts = { ...state.pendingDrafts };
            delete drafts[productId];
            return { pendingDrafts: drafts };
        });
    },
    clearActiveDraft: (productId) => {
        set((state) => {
            const drafts = { ...state.pendingDrafts };
            delete drafts[productId];
            return { pendingDrafts: drafts };
        });
    }
}));
