import { useState, useEffect } from 'react';
import { 
  Package, AlertTriangle, Clock, Trash2, RefreshCw,
  AlertCircle, ArrowDownLeft, ArrowUpRight, ScanLine
} from 'lucide-react';
import { LoadingSkeleton } from '../Common/LoadingSkeleton';

export default function MobileDashboard({ onTabChange }: { onTabChange: (tab: string) => void }) {
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const hasPermission = (permission: string) => {
    if (currentUser.role === 'super_admin') return true;
    return currentUser.permissions?.includes(permission);
  };
  const canView = hasPermission('kpi.view');

  const fetchSummary = async () => {
    if (!canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const token = localStorage.getItem('token');
    const res = await fetch('/api/dashboard/summary', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      setSummary(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSummary();
  }, [canView]);

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-slate-900 rounded-3xl border border-slate-800 p-8 text-center m-4">
        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4">
          <AlertCircle className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Access Denied</h2>
        <p className="text-slate-400 max-w-md">
          You do not have permission to view the dashboard.
        </p>
      </div>
    );
  }

  const QuickStat = ({ icon: Icon, label, value, color }: any) => (
    <div className="bg-slate-900 border border-slate-800 p-3 rounded-2xl flex items-center gap-3">
      <div className={`p-2 rounded-xl bg-${color}-500/10 text-${color}-500`}>
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <p className="text-slate-500 text-[9px] font-bold uppercase tracking-widest truncate">{label}</p>
        <h3 className="text-base font-bold text-white leading-tight truncate">{value}</h3>
      </div>
    </div>
  );

  if (loading && !summary) return <div className="p-4"><LoadingSkeleton /></div>;

  return (
    <div className="p-4 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Dashboard</h1>
          <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold">Overview</p>
        </div>
        <button 
          onClick={fetchSummary}
          className="p-2 bg-slate-900 rounded-xl border border-slate-800 text-slate-400"
        >
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <QuickStat icon={Package} label="Total Stock" value={summary?.totalQuantity?.toLocaleString()} color="blue" />
        <QuickStat icon={AlertTriangle} label="Low Stock" value={summary?.lowStockCount} color="amber" />
        <QuickStat icon={Clock} label="Near Expiry" value={summary?.nearExpiryCount} color="orange" />
        <QuickStat icon={Trash2} label="Wastage" value={`$${summary?.wastageValue?.toLocaleString()}`} color="rose" />
      </div>

      <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl space-y-4">
        <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
          <ScanLine size={14} className="text-emerald-500" />
          Quick Actions
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {hasPermission('inventory.grn.create') && (
            <button 
              onClick={() => onTabChange('grn')}
              className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-2xl border border-slate-800 hover:bg-slate-800 transition-all"
            >
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                <ArrowDownLeft size={18} />
              </div>
              <span className="text-xs font-bold">Receive</span>
            </button>
          )}
          {hasPermission('inventory.issue.create') && (
            <button 
              onClick={() => onTabChange('issue')}
              className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-2xl border border-slate-800 hover:bg-slate-800 transition-all"
            >
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500">
                <ArrowUpRight size={18} />
              </div>
              <span className="text-xs font-bold">Issue</span>
            </button>
          )}
        </div>
      </div>

      {/* Alerts Preview */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Recent Alerts</h3>
          <button onClick={() => onTabChange('alerts')} className="text-emerald-500 text-[10px] font-bold uppercase tracking-widest">View All</button>
        </div>
        <div className="space-y-2">
          {summary?.lowStockCount > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-2xl flex items-center gap-3">
              <AlertTriangle size={18} className="text-amber-500 shrink-0" />
              <div>
                <p className="text-xs font-bold text-white">{summary.lowStockCount} Items Low on Stock</p>
                <p className="text-[10px] text-slate-500">Immediate reorder recommended</p>
              </div>
            </div>
          )}
          {summary?.nearExpiryCount > 0 && (
            <div className="bg-orange-500/10 border border-orange-500/20 p-3 rounded-2xl flex items-center gap-3">
              <Clock size={18} className="text-orange-500 shrink-0" />
              <div>
                <p className="text-xs font-bold text-white">{summary.nearExpiryCount} Batches Near Expiry</p>
                <p className="text-[10px] text-slate-500">Check expiry reports</p>
              </div>
            </div>
          )}
          {!summary?.lowStockCount && !summary?.nearExpiryCount && (
            <div className="bg-emerald-500/5 border border-emerald-500/10 p-4 rounded-2xl text-center">
              <p className="text-xs text-slate-500">All systems normal. No critical alerts.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
