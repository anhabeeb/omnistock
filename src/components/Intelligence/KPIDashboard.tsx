import React from 'react';
import { 
  TrendingUp, 
  AlertTriangle, 
  Package, 
  Clock, 
  BarChart3,
  Activity
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell
} from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { useSettings } from '../../contexts/SettingsContext';
import { ExportButton } from '../Common/ExportButton';
import { PrintButton } from '../Common/PrintButton';
import { PrintHeader } from '../Common/PrintHeader';

interface KPISummary {
  totalInventoryValue: number;
  wastageValue30d: number;
  expiryRiskValue30d: number;
  avgDispatchDays: number;
}

interface TurnoverData {
  cogs: number;
  inventoryValue: number;
  turnoverRatio: number;
  period: string;
}

export const KPIDashboard: React.FC = () => {
  const { format } = useSettings();
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const hasPermission = (p: string) => currentUser.role === 'super_admin' || currentUser.permissions?.includes(p);
  const canView = hasPermission('kpi.view');

  const { data: summary, isLoading: summaryLoading, refetch: refetchSummary } = useQuery<KPISummary>({
    queryKey: ['kpi', 'summary'],
    queryFn: async () => {
      const res = await fetch('/api/kpi/summary', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      if (!res.ok) throw new Error('Failed to fetch KPI summary');
      return res.json();
    },
    enabled: canView,
    staleTime: 60000, // 60 seconds
  });

  const { data: turnover, isLoading: turnoverLoading, refetch: refetchTurnover } = useQuery<TurnoverData>({
    queryKey: ['kpi', 'turnover'],
    queryFn: async () => {
      const res = await fetch('/api/kpi/turnover', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      if (!res.ok) throw new Error('Failed to fetch turnover data');
      return res.json();
    },
    enabled: canView,
    staleTime: 120000, // 120 seconds
  });

  const handleRefresh = () => {
    refetchSummary();
    refetchTurnover();
  };

  if (!canView) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Activity className="mx-auto h-12 w-12 text-red-500 mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Access Denied</h2>
          <p className="text-slate-400">You do not have permission to view intelligence dashboards.</p>
        </div>
      </div>
    );
  }

  if (summaryLoading || turnoverLoading) return <div className="p-8 text-center">Loading Intelligence Dashboard...</div>;

  const stats = [
    {
      label: 'Total Inventory Value',
      value: format(summary?.totalInventoryValue || 0),
      icon: Package,
      color: 'text-blue-600',
      bg: 'bg-blue-50'
    },
    {
      label: 'Wastage (30d)',
      value: format(summary?.wastageValue30d || 0),
      icon: AlertTriangle,
      color: 'text-orange-600',
      bg: 'bg-orange-50'
    },
    {
      label: 'Expiry Risk (30d)',
      value: format(summary?.expiryRiskValue30d || 0),
      icon: Clock,
      color: 'text-red-600',
      bg: 'bg-red-50'
    },
    {
      label: 'Avg. Dispatch Time',
      value: `${summary?.avgDispatchDays.toFixed(1)} Days`,
      icon: TrendingUp,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50'
    }
  ];

  const exportData = [
    {
      metric: 'Total Inventory Value',
      value: format(summary?.totalInventoryValue || 0)
    },
    {
      metric: 'Wastage (30d)',
      value: format(summary?.wastageValue30d || 0)
    },
    {
      metric: 'Expiry Risk (30d)',
      value: format(summary?.expiryRiskValue30d || 0)
    },
    {
      metric: 'Avg. Dispatch Time (Days)',
      value: summary?.avgDispatchDays.toFixed(1)
    },
    {
      metric: 'Turnover Ratio',
      value: turnover?.turnoverRatio.toFixed(2)
    }
  ];

  const exportColumns = [
    { header: 'Metric', key: 'metric' },
    { header: 'Value', key: 'value' }
  ];

  return (
    <div className="p-6 space-y-6">
      <PrintHeader title="KPI Dashboard Summary" />
      <div className="flex justify-between items-center no-print">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Warehouse Intelligence</h1>
        <div className="flex items-center gap-3">
          <ExportButton data={exportData} filename="kpi-summary" columns={exportColumns} />
          <PrintButton />
          <button 
            onClick={handleRefresh}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-sm font-medium"
          >
            <Activity className="w-4 h-4" />
            Refresh Data
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, idx) => (
          <div key={idx} className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className={`${stat.bg} p-2 rounded-lg`}>
                <stat.icon className={`w-6 h-6 ${stat.color}`} />
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-gray-500 font-medium">{stat.label}</p>
              <h3 className="text-2xl font-bold text-gray-900">{stat.value}</h3>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Stock Turnover Chart */}
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-gray-900">Stock Turnover Analysis</h3>
            <div className="text-xs font-medium px-2 py-1 bg-blue-50 text-blue-600 rounded">
              Ratio: {turnover?.turnoverRatio.toFixed(2)}x
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[
                { name: 'COGS', value: turnover?.cogs },
                { name: 'Avg Inventory', value: turnover?.inventoryValue }
              ]}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  formatter={(value: number) => [`₹${value.toLocaleString()}`, '']}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  <Cell fill="#3b82f6" />
                  <Cell fill="#94a3b8" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-4 text-xs text-gray-500 italic">
            * A higher turnover ratio indicates efficient inventory management and strong sales.
          </p>
        </div>

        {/* Dispatch Performance */}
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
          <h3 className="text-lg font-bold text-gray-900 mb-6">Dispatch Performance Trend</h3>
          <div className="h-64 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <BarChart3 className="w-12 h-12 mx-auto mb-2 opacity-20" />
              <p className="text-sm">Historical trend data will appear as more dispatches are completed.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
