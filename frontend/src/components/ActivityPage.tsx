import React, { useEffect, useState } from 'react';
import { ShieldAlert, Lock, Unlock, CheckCircle, Trash2, Activity as ActivityIcon } from 'lucide-react';
import Sidebar from './Sidebar';
import { socketService } from '../services/socket.service';

interface AuditEvent {
    id: number;
    entityId: string;
    entityName: string | null;
    action: 'locked' | 'unlocked' | 'force_unlocked' | 'draft_committed' | 'draft_discarded' | 'lock_denied';
    actorId: string;
    actorName: string;
    targetUserId: string | null;
    durationSeconds: number | null;
    createdAt: string;
}

interface ActivityPageProps {
    currentView: 'dashboard' | 'activity';
    onNavigate: (view: 'dashboard' | 'activity') => void;
}

export const ActivityPage: React.FC<ActivityPageProps> = ({ currentView, onNavigate }) => {
    const [events, setEvents] = useState<AuditEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [connected, setConnected] = useState(socketService.isConnected);

    const fetchEvents = async () => {
        try {
            const res = await fetch('http://localhost:3000/audit?limit=50');
            if (res.ok) {
                const data = await res.json();
                setEvents(data);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchEvents();

        socketService.onEvent('auditEvent', fetchEvents);

        const onConnect = () => setConnected(true);
        const onDisconnect = () => setConnected(false);

        setConnected(socketService.isConnected);
        socketService.onEvent('connect', onConnect);
        socketService.onEvent('disconnect', onDisconnect);

        return () => {
            socketService.offEvent('auditEvent', fetchEvents);
            socketService.offEvent('connect', onConnect);
            socketService.offEvent('disconnect', onDisconnect);
        };
    }, []);

    const getActionConfig = (action: string) => {
        switch (action) {
            case 'locked': return { icon: <Lock size={14} />, color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20', label: 'Acquired Lock' };
            case 'unlocked': return { icon: <Unlock size={14} />, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', label: 'Released Lock' };
            case 'force_unlocked': return { icon: <ShieldAlert size={14} />, color: 'text-amber-400 bg-amber-500/10 border-amber-500/20', label: 'Force Unlocked' };
            case 'draft_committed': return { icon: <CheckCircle size={14} />, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', label: 'Draft Committed' };
            case 'draft_discarded': return { icon: <Trash2 size={14} />, color: 'text-rose-400 bg-rose-500/10 border-rose-500/20', label: 'Draft Discarded' };
            case 'lock_denied': return { icon: <ShieldAlert size={14} />, color: 'text-rose-400 bg-rose-500/10 border-rose-500/20', label: 'Lock Denied' };
            default: return { icon: <ActivityIcon size={14} />, color: 'text-white/40 bg-white/5 border-white/10', label: action };
        }
    };

    return (
        <div className="flex h-screen overflow-hidden dark bg-zinc-950">
            <Sidebar connected={connected} currentView={currentView} onNavigate={onNavigate} />

            <main className="flex-1 flex flex-col overflow-hidden">
                <header className="flex items-center justify-between px-8 py-5 border-b border-white/[0.06] shrink-0">
                    <div>
                        <h1 className="text-xl font-bold text-white tracking-tight">System Activity</h1>
                        <p className="text-xs text-white/40 mt-0.5">Real-time audit log of security events</p>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto px-8 py-6">
                    <div className="max-w-4xl mx-auto space-y-4 shadow-xl">
                        {loading ? (
                            <div className="text-white/40 text-sm">Loading activity...</div>
                        ) : events.length === 0 ? (
                            <div className="glass-card p-8 rounded-2xl flex flex-col items-center justify-center text-center">
                                <ActivityIcon size={32} className="text-white/20 mb-3" />
                                <p className="text-sm font-medium text-white/60">No activity recorded yet</p>
                                <p className="text-xs text-white/30 mt-1">Actions performed by users will appear here.</p>
                            </div>
                        ) : (
                            events.map(ev => {
                                const config = getActionConfig(ev.action);
                                return (
                                    <div key={ev.id} className="glass-card p-4 rounded-xl flex items-start gap-4 hover:bg-white/[0.02] transition-colors border border-white/5">
                                        <div className={`mt-0.5 w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${config.color}`}>
                                            {config.icon}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between gap-4">
                                                <p className="text-sm text-white/90 font-medium">
                                                    {ev.actorName} <span className="text-white/40 font-normal">({ev.actorId})</span>
                                                </p>
                                                <span className="text-[10px] text-white/30 whitespace-nowrap">
                                                    {new Date(ev.createdAt).toLocaleString()}
                                                </span>
                                            </div>
                                            {ev.action === 'lock_denied' ? (
                                                <p className="text-xs text-white/60 mt-0.5">
                                                    <strong className={`${config.color.split(' ')[0]}`}>{ev.actorName || ev.actorId}</strong>
                                                    {' '}attempted to lock ID <span className="text-white/80 font-medium">{ev.entityId}</span> but was blocked by a pending draft from <strong className="text-rose-300">{ev.targetUserId}</strong>.
                                                </p>
                                            ) : (
                                                <p className="text-xs text-white/60 mt-0.5">
                                                    <strong className={`${config.color.split(' ')[0]}`}>{config.label}</strong>
                                                    {' '}on {ev.entityName ? <span className="text-white/80 font-medium">{ev.entityName}</span> : 'product'} <span className="text-white/40">(#{ev.entityId})</span>
                                                    {ev.targetUserId ? ` — Target: ${ev.targetUserId}` : ''}
                                                </p>
                                            )}
                                        </div>
                                        {ev.durationSeconds != null && (
                                            <div className="text-[10px] font-mono font-medium text-indigo-300/80 bg-indigo-500/10 border border-indigo-500/20 px-2 py-1 rounded max-h-6 flex items-center shrink-0">
                                                {Math.floor(ev.durationSeconds / 60).toString().padStart(2, '0')}m{' '}
                                                {(ev.durationSeconds % 60).toString().padStart(2, '0')}s
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
};
