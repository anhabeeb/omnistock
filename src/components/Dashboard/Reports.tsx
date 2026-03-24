import { useState, useEffect } from 'react';
import { 
  FileText, RefreshCw,
  BarChart3, PieChart as PieChartIcon, Table as TableIcon,
  Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useSettings } from '../../contexts/SettingsContext';
import { ExportButton } from '../Common/ExportButton';
import { PrintButton } from '../Common/PrintButton';
import { PrintHeader } from '../Common/PrintHeader';

type ReportType = 'stock' | 'movements' | 'valuation' | 'wastage' | 'expiry';

export default function Reports() {
  const { format } = useSettings();
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const hasPermission = (p: string) => currentUser.role === 'super_admin' || currentUser.permissions?.includes(p);
  const canView = hasPermission('reports.view');

  const [activeReport, setActiveReport] = useState<ReportType>('stock');
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [godowns, setGodowns] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [filters, setFilters] = useState({
    godownId: '',
    categoryId: '',
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0],
    groupBy: 'item'
  });

  const fetchMasters = async () => {
    if (!canView) return;
    const token = localStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` };
    try {
      const [gRes, cRes] = await Promise.all([
        fetch('/api/lookups/godowns?activeOnly=true', { headers }),
        fetch('/api/categories', { headers })
      ]);
      
      if (gRes.ok) {
        const gData = await gRes.json();
        setGodowns(Array.isArray(gData) ? gData : []);
      } else {
        console.error("Failed to fetch godowns:", await gRes.text());
      }

      if (cRes.ok) {
        const cData = await cRes.json();
        setCategories(Array.isArray(cData) ? cData : []);
      } else {
        console.error("Failed to fetch categories:", await cRes.text());
      }
    } catch (error) {
      console.error("Error fetching masters:", error);
    }
  };

  const fetchReport = async () => {
    if (!canView) return;
    setLoading(true);
    setError(null);
    const token = localStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` };
    const queryParams = new URLSearchParams(filters).toString();
    
    let endpoint = '';
    switch(activeReport) {
      case 'stock': endpoint = `/api/reports/current-stock?${queryParams}`; break;
      case 'movements': endpoint = `/api/reports/movements?${queryParams}`; break;
      case 'valuation': endpoint = `/api/reports/valuation?${queryParams}`; break;
      case 'wastage': endpoint = `/api/wastage`; break; // Simple list for now
      case 'expiry': endpoint = `/api/inventory/expiry-alerts?days=30`; break;
    }

    try {
      const res = await fetch(endpoint, { headers });
      const payload = await res.json() as any;
      
      if (!res.ok) {
        console.error(`Report fetch failed [${endpoint}]:`, payload);
        throw new Error(payload.message || `Failed to fetch ${activeReport} report`);
      }

      setData(Array.isArray(payload) ? payload : []);
    } catch (error: any) {
      console.error("Report fetch error:", error);
      setError(error.message || "An unexpected error occurred while fetching the report.");
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMasters();
  }, [canView]);

  useEffect(() => {
    fetchReport();
  }, [activeReport, filters.godownId, filters.categoryId, filters.groupBy, canView]);

  if (!canView) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <FileText className="mx-auto h-12 w-12 text-red-500 mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Access Denied</h2>
          <p className="text-slate-400">You do not have permission to view reports.</p>
        </div>
      </div>
    );
  }

  const getExportColumns = () => {
    switch(activeReport) {
      case 'stock': return [
        { header: 'Item', key: 'item_name' },
        { header: 'SKU', key: 'item_sku' },
        { header: 'Godown', key: 'godown_name' },
        { header: 'Category', key: 'category_name' },
        { header: 'Quantity', key: 'quantity_on_hand' },
        { header: 'Value', key: (row: any) => (row.quantity_on_hand || 0) * (row.average_unit_cost || 0) }
      ];
      case 'movements': return [
        { header: 'Date', key: 'movement_date' },
        { header: 'Type', key: 'movement_type' },
        { header: 'Item', key: 'item_name' },
        { header: 'Godown', key: 'godown_name' },
        { header: 'Quantity', key: 'base_quantity' }
      ];
      case 'valuation': return [
        { header: 'Group', key: 'group_name' },
        { header: 'Total Value', key: 'total_value' }
      ];
      case 'wastage': return [
        { header: 'Date', key: 'wastage_date' },
        { header: 'Number', key: 'wastage_number' },
        { header: 'Godown', key: 'godown_name' },
        { header: 'Reason', key: 'reason' },
        { header: 'Status', key: 'status' }
      ];
      case 'expiry': return [
        { header: 'Item', key: 'item_name' },
        { header: 'Batch', key: 'batch_number' },
        { header: 'Expiry', key: 'expiry_date' },
        { header: 'Quantity', key: 'current_quantity' }
      ];
      default: return [];
    }
  };

  const getReportTitle = () => {
    switch(activeReport) {
      case 'stock': return 'Current Stock Report';
      case 'movements': return 'Stock Movements Report';
      case 'valuation': return 'Inventory Valuation Report';
      case 'wastage': return 'Wastage Report';
      case 'expiry': return 'Expiry Alerts Report';
      default: return 'Report';
    }
  };

  return (
    <div className="space-y-6">
      <PrintHeader title={getReportTitle()} />
      <div className="flex items-center justify-between no-print">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">Advanced Reporting</h2>
          <p className="text-gray-500 dark:text-slate-400 text-sm mt-1">Generate and export detailed warehouse insights.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={fetchReport}
            className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl text-slate-500 dark:text-slate-400 border border-slate-300 dark:border-slate-800 transition-colors"
          >
            <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
          </button>
          <ExportButton data={data} filename={`${activeReport}-report`} columns={getExportColumns()} />
          <PrintButton />
        </div>
      </div>

      {/* Report Type Tabs */}
      <div className="flex gap-2 p-1 bg-gray-100 dark:bg-slate-900/50 border border-gray-200 dark:border-slate-800 rounded-2xl overflow-x-auto custom-scrollbar no-print">
        {[
          { id: 'stock', label: 'Current Stock', icon: TableIcon },
          { id: 'movements', label: 'Movements', icon: RefreshCw },
          { id: 'valuation', label: 'Valuation', icon: BarChart3 },
          { id: 'wastage', label: 'Wastage', icon: PieChartIcon },
          { id: 'expiry', label: 'Expiry', icon: Clock }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveReport(tab.id as ReportType)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
              activeReport === tab.id 
                ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/20" 
                : "text-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-white"
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filters Bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 p-4 rounded-3xl no-print">
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-gray-500 dark:text-slate-500 uppercase tracking-widest px-1">Godown</label>
          <select 
            value={filters.godownId}
            onChange={(e) => setFilters({...filters, godownId: e.target.value})}
            className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">All Godowns</option>
            {(godowns || []).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-gray-500 dark:text-slate-500 uppercase tracking-widest px-1">Category</label>
          <select 
            value={filters.categoryId}
            onChange={(e) => setFilters({...filters, categoryId: e.target.value})}
            className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">All Categories</option>
            {(categories || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {activeReport === 'movements' && (
          <>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-gray-500 dark:text-slate-500 uppercase tracking-widest px-1">From</label>
              <input 
                type="date"
                value={filters.from}
                onChange={(e) => setFilters({...filters, from: e.target.value})}
                className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-gray-500 dark:text-slate-500 uppercase tracking-widest px-1">To</label>
              <input 
                type="date"
                value={filters.to}
                onChange={(e) => setFilters({...filters, to: e.target.value})}
                className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </>
        )}
        {activeReport === 'valuation' && (
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-gray-500 dark:text-slate-500 uppercase tracking-widest px-1">Group By</label>
            <select 
              value={filters.groupBy}
              onChange={(e) => setFilters({...filters, groupBy: e.target.value})}
              className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="item">Item</option>
              <option value="godown">Godown</option>
              <option value="category">Category</option>
            </select>
          </div>
        )}
      </div>

      {/* Data Table */}
      <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 dark:bg-slate-800/50 border-b border-gray-200 dark:border-slate-800">
                {activeReport === 'stock' && (
                  <>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Item</th>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Godown</th>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Category</th>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider text-right">Qty</th>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider text-right">Value</th>
                  </>
                )}
                {activeReport === 'movements' && (
                  <>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Type</th>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Item</th>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Godown</th>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider text-right">Qty</th>
                  </>
                )}
                {activeReport === 'valuation' && (
                  <>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Group</th>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider text-right">Total Value</th>
                  </>
                )}
                {activeReport === 'wastage' && (
                  <>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Number</th>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Godown</th>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Reason</th>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                  </>
                )}
                {activeReport === 'expiry' && (
                  <>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Item</th>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Batch</th>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Expiry</th>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider text-right">Qty</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-slate-800">
              <AnimatePresence mode="wait">
                {loading ? (
                  [1,2,3,4,5].map(i => (
                    <tr key={i} className="animate-pulse">
                      <td colSpan={6} className="px-6 py-4"><div className="h-4 bg-gray-200 dark:bg-slate-800 rounded w-full" /></td>
                    </tr>
                  ))
                ) : error ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <FileText className="h-8 w-8 text-rose-500 opacity-50" />
                        <p className="text-rose-500 font-medium">{error}</p>
                        <button 
                          onClick={fetchReport}
                          className="mt-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-sm transition-colors"
                        >
                          Try Again
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (data || []).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-gray-500 dark:text-slate-500 font-medium">No data found for the selected filters.</td>
                  </tr>
                ) : (data || []).map((row, i) => (
                  <motion.tr 
                    key={i}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.02 }}
                    className="hover:bg-gray-50 dark:hover:bg-slate-800/30 transition-colors"
                  >
                    {activeReport === 'stock' && (
                      <>
                        <td className="px-6 py-4 text-sm text-gray-900 dark:text-white font-medium">{row.item_name} <span className="text-gray-500 dark:text-slate-500 text-xs ml-1">{row.item_sku}</span></td>
                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-slate-400">{row.godown_name}</td>
                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-slate-400">{row.category_name}</td>
                        <td className="px-6 py-4 text-sm text-gray-900 dark:text-white text-right font-mono">{row.quantity_on_hand || 0}</td>
                        <td className="px-6 py-4 text-sm text-emerald-600 dark:text-emerald-400 text-right font-mono">{format((row.quantity_on_hand || 0) * (row.average_unit_cost || 0))}</td>
                      </>
                    )}
                    {activeReport === 'movements' && (
                      <>
                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-slate-400">{new Date(row.movement_date).toLocaleDateString()}</td>
                        <td className="px-6 py-4 text-sm">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            row.base_quantity > 0 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-500' : 'bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-500'
                          }`}>
                            {row.movement_type.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900 dark:text-white font-medium">{row.item_name}</td>
                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-slate-400">{row.godown_name}</td>
                        <td className={`px-6 py-4 text-sm text-right font-mono font-bold ${row.base_quantity > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                          {row.base_quantity > 0 ? `+${row.base_quantity}` : row.base_quantity}
                        </td>
                      </>
                    )}
                    {activeReport === 'valuation' && (
                      <>
                        <td className="px-6 py-4 text-sm text-gray-900 dark:text-white font-medium">{row.group_name}</td>
                        <td className="px-6 py-4 text-sm text-emerald-600 dark:text-emerald-400 text-right font-mono font-bold">{format(row.total_value)}</td>
                      </>
                    )}
                    {activeReport === 'wastage' && (
                      <>
                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-slate-400">{new Date(row.wastage_date).toLocaleDateString()}</td>
                        <td className="px-6 py-4 text-sm text-gray-900 dark:text-white font-medium">{row.wastage_number}</td>
                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-slate-400">{row.godown_name}</td>
                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-slate-400">{row.reason}</td>
                        <td className="px-6 py-4 text-sm">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            row.status === 'posted' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-500' : 'bg-gray-100 text-gray-700 dark:bg-slate-500/10 dark:text-slate-500'
                          }`}>
                            {row.status}
                          </span>
                        </td>
                      </>
                    )}
                    {activeReport === 'expiry' && (
                      <>
                        <td className="px-6 py-4 text-sm text-gray-900 dark:text-white font-medium">{row.item_name}</td>
                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-slate-400 font-mono">{row.batch_number}</td>
                        <td className="px-6 py-4 text-sm text-rose-600 dark:text-rose-400 font-medium">{new Date(row.expiry_date).toLocaleDateString()}</td>
                        <td className="px-6 py-4 text-sm text-gray-900 dark:text-white text-right font-mono">{row.current_quantity}</td>
                      </>
                    )}
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
