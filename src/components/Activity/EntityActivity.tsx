import React from "react";
import { 
  Clock, 
  User, 
  AlertCircle,
  Info,
  CheckCircle2,
  AlertTriangle,
  Package,
  Truck,
  Warehouse,
  Store,
  FileText,
  ArrowRightLeft,
  Settings2,
  Trash2,
  Database,
  Shield,
  RefreshCcw,
  Settings
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { motion } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { useEntityActivity } from "../../hooks/useActivityFeed";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const ACTION_ICONS: Record<string, any> = {
  'user.created': User,
  'user.updated': User,
  'user.deactivated': User,
  'user.reactivated': User,
  'user.password_reset': Shield,
  'item.created': Package,
  'item.updated': Package,
  'item.deactivated': Package,
  'item.reactivated': Package,
  'item.deleted': Trash2,
  'supplier.created': Truck,
  'supplier.updated': Truck,
  'supplier.deactivated': Truck,
  'supplier.reactivated': Truck,
  'supplier.deleted': Trash2,
  'godown.created': Warehouse,
  'godown.updated': Warehouse,
  'godown.deactivated': Warehouse,
  'godown.reactivated': Warehouse,
  'godown.deleted': Trash2,
  'outlet.created': Store,
  'outlet.updated': Store,
  'outlet.deactivated': Store,
  'outlet.reactivated': Store,
  'outlet.deleted': Trash2,
  'inventory.grn_created': FileText,
  'inventory.grn_posted': CheckCircle2,
  'inventory.issue_created': FileText,
  'inventory.issue_posted': CheckCircle2,
  'inventory.transfer_created': ArrowRightLeft,
  'inventory.transfer_dispatched': ArrowRightLeft,
  'inventory.transfer_received': CheckCircle2,
  'inventory.adjustment_created': Settings2,
  'inventory.adjustment_posted': CheckCircle2,
  'system.init': Database,
  'system.reset_requested': AlertTriangle,
  'system.reset_verified': CheckCircle2,
  'system.reset_executed': RefreshCcw,
  'settings.updated': Settings,
  'onboarding.reset': RefreshCcw,
};

const SEVERITY_COLORS = {
  info: "text-blue-400 bg-blue-400/10 border-blue-400/20",
  warning: "text-amber-400 bg-amber-400/10 border-amber-400/20",
  error: "text-rose-400 bg-rose-400/10 border-rose-400/20",
  critical: "text-rose-500 bg-rose-500/20 border-rose-500/30",
};

interface EntityActivityProps {
  entityType: string;
  entityId: string;
  title?: string;
  hideHeader?: boolean;
}

export const EntityActivity: React.FC<EntityActivityProps> = ({ 
  entityType, 
  entityId, 
  title = "Activity History",
  hideHeader = false
}) => {
  const { data: activities, isLoading, isError } = useEntityActivity(entityType, entityId);

  return (
    <div className={cn(
      "flex flex-col h-full overflow-hidden",
      !hideHeader && "bg-slate-900 border border-slate-800 rounded-2xl"
    )}>
      {!hideHeader && (
        <div className="p-4 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Clock size={16} className="text-emerald-400" />
            {title}
          </h3>
          <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-bold uppercase">
            {activities?.length || 0} Events
          </span>
        </div>
      )}

      <div className={cn(
        "flex-1 overflow-y-auto custom-scrollbar relative",
        hideHeader ? "p-0" : "p-6"
      )}>
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-32 space-y-2">
            <div className="w-6 h-6 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
            <p className="text-xs text-slate-500">Loading history...</p>
          </div>
        ) : isError ? (
          <div className="text-center py-8">
            <AlertCircle className="w-8 h-8 text-rose-500 mx-auto mb-2" />
            <p className="text-xs text-slate-400">Failed to load history</p>
          </div>
        ) : !activities || activities.length === 0 ? (
          <div className="text-center py-12">
            <Clock className="w-10 h-10 text-slate-800 mx-auto mb-3" />
            <p className="text-sm text-slate-500 font-medium">No activity recorded yet</p>
            <p className="text-xs text-slate-600 mt-1">Actions on this {entityType} will appear here.</p>
          </div>
        ) : (
          <div className="relative pl-8 before:absolute before:left-[15px] before:top-2 before:bottom-2 before:w-px before:bg-slate-800">
            {activities.map((log, index) => {
              const Icon = ACTION_ICONS[log.action_type] || Info;
              return (
                <motion.div 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  key={log.id} 
                  className="relative mb-8 last:mb-0"
                >
                  {/* Timeline Dot */}
                  <div className={cn(
                    "absolute -left-[25px] top-1 w-4 h-4 rounded-full border-2 border-slate-950 z-10",
                    log.severity === 'critical' ? "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]" :
                    log.severity === 'error' ? "bg-rose-400" :
                    log.severity === 'warning' ? "bg-amber-400" : "bg-blue-400"
                  )} />

                  <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-4 hover:border-slate-700 transition-colors group">
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        "p-2 rounded-lg border shrink-0",
                        SEVERITY_COLORS[log.severity] || SEVERITY_COLORS.info
                      )}>
                        <Icon size={16} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-white leading-tight">
                            {log.summary}
                          </p>
                          <span className="text-[10px] text-slate-500 whitespace-nowrap font-medium">
                            {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                          </span>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                          <div className="flex items-center gap-1 text-slate-400">
                            <User size={12} className="text-slate-500" />
                            <span className="font-medium text-slate-300">{log.actor_username}</span>
                          </div>

                          <div className="flex items-center gap-1 text-slate-500">
                            <Clock size={12} />
                            <span>{format(new Date(log.created_at), "MMM d, HH:mm")}</span>
                          </div>

                          {log.reference_number && (
                            <div className="flex items-center gap-1 text-blue-400 font-mono">
                              <FileText size={12} />
                              <span>{log.reference_number}</span>
                            </div>
                          )}
                        </div>

                        {log.details_json && Object.keys(log.details_json).length > 0 && (
                          <div className="mt-3 p-2 bg-slate-950/30 rounded-lg border border-slate-800/30">
                            <pre className="text-[9px] font-mono text-slate-500 overflow-x-auto custom-scrollbar max-h-32">
                              {JSON.stringify(log.details_json, null, 2).length > 1000 
                                ? JSON.stringify(log.details_json, null, 2).slice(0, 1000) + "\n... [Truncated]"
                                : JSON.stringify(log.details_json, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default EntityActivity;
