import { useState } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area
} from 'recharts';
import { 
  TrendingUp, TrendingDown, 
  RefreshCw, ArrowUpRight,
  Building2, Wallet, Target, Percent, AlertCircle
} from 'lucide-react';
import { motion } from 'motion/react';
import { FinanceSummary } from '../../types';
import { useQuery } from '@tanstack/react-query';
import { useSettings } from '../../contexts/SettingsContext';
import { ExportButton } from '../Common/ExportButton';
import { PrintButton } from '../Common/PrintButton';
import { PrintHeader } from '../Common/PrintHeader';

export default function FinanceDashboard() {
  const { format } = useSettings();
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const hasPermission = (p: string) => currentUser.role === 'super_admin' || currentUser.permissions?.includes(p);
  const canView = hasPermission('finance.view');

  const [filters, setFilters] = useState({
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0]
  });

  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  const { data: summary, isLoading: summaryLoading, refetch: refetchSummary } = useQuery<FinanceSummary>({
    queryKey: ['finance', 'summary', filters],
    queryFn: async () => {
      const res = await fetch(`/api/finance/summary?from=${filters.from}&to=${filters.to}`, { headers });
      if (!res.ok) throw new Error('Failed to fetch finance summary');
      return res.json();
    },
    enabled: canView,
    staleTime: 60000,
  });

  const { data: outletMargins = [], isLoading: marginsLoading, refetch: refetchMargins } = useQuery<any[]>({
    queryKey: ['finance', 'margins', filters],
    queryFn: async () => {
      const res = await fetch(`/api/finance/margin/by-outlet?from=${filters.from}&to=${filters.to}`, { headers });
      if (!res.ok) throw new Error('Failed to fetch outlet margins');
      return res.json();
    },
    enabled: canView,
    staleTime: 120000,
  });

  const { data: salesTrend = [], isLoading: trendLoading, refetch: refetchTrend } = useQuery<any[]>({
    queryKey: ['finance', 'sales-trend', filters],
    queryFn: async () => {
      const res = await fetch(`/api/finance/sales-trend?from=${filters.from}&to=${filters.to}`, { headers });
      if (!res.ok) throw new Error('Failed to fetch sales trend');
      return res.json();
    },
    enabled: canView,
    staleTime: 120000,
  });

  const handleRefresh = () => {
    refetchSummary();
    refetchMargins();
    refetchTrend();
  };

  if (!canView) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-red-500 mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Access Denied</h2>
          <p className="text-slate-400">You do not have permission to view the finance dashboard.</p>
        </div>
      </div>
    );
  }

  const loading = summaryLoading || marginsLoading || trendLoading;

  const exportColumns = [
    { header: 'Outlet', key: 'outletName' },
    { header: 'Revenue', key: 'revenue' },
    { header: 'COGS', key: 'cogs' },
    { header: 'Wastage', key: 'wastage' },
    { header: 'Gross Profit', key: 'grossProfit' },
    { header: 'Margin %', key: 'marginPercentage' }
  ];

  const StatCard = ({ icon: Icon, label, value, subValue, color, trend, isPercentage }: any) => (
    <motion.div 
      whileHover={{ y: -5 }}
      className="bg-slate-900 border border-slate-800 p-6 rounded-3xl space-y-4 relative overflow-hidden group"
    >
      <div className={`absolute top-0 right-0 w-24 h-24 bg-${color}-500/5 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110`} />
      <div className="flex items-center justify-between">
        <div className={`p-3 rounded-2xl bg-${color}-500/10 text-${color}-500`}>
          <Icon size={24} />
        </div>
        {trend && (
          <div className={`flex items-center gap-1 text-xs font-bold ${trend > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
            {trend > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {Math.abs(trend)}%
          </div>
        )}
      </div>
      <div>
        <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">{label}</p>
        <h3 className="text-2xl font-bold text-white tracking-tight">
          {isPercentage ? value : format(value)}
        </h3>
        {subValue && <p className="text-xs text-slate-400 mt-1 font-medium">{subValue}</p>}
      </div>
    </motion.div>
  );

  return (
    <div className="p-4 space-y-6">
      <PrintHeader title="Finance & Profit" filters={`From: ${filters.from} To: ${filters.to}`} />
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 no-print">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Finance & Profit</h1>
          <p className="text-slate-500 text-sm">Revenue, COGS, and Margin Analysis</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-slate-900 border border-slate-800 rounded-2xl p-1">
            <input 
              type="date" 
              value={filters.from}
              onChange={(e) => setFilters({...filters, from: e.target.value})}
              className="bg-transparent text-xs font-bold uppercase tracking-widest text-white px-3 py-2 outline-none"
            />
            <div className="w-px bg-slate-800 my-2" />
            <input 
              type="date" 
              value={filters.to}
              onChange={(e) => setFilters({...filters, to: e.target.value})}
              className="bg-transparent text-xs font-bold uppercase tracking-widest text-white px-3 py-2 outline-none"
            />
          </div>
          <ExportButton data={outletMargins} filename={`outlet-margins-${filters.from}-to-${filters.to}`} columns={exportColumns} />
          <PrintButton />
          <button 
            onClick={handleRefresh}
            className="p-3 bg-slate-900 rounded-2xl border border-slate-800 text-slate-400 hover:text-white transition-all"
          >
            <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard icon={Wallet} label="Total Revenue" value={summary?.revenue || 0} color="emerald" trend={12} />
        <StatCard icon={ArrowUpRight} label="COGS" value={summary?.cogs || 0} subValue="Inventory Issued" color="orange" trend={-5} />
        <StatCard icon={TrendingDown} label="Wastage Loss" value={summary?.wastageLoss || 0} color="rose" />
        <StatCard icon={Target} label="Net Profit" value={summary?.netProfit || 0} subValue="After Wastage" color="blue" trend={8} />
        <StatCard icon={Percent} label="Margin %" value={`${summary?.marginPercentage?.toFixed(1) || 0}%`} color="violet" trend={2} isPercentage />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sales Trend */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2">
              <TrendingUp size={16} className="text-emerald-500" />
              Sales Trend
            </h3>
          </div>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={salesTrend}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="date" stroke="#64748b" fontSize={10} tickFormatter={(val) => val.split('-').slice(1).join('/')} />
                <YAxis stroke="#64748b" fontSize={10} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }}
                  itemStyle={{ color: '#fff', fontSize: '12px' }}
                />
                <Area type="monotone" dataKey="revenue" stroke="#10b981" fillOpacity={1} fill="url(#colorRevenue)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Outlet Margin Analysis */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2">
              <Building2 size={16} className="text-blue-500" />
              Outlet Performance
            </h3>
          </div>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={outletMargins}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="outletName" stroke="#64748b" fontSize={10} />
                <YAxis stroke="#64748b" fontSize={10} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }}
                  itemStyle={{ color: '#fff', fontSize: '12px' }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '20px' }} />
                <Bar dataKey="revenue" fill="#10b981" radius={[4, 4, 0, 0]} name="Revenue" />
                <Bar dataKey="grossProfit" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Profit" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Detailed Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden">
        <div className="p-6 border-b border-slate-800">
          <h3 className="text-sm font-bold text-white uppercase tracking-widest">Outlet Margin Breakdown</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-800/50">
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Outlet</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Revenue</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">COGS</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Wastage</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Net Profit</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Margin %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {outletMargins.map((row: any, idx: number) => (
                <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-6 py-4">
                    <p className="text-sm font-bold text-white">{row.outletName}</p>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <p className="text-sm font-medium text-white">{format(row.revenue)}</p>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <p className="text-sm font-medium text-slate-400">{format(row.cogs)}</p>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <p className="text-sm font-medium text-rose-400">{format(row.wastageLoss || 0)}</p>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <p className="text-sm font-bold text-emerald-500">{format(row.netProfit || row.grossProfit)}</p>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-500/10 text-blue-500 rounded-full text-xs font-bold">
                      {row.marginPercentage.toFixed(1)}%
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-blue-500/10 border border-blue-500/20 p-6 rounded-3xl">
        <div className="flex items-start gap-4">
          <AlertCircle size={24} className="text-blue-500 shrink-0" />
          <div className="space-y-2">
            <h4 className="text-sm font-bold text-white uppercase tracking-widest">Calculation Methodology</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Revenue is calculated from posted sales documents. COGS is derived from inventory issued to outlets during the selected period. 
              Wastage loss is calculated from recorded wastage movements at the weighted average cost.
              <span className="text-blue-400 font-bold"> Note:</span> These figures represent outlet-level net margin approximations. 
              True recipe-level COGS integration is planned for future phases.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
