import { 
  TrendingDown, 
  DollarSign,
  Activity,
  BarChart3
} from 'lucide-react';
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  AreaChart,
  Area
} from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { useSettings } from '../../contexts/SettingsContext';
import { ExportButton } from '../Common/ExportButton';
import { PrintButton } from '../Common/PrintButton';
import { PrintHeader } from '../Common/PrintHeader';

interface DiscrepancySummary {
  totalVariance: number;
  shrinkageValue: number;
  overageValue: number;
  highVarianceItems: { item_name: string; total_item_variance: number; total_item_variance_qty: number }[];
}

export function DiscrepancyAnalytics() {
  const { format } = useSettings();
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const hasPermission = (p: string) => currentUser.role === 'super_admin' || currentUser.permissions?.includes(p);
  const canView = hasPermission('alerts.view');

  const { data: summary, isLoading: summaryLoading } = useQuery<DiscrepancySummary>({
    queryKey: ['discrepancies', 'summary'],
    queryFn: async () => {
      const res = await fetch('/api/discrepancies/summary', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) throw new Error('Failed to fetch discrepancy summary');
      return res.json();
    },
    enabled: canView,
    staleTime: 60000, // 60 seconds
  });

  const { data: trends = [], isLoading: trendsLoading } = useQuery<any[]>({
    queryKey: ['discrepancies', 'trends'],
    queryFn: async () => {
      const res = await fetch('/api/discrepancies/trends', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) throw new Error('Failed to fetch trends');
      return res.json();
    },
    enabled: canView,
    staleTime: 120000, // 120 seconds
  });

  if (!canView) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Activity className="mx-auto h-12 w-12 text-red-500 mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Access Denied</h2>
          <p className="text-slate-400">You do not have permission to view discrepancy analytics.</p>
        </div>
      </div>
    );
  }

  if (summaryLoading || trendsLoading) return <div className="p-8 text-center">Loading Discrepancy Analytics...</div>;

  const stats = [
    { label: 'Total Variance (30d)', value: format(summary?.totalVariance || 0), icon: Activity, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Shrinkage (Loss)', value: format(summary?.shrinkageValue || 0), icon: TrendingDown, color: 'text-red-600', bg: 'bg-red-50' },
    { label: 'Overage (Gain)', value: format(summary?.overageValue || 0), icon: DollarSign, color: 'text-emerald-600', bg: 'bg-emerald-50' }
  ];

  const exportColumns = [
    { header: 'Item Name', key: 'item_name' },
    { header: 'Total Item Variance Qty', key: 'total_item_variance_qty' },
    { header: 'Total Item Variance Value', key: 'total_item_variance' }
  ];

  return (
    <div className="p-6 space-y-6">
      <PrintHeader title="Shrinkage & Discrepancy Analytics" />
      <div className="flex justify-between items-center no-print">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Shrinkage & Discrepancy Analytics</h1>
          <p className="text-sm text-gray-500">Inventory variance detection and loss prevention</p>
        </div>
        <div className="flex gap-3">
          <ExportButton data={summary?.highVarianceItems || []} filename="discrepancy-analytics" columns={exportColumns} />
          <PrintButton />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((stat, idx) => (
          <div key={idx} className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
            <div className="flex items-center gap-4 mb-4">
              <div className={`${stat.bg} p-2 rounded-lg`}>
                <stat.icon className={`w-6 h-6 ${stat.color}`} />
              </div>
              <div>
                <p className="text-sm text-gray-500 font-medium">{stat.label}</p>
                <h3 className="text-2xl font-bold text-gray-900">{stat.value}</h3>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Shrinkage Trends */}
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
          <h3 className="text-lg font-bold text-gray-900 mb-6">Shrinkage Trends (30 Days)</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trends}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip 
                   contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                   formatter={(value: number) => [`₹${value.toLocaleString()}`, 'Shrinkage']}
                />
                <Area type="monotone" dataKey="shrinkage" stroke="#ef4444" fill="#fee2e2" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* High Variance Items */}
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
          <h3 className="text-lg font-bold text-gray-900 mb-6">High Variance Items</h3>
          <div className="space-y-4">
            {(summary?.highVarianceItems || []).map((item, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="bg-white p-2 rounded border border-gray-200">
                    <BarChart3 className="w-4 h-4 text-gray-400" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900">{item.item_name}</p>
                    <p className="text-xs text-gray-500">Total Variance: {item.total_item_variance_qty} units</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-red-600">₹{item.total_item_variance.toLocaleString()}</p>
                  <p className="text-xs text-gray-400">Total Value</p>
                </div>
              </div>
            ))}
            {(!summary?.highVarianceItems || summary.highVarianceItems.length === 0) && (
              <div className="text-center py-8 text-gray-400">
                No high variance items detected.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
