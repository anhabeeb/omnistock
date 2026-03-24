import { useState } from 'react';
import { 
  AlertTriangle, Clock, Package, Trash2, 
  RefreshCw, AlertCircle
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { ExportButton } from '../Common/ExportButton';
import { PrintButton } from '../Common/PrintButton';
import { PrintHeader } from '../Common/PrintHeader';
import { asArray, asObject } from '../../utils/apiShape';

const emptyAlerts = {
  lowStock: [] as any[],
  nearExpiry: [] as any[],
  expired: [] as any[],
  deadStock: [] as any[],
};

export default function Alerts() {
  const [selectedGodown, setSelectedGodown] = useState('');
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const hasPermission = (p: string) => currentUser.role === 'super_admin' || currentUser.permissions?.includes(p);
  const canView = hasPermission('alerts.view');

  const { data: alerts, isLoading: alertsLoading, refetch: refetchAlerts } = useQuery<any>({
    queryKey: ['alerts-summary', selectedGodown],
    queryFn: async () => {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/alerts/summary?godownId=${selectedGodown}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch alerts');
      const json = await res.json();
      const normalized = asObject(json, emptyAlerts);
      return {
        lowStock: asArray<any>(normalized.lowStock),
        nearExpiry: asArray<any>(normalized.nearExpiry),
        expired: asArray<any>(normalized.expired),
        deadStock: asArray<any>(normalized.deadStock),
      };
    },
    enabled: canView,
    staleTime: 60000, // 60 seconds as per worker cache
  });

  const { data: godowns = [] } = useQuery<any[]>({
    queryKey: ['master-data', 'godowns', 'active'],
    queryFn: async () => {
      const res = await fetch('/api/lookups/godowns?activeOnly=true', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) throw new Error('Failed to fetch godowns');
      return asArray<any>(await res.json());
    },
    enabled: canView,
    staleTime: 1000 * 60 * 10, // 10 minutes
  });

  if (!canView) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-red-500 mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Access Denied</h2>
          <p className="text-slate-400">You do not have permission to view inventory alerts.</p>
        </div>
      </div>
    );
  }

  const getExportData = () => {
    if (!alerts) return [];
    const data: any[] = [];
    
    alerts.lowStock?.forEach((item: any) => {
      data.push({
        Type: 'Low Stock',
        Item: item.item_name || item.name,
        Godown: item.godown_name,
        Batch: item.batch_number || '-',
        'Current Qty': item.total_qty || item.quantity_on_hand,
        'Threshold/Expiry': item.reorder_level || '-'
      });
    });

    alerts.nearExpiry?.forEach((item: any) => {
      data.push({
        Type: 'Expiring Soon',
        Item: item.item_name || item.name,
        Godown: item.godown_name,
        Batch: item.batch_number || '-',
        'Current Qty': item.total_qty || item.quantity_on_hand,
        'Threshold/Expiry': item.expiry_date ? new Date(item.expiry_date).toLocaleDateString() : '-'
      });
    });

    alerts.expired?.forEach((item: any) => {
      data.push({
        Type: 'Expired',
        Item: item.item_name || item.name,
        Godown: item.godown_name,
        Batch: item.batch_number || '-',
        'Current Qty': item.total_qty || item.quantity_on_hand,
        'Threshold/Expiry': item.expiry_date ? new Date(item.expiry_date).toLocaleDateString() : '-'
      });
    });

    alerts.deadStock?.forEach((item: any) => {
      data.push({
        Type: 'Dead Stock',
        Item: item.item_name || item.name,
        Godown: item.godown_name,
        Batch: item.batch_number || '-',
        'Current Qty': item.total_qty || item.quantity_on_hand,
        'Threshold/Expiry': '-'
      });
    });

    return data;
  };

  const exportColumns = [
    { header: 'Alert Type', key: 'Type' },
    { header: 'Item Name', key: 'Item' },
    { header: 'Godown', key: 'Godown' },
    { header: 'Batch #', key: 'Batch' },
    { header: 'Current Qty', key: 'Current Qty' },
    { header: 'Threshold / Expiry', key: 'Threshold/Expiry' }
  ];

  const AlertSection = ({ title, icon: Icon, data, color, emptyMsg }: any) => (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
      <div className={`px-6 py-4 border-b border-slate-800 bg-${color}-500/5 flex items-center justify-between`}>
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl bg-${color}-500/10 text-${color}-500`}>
            <Icon size={20} />
          </div>
          <h3 className="text-lg font-bold text-white">{title}</h3>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-bold bg-${color}-500/10 text-${color}-500`}>
          {data?.length || 0} Issues
        </span>
      </div>
      <div className="divide-y divide-slate-800">
        {data?.length === 0 ? (
          <div className="p-8 text-center text-slate-500 font-medium">{emptyMsg}</div>
        ) : data?.map((item: any, i: number) => (
          <div key={i} className="p-6 hover:bg-slate-800/30 transition-colors flex items-center justify-between group">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-slate-400 group-hover:scale-110 transition-transform">
                <Package size={20} />
              </div>
              <div>
                <p className="font-bold text-white">{item.item_name || item.name}</p>
                <p className="text-xs text-slate-500 uppercase tracking-wider">
                  {item.godown_name} {item.batch_number ? `• Batch: ${item.batch_number}` : ''}
                </p>
              </div>
            </div>
            <div className="text-right">
              {item.reorder_level && (
                <div className="space-y-1">
                  <p className="text-xs text-slate-500 uppercase tracking-widest">Current / Reorder</p>
                  <p className="text-rose-400 font-bold font-mono">{item.total_qty} / {item.reorder_level}</p>
                </div>
              )}
              {item.expiry_date && (
                <div className="space-y-1">
                  <p className="text-xs text-slate-500 uppercase tracking-widest">Expiry Date</p>
                  <p className="text-rose-400 font-bold font-mono">{new Date(item.expiry_date).toLocaleDateString()}</p>
                </div>
              )}
              {item.quantity_on_hand && !item.reorder_level && (
                <div className="space-y-1">
                  <p className="text-xs text-slate-500 uppercase tracking-widest">Dead Stock Qty</p>
                  <p className="text-amber-400 font-bold font-mono">{item.quantity_on_hand}</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-8">
      <PrintHeader title="System Alerts & Monitoring" filters={selectedGodown ? `Godown: ${godowns.find(g => g.id === selectedGodown)?.name}` : 'All Godowns'} />
      <div className="flex items-center justify-between no-print">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">System Alerts & Monitoring</h2>
          <p className="text-slate-400 text-sm mt-1">Real-time monitoring of stock levels, expiry, and dead stock.</p>
        </div>
        <div className="flex gap-4 items-center">
          <select 
            value={selectedGodown}
            onChange={(e) => setSelectedGodown(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">All Godowns</option>
            {godowns.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <ExportButton data={getExportData()} filename="system-alerts" columns={exportColumns} />
          <PrintButton />
          <button 
            onClick={() => refetchAlerts()}
            className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 border border-slate-800"
          >
            <RefreshCw size={20} className={alertsLoading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <AlertSection 
          title="Low Stock Alerts" 
          icon={AlertTriangle} 
          data={alerts?.lowStock} 
          color="rose" 
          emptyMsg="All items are above reorder levels."
        />
        <AlertSection 
          title="Expiry Alerts (30 Days)" 
          icon={Clock} 
          data={alerts?.nearExpiry} 
          color="amber" 
          emptyMsg="No items expiring in the next 30 days."
        />
        <AlertSection 
          title="Expired Stock" 
          icon={AlertCircle} 
          data={alerts?.expired} 
          color="rose" 
          emptyMsg="No expired stock found."
        />
        <AlertSection 
          title="Dead Stock (90 Days)" 
          icon={Trash2} 
          data={alerts?.deadStock} 
          color="slate" 
          emptyMsg="No dead stock identified."
        />
      </div>
    </div>
  );
}
