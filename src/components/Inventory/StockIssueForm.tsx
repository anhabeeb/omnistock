import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Plus, Trash2, Save, ArrowLeft, Search, Scan, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';
import BarcodeScanModal from '../Alerts/BarcodeScanModal';
import { asArray } from '../../utils/apiShape';

const StockIssueForm: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isScanModalOpen, setIsScanModalOpen] = useState(false);
  
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const hasPermission = (p: string) => currentUser.role === 'super_admin' || currentUser.permissions?.includes(p);
  const canView = hasPermission('inventory.issue.create');

  const [formData, setFormData] = useState({
    issue_number: `ISS-${Date.now()}`,
    outlet_id: '',
    source_godown_id: '',
    issue_date: new Date().toISOString().split('T')[0],
    remarks: '',
    items: [] as any[]
  });

  const { data: outlets = [] } = useQuery<any[]>({
    queryKey: ["master-data", "outlets"],
    queryFn: () => fetch('/api/lookups/outlets?activeOnly=true', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }).then(async (res) => asArray<any>(await res.json())),
    enabled: canView,
    staleTime: 1000 * 60 * 10,
  });

  const { data: godowns = [] } = useQuery<any[]>({
    queryKey: ["master-data", "godowns"],
    queryFn: () => fetch('/api/lookups/godowns?activeOnly=true', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }).then(async (res) => asArray<any>(await res.json())),
    enabled: canView,
    staleTime: 1000 * 60 * 10,
  });

  const { data: items = [] } = useQuery<any[]>({
    queryKey: ["master-data", "items"],
    queryFn: () => fetch('/api/lookups/items?activeOnly=true', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }).then(async (res) => asArray<any>(await res.json())),
    enabled: canView,
    staleTime: 1000 * 60 * 10,
  });

  const { data: units = [] } = useQuery<any[]>({
    queryKey: ["master-data", "units"],
    queryFn: () => fetch('/api/units', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }).then(async (res) => asArray<any>(await res.json())),
    enabled: canView,
    staleTime: 1000 * 60 * 10,
  });

  if (!canView) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-red-500 mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Access Denied</h2>
          <p className="text-slate-400">You do not have permission to view or create stock issues.</p>
        </div>
      </div>
    );
  }

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch('/api/issues', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(data)
      });
      if (!res.ok) {
        const err = await res.json() as any;
        throw new Error(err.message || "Failed to save issue");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      queryClient.invalidateQueries({ queryKey: ["recent-movements"] });
      queryClient.invalidateQueries({ queryKey: ["kpi"] });
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
      queryClient.invalidateQueries({ queryKey: ["stock"] });
      navigate('/inventory/issues');
    },
    onError: (error: any) => {
      toast.error(error.message);
    }
  });

  const addItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, {
        item_id: '',
        requested_quantity: 0,
        issued_quantity: 0,
        entered_unit_id: '',
        unit_cost: 0,
        total_cost: 0,
        allocations: []
      }]
    });
  };

  const fetchAllocations = async (index: number) => {
    const item = formData.items[index];
    if (!item.item_id || !formData.source_godown_id || item.issued_quantity <= 0) return;

    const res = await fetch(`/api/inventory/fefo-suggestions?itemId=${item.item_id}&godownId=${formData.source_godown_id}&quantity=${item.issued_quantity}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
    const data = await res.json() as any;
    
    const newItems = [...formData.items];
    newItems[index].allocations = data.allocations;
    setFormData({ ...formData, items: newItems });
  };

  const handleBarcodeScan = async (code: string) => {
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/items/lookup-by-code?code=${code}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      const item = await res.json() as any;
      setFormData({
        ...formData,
        items: [...formData.items, {
          item_id: item.id,
          requested_quantity: 1,
          issued_quantity: 1,
          entered_unit_id: item.base_unit_id,
          unit_cost: item.weighted_average_cost || 0,
          total_cost: item.weighted_average_cost || 0,
          allocations: []
        }]
      });
    } else {
      toast.error("Item not found for this barcode");
    }
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
        <h1 className="text-3xl font-bold text-white">New Stock Issue</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-slate-900 p-6 rounded-3xl border border-slate-800">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Issue Number</label>
            <input type="text" value={formData.issue_number} readOnly className="w-full bg-slate-800 border-none rounded-xl px-4 py-3 text-white" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Source Godown</label>
            <select 
              required
              value={formData.source_godown_id}
              onChange={e => setFormData({...formData, source_godown_id: e.target.value})}
              className="w-full bg-slate-800 border-none rounded-xl px-4 py-3 text-white"
            >
              <option value="">Select Godown</option>
              {godowns.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Destination Outlet</label>
            <select 
              required
              value={formData.outlet_id}
              onChange={e => setFormData({...formData, outlet_id: e.target.value})}
              className="w-full bg-slate-800 border-none rounded-xl px-4 py-3 text-white"
            >
              <option value="">Select Outlet</option>
              {outlets.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
        </div>

        <div className="bg-slate-900 rounded-3xl border border-slate-800 overflow-hidden">
          <div className="p-6 border-b border-slate-800 flex justify-between items-center">
            <h2 className="text-xl font-bold text-white">Items to Issue</h2>
            <div className="flex gap-2">
              <button 
                type="button"
                onClick={() => setIsScanModalOpen(true)}
                className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-xl font-bold flex items-center transition-colors border border-slate-700"
              >
                <Scan className="w-5 h-5 mr-2" /> Scan Item
              </button>
              <button type="button" onClick={addItem} className="bg-emerald-500 hover:bg-emerald-600 text-slate-900 px-4 py-2 rounded-xl font-bold flex items-center">
                <Plus className="w-5 h-5 mr-2" /> Add Item
              </button>
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-800/50">
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Item</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Qty</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Unit</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">Allocations</th>
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
                        }}
                        className="bg-slate-800 border-none rounded-lg px-3 py-2 text-white w-48"
                      >
                        <option value="">Select Item</option>
                        {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <input 
                        type="number" 
                        required
                        value={item.issued_quantity}
                        onChange={e => {
                          const newItems = [...formData.items];
                          newItems[index].issued_quantity = parseFloat(e.target.value);
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
                      <div className="flex flex-col space-y-1">
                        {((item as any).allocations || []).length > 0 ? (
                          ((item as any).allocations || []).map((a: any) => (
                            <div key={a.batch_id} className="text-xs text-slate-400">
                              Batch: {a.batch_number} - Qty: {a.allocated}
                            </div>
                          ))
                        ) : (
                          <button 
                            type="button"
                            onClick={() => fetchAllocations(index)}
                            className="flex items-center text-xs text-emerald-500 hover:text-emerald-400"
                          >
                            <Search className="w-3 h-3 mr-1" /> Suggest FEFO
                          </button>
                        )}
                      </div>
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
            <Save className="w-6 h-6 mr-2" /> {mutation.isPending ? "Saving..." : "Save Issue Draft"}
          </button>
        </div>
      </form>

      <BarcodeScanModal 
        isOpen={isScanModalOpen}
        onClose={() => setIsScanModalOpen(false)}
        onScan={handleBarcodeScan}
      />
    </motion.div>
  );
};

export default StockIssueForm;
