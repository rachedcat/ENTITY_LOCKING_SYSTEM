import { create } from 'zustand';

// ─── Types ────────────────────────────────────────────────────────────────────

export type UserRole = 'user' | 'admin';

export interface AuthUser {
    id: string;
    name: string;
    role: UserRole;
    /** Short label shown in the avatar circle */
    initials: string;
    /** Accent color key */
    color: 'indigo' | 'violet' | 'amber';
}

// ─── Pre-defined presets ──────────────────────────────────────────────────────

export type PresetKey = 'userA' | 'userB' | 'admin';

export const USER_PRESETS: Record<PresetKey, AuthUser> = {
    userA: { id: 'user-1', name: 'Rached', role: 'user', initials: 'R', color: 'indigo' },
    userB: { id: 'user-2', name: 'Collaborator', role: 'user', initials: 'C', color: 'violet' },
    admin: { id: 'admin-1', name: 'Supervisor', role: 'admin', initials: 'S', color: 'amber' },
};

/** Ordered list for the picker UI */
export const PRESET_ORDER: PresetKey[] = ['userA', 'userB', 'admin'];

const STORAGE_KEY = 'sve_current_user';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadFromStorage(): { user: AuthUser; presetKey: PresetKey } {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw) as { user: AuthUser; presetKey: PresetKey };
            const preset = USER_PRESETS[parsed?.presetKey];
            if (preset) return parsed;
        }
    } catch { /* ignore */ }
    return { user: USER_PRESETS.userA, presetKey: 'userA' };
}

function saveToStorage(user: AuthUser, presetKey: PresetKey): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ user, presetKey }));
        // Backward-compat keys used elsewhere in the codebase
        localStorage.setItem('sve_user_id', user.id);
        localStorage.setItem('sve_role', user.role);
    } catch { /* ignore */ }
}

// ─── Store ────────────────────────────────────────────────────────────────────

interface AuthState {
    currentUser: AuthUser;
    currentPresetKey: PresetKey;

    /** Select a specific preset by key */
    switchToPreset: (key: PresetKey) => void;
}

export const useAuthStore = create<AuthState>((set) => {
    const { user, presetKey } = loadFromStorage();
    saveToStorage(user, presetKey); // sync compat keys on boot

    return {
        currentUser: user,
        currentPresetKey: presetKey,

        switchToPreset: (key) => {
            const next = USER_PRESETS[key];
            if (!next) return;
            saveToStorage(next, key);
            set({ currentUser: next, currentPresetKey: key });
        },
    };
});
