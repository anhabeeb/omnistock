import { useState, useEffect } from 'react';
import { realtimeClient } from '../realtime/client';
import { cn } from '../utils/cn';

interface SyncStatusProps {
  className?: string;
}

export function SyncStatus({ className = "fixed top-20 right-8 z-[9999]" }: SyncStatusProps) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [wsStatus, setWsStatus] = useState<'connected' | 'disconnected' | 'reconnecting'>('disconnected');

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const unsubscribe = realtimeClient.onStatusChange(setWsStatus);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubscribe();
    };
  }, []);

  if (isOnline && wsStatus === 'connected') return null;

  return (
    <div className={cn(
      "px-3 py-1.5 rounded-full text-xs font-medium shadow-lg flex items-center gap-2 transition-all duration-300",
      wsStatus === 'connected' ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" : "bg-rose-500/10 text-rose-500 border border-rose-500/20",
      className
    )}>
      {wsStatus !== 'connected' && <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />}
      <span>{!isOnline ? 'Offline Mode' : wsStatus === 'reconnecting' ? 'Reconnecting...' : 'Disconnected'}</span>
    </div>
  );
}
