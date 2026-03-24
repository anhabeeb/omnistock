import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { 
  Plus, Search,
  ChevronRight, CheckCircle2,
  Clock, AlertCircle, Save, Send, Check,
  RefreshCw, Scan, Printer
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import BarcodeScanModal from '../Alerts/BarcodeScanModal';
import { AttachmentManager } from '../Common/AttachmentManager';
import { ExportButton } from '../Common/ExportButton';
import { PrintButton } from '../Common/PrintButton';
import { PrintHeader } from '../Common/PrintHeader';
import DocumentPrintModal from '../Common/DocumentPrintModal';
import { asArray, asObject } from '../../utils/apiShape';

export default function StockCount() {
  const queryClient = useQueryClient();
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const hasPermission = (p: string) => currentUser.role === 'super_admin' || currentUser.permissions?.includes(p);
  const canView = hasPermission('stockcount.view');
  const canCreate = hasPermission('stockcount.create');
  const canSubmit = hasPermission('stockcount.submit');
  const canApprove = hasPermission('stockcount.approve');
  const canPost = hasPermission('stockcount.post');

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [newSession, setNewSession] = useState({ godown_id: '', remarks: '' });
  const [isScanModalOpen, setIsScanModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [printSession, setPrintSession] = useState<any | null>(null);

  const { data: sessions = [], isLoading: sessionsLoading } = useQuery<any[]>({
    queryKey: ["stock-counts"],
    queryFn: async () => {
      const res = await fetch('/api/stock-counts', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      return asArray<any>(await res.json());
    },
    enabled: canView
  });

  const { data: godowns = [] } = useQuery<any[]>({
    queryKey: ["master-data", "godowns"],
    queryFn: async () => {
      const res = await fetch('/api/lookups/godowns?activeOnly=true', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      return asArray<any>(await res.json());
    },
    enabled: canView,
    staleTime: 1000 * 60 * 10,
  });

  const { data: activeSession } = useQuery<any>({
    queryKey: ["stock-counts", activeSessionId],
    queryFn: async () => {
      const res = await fetch(`/api/stock-counts/${activeSessionId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      const json = await res.json();
      const normalized = asObject(json, { items: [] as any[] });
      return { ...normalized, items: asArray<any>(normalized.items) };
    },
    enabled: !!activeSessionId && canView,
  });

  const activeSessionItems = asArray<any>(activeSession?.items);

  if (!canView) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-red-500 mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Access Denied</h2>
          <p className="text-slate-400">You do not have permission to view stock counts.</p>
        </div>
      </div>
    );
  }

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch('/api/stock-counts', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(data)
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["stock-counts"] });
      setShowNewModal(false);
      setActiveSessionId(data.id);
    }
  });

  const loadStockMutation = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/stock-counts/${id}/load-system-stock`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock-counts", activeSessionId] });
    }
  });

  const updateCountMutation = useMutation({
    mutationFn: async ({ itemId, qty }: { itemId: string, qty: number }) => {
      await fetch(`/api/stock-counts/items/${itemId}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ counted_quantity: qty })
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock-counts", activeSessionId] });
    }
  });

  const submitMutation = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/stock-counts/${id}/submit`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock-counts", activeSessionId] });
    }
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/stock-counts/${id}/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock-counts", activeSessionId] });
    }
  });

  const postMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/stock-counts/${id}/post`, {
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
      queryClient.invalidateQueries({ queryKey: ["stock-counts", activeSessionId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      queryClient.invalidateQueries({ queryKey: ["recent-movements"] });
      queryClient.invalidateQueries({ queryKey: ["stock"] });
    },
    onError: (error: any) => {
      toast.error(error.message);
    }
  });

  const handleBarcodeScan = async (code: string) => {
    if (!activeSession) return;
    const item = activeSessionItems.find((i: any) => i.item_sku === code || i.barcode === code);
    if (item) {
      setSearchQuery(item.item_sku);
      const element = document.getElementById(`item-${item.id}`);
      if (element) element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      toast.error("Item not found in this count session. Ensure it has stock in this godown.");
    }
  };

  const handlePrintSession = async (session: any) => {
    try {
      const res = await fetch(`/api/stock-counts/${session.id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) throw new Error('Failed to fetch session details');
      const data = await res.json();
      setPrintSession(data);
    } catch (error) {
      console.error('Error fetching session details:', error);
      toast.error('Failed to load session details for printing');
    }
  };

  const exportColumns = [
    { header: 'Item Name', key: 'item_name' },
    { header: 'SKU', key: 'item_sku' },
    { header: 'Batch', key: 'batch_number' },
    { header: 'System Qty', key: 'system_quantity' },
    { header: 'Counted Qty', key: 'counted_quantity' },
    { header: 'Variance', key: 'variance_quantity' },
    { header: 'Variance Value', key: 'variance_value' }
  ];

  if (activeSessionId && activeSession) {
    return (
      <div className="space-y-6">
        <PrintHeader title={`Stock Count Session: ${activeSession.session_number}`} />
        <div className="flex items-center justify-between no-print">
          <div className="flex items-center gap-4">
            <button onClick={() => { setActiveSessionId(null); queryClient.invalidateQueries({ queryKey: ["stock-counts"] }); }} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl text-gray-500 dark:text-slate-400">
              <ChevronRight className="rotate-180" size={24} />
            </button>
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">{activeSession.session_number}</h2>
              <p className="text-gray-500 dark:text-slate-400 text-sm">{activeSession.godown_name} • {new Date(activeSession.count_date).toLocaleDateString()}</p>
            </div>
          </div>
          <div className="flex gap-3">
            <ExportButton data={activeSession.items} filename={`stock-count-${activeSession.session_number}`} columns={exportColumns} />
            <PrintButton />
            {activeSession.status === 'draft' && canCreate && (
              <>
                <button 
                  onClick={() => setIsScanModalOpen(true)}
                  className="bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-900 dark:text-white px-4 py-2 rounded-xl border border-gray-200 dark:border-slate-700 transition-colors flex items-center gap-2"
                >
                  <Scan size={18} />
                  <span>Scan Item</span>
                </button>
                <button 
                  onClick={() => loadStockMutation.mutate(activeSession.id)} 
                  disabled={loadStockMutation.isPending}
                  className="bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-900 dark:text-white px-4 py-2 rounded-xl border border-gray-200 dark:border-slate-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  <RefreshCw size={18} className={loadStockMutation.isPending ? "animate-spin" : ""} />
                  <span>{loadStockMutation.isPending ? "Loading..." : "Load System Stock"}</span>
                </button>
              </>
            )}
            {activeSession.status === 'draft' && canSubmit && (
              <button 
                onClick={() => submitMutation.mutate(activeSession.id)} 
                disabled={submitMutation.isPending}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                <Send size={18} />
                <span>{submitMutation.isPending ? "Submitting..." : "Submit for Approval"}</span>
              </button>
            )}
            {activeSession.status === 'submitted' && canApprove && (
              <button 
                onClick={() => approveMutation.mutate(activeSession.id)} 
                disabled={approveMutation.isPending}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                <Check size={18} />
                <span>{approveMutation.isPending ? "Approving..." : "Approve Session"}</span>
              </button>
            )}
            {activeSession.status === 'approved' && canPost && (
              <button 
                onClick={() => postMutation.mutate(activeSession.id)} 
                disabled={postMutation.isPending}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                <Save size={18} />
                <span>{postMutation.isPending ? "Posting..." : "Post Reconciliation"}</span>
              </button>
            )}
            <span className={`px-4 py-2 rounded-xl text-sm font-bold uppercase tracking-wider flex items-center gap-2 ${
              activeSession.status === 'posted' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'
            }`}>
              {activeSession.status === 'posted' ? <CheckCircle2 size={18} /> : <Clock size={18} />}
              {activeSession.status}
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl no-print">
          <AttachmentManager entityType="stock_count" entityId={activeSession.id} />
        </div>

        <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
          <div className="p-4 border-b border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800/20 no-print">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500" size={18} />
              <input 
                type="text"
                placeholder="Search items in session..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl pl-10 pr-4 py-2 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-emerald-500"
              />
            </div>
          </div>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 dark:bg-slate-800/50">
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Item</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Batch</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider text-right">System Qty</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider text-right">Counted Qty</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider text-right">Variance</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider text-right">Variance Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-slate-800">
              {activeSessionItems
                .filter((item: any) => 
                  item.item_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                  item.item_sku.toLowerCase().includes(searchQuery.toLowerCase())
                )
                .map((item: any, i: number) => (
                <tr key={i} id={`item-${item.id}`} className="hover:bg-gray-50 dark:hover:bg-slate-800/30 transition-colors">
                  <td className="px-6 py-4 text-sm text-gray-900 dark:text-white font-medium">{item.item_name} <span className="text-gray-500 dark:text-slate-500 text-xs ml-1">{item.item_sku}</span></td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-slate-400 font-mono">{item.batch_number || 'N/A'}</td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-slate-400 text-right font-mono">{item.system_quantity}</td>
                  <td className="px-6 py-4 text-right">
                    <input 
                      type="number"
                      defaultValue={item.counted_quantity}
                      disabled={!canCreate || (activeSession.status !== 'draft' && activeSession.status !== 'in_progress')}
                      onBlur={(e) => updateCountMutation.mutate({ itemId: item.id, qty: parseFloat(e.target.value) })}
                      className="w-24 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg px-2 py-1 text-right text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-emerald-500 disabled:opacity-50"
                    />
                  </td>
                  <td className={`px-6 py-4 text-sm text-right font-mono font-bold ${
                    item.variance_quantity > 0 ? 'text-emerald-600 dark:text-emerald-400' : item.variance_quantity < 0 ? 'text-red-600 dark:text-rose-400' : 'text-gray-500 dark:text-slate-500'
                  }`}>
                    {item.variance_quantity > 0 ? `+${item.variance_quantity}` : item.variance_quantity}
                  </td>
                  <td className={`px-6 py-4 text-sm text-right font-mono font-bold ${
                    item.variance_value > 0 ? 'text-emerald-600 dark:text-emerald-400' : item.variance_value < 0 ? 'text-red-600 dark:text-rose-400' : 'text-gray-500 dark:text-slate-500'
                  }`}>
                    ${item.variance_value?.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <BarcodeScanModal 
          isOpen={isScanModalOpen}
          onClose={() => setIsScanModalOpen(false)}
          onScan={handleBarcodeScan}
        />
      </div>
    );
  }

  const exportSessionsColumns = [
    { header: 'Session #', key: 'session_number' },
    { header: 'Godown', key: 'godown_name' },
    { header: 'Date', key: 'count_date' },
    { header: 'Status', key: 'status' },
    { header: 'Created By', key: 'creator_name' }
  ];

  return (
    <div className="space-y-6">
      <PrintHeader title="Stock Counts & Reconciliation" />
      <div className="flex items-center justify-between no-print">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">Stock Counts & Reconciliation</h2>
          <p className="text-gray-500 dark:text-slate-400 text-sm mt-1">Manage inventory audits and reconcile variances.</p>
        </div>
        <div className="flex items-center gap-3">
          <ExportButton data={sessions} filename="stock-counts" columns={exportSessionsColumns} />
          <PrintButton />
          {canCreate && (
            <button 
              onClick={() => setShowNewModal(true)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-2"
            >
              <Plus size={18} />
              <span>New Count Session</span>
            </button>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 dark:bg-slate-800/50">
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Session #</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Godown</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Date</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Created By</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider text-right no-print">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-slate-800">
              {sessionsLoading ? (
                [1,2,3].map(i => <tr key={i} className="animate-pulse"><td colSpan={6} className="px-6 py-8"><div className="h-4 bg-gray-200 dark:bg-slate-800 rounded w-full" /></td></tr>)
              ) : sessions.map((s: any, i: number) => (
                <tr key={i} className="hover:bg-gray-50 dark:hover:bg-slate-800/30 transition-colors group cursor-pointer" onClick={() => setActiveSessionId(s.id)}>
                  <td className="px-6 py-4 text-sm text-gray-900 dark:text-white font-bold">{s.session_number}</td>
                  <td className="px-6 py-4 text-sm text-gray-700 dark:text-slate-300">{s.godown_name}</td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-slate-400">{new Date(s.count_date).toLocaleDateString()}</td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      s.status === 'posted' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-500' : 
                      s.status === 'cancelled' ? 'bg-red-100 text-red-700 dark:bg-rose-500/10 dark:text-rose-500' : 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-500'
                    }`}>
                      {s.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-slate-400">{s.creator_name}</td>
                  <td className="px-6 py-4 text-right no-print">
                    <div className="flex items-center justify-end gap-2">
                      <button 
                        onClick={(e) => { e.stopPropagation(); handlePrintSession(s); }}
                        className="p-2 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-lg text-gray-500 dark:text-slate-500 hover:text-gray-900 dark:hover:text-white transition-colors"
                        title="Print Session"
                      >
                        <Printer size={18} />
                      </button>
                      <button className="p-2 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-lg text-gray-500 dark:text-slate-500 hover:text-gray-900 dark:hover:text-white transition-colors">
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

      {/* New Session Modal */}
      <AnimatePresence>
        {showNewModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm no-print">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-3xl p-8 shadow-2xl"
            >
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-6">New Stock Count Session</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Select Godown</label>
                  <select 
                    value={newSession.godown_id}
                    onChange={(e) => setNewSession({...newSession, godown_id: e.target.value})}
                    className="w-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-3 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-emerald-500"
                  >
                    <option value="">Select Godown...</option>
                    {godowns.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Remarks</label>
                  <textarea 
                    value={newSession.remarks}
                    onChange={(e) => setNewSession({...newSession, remarks: e.target.value})}
                    className="w-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-3 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-emerald-500 h-24 resize-none"
                    placeholder="Optional remarks..."
                  />
                </div>
                <div className="flex gap-3 pt-4">
                  <button onClick={() => setShowNewModal(false)} className="flex-1 px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 font-bold hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">Cancel</button>
                  <button 
                    onClick={() => createMutation.mutate(newSession)} 
                    disabled={createMutation.isPending}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl shadow-lg shadow-emerald-600/20 transition-all disabled:opacity-50"
                  >
                    {createMutation.isPending ? "Starting..." : "Start Session"}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {printSession && (
        <DocumentPrintModal
          isOpen={!!printSession}
          onClose={() => setPrintSession(null)}
          title="Stock Count Session"
          documentNumber={printSession.session_number}
          date={printSession.count_date}
          status={printSession.status}
          details={[
            { label: 'Godown', value: printSession.godown_name },
            { label: 'Created By', value: printSession.creator_name },
            { label: 'Remarks', value: printSession.remarks || 'N/A' },
            { label: 'Total Items', value: asArray<any>(printSession.items).length.toString() }
          ]}
          items={asArray<any>(printSession.items)}
          itemColumns={[
            { header: 'Item Name', key: 'item_name' },
            { header: 'SKU', key: 'item_sku' },
            { header: 'Batch', key: 'batch_number' },
            { header: 'System Qty', key: 'system_quantity', align: 'right' },
            { header: 'Counted Qty', key: 'counted_quantity', align: 'right' },
            { header: 'Variance', key: 'variance_quantity', align: 'right' },
            { header: 'Variance Value', key: 'variance_value', align: 'right', isCurrency: true }
          ]}
          totals={[
            { 
              label: 'Total Variance Value', 
              value: asArray<any>(printSession.items).reduce((sum: number, item: any) => sum + (Number(item.variance_value) || 0), 0),
              isCurrency: true
            }
          ]}
          signatures={['Counted By', 'Verified By', 'Approved By']}
        />
      )}
    </div>
  );
}
