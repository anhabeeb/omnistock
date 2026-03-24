import { 
  ArrowDownLeft, ArrowUpRight, RefreshCw, Search, Trash2, 
  ChevronRight, Package, AlertCircle
} from 'lucide-react';

export default function MobileOperations({ onAction }: { onAction: (action: string) => void }) {
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const hasPermission = (permission: string) => {
    if (currentUser.role === 'super_admin') return true;
    return currentUser.permissions?.includes(permission);
  };
  const canView = hasPermission('inventory.view');

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-slate-900 rounded-3xl border border-slate-800 p-8 text-center m-4">
        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4">
          <AlertCircle className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Access Denied</h2>
        <p className="text-slate-400 max-w-md">
          You do not have permission to view operations.
        </p>
      </div>
    );
  }

  const operations = [
    { id: 'grn', label: 'Receive Stock', sub: 'GRN', icon: ArrowDownLeft, color: 'emerald', permission: 'inventory.grn.create' },
    { id: 'issue', label: 'Issue to Outlet', sub: 'Issue', icon: ArrowUpRight, color: 'blue', permission: 'inventory.issue.create' },
    { id: 'transfer', label: 'Transfer Stock', sub: 'Transfer', icon: RefreshCw, color: 'violet', permission: 'inventory.transfer.create' },
    { id: 'stock-count', label: 'Stock Count', sub: 'Audit', icon: Search, color: 'amber', permission: 'stockcount.create' },
    { id: 'wastage', label: 'Wastage Entry', sub: 'Loss', icon: Trash2, color: 'rose', permission: 'wastage.create' },
  ];

  return (
    <div className="p-4 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white tracking-tight">Operations</h1>
        <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold">Warehouse Workflows</p>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {operations.filter(op => !op.permission || hasPermission(op.permission)).map(op => (
          <button
            key={op.id}
            onClick={() => onAction(op.id)}
            className="w-full bg-slate-900 border border-slate-800 p-3 rounded-2xl flex items-center justify-between hover:bg-slate-800 transition-all group"
          >
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-xl bg-${op.color}-500/10 text-${op.color}-500 group-hover:scale-110 transition-transform`}>
                <op.icon size={20} />
              </div>
              <div className="text-left">
                <p className="text-sm font-bold text-white leading-tight">{op.label}</p>
                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">{op.sub}</p>
              </div>
            </div>
            <ChevronRight size={16} className="text-slate-700" />
          </button>
        ))}
      </div>

      {/* Recent Activity Preview */}
      <div className="space-y-3">
        <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Recent Activity</h3>
        <div className="space-y-2">
          {[1, 2].map(i => (
            <div key={i} className="bg-slate-900/50 border border-slate-800 p-3 rounded-2xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-slate-800 rounded-lg flex items-center justify-center text-slate-500">
                  <Package size={16} />
                </div>
                <div>
                  <p className="text-xs font-bold text-white">GRN-2026-00{i}</p>
                  <p className="text-[9px] text-slate-500 uppercase tracking-widest">2h ago</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold text-emerald-500">+$2,450</p>
                <p className="text-[9px] text-slate-500 uppercase tracking-widest">Main</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
