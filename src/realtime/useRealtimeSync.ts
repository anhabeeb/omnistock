import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { realtimeClient, RealtimeEvent } from './client';

export const useRealtimeSync = (isAuthenticated: boolean) => {
  const queryClient = useQueryClient();
  const pendingInvalidations = useRef(new Set<string>());
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      realtimeClient.disconnect();
      return;
    }

    const token = localStorage.getItem('token');
    if (token) {
      realtimeClient.connect(token);
    }

    const unsubscribe = realtimeClient.onMessage((event: RealtimeEvent) => {
      console.log('Realtime event received', event);
      handleEvent(event, pendingInvalidations.current);
      
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        pendingInvalidations.current.forEach(key => queryClient.invalidateQueries({ queryKey: JSON.parse(key), exact: false }));
        pendingInvalidations.current.clear();
      }, 200);
    });

    return () => {
      unsubscribe();
      realtimeClient.disconnect();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [isAuthenticated, queryClient]);
};

function handleEvent(event: RealtimeEvent, pending: Set<string>) {
  const { type } = event;

  const add = (key: any[]) => pending.add(JSON.stringify(key));

  // Invalidation mapping
  if (type.startsWith('item.')) add(['master-data', 'items']);
  if (type.startsWith('supplier.')) add(['master-data', 'suppliers']);
  if (type.startsWith('godown.')) add(['master-data', 'godowns']);
  if (type.startsWith('outlet.')) add(['master-data', 'outlets']);

  if (type === 'inventory.changed') {
    add(['current-stock']);
    add(['dashboard']);
    add(['movements']);
  }

  if (type === 'notification.created') add(['notifications']);
  if (type === 'settings.updated') add(['settings']);
  
  if (type === 'activity.created') {
    add(['activity']);
    add(['activity-entity']);
  }
  
  if (type === 'grn.posted') {
    add(['grn']);
    add(['current-stock']);
    add(['dashboard']);
    add(['movements']);
  }
  
  if (type === 'issue.posted') {
    add(['issues']);
    add(['current-stock']);
    add(['dashboard']);
    add(['movements']);
  }
}
