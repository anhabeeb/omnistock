import React, { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { 
  Clock, 
  User, 
  Package, 
  Truck, 
  Warehouse, 
  Store, 
  Settings, 
  AlertCircle,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Shield,
  Database,
  RefreshCcw,
  FileText,
  ArrowRightLeft,
  Settings2,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Info,
  X
} from "lucide-react";
import { format, isToday, isYesterday, parseISO } from "date-fns";
import { motion, AnimatePresence } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { useActivityFeed, ActivityLog } from "../../hooks/useActivityFeed";

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
  info: "text-blue-500 bg-blue-500/10 border-blue-500/20",
  warning: "text-amber-500 bg-amber-500/10 border-amber-500/20",
  error: "text-rose-500 bg-rose-500/10 border-rose-500/20",
  critical: "text-rose-600 bg-rose-600/20 border-rose-600/30 font-bold",
};

const ENTITY_ROUTES: Record<string, string> = {
  'item': '/items',
  'supplier': '/suppliers',
  'godown': '/godowns',
  'outlet': '/outlets',
  'user': '/users',
  'transfer': '/ledger',
  'grn': '/ledger',
  'issue': '/ledger',
  'adjustment': '/ledger',
  'stockcount': '/stock-count',
  'wastage': '/wastage',
  'request': '/requests',
};

export const ActivityFeed: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    entityType: "",
    actionType: "",
    actorUserId: "",
    from: "",
    to: "",
    search: ""
  });
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(filters.search);
      setPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [filters.search]);

  const { data, isLoading, isError, isFetching } = useActivityFeed({
    ...filters,
    search: debouncedSearch,
    limit: 25,
    offset: (page - 1) * 25
  });

  const activities = data?.data || [];
  const pagination = data?.pagination;

  const groupedActivities = useMemo(() => {
    const groups: Record<string, ActivityLog[]> = {};
    activities.forEach(log => {
      const date = parseISO(log.created_at);
      let groupKey = format(date, "yyyy-MM-dd");
      if (isToday(date)) groupKey = "Today";
      else if (isYesterday(date)) groupKey = "Yesterday";
      else groupKey = format(date, "MMMM d, yyyy");

      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push(log);
    });
    return groups;
  }, [activities]);

  const handleReset = () => {
    setFilters({
      entityType: "",
      actionType: "",
      actorUserId: "",
      from: "",
      to: "",
      search: ""
    });
    setPage(1);
  };

  const handleNavigate = (type: string, id: string) => {
    const route = ENTITY_ROUTES[type];
    if (route && id) {
      navigate(`${route}/${id}`);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight">Activity Feed</h2>
          <p className="text-slate-400 text-sm mt-1">Real-time system and operational audit trail</p>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl border transition-all",
              showFilters 
                ? "bg-emerald-600/10 border-emerald-500/50 text-emerald-400" 
                : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
            )}
          >
            <Filter size={18} />
            <span className="text-sm font-medium">Filters</span>
            {(filters.entityType || filters.actorUserId || filters.from || filters.to) && (
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
            )}
          </button>

          <button 
            onClick={() => queryClient.invalidateQueries({ queryKey: ["activity"], exact: false })}
            className="p-2.5 bg-slate-900 border border-slate-800 text-slate-400 hover:text-white rounded-xl transition-all"
            title="Refresh"
          >
            <RefreshCcw size={18} className={isFetching ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showFilters && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Search Summary</label>
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Keywords..."
                    value={filters.search}
                    onChange={(e) => { setFilters({...filters, search: e.target.value}); setPage(1); }}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Entity Type</label>
                <select
                  value={filters.entityType}
                  onChange={(e) => { setFilters({...filters, entityType: e.target.value}); setPage(1); }}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                >
                  <option value="">All Entities</option>
                  <option value="item">Items</option>
                  <option value="supplier">Suppliers</option>
                  <option value="godown">Godowns</option>
                  <option value="outlet">Outlets</option>
                  <option value="user">Users</option>
                  <option value="grn">GRN</option>
                  <option value="issue">Stock Issues</option>
                  <option value="transfer">Transfers</option>
                  <option value="adjustment">Adjustments</option>
                  <option value="stockcount">Stock Count</option>
                  <option value="wastage">Wastage</option>
                  <option value="request">Stock Requests</option>
                  <option value="system">System</option>
                  <option value="settings">Settings</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Actor User ID</label>
                <input
                  type="text"
                  placeholder="User ID..."
                  value={filters.actorUserId}
                  onChange={(e) => { setFilters({...filters, actorUserId: e.target.value}); setPage(1); }}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Date From</label>
                <input
                  type="date"
                  value={filters.from}
                  onChange={(e) => { setFilters({...filters, from: e.target.value}); setPage(1); }}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Date To</label>
                <input
                  type="date"
                  value={filters.to}
                  onChange={(e) => { setFilters({...filters, to: e.target.value}); setPage(1); }}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>

              <div className="md:col-span-3 lg:col-span-1 flex items-end">
                <button 
                  onClick={handleReset}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors text-sm font-medium"
                >
                  <X size={16} />
                  Reset Filters
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-8">
        {isLoading ? (
          <div className="p-12 flex flex-col items-center justify-center space-y-4 bg-slate-900 border border-slate-800 rounded-3xl">
            <div className="w-10 h-10 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
            <p className="text-slate-500 font-medium">Loading activities...</p>
          </div>
        ) : isError ? (
          <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-3xl">
            <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-white">Failed to load activity</h3>
            <p className="text-slate-400 mt-2">There was an error fetching the activity logs. Please try again.</p>
          </div>
        ) : activities.length === 0 ? (
          <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-3xl">
            <Clock className="w-12 h-12 text-slate-700 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-white">No activity found</h3>
            <p className="text-slate-400 mt-2">No actions have been recorded matching your filters.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(groupedActivities).map(([group, logs]) => (
              <div key={group} className="space-y-4">
                <div className="flex items-center gap-4">
                  <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">{group}</h3>
                  <div className="h-px w-full bg-slate-800" />
                </div>

                <div className="space-y-3">
                  {logs.map((log) => {
                    const Icon = ACTION_ICONS[log.action_type] || Info;
                    return (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        key={log.id} 
                        className="bg-slate-900 border border-slate-800 rounded-2xl p-4 hover:border-slate-700 transition-all group relative overflow-hidden"
                      >
                        <div className="flex items-start gap-4">
                          <div className={cn(
                            "mt-1 p-2.5 rounded-xl border shrink-0 transition-transform group-hover:scale-105",
                            SEVERITY_COLORS[log.severity] || SEVERITY_COLORS.info
                          )}>
                            <Icon size={20} />
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-white font-semibold leading-tight">
                                {log.summary}
                              </p>
                              <span className="text-xs text-slate-500 whitespace-nowrap shrink-0 flex items-center gap-1">
                                <Clock size={12} />
                                {format(new Date(log.created_at), "HH:mm")}
                              </span>
                            </div>
                            
                            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                              <div className="flex items-center gap-1.5 text-slate-400">
                                <User size={14} className="text-slate-500" />
                                <span className="font-medium text-slate-300">{log.actor_username}</span>
                                <span className="px-1.5 py-0.5 bg-slate-800 rounded text-[10px] uppercase tracking-wider font-bold text-slate-500">
                                  {log.actor_role.replace('_', ' ')}
                                </span>
                              </div>

                              {log.entity_type && (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-slate-500 uppercase tracking-tighter text-[10px] font-bold">{log.entity_type}</span>
                                  {log.entity_id && (
                                    <button 
                                      onClick={() => handleNavigate(log.entity_type, log.entity_id)}
                                      className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 transition-colors font-mono"
                                    >
                                      <span>#{log.entity_id.slice(0, 8)}</span>
                                      <ExternalLink size={10} />
                                    </button>
                                  )}
                                </div>
                              )}

                              {log.reference_number && (
                                <div className="flex items-center gap-1.5 text-slate-400">
                                  <FileText size={14} className="text-slate-500" />
                                  <span className="font-mono text-blue-400">{log.reference_number}</span>
                                </div>
                              )}

                              {log.source_ip && (
                                <div className="flex items-center gap-1.5 text-slate-600">
                                  <Database size={14} />
                                  <span>{log.source_ip}</span>
                                </div>
                              )}
                            </div>

                            {log.details_json && Object.keys(log.details_json).length > 0 && (
                              <div className="mt-3 p-3 bg-slate-950/50 rounded-xl border border-slate-800/30">
                                <pre className="text-[10px] font-mono text-slate-500 overflow-x-auto custom-scrollbar max-h-40">
                                  {JSON.stringify(log.details_json, null, 2).length > 2000 
                                    ? JSON.stringify(log.details_json, null, 2).slice(0, 2000) + "\n... [Truncated for performance]"
                                    : JSON.stringify(log.details_json, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-3xl p-4">
            <p className="text-sm text-slate-500">
              Showing <span className="text-slate-300">{(page - 1) * pagination.limit + 1}</span> to <span className="text-slate-300">{Math.min(page * pagination.limit, pagination.total)}</span> of <span className="text-slate-300">{pagination.total}</span> activities
            </p>
            <div className="flex items-center gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
                className="p-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800 text-white rounded-xl transition-all"
              >
                <ChevronLeft size={18} />
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                  let pageNum = page;
                  if (page <= 3) pageNum = i + 1;
                  else if (page >= pagination.totalPages - 2) pageNum = pagination.totalPages - 4 + i;
                  else pageNum = page - 2 + i;

                  if (pageNum <= 0 || pageNum > pagination.totalPages) return null;

                  return (
                    <button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      className={cn(
                        "w-8 h-8 rounded-lg text-xs font-bold transition-all",
                        page === pageNum ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"
                      )}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>
              <button
                disabled={page === pagination.totalPages}
                onClick={() => setPage(p => p + 1)}
                className="p-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800 text-white rounded-xl transition-all"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ActivityFeed;
