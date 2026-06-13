import React from 'react';
import {
    LayoutDashboard,
    Package,
    Activity,
    Users,
    Settings,
    Wifi,
    WifiOff,
    Lock,
    ShieldCheck,
} from 'lucide-react';
import { useLockStore } from '../store/useLockStore';

interface NavItem {
    id: string;
    label: string;
    icon: React.ReactNode;
}

const navItems: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
    { id: 'products', label: 'Products', icon: <Package size={18} /> },
    { id: 'activity', label: 'Activity', icon: <Activity size={18} /> },
    { id: 'users', label: 'Users', icon: <Users size={18} /> },
    { id: 'settings', label: 'Settings', icon: <Settings size={18} /> },
];

interface SidebarProps {
    connected: boolean;
    currentView?: 'dashboard' | 'activity';
    onNavigate?: (view: 'dashboard' | 'activity') => void;
}

const Sidebar: React.FC<SidebarProps> = ({ connected, currentView = 'dashboard', onNavigate }) => {
    const locks = useLockStore((s) => s.locks);
    const activeLockCount = Object.keys(locks).length;

    return (
        <aside className="flex flex-col w-64 h-full shrink-0 glass-card rounded-none rounded-r-3xl border-l-0 border-t-0 border-b-0 p-5 gap-6">

            {/* ── Logo ─────────────────────────────────────────── */}
            <div className="flex items-center gap-3 px-1">
                <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-500/30">
                    <ShieldCheck size={18} className="text-indigo-400" />
                </div>
                <div>
                    <p className="text-sm font-semibold text-white leading-none">SVE Lock</p>
                    <p className="text-xs text-white/40 mt-0.5">Entity Manager</p>
                </div>
            </div>

            {/* ── Connection badge ─────────────────────────────── */}
            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium
        ${connected
                    ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                    : 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
                }`}>
                {connected
                    ? <><Wifi size={13} /> WebSocket connected</>
                    : <><WifiOff size={13} /> WebSocket offline</>
                }
            </div>

            {/* ── Navigation ───────────────────────────────────── */}
            <nav className="flex flex-col gap-1 flex-1">
                <p className="text-[10px] font-semibold tracking-widest text-white/30 uppercase px-3 mb-1">
                    Menu
                </p>
                {navItems.map((item) => {
                    const active = item.id === currentView;
                    const isClickable = item.id === 'dashboard' || item.id === 'activity';
                    return (
                        <div
                            key={item.label}
                            onClick={isClickable && onNavigate ? () => onNavigate(item.id as any) : undefined}
                            className={`nav-item ${active ? 'active' : ''} ${isClickable ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}
                        >
                            <span className="opacity-70">{item.icon}</span>
                            {item.label}
                        </div>
                    );
                })}
            </nav>

            {/* ── Active locks summary ──────────────────────────── */}
            <div className="glass-card p-4 rounded-xl">
                <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold text-white/50 uppercase tracking-wider">
                        Active Locks
                    </p>
                    <Lock size={13} className="text-white/30" />
                </div>
                {activeLockCount === 0 ? (
                    <p className="text-xs text-white/30 italic">No entities locked</p>
                ) : (
                    <div className="flex flex-col gap-1.5">
                        {Object.values(locks).map((lock) => (
                            <div key={lock.entityId} className="flex items-center justify-between">
                                <span className="text-xs text-white/70 font-mono">#{lock.entityId}</span>
                                <span className="text-[10px] text-rose-300 truncate max-w-[90px]">{lock.owner}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </aside>
    );
};

export default Sidebar;
