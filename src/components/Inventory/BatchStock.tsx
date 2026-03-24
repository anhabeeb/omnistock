import React, { useState } from 'react';
import { Search, Calendar, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { useQuery } from '@tanstack/react-query';
import { useSettings } from '../../contexts/SettingsContext';
import { ExportButton } from '../Common/ExportButton';
import { PrintButton } from '../Common/PrintButton';
import { PrintHeader } from '../Common/PrintHeader';

const BatchStock: React.FC = () => {
  const { format } = useSettings();
  const [searchTerm, setSearchTerm] = useState('');

  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const hasPermission = (permission: string) => {
    if (currentUser.role === 'super_admin') return true;
    return currentUser.permissions?.includes(permission);
  };
  const canView = hasPermission('inventory.view');

  const { data: stock = [], isLoading } = useQuery<any[]>({
    queryKey: ['inventory', 'current-stock'],
    queryFn: async () => {
      const res = await fetch('/api/inventory/current-stock', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) throw new Error('Failed to fetch stock');
      return res.json();
    },
    staleTime: 60000, // 60 seconds
    enabled: canView,
  });

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-4">
          <AlertCircle className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">Access Denied</h2>
        <p className="text-slate-600 max-w-md">
          You do not have permission to view the batch stock. Please contact your system administrator if you believe this is an error.
        </p>
      </div>
    );
  }

  const filteredStock = stock.filter((s: any) => 
    s.item_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.item_sku?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.barcode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.batch_number?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const exportColumns = [
    { header: 'Item Name', key: 'item_name' },
    { header: 'SKU', key: 'item_sku' },
    { header: 'Barcode', key: 'barcode' },
    { header: 'Godown', key: 'godown_name' },
    { header: 'Batch #', key: 'batch_number' },
    { header: 'Expiry', key: 'expiry_date' },
    { header: 'On Hand', key: 'quantity_on_hand' },
    { header: 'Reserved', key: 'reserved_quantity' },
    { header: 'Avg Cost', key: 'average_unit_cost' }
  ];

  return (
    <div className="p-8">
      <PrintHeader title="Current Stock by Batch" filters={searchTerm ? `Search: ${searchTerm}` : undefined} />
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4 no-print">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Current Stock by Batch</h1>
          <p className="text-gray-500 dark:text-slate-400 mt-1">Real-time inventory levels across all godowns</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-slate-500" />
            <input 
              type="text"
              placeholder="Search items or batches..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl pl-12 pr-6 py-3 text-gray-900 dark:text-white w-full md:w-80 focus:ring-2 focus:ring-blue-500 dark:focus:ring-emerald-500 transition-all"
            />
          </div>
          <ExportButton data={filteredStock} filename="batch-stock" columns={exportColumns} />
          <PrintButton />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <div className="bg-slate-900 rounded-3xl border border-slate-800 overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-800/50">
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Item / SKU</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Godown</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Batch #</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Expiry</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase text-right">On Hand</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase text-right">Reserved</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase text-right">Avg Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {isLoading ? (
                <tr><td colSpan={7} className="px-6 py-12 text-center text-slate-500">Loading inventory data...</td></tr>
              ) : filteredStock.length === 0 ? (
                <tr><td colSpan={7} className="px-6 py-12 text-center text-slate-500">No stock found matching your search.</td></tr>
              ) : filteredStock.map((s: any, idx: number) => (
                <motion.tr 
                  key={idx}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: idx * 0.05 }}
                  className="hover:bg-slate-800/30 transition-colors"
                >
                  <td className="px-6 py-4">
                    <div className="font-bold text-white">{s.item_name}</div>
                    <div className="text-xs text-slate-500">{s.item_sku}</div>
                  </td>
                  <td className="px-6 py-4 text-slate-300">{s.godown_name}</td>
                  <td className="px-6 py-4">
                    <span className="bg-slate-800 px-2 py-1 rounded text-xs font-mono text-emerald-400">
                      {s.batch_number || 'N/A'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center text-slate-300">
                      <Calendar className="w-4 h-4 mr-2 text-slate-500" />
                      {s.expiry_date ? new Date(s.expiry_date).toLocaleDateString() : 'No Expiry'}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="text-lg font-bold text-white">{s.quantity_on_hand}</span>
                  </td>
                  <td className="px-6 py-4 text-right text-slate-400">{s.reserved_quantity || 0}</td>
                  <td className="px-6 py-4 text-right text-emerald-400 font-mono">
                    {format(s.average_unit_cost || 0)}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default BatchStock;
