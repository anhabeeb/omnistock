import React, { useState, useEffect, useRef } from 'react';
import { 
  Bell, 
  Check, 
  AlertTriangle, 
  Clock, 
  Info, 
  X,
  AlertCircle,
  XCircle,
  ArrowRight
} from 'lucide-react';
import { Notification } from '../../types';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'react-hot-toast';
import { asArray } from '../../utils/apiShape';

export const NotificationCenter: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: ['notifications'],
    queryFn: async () => {
      const res = await fetch('/api/notifications?unreadOnly=true', { 
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } 
      });
      if (!res.ok) throw new Error('Failed to fetch notifications');
      return asArray<Notification>(await res.json());
    },
    refetchInterval: 60000,
  });

  // Show toast for new high/critical notifications
  useEffect(() => {
    const highSeverity = notifications.filter(n => n.severity === 'high' || n.severity === 'critical');
    highSeverity.forEach(n => {
      if (new Date(n.created_at).getTime() > Date.now() - 5000) {
        toast.error(n.message, { duration: 5000 });
      }
    });
  }, [notifications]);

  const markAsReadMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/notifications/${id}/read`, { 
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) throw new Error('Failed to mark as read');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/notifications/read-all', { 
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) throw new Error('Failed to mark all as read');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getIcon = (_type: string, severity: string) => {
    switch (severity) {
      case 'critical': return <XCircle className="w-5 h-5 text-red-600" />;
      case 'high': return <AlertCircle className="w-5 h-5 text-orange-600" />;
      case 'medium': return <AlertTriangle className="w-5 h-5 text-amber-600" />;
      default: return <Info className="w-5 h-5 text-blue-600" />;
    }
  };

  const unreadCount = notifications.length;

  return (
    <div className="relative" ref={dropdownRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors"
      >
        <Bell className="w-6 h-6" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 w-5 h-5 bg-red-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 md:w-96 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
            <h3 className="font-bold text-gray-900 flex items-center gap-2">
              Notifications
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 bg-blue-100 text-blue-600 text-xs rounded-full">
                  {unreadCount} New
                </span>
              )}
            </h3>
            {unreadCount > 0 && (
              <button 
                onClick={() => markAllAsReadMutation.mutate()}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
              >
                <Check className="w-3 h-3" />
                Mark all as read
              </button>
            )}
          </div>

          <div className="max-h-[400px] overflow-y-auto divide-y divide-gray-100">
            {notifications.map((notification) => (
              <div 
                key={notification.id} 
                className="p-4 hover:bg-gray-50 transition-colors group relative"
              >
                <div className="flex gap-3">
                  <div className="flex-shrink-0 mt-1">
                    {getIcon(notification.type, notification.severity)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 leading-relaxed pr-6">
                      {notification.message}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <Clock className="w-3 h-3 text-gray-400" />
                      <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">
                        {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                  <button 
                    onClick={() => markAsReadMutation.mutate(notification.id)}
                    className="absolute top-4 right-4 p-1 text-gray-300 hover:text-gray-500 hover:bg-gray-100 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                {notification.related_entity_id && (
                  <div className="mt-3 pl-8">
                    <button className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-bold group/btn">
                      View Details
                      <ArrowRight className="w-3 h-3 group-hover/btn:translate-x-0.5 transition-transform" />
                    </button>
                  </div>
                )}
              </div>
            ))}

            {notifications.length === 0 && (
              <div className="py-12 text-center">
                <div className="bg-gray-50 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Bell className="w-6 h-6 text-gray-300" />
                </div>
                <p className="text-sm text-gray-500 font-medium">No new notifications</p>
                <p className="text-xs text-gray-400 mt-1">We'll alert you when something happens.</p>
              </div>
            )}
          </div>

          <div className="p-3 bg-gray-50 border-t border-gray-100 text-center">
            <button className="text-xs text-gray-500 hover:text-gray-700 font-medium">
              View All Notifications
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
