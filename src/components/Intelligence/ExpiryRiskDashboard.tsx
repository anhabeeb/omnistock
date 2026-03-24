import { 
  Clock, 
  AlertCircle, 
  ShieldCheck, 
  ArrowRight
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useSettings } from '../../contexts/SettingsContext';
import { ExportButton } from '../Common/ExportButton';
import { PrintButton } from '../Common/PrintButton';
import { PrintHeader } from '../Common/PrintHeader';

interface ExpiryRiskData {
  highRiskCount: number;
  mediumRiskCount: number;
  lowRiskCount: number;
  highRiskValue: number;
  mediumRiskValue: number;
  lowRiskValue: number;
  topAtRiskItems: { item_name: string; batch_number: string; expiry_date: string; current_quantity: number; initial_cost: number; total_value: number }[];
}

export function ExpiryRiskDashboard() {
  const { format } = useSettings();
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const hasPermission = (p: string) => currentUser.role === 'super_admin' || currentUser.permissions?.includes(p);
  const canView = hasPermission('alerts.view');

  const { data, isLoading: riskLoading } = useQuery<ExpiryRiskData>({
    queryKey: ['expiry', 'risk'],
    queryFn: async () => {
      const res = await fetch('/api/expiry/risk', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) throw new Error('Failed to fetch expiry risk data');
      return res.json();
    },
    enabled: canView,
    staleTime: 60000, // 60 seconds
  });

  const { data: recommendations = [], isLoading: recLoading } = useQuery<any[]>({
    queryKey: ['expiry', 'recommendations'],
    queryFn: async () => {
      const res = await fetch('/api/expiry/recommendations', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) throw new Error('Failed to fetch recommendations');
      return res.json();
    },
    enabled: canView,
    staleTime: 120000, // 120 seconds
  });

  if (!canView) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-red-500 mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Access Denied</h2>
          <p className="text-slate-400">You do not have permission to view expiry risk forecasting.</p>
        </div>
      </div>
    );
  }

  if (riskLoading || recLoading) return <div className="p-8 text-center">Loading Expiry Risk Dashboard...</div>;

  const riskStats = [
    { label: 'High Risk (<30d)', count: data?.highRiskCount, value: data?.highRiskValue, color: 'text-red-600', bg: 'bg-red-50' },
    { label: 'Medium Risk (30-90d)', count: data?.mediumRiskCount, value: data?.mediumRiskValue, color: 'text-orange-600', bg: 'bg-orange-50' },
    { label: 'Low Risk (90-180d)', count: data?.lowRiskCount, value: data?.lowRiskValue, color: 'text-blue-600', bg: 'bg-blue-50' }
  ];

  const totalRiskValue = (data?.highRiskValue || 0) + (data?.mediumRiskValue || 0) + (data?.lowRiskValue || 0) || 1;

  const exportColumns = [
    { header: 'Item Name', key: 'item_name' },
    { header: 'Batch Number', key: 'batch_number' },
    { header: 'Expiry Date', key: (row: any) => new Date(row.expiry_date).toLocaleDateString() },
    { header: 'Quantity', key: 'current_quantity' },
    { header: 'Total Value', key: 'total_value' }
  ];

  return (
    <div className="p-6 space-y-6">
      <PrintHeader title="Expiry Risk Forecasting" />
      <div className="flex justify-between items-center no-print">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Expiry Risk Forecasting</h1>
          <p className="text-sm text-gray-500">Predictive analysis and prevention recommendations</p>
        </div>
        <div className="flex gap-3">
          <ExportButton data={data?.topAtRiskItems || []} filename="expiry-risk" columns={exportColumns} />
          <PrintButton />
        </div>
      </div>

      {/* Risk Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {riskStats.map((stat, idx) => (
          <div key={idx} className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
            <div className="flex items-center gap-4 mb-4">
              <div className={`${stat.bg} p-2 rounded-lg`}>
                <Clock className={`w-6 h-6 ${stat.color}`} />
              </div>
              <div>
                <p className="text-sm text-gray-500 font-medium">{stat.label}</p>
                <h3 className="text-2xl font-bold text-gray-900">{format(stat.value || 0)}</h3>
              </div>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">{stat.count || 0} Batches at risk</span>
              <span className={`font-medium ${stat.color}`}>
                {((stat.value || 0) / totalRiskValue * 100).toFixed(1)}% of total risk
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top At-Risk Items */}
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
          <h3 className="text-lg font-bold text-gray-900 mb-6">Top At-Risk Batches</h3>
          <div className="space-y-4">
            {(data?.topAtRiskItems || []).map((item, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="bg-white p-2 rounded border border-gray-200">
                    <AlertCircle className="w-4 h-4 text-red-500" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900">{item.item_name}</p>
                    <p className="text-xs text-gray-500">Batch: {item.batch_number} | Exp: {new Date(item.expiry_date).toLocaleDateString()}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-red-600">₹{item.total_value.toLocaleString()}</p>
                  <p className="text-xs text-gray-400">Qty: {item.current_quantity}</p>
                </div>
              </div>
            ))}
            {(!data?.topAtRiskItems || data.topAtRiskItems.length === 0) && (
              <div className="text-center py-8 text-gray-400">
                No batches at immediate risk of expiry.
              </div>
            )}
          </div>
        </div>

        {/* Prevention Recommendations */}
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
          <h3 className="text-lg font-bold text-gray-900 mb-6">Prevention Recommendations</h3>
          <div className="space-y-4">
            {recommendations.map((rec: any, idx: number) => (
              <div key={idx} className="p-4 bg-emerald-50 border border-emerald-100 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-emerald-600" />
                    <span className="text-sm font-bold text-emerald-900">{rec.recommendation}</span>
                  </div>
                  <span className="text-xs font-medium text-emerald-600 bg-white px-2 py-1 rounded border border-emerald-100">
                    Priority: High
                  </span>
                </div>
                <p className="text-sm text-emerald-800 mb-3">
                  Item <span className="font-bold">{rec.item_name}</span> in <span className="font-bold">{rec.godown_name}</span> is expiring on {new Date(rec.expiry_date).toLocaleDateString()}.
                </p>
                <div className="flex gap-2">
                  <button className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded hover:bg-emerald-700">
                    Create Issue <ArrowRight className="w-3 h-3" />
                  </button>
                  <button className="flex items-center gap-1 px-3 py-1.5 bg-white text-emerald-600 border border-emerald-200 text-xs font-medium rounded hover:bg-emerald-50">
                    Transfer Stock
                  </button>
                </div>
              </div>
            ))}
            {recommendations.length === 0 && (
              <div className="text-center py-8 text-gray-400">
                No immediate prevention actions required.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
