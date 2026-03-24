import { useState, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import { 
  DollarSign, Package, AlertTriangle, Clock, TrendingUp, 
  Trash2, Warehouse, Filter, RefreshCw,
  AlertCircle
} from 'lucide-react';
import { motion } from 'motion/react';
import { useSettings } from '../../contexts/SettingsContext';
import { ExportButton } from '../Common/ExportButton';
import { PrintButton } from '../Common/PrintButton';
import { PrintHeader } from '../Common/PrintHeader';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

interface DashboardSummary {
  totalValue: number;
  totalQuantity: number;
  lowStockCount: number;
  wastageValue: number;
  nearExpiryCount: number;
  deadStockCount: number;
  expiredValue: number;
  outOfStockCount: number;
}

interface GodownOption {
  id: string;
  name: string;
}

interface ChartDatum {
  name: string;
  value: number;
  quantity?: number;
  total_issued?: number;
}

const DEFAULT_SUMMARY: DashboardSummary = {
  totalValue: 0,
  totalQuantity: 0,
  lowStockCount: 0,
  wastageValue: 0,
  nearExpiryCount: 0,
  deadStockCount: 0,
  expiredValue: 0,
  outOfStockCount: 0,
};

const normalizeNumber = (value: unknown) => typeof value === 'number'
  ? value
  : typeof value === 'string'
    ? Number(value) || 0
    : 0;

const normalizeArray = <T,>(value: unknown): T[] => {
  if (Array.isArray(value)) {
    return value as T[];
  }

  if (value && typeof value === 'object' && Array.isArray((value as { results?: unknown[] }).results)) {
    return (value as { results: T[] }).results;
  }

  return [];
};

const normalizeSummary = (value: unknown): DashboardSummary => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return DEFAULT_SUMMARY;
  }

  const summary = value as Partial<DashboardSummary>;
  return {
    totalValue: normalizeNumber(summary.totalValue),
    totalQuantity: normalizeNumber(summary.totalQuantity),
    lowStockCount: normalizeNumber(summary.lowStockCount),
    wastageValue: normalizeNumber(summary.wastageValue),
    nearExpiryCount: normalizeNumber(summary.nearExpiryCount),
    deadStockCount: normalizeNumber(summary.deadStockCount),
    expiredValue: normalizeNumber(summary.expiredValue),
    outOfStockCount: normalizeNumber(summary.outOfStockCount),
  };
};

export default function AnalyticsDashboard() {
  const { format } = useSettings();
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const hasPermission = (p: string) => currentUser.role === 'super_admin' || currentUser.permissions?.includes(p);
  const canView = hasPermission('kpi.view');

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [stockByGodown, setStockByGodown] = useState<ChartDatum[]>([]);
  const [stockByCategory, setStockByCategory] = useState<ChartDatum[]>([]);
  const [fastMoving, setFastMoving] = useState<ChartDatum[]>([]);
  const [loading, setLoading] = useState(true);
  const [godowns, setGodowns] = useState<GodownOption[]>([]);
  const [filters, setFilters] = useState({
    godownId: '',
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0]
  });

  const fetchJson = async (url: string, headers: Record<string, string>) => {
    const response = await fetch(url, { headers });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(`${url} returned ${response.status}`);
    }

    return data;
  };

  const fetchData = async () => {
    if (!canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const token = localStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` };
    
    try {
      const queryParams = new URLSearchParams(filters).toString();
      const [summaryResult, byGodownResult, byCategoryResult, fastMovingResult, godownResult] = await Promise.allSettled([
        fetchJson(`/api/dashboard/summary?${queryParams}`, headers),
        fetchJson(`/api/dashboard/stock-by-godown`, headers),
        fetchJson(`/api/dashboard/stock-by-category`, headers),
        fetchJson(`/api/dashboard/fast-moving`, headers),
        fetchJson(`/api/lookups/godowns?activeOnly=true`, headers)
      ]);

      if (summaryResult.status === 'rejected') {
        console.error('Analytics summary fetch failed:', summaryResult.reason);
      }
      if (byGodownResult.status === 'rejected') {
        console.error('Stock-by-godown fetch failed:', byGodownResult.reason);
      }
      if (byCategoryResult.status === 'rejected') {
        console.error('Stock-by-category fetch failed:', byCategoryResult.reason);
      }
      if (fastMovingResult.status === 'rejected') {
        console.error('Fast-moving fetch failed:', fastMovingResult.reason);
      }
      if (godownResult.status === 'rejected') {
        console.error('Godown filter fetch failed:', godownResult.reason);
      }

      setSummary(summaryResult.status === 'fulfilled' ? normalizeSummary(summaryResult.value) : DEFAULT_SUMMARY);
      setStockByGodown(byGodownResult.status === 'fulfilled' ? normalizeArray<ChartDatum>(byGodownResult.value) : []);
      setStockByCategory(byCategoryResult.status === 'fulfilled' ? normalizeArray<ChartDatum>(byCategoryResult.value) : []);
      setFastMoving(fastMovingResult.status === 'fulfilled' ? normalizeArray<ChartDatum>(fastMovingResult.value) : []);
      setGodowns(godownResult.status === 'fulfilled' ? normalizeArray<GodownOption>(godownResult.value) : []);
    } catch (error) {
      console.error("Dashboard fetch error:", error);
      setSummary(DEFAULT_SUMMARY);
      setStockByGodown([]);
      setStockByCategory([]);
      setFastMoving([]);
      setGodowns([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [filters.godownId, canView]); // Refresh on godown change

  if (!canView) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <AlertTriangle className="mx-auto h-12 w-12 text-red-500 mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Access Denied</h2>
          <p className="text-slate-400">You do not have permission to view the dashboard.</p>
        </div>
      </div>
    );
  }

  const exportColumns = [
    { header: 'Metric', key: 'metric' },
    { header: 'Value', key: 'value' }
  ];

  const getExportData = () => {
    return [
      { metric: 'Total Stock Value', value: summary?.totalValue || 0 },
      { metric: 'Total Quantity', value: summary?.totalQuantity || 0 },
      { metric: 'Low Stock Items', value: summary?.lowStockCount || 0 },
      { metric: 'Wastage (Period)', value: summary?.wastageValue || 0 },
      { metric: 'Near Expiry (30d)', value: summary?.nearExpiryCount || 0 },
      { metric: 'Dead Stock (90d)', value: summary?.deadStockCount || 0 },
      { metric: 'Expired Value', value: summary?.expiredValue || 0 },
    ];
  };

  const StatCard = ({ icon: Icon, label, value, subValue, color, isCurrency }: any) => (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-slate-900 border border-slate-800 p-6 rounded-3xl shadow-xl"
    >
      <div className="flex items-center justify-between mb-4">
        <div className={`p-3 rounded-2xl bg-${color}-500/10 text-${color}-500`}>
          <Icon size={24} />
        </div>
        <TrendingUp size={20} className="text-slate-600" />
      </div>
      <p className="text-slate-400 text-sm font-medium">{label}</p>
      <div className="flex items-baseline gap-2 mt-1">
        <h3 className="text-2xl font-bold text-white">{isCurrency ? format(value) : value}</h3>
        {subValue && <span className="text-xs text-slate-500">{subValue}</span>}
      </div>
    </motion.div>
  );

  if (loading && !summary) return <div className="p-8 text-center text-slate-400">Loading Analytics...</div>;

  return (
    <div className="space-y-8">
      <PrintHeader title="Analytics Dashboard" filters={`Godown: ${godowns.find(g => g.id === filters.godownId)?.name || 'All'} | From: ${filters.from} To: ${filters.to}`} />
      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900/50 p-4 rounded-2xl border border-slate-800 no-print">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-slate-400">
            <Filter size={18} />
            <span className="text-sm font-medium">Filters:</span>
          </div>
          {godowns.length > 0 && (
            <select 
              value={filters.godownId}
              onChange={(e) => setFilters({...filters, godownId: e.target.value})}
              className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">All Godowns</option>
              {godowns.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          )}
        </div>
        <div className="flex items-center gap-3">
          <ExportButton data={getExportData()} filename={`analytics-summary-${filters.from}-to-${filters.to}`} columns={exportColumns} />
          <PrintButton />
          <button 
            onClick={fetchData}
            className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 transition-colors"
          >
            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          icon={DollarSign} 
          label="Total Stock Value" 
          value={summary?.totalValue || 0} 
          color="emerald" 
          isCurrency
        />
        <StatCard 
          icon={Package} 
          label="Total Quantity" 
          value={summary?.totalQuantity?.toLocaleString() || 0} 
          color="blue" 
        />
        <StatCard 
          icon={AlertTriangle} 
          label="Low Stock Items" 
          value={summary?.lowStockCount || 0} 
          subValue="Requires Reorder"
          color="amber" 
        />
        <StatCard 
          icon={Trash2} 
          label="Wastage (Period)" 
          value={summary?.wastageValue || 0} 
          color="rose" 
          isCurrency
        />
      </div>

      {/* Health Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard 
          icon={Clock} 
          label="Near Expiry (30d)" 
          value={summary?.nearExpiryCount} 
          color="orange" 
        />
        <StatCard 
          icon={AlertCircle} 
          label="Dead Stock (90d)" 
          value={summary?.deadStockCount} 
          color="slate" 
        />
        <StatCard 
          icon={DollarSign} 
          label="Expired Value" 
          value={summary?.expiredValue || 0} 
          color="red" 
          isCurrency
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Stock by Godown */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl">
          <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
            <Warehouse size={20} className="text-emerald-500" />
            Stock Value by Godown
          </h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stockByGodown}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => format(v)} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }}
                  itemStyle={{ color: '#fff' }}
                />
                <Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Stock by Category */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl">
          <h3 className="text-lg font-bold text-white mb-6">Stock Distribution by Category</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stockByCategory}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {stockByCategory.map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }}
                />
                <Legend verticalAlign="bottom" height={36}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Fast Moving Items */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl">
          <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
            <TrendingUp size={20} className="text-blue-500" />
            Fast Moving Items (Last 30 Days)
          </h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={fastMoving} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                <XAxis type="number" stroke="#64748b" fontSize={12} hide />
                <YAxis dataKey="name" type="category" stroke="#64748b" fontSize={12} width={100} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }}
                />
                <Bar dataKey="total_issued" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Alerts Summary */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl">
          <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
            <AlertTriangle size={20} className="text-amber-500" />
            Critical Alerts
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-rose-500/5 border border-rose-500/10 rounded-2xl">
              <div className="flex items-center gap-3">
                <Clock className="text-rose-500" size={20} />
                <span className="text-slate-300 font-medium">Near Expiry Items</span>
              </div>
              <span className="text-rose-500 font-bold">{summary?.nearExpiryCount}</span>
            </div>
            <div className="flex items-center justify-between p-4 bg-amber-500/5 border border-amber-500/10 rounded-2xl">
              <div className="flex items-center gap-3">
                <AlertTriangle className="text-amber-500" size={20} />
                <span className="text-slate-300 font-medium">Low Stock Alerts</span>
              </div>
              <span className="text-amber-500 font-bold">{summary?.lowStockCount}</span>
            </div>
            <div className="flex items-center justify-between p-4 bg-slate-800/50 border border-slate-700/50 rounded-2xl">
              <div className="flex items-center gap-3">
                <Package className="text-slate-400" size={20} />
                <span className="text-slate-300 font-medium">Out of Stock Items</span>
              </div>
              <span className="text-white font-bold">{summary?.outOfStockCount}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
