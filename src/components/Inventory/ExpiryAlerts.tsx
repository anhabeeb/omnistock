import React, { useState } from 'react';
import { AlertTriangle, Calendar, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { useQuery } from '@tanstack/react-query';
import { ExportButton } from '../Common/ExportButton';
import { PrintButton } from '../Common/PrintButton';
import { PrintHeader } from '../Common/PrintHeader';

const ExpiryAlerts: React.FC = () => {
  const [days, setDays] = useState(30);
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const hasPermission = (p: string) => currentUser.role === 'super_admin' || currentUser.permissions?.includes(p);
  const canView = hasPermission('inventory.view');

  const { data: alerts = [], isLoading } = useQuery<any[]>({
    queryKey: ['inventory', 'expiry-alerts', days],
    queryFn: async () => {
      const res = await fetch(`/api/inventory/expiry-alerts?days=${days}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) throw new Error('Failed to fetch expiry alerts');
      return res.json();
    },
    enabled: canView,
    staleTime: 60000, // 60 seconds
  });

  if (!canView) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-red-500 mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Access Denied</h2>
          <p className="text-slate-400">You do not have permission to view expiry alerts.</p>
        </div>
      </div>
    );
  }

  const exportColumns = [
    { header: 'Item Name', key: 'item_name' },
    { header: 'Godown', key: 'godown_name' },
    { header: 'Batch #', key: 'batch_number' },
    { header: 'Expiry Date', key: (row: any) => new Date(row.expiry_date).toLocaleDateString() },
    { header: 'Days Left', key: (row: any) => Math.ceil((new Date(row.expiry_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) },
    { header: 'Current Qty', key: 'current_quantity' }
  ];

  return (
    <div className="p-8">
      <PrintHeader title="Expiry Alerts" filters={`Alert Threshold: ${days} Days`} />
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4 no-print">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center">
            <AlertTriangle className="w-8 h-8 mr-3 text-rose-500" /> Expiry Alerts
          </h1>
          <p className="text-slate-400 mt-1">Batches nearing expiry within the next {days} days</p>
        </div>
        
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <label className="text-xs font-bold text-slate-500 uppercase">Alert Threshold (Days):</label>
            <select 
              value={days}
              onChange={e => setDays(parseInt(e.target.value))}
              className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-2 text-white focus:ring-2 focus:ring-rose-500"
            >
              <option value="7">7 Days</option>
              <option value="15">15 Days</option>
              <option value="30">30 Days</option>
              <option value="60">60 Days</option>
              <option value="90">90 Days</option>
            </select>
          </div>
          <ExportButton data={alerts} filename={`expiry-alerts-${days}-days`} columns={exportColumns} />
          <PrintButton />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <div className="bg-slate-900 rounded-3xl border border-slate-800 overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-800/50">
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Item</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Godown</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Batch #</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Expiry Date</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Days Left</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase text-right">Current Qty</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {isLoading ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-500">Scanning inventory for expiry alerts...</td></tr>
              ) : alerts.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-emerald-500 font-bold">No items found nearing expiry. All clear!</td></tr>
              ) : alerts.map((a: any, idx: number) => {
                const daysLeft = Math.ceil((new Date(a.expiry_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                const isExpired = daysLeft <= 0;
                
                return (
                  <motion.tr 
                    key={idx}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="px-6 py-4 font-bold text-white">{a.item_name}</td>
                    <td className="px-6 py-4 text-slate-300">{a.godown_name}</td>
                    <td className="px-6 py-4">
                      <span className="bg-slate-800 px-2 py-1 rounded text-xs font-mono text-slate-400">
                        {a.batch_number}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className={`flex items-center font-bold ${isExpired ? 'text-rose-500' : 'text-amber-500'}`}>
                        <Calendar className="w-4 h-4 mr-2" />
                        {new Date(a.expiry_date).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${isExpired ? 'bg-rose-500/20 text-rose-500' : 'bg-amber-500/20 text-amber-500'}`}>
                        {isExpired ? 'EXPIRED' : `${daysLeft} days left`}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-lg font-bold text-white">{a.current_quantity}</span>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ExpiryAlerts;
