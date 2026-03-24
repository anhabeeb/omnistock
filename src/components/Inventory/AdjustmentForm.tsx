import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Plus, Trash2, Save, ArrowLeft, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { useSettings } from '../../contexts/SettingsContext';
import type { Godown, Item, StockBatch, Unit } from '../../types';
import { asArray } from '../../utils/apiShape';

type AdjustmentDirection = 'plus' | 'minus';

interface AdjustmentLineItem {
  item_id: string;
  batch_id: string;
  direction: AdjustmentDirection;
  entered_quantity: number;
  entered_unit_id: number | '';
  unit_cost: number;
  total_cost: number;
  remarks: string;
}

interface AdjustmentFormData {
  adjustment_number: string;
  godown_id: string;
  adjustment_date: string;
  reason: string;
  remarks: string;
  items: AdjustmentLineItem[];
}

const AdjustmentForm: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { format } = useSettings();
  const [batches, setBatches] = useState<StockBatch[]>([]);
  
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const hasPermission = (p: string) => currentUser.role === 'super_admin' || currentUser.permissions?.includes(p);
  const canView = hasPermission('inventory.adjustment.create');

  const [formData, setFormData] = useState<AdjustmentFormData>({
    adjustment_number: `ADJ-${Date.now()}`,
    godown_id: '',
    adjustment_date: new Date().toISOString().split('T')[0],
    reason: '',
    remarks: '',
    items: []
  });

  const { data: godowns = [] } = useQuery<Godown[]>({
    queryKey: ["master-data", "godowns", "active"],
    queryFn: () => fetch('/api/lookups/godowns?activeOnly=true', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }).then(async (res) => asArray<Godown>(await res.json())),
    enabled: canView,
    staleTime: 1000 * 60 * 10,
  });

  const { data: items = [] } = useQuery<Item[]>({
    queryKey: ["master-data", "items", "active"],
    queryFn: () => fetch('/api/lookups/items?activeOnly=true', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }).then(async (res) => asArray<Item>(await res.json())),
    enabled: canView,
    staleTime: 1000 * 60 * 10,
  });

  const { data: units = [] } = useQuery<Unit[]>({
    queryKey: ["master-data", "units"],
    queryFn: () => fetch('/api/units', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }).then(async (res) => asArray<Unit>(await res.json())),
    enabled: canView,
    staleTime: 1000 * 60 * 10,
  });

  if (!canView) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-red-500 mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Access Denied</h2>
          <p className="text-slate-400">You do not have permission to view or create stock adjustments.</p>
        </div>
      </div>
    );
  }

  const mutation = useMutation({
    mutationFn: async (data: AdjustmentFormData) => {
      const res = await fetch('/api/adjustments', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(data)
      });
      if (!res.ok) {
        const err = await res.json() as any;
        throw new Error(err.message || "Failed to save adjustment");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      queryClient.invalidateQueries({ queryKey: ["recent-movements"] });
      queryClient.invalidateQueries({ queryKey: ["kpi"] });
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
      queryClient.invalidateQueries({ queryKey: ["stock"] });
      navigate('/inventory/adjustments');
    },
    onError: (error: any) => {
      toast.error(error.message);
    }
  });

  const fetchBatches = async (itemId: string, godownId: string) => {
    if (!itemId || !godownId) return;
    const res = await fetch(`/api/inventory/batches?itemId=${itemId}&godownId=${godownId}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
    const data = asArray<StockBatch>(await res.json());
    setBatches(data);
  };

  const addItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, {
        item_id: '',
        batch_id: '',
        direction: 'plus',
        entered_quantity: 0,
        entered_unit_id: '',
        unit_cost: 0,
        total_cost: 0,
        remarks: ''
      }]
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(formData);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-8 max-w-6xl mx-auto"
    >
      <div className="flex items-center justify-between mb-8">
        <button onClick={() => navigate(-1)} className="flex items-center text-slate-400 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5 mr-2" /> Back
        </button>
        <h1 className="text-3xl font-bold text-white">New Stock Adjustment</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-slate-900 p-6 rounded-3xl border border-slate-800">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Adjustment Number</label>
            <input type="text" value={formData.adjustment_number} readOnly className="w-full bg-slate-800 border-none rounded-xl px-4 py-3 text-white" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Godown</label>
            <select 
              required
              value={formData.godown_id}
              onChange={e => setFormData({...formData, godown_id: e.target.value})}
              className="w-full bg-slate-800 border-none rounded-xl px-4 py-3 text-white"
            >
              <option value="">Select Godown</option>
              {godowns.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Reason</label>
            <input 
              type="text" 
              required
              value={formData.reason}
              onChange={e => setFormData({...formData, reason: e.target.value})}
              placeholder="e.g., Damage, Correction"
              className="w-full bg-slate-800 border-none rounded-xl px-4 py-3 text-white"
            />
          </div>
        </div>

        <div className="bg-slate-900 rounded-3xl border border-slate-800 overflow-hidden">
          <div className="p-6 border-b border-slate-800 flex justify-between items-center">
            <h2 className="text-xl font-bold text-white">Adjustment Items</h2>
            <button type="button" onClick={addItem} className="bg-emerald-500 hover:bg-emerald-600 text-slate-900 px-4 py-2 rounded-xl font-bold flex items-center">
              <Plus className="w-5 h-5 mr-2" /> Add Item
            </button>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-800/50">
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Item</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Batch</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Type</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Qty</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Unit</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Unit Cost</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Total</th>
                  <th className="px-6 py-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {formData.items.map((item, index) => (
                  <tr key={index} className="hover:bg-slate-800/30">
                    <td className="px-4 py-3">
                      <select 
                        required
                        value={item.item_id}
                        onChange={e => {
                          const newItems = [...formData.items];
                          newItems[index].item_id = e.target.value;
                          setFormData({...formData, items: newItems});
                          fetchBatches(e.target.value, formData.godown_id);
                        }}
                        className="bg-slate-800 border-none rounded-lg px-3 py-2 text-white w-48"
                      >
                        <option value="">Select Item</option>
                        {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <select 
                        required
                        value={item.batch_id}
                        onChange={e => {
                          const newItems = [...formData.items];
                          newItems[index].batch_id = e.target.value;
                          setFormData({...formData, items: newItems});
                        }}
                        className="bg-slate-800 border-none rounded-lg px-3 py-2 text-white w-48"
                      >
                        <option value="">Select Batch</option>
                        {batches.map(b => <option key={b.id} value={b.id}>{b.batch_number} (Exp: {b.expiry_date})</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <select 
                        required
                        value={item.direction}
                        onChange={e => {
                          const newItems = [...formData.items];
                          newItems[index].direction = e.target.value as AdjustmentDirection;
                          setFormData({...formData, items: newItems});
                        }}
                        className="bg-slate-800 border-none rounded-lg px-3 py-2 text-white w-24"
                      >
                        <option value="plus">Plus (+)</option>
                        <option value="minus">Minus (-)</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <input 
                        type="number" 
                        required
                        value={item.entered_quantity}
                        onChange={e => {
                          const newItems = [...formData.items];
                          const qty = parseFloat(e.target.value);
                          newItems[index].entered_quantity = qty;
                          newItems[index].total_cost = qty * newItems[index].unit_cost;
                          setFormData({...formData, items: newItems});
                        }}
                        className="bg-slate-800 border-none rounded-lg px-3 py-2 text-white w-24"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <select 
                        required
                        value={item.entered_unit_id}
                        onChange={e => {
                          const newItems = [...formData.items];
                          newItems[index].entered_unit_id = parseInt(e.target.value);
                          setFormData({...formData, items: newItems});
                        }}
                        className="bg-slate-800 border-none rounded-lg px-3 py-2 text-white w-24"
                      >
                        <option value="">Unit</option>
                        {units.map(u => <option key={u.id} value={u.id}>{u.code}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <input 
                        type="number" 
                        required
                        value={item.unit_cost}
                        onChange={e => {
                          const newItems = [...formData.items];
                          const cost = parseFloat(e.target.value);
                          newItems[index].unit_cost = cost;
                          newItems[index].total_cost = cost * newItems[index].entered_quantity;
                          setFormData({...formData, items: newItems});
                        }}
                        className="bg-slate-800 border-none rounded-lg px-3 py-2 text-white w-24"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-slate-400 font-bold">{format(item.total_cost || 0)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => {
                        const newItems = [...formData.items];
                        newItems.splice(index, 1);
                        setFormData({...formData, items: newItems});
                      }} className="text-rose-500 hover:text-rose-400">
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex justify-end">
          <button 
            type="submit"
            disabled={mutation.isPending}
            className="bg-emerald-500 hover:bg-emerald-600 text-slate-900 px-8 py-4 rounded-2xl font-bold flex items-center shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50"
          >
            <Save className="w-6 h-6 mr-2" /> {mutation.isPending ? "Saving..." : "Save Adjustment Draft"}
          </button>
        </div>
      </form>
    </motion.div>
  );
};

export default AdjustmentForm;
