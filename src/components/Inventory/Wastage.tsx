import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { 
  Plus,
  ChevronRight, CheckCircle2,
  Clock, AlertCircle, Check, Trash, Printer
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AttachmentManager } from '../Common/AttachmentManager';
import { useSettings } from '../../contexts/SettingsContext';
import { ExportButton } from '../Common/ExportButton';
import { PrintButton } from '../Common/PrintButton';
import { PrintHeader } from '../Common/PrintHeader';
import DocumentPrintModal from '../Common/DocumentPrintModal';
import { asArray, asObject } from '../../utils/apiShape';

export default function Wastage() {
  const queryClient = useQueryClient();
  const { format } = useSettings();
  const [activeRecordId, setActiveRecordId] = useState<string | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [printDoc, setPrintDoc] = useState<any>(null);
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const hasPermission = (p: string) => currentUser.role === 'super_admin' || currentUser.permissions?.includes(p);
  const canView = hasPermission('wastage.view');
  const canCreate = hasPermission('wastage.create');
  const canPost = hasPermission('wastage.post');

  const [newRecord, setNewRecord] = useState({
    godown_id: '',
    wastage_date: new Date().toISOString().split('T')[0],
    reason: '',
    remarks: '',
    severity: 'medium',
    category: 'operational',
    sub_category: '',
    items: [] as any[]
  });

  const { data: records = [], isLoading: recordsLoading } = useQuery<any[]>({
    queryKey: ["wastage"],
    queryFn: async () => {
      const res = await fetch('/api/wastage', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      return asArray<any>(await res.json());
    },
    enabled: canView
  });

  if (!canView) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-red-500 mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Access Denied</h2>
          <p className="text-slate-400">You do not have permission to view wastage records.</p>
        </div>
      </div>
    );
  }

  const handlePrintDoc = async (record: any) => {
    try {
      const res = await fetch(`/api/wastage/${record.id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) throw new Error('Failed to fetch wastage details');
      const data = await res.json();
      setPrintDoc(data);
    } catch (error) {
      console.error('Error fetching wastage details:', error);
      toast.error('Failed to load wastage details for printing.');
    }
  };

  const { data: godowns = [] } = useQuery<any[]>({
    queryKey: ["master-data", "godowns"],
    queryFn: async () => {
      const res = await fetch('/api/lookups/godowns?activeOnly=true', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      return asArray<any>(await res.json());
    },
    staleTime: 1000 * 60 * 10,
  });

  const { data: items = [] } = useQuery<any[]>({
    queryKey: ["master-data", "items"],
    queryFn: async () => {
      const res = await fetch('/api/lookups/items?activeOnly=true', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      return asArray<any>(await res.json());
    },
    staleTime: 1000 * 60 * 10,
  });

  const { data: activeRecord } = useQuery<any>({
    queryKey: ["wastage", activeRecordId],
    queryFn: async () => {
      const res = await fetch(`/api/wastage/${activeRecordId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      const json = await res.json();
      const normalized = asObject(json, { items: [] as any[] });
      return { ...normalized, items: asArray<any>(normalized.items) };
    },
    enabled: !!activeRecordId,
  });

  const activeRecordItems = asArray<any>(activeRecord?.items);

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch('/api/wastage', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error("Failed to create wastage record");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wastage"] });
      setShowNewModal(false);
    }
  });

  const postMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/wastage/${id}/post`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) {
        const data = await res.json() as any;
        throw new Error(data.message);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wastage", activeRecordId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      queryClient.invalidateQueries({ queryKey: ["recent-movements"] });
      queryClient.invalidateQueries({ queryKey: ["stock"] });
    },
    onError: (error: any) => {
      toast.error(error.message);
    }
  });

  const handleAddItem = () => {
    setNewRecord({
      ...newRecord,
      items: [...newRecord.items, { item_id: '', batch_id: '', quantity: 0, entered_unit_id: '', unit_cost: 0, total_cost: 0, reason_detail: '' }]
    });
  };

  const handleRemoveItem = (index: number) => {
    const newItems = [...newRecord.items];
    newItems.splice(index, 1);
    setNewRecord({ ...newRecord, items: newItems });
  };

  const handleItemChange = async (index: number, field: string, value: any) => {
    const newItems = [...newRecord.items];
    newItems[index][field] = value;

    if (field === 'item_id') {
      const item = items.find((i: any) => i.id === value);
      if (item) {
        newItems[index].entered_unit_id = item.base_unit_id;
        const res = await fetch(`/api/inventory/batches?itemId=${value}&godownId=${newRecord.godown_id}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        const batches = await res.json();
        newItems[index].batches = batches;
      }
    }

    if (field === 'batch_id') {
      const batch = newItems[index].batches?.find((b: any) => b.id === value);
      if (batch) {
        newItems[index].unit_cost = batch.current_cost;
      }
    }

    if (field === 'quantity' || field === 'unit_cost') {
      newItems[index].total_cost = (newItems[index].quantity || 0) * (newItems[index].unit_cost || 0);
    }

    setNewRecord({ ...newRecord, items: newItems });
  };

  const getExportColumns = () => {
    return [
      { header: 'Wastage No', key: 'wastage_number' },
      { header: 'Date', key: 'wastage_date' },
      { header: 'Godown', key: 'godown_name' },
      { header: 'Category', key: 'category' },
      { header: 'Severity', key: 'severity' },
      { header: 'Status', key: 'status' },
      { header: 'Reason', key: 'reason' },
      { header: 'Total Value', key: 'total_value' },
      { header: 'Created By', key: 'created_by_name' }
    ];
  };

  const getReportTitle = () => {
    return 'Wastage Report';
  };

  if (activeRecordId && activeRecord) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => { setActiveRecordId(null); queryClient.invalidateQueries({ queryKey: ["wastage"] }); }} className="p-2 hover:bg-slate-800 rounded-xl text-slate-400">
              <ChevronRight className="rotate-180" size={24} />
            </button>
            <div>
              <h2 className="text-2xl font-bold text-white tracking-tight">{activeRecord.wastage_number}</h2>
              <p className="text-slate-400 text-sm">{activeRecord.godown_name} • {new Date(activeRecord.wastage_date).toLocaleDateString()}</p>
            </div>
          </div>
          <div className="flex gap-3">
            {activeRecord.status === 'draft' && canPost && (
              <button 
                onClick={() => postMutation.mutate(activeRecord.id)} 
                disabled={postMutation.isPending}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                <Check size={18} />
                <span>{postMutation.isPending ? "Posting..." : "Post Wastage"}</span>
              </button>
            )}
            <span className={`px-4 py-2 rounded-xl text-sm font-bold uppercase tracking-wider flex items-center gap-2 ${
              activeRecord.status === 'posted' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'
            }`}>
              {activeRecord.status === 'posted' ? <CheckCircle2 size={18} /> : <Clock size={18} />}
              {activeRecord.status}
            </span>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Reason</label>
              <p className="text-white mt-1">{activeRecord.reason}</p>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Severity</label>
              <p className={`mt-1 font-bold capitalize ${
                activeRecord.severity === 'critical' ? 'text-red-500' : 
                activeRecord.severity === 'high' ? 'text-orange-500' : 'text-blue-500'
              }`}>{activeRecord.severity}</p>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Category</label>
              <p className="text-white mt-1 capitalize">{activeRecord.category} {activeRecord.sub_category ? `(${activeRecord.sub_category})` : ''}</p>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Remarks</label>
              <p className="text-white mt-1">{activeRecord.remarks || 'No remarks'}</p>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
          <AttachmentManager entityType="wastage" entityId={activeRecord.id} />
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-800/50">
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Item</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Batch</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Quantity</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Unit Cost</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Total Cost</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {activeRecordItems.map((item: any, i: number) => (
                <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-6 py-4 text-sm text-white font-medium">{item.item_name}</td>
                  <td className="px-6 py-4 text-sm text-slate-400 font-mono">{item.batch_number || 'N/A'}</td>
                  <td className="px-6 py-4 text-sm text-white text-right font-mono">{item.quantity}</td>
                  <td className="px-6 py-4 text-sm text-slate-400 text-right font-mono">{format(item.unit_cost || 0)}</td>
                  <td className="px-6 py-4 text-sm text-rose-400 text-right font-mono font-bold">{format(item.total_cost || 0)}</td>
                  <td className="px-6 py-4 text-sm text-slate-400">{item.reason_detail || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PrintHeader title={getReportTitle()} />
      <div className="flex items-center justify-between no-print">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Wastage Tracking</h2>
          <p className="text-slate-400 text-sm mt-1">Record and monitor stock wastage and losses.</p>
        </div>
        <div className="flex gap-3">
          <ExportButton 
            data={records}
            filename={`wastage_report_${new Date().toISOString().split('T')[0]}`}
            columns={getExportColumns()}
          />
          <PrintButton />
          {canCreate && (
            <button 
              onClick={() => setShowNewModal(true)}
              className="bg-rose-600 hover:bg-rose-500 text-white px-4 py-2 rounded-xl shadow-lg shadow-rose-600/20 transition-all flex items-center gap-2"
            >
              <Plus size={18} />
              <span>New Wastage Record</span>
            </button>
          )}
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-800/50">
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Number</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Godown</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Date</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Reason</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {recordsLoading ? (
                [1,2,3].map(i => <tr key={i} className="animate-pulse"><td colSpan={6} className="px-6 py-8"><div className="h-4 bg-slate-800 rounded w-full" /></td></tr>)
              ) : records.map((r: any, i: number) => (
                <tr key={i} className="hover:bg-slate-800/30 transition-colors group cursor-pointer" onClick={() => setActiveRecordId(r.id)}>
                  <td className="px-6 py-4 text-sm text-white font-bold">{r.wastage_number}</td>
                  <td className="px-6 py-4 text-sm text-slate-300">{r.godown_name}</td>
                  <td className="px-6 py-4 text-sm text-slate-400">{new Date(r.wastage_date).toLocaleDateString()}</td>
                  <td className="px-6 py-4 text-sm text-slate-400">{r.reason}</td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      r.status === 'posted' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'
                    }`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button 
                        onClick={(e) => { e.stopPropagation(); handlePrintDoc(r); }}
                        className="p-2 hover:bg-slate-700 rounded-lg text-slate-500 hover:text-white transition-colors"
                        title="Print Wastage"
                      >
                        <Printer size={18} />
                      </button>
                      <button className="p-2 hover:bg-slate-700 rounded-lg text-slate-500 hover:text-white transition-colors">
                        <ChevronRight size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Record Modal */}
      <AnimatePresence>
        {showNewModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl overflow-y-auto max-h-[90vh]"
            >
              <h3 className="text-xl font-bold text-white mb-6">New Wastage Record</h3>
              <div className="grid grid-cols-2 gap-6 mb-8">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Godown</label>
                  <select 
                    value={newRecord.godown_id}
                    onChange={(e) => setNewRecord({...newRecord, godown_id: e.target.value})}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">Select Godown...</option>
                    {godowns.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Date</label>
                  <input 
                    type="date"
                    value={newRecord.wastage_date}
                    onChange={(e) => setNewRecord({...newRecord, wastage_date: e.target.value})}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-300 mb-2">Reason</label>
                  <input 
                    type="text"
                    value={newRecord.reason}
                    onChange={(e) => setNewRecord({...newRecord, reason: e.target.value})}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="e.g. Damage, Expiry, Spillage"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Severity</label>
                  <select 
                    value={newRecord.severity}
                    onChange={(e) => setNewRecord({...newRecord, severity: e.target.value})}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Category</label>
                  <select 
                    value={newRecord.category}
                    onChange={(e) => setNewRecord({...newRecord, category: e.target.value})}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="operational">Operational</option>
                    <option value="quality">Quality Issue</option>
                    <option value="theft">Theft/Shrinkage</option>
                    <option value="expiry">Expiry</option>
                    <option value="damage">Damage</option>
                  </select>
                </div>
              </div>

              <div className="space-y-4 mb-8">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-500 uppercase tracking-widest">Wastage Items</h4>
                  <button onClick={handleAddItem} className="text-emerald-400 text-sm font-medium hover:underline flex items-center gap-1">
                    <Plus size={16} /> Add Item
                  </button>
                </div>
                {newRecord.items.map((item, i) => (
                  <div key={i} className="grid grid-cols-6 gap-3 p-4 bg-slate-800/50 rounded-2xl border border-slate-700/50 relative group">
                    <div className="col-span-2">
                      <select 
                        value={item.item_id}
                        onChange={(e) => handleItemChange(i, 'item_id', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="">Select Item...</option>
                        {items.map((it: any) => <option key={it.id} value={it.id}>{it.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <select 
                        value={item.batch_id}
                        onChange={(e) => handleItemChange(i, 'batch_id', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="">Select Batch...</option>
                        {item.batches?.map((b: any) => <option key={b.id} value={b.id}>{b.batch_number} (Qty: {b.current_quantity})</option>)}
                      </select>
                    </div>
                    <div>
                      <input 
                        type="number"
                        value={item.quantity}
                        onChange={(e) => handleItemChange(i, 'quantity', parseFloat(e.target.value))}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-500"
                        placeholder="Qty"
                      />
                    </div>
                    <div>
                      <input 
                        type="number"
                        value={item.unit_cost}
                        onChange={(e) => handleItemChange(i, 'unit_cost', parseFloat(e.target.value))}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-500"
                        placeholder="Cost"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-rose-400 font-bold text-sm">{format(item.total_cost || 0)}</span>
                      <button onClick={() => handleRemoveItem(i)} className="p-1.5 hover:bg-rose-500/10 text-rose-500 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                        <Trash size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-3 pt-4">
                <button onClick={() => setShowNewModal(false)} className="flex-1 px-4 py-3 rounded-xl border border-slate-700 text-slate-400 font-bold hover:bg-slate-800 transition-colors">Cancel</button>
                <button 
                  onClick={() => createMutation.mutate(newRecord)} 
                  disabled={createMutation.isPending}
                  className="flex-1 bg-rose-600 hover:bg-rose-500 text-white font-bold py-3 rounded-xl shadow-lg shadow-rose-600/20 transition-all disabled:opacity-50"
                >
                  {createMutation.isPending ? "Recording..." : "Record Wastage"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {printDoc && (
        <DocumentPrintModal
          isOpen={!!printDoc}
          onClose={() => setPrintDoc(null)}
          title="Wastage Report"
          documentNumber={printDoc.wastage_number}
          date={printDoc.wastage_date}
          status={printDoc.status}
          details={[
            { label: 'Godown', value: printDoc.godown_name },
            { label: 'Category', value: `${printDoc.category} ${printDoc.sub_category ? `(${printDoc.sub_category})` : ''}` },
            { label: 'Severity', value: printDoc.severity },
            { label: 'Reason', value: printDoc.reason },
            { label: 'Remarks', value: printDoc.remarks || '-' },
            { label: 'Created By', value: printDoc.created_by_name }
          ]}
          itemColumns={[
            { header: 'Item', key: 'item_name' },
            { header: 'Batch', key: 'batch_number' },
            { header: 'Reason', key: 'reason_detail' },
            { header: 'Qty', key: 'quantity', align: 'right' },
            { header: 'Unit Cost', key: 'unit_cost', align: 'right', isCurrency: true },
            { header: 'Total', key: 'total_cost', align: 'right', isCurrency: true }
          ]}
          items={asArray<any>(printDoc.items)}
          totals={[
            { label: 'Total Value', value: printDoc.total_value, isCurrency: true }
          ]}
          signatures={[
            'Prepared By',
            'Authorized By'
          ]}
        />
      )}
    </div>
  );
}
