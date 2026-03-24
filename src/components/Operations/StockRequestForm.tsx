import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { 
  Plus, 
  Trash2, 
  Save, 
  Send, 
  CheckCircle2, 
  XCircle, 
  ChevronLeft,
  Package,
  AlertCircle,
  Printer
} from 'lucide-react';
import { Item, Outlet, StockRequest } from '../../types';
import { AttachmentManager } from '../Common/AttachmentManager';
import DocumentPrintModal from '../Common/DocumentPrintModal';
import { asArray, asObject } from '../../utils/apiShape';

interface StockRequestFormProps {
  requestId?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const StockRequestForm: React.FC<StockRequestFormProps> = ({ requestId, onClose, onSuccess }) => {
  const [items, setItems] = useState<Item[]>([]);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [request, setRequest] = useState<StockRequest | null>(null);
  const [showPrintModal, setShowPrintModal] = useState(false);

  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const hasPermission = (p: string) => currentUser.role === 'super_admin' || currentUser.permissions?.includes(p);
  const canView = hasPermission('requests.view') || hasPermission('requests.create');

  const [formData, setFormData] = useState({
    outlet_id: '',
    requested_date: new Date().toISOString().split('T')[0],
    remarks: '',
    items: [] as any[]
  });

  useEffect(() => {
    if (canView) {
      fetchData();
    } else {
      setLoading(false);
    }
  }, [requestId, canView]);

  if (!canView) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-red-500 mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Access Denied</h2>
          <p className="text-slate-400">You do not have permission to view or create stock requests.</p>
        </div>
      </div>
    );
  }

  const fetchData = async () => {
    try {
      const [itemsRes, outletsRes] = await Promise.all([
        fetch('/api/lookups/items?activeOnly=true', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }),
        fetch('/api/lookups/outlets?activeOnly=true', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      ]);
      
      if (itemsRes.ok) setItems(asArray<Item>(await itemsRes.json()));
      if (outletsRes.ok) setOutlets(asArray<Outlet>(await outletsRes.json()));

      if (requestId) {
        const reqRes = await fetch(`/api/requests/${requestId}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
        if (reqRes.ok) {
          const json = await reqRes.json();
          const data = asObject(json, { items: [] as any[] }) as StockRequest;
          setRequest(data);
          setFormData({
            outlet_id: data.outlet_id,
            requested_date: data.requested_date,
            remarks: data.remarks || '',
            items: asArray<any>(data.items).map((i: any) => ({
              id: i.id,
              item_id: i.item_id,
              requested_quantity: i.requested_quantity,
              remarks: i.remarks || ''
            }))
          });
        }
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const addItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { item_id: '', requested_quantity: 1, remarks: '' }]
    });
  };

  const removeItem = (index: number) => {
    const newItems = [...formData.items];
    newItems.splice(index, 1);
    setFormData({ ...formData, items: newItems });
  };

  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...formData.items];
    newItems[index] = { ...newItems[index], [field]: value };
    setFormData({ ...formData, items: newItems });
  };

  const handleAction = async (action: 'submit' | 'approve' | 'fulfill' | 'cancel') => {
    setSubmitting(true);
    try {
      const actionPayload =
        action === 'approve'
          ? {
              items: (request?.items || []).map((item: any) => ({
                id: item.id,
                approved_quantity: item.approved_quantity ?? item.requested_quantity,
              })),
            }
          : action === 'fulfill'
            ? {
                items: (request?.items || [])
                  .map((item: any) => ({
                    id: item.id,
                    quantity: Math.max((item.approved_quantity ?? item.requested_quantity ?? 0) - (item.fulfilled_quantity ?? 0), 0),
                  }))
                  .filter((item: any) => item.quantity > 0),
              }
            : undefined;

      const res = await fetch(`/api/requests/${requestId}/${action}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
          ...(actionPayload ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(actionPayload ? { body: JSON.stringify(actionPayload) } : {}),
      });

      if (res.ok) {
        onSuccess();
      } else {
        const error = await res.json() as { message: string };
        toast.error(`Error: ${error.message}`);
      }
    } catch (error) {
      console.error(`Error during ${action}:`, error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (submit: boolean = false) => {
    if (!formData.outlet_id || formData.items.length === 0) {
      toast.error("Please select an outlet and add at least one item.");
      return;
    }

    setSubmitting(true);
    try {
      const url = requestId ? `/api/requests/${requestId}` : '/api/requests';
      const method = requestId ? 'PUT' : 'POST';
      
      const res = await fetch(url, {
        method,
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(formData)
      });

      if (res.ok) {
        const result = await res.json() as { id: string };
        const currentId = requestId || result.id;
        
        if (submit) {
          await fetch(`/api/requests/${currentId}/submit`, { method: 'POST' , headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
        }
        
        onSuccess();
      } else {
        const error = await res.json() as { message: string };
        toast.error(`Error: ${error.message}`);
      }
    } catch (error) {
      console.error('Error saving request:', error);
      toast.error('Failed to save request.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-8 text-center">Loading form...</div>;

  const isReadOnly = request && request.status !== 'draft';

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {requestId ? `Request ${request?.request_number}` : 'New Stock Request'}
            </h1>
            {request && (
              <p className="text-sm text-gray-500">Status: <span className="font-bold uppercase">{request.status}</span></p>
            )}
          </div>
        </div>
        <div className="flex gap-3">
          {request && (
            <button 
              onClick={() => setShowPrintModal(true)}
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-sm font-medium"
            >
              <Printer className="w-4 h-4" />
              Print
            </button>
          )}
          {!isReadOnly && (
            <>
              <button 
                onClick={() => handleSubmit(false)}
                disabled={submitting}
                className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-sm font-medium disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                Save Draft
              </button>
              <button 
                onClick={() => handleSubmit(true)}
                disabled={submitting}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                Submit Request
              </button>
            </>
          )}
          {request?.status === 'submitted' && (
            <button 
              onClick={() => handleAction('approve')}
              disabled={submitting}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              Approve Request
            </button>
          )}
          {request?.status === 'approved' && (
            <button 
              onClick={() => handleAction('fulfill')}
              disabled={submitting}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50"
            >
              <Package className="w-4 h-4" />
              Fulfill & Dispatch
            </button>
          )}
          {request && request.status !== 'cancelled' && request.status !== 'fulfilled' && (
            <button 
              onClick={() => handleAction('cancel')}
              disabled={submitting}
              className="flex items-center gap-2 px-4 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 text-sm font-medium disabled:opacity-50"
            >
              <XCircle className="w-4 h-4" />
              Cancel
            </button>
          )}
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Requesting Outlet</label>
            <select 
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              value={formData.outlet_id}
              onChange={(e) => setFormData({ ...formData, outlet_id: e.target.value })}
            >
              <option value="">Select Outlet</option>
              {outlets.map(o => (
                <option key={o.id} value={o.id}>{o.name} ({o.code})</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Requested Date</label>
            <input 
              type="date"
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              value={formData.requested_date}
              onChange={(e) => setFormData({ ...formData, requested_date: e.target.value })}
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Remarks</label>
          <textarea 
            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            rows={2}
            placeholder="Add any special instructions or notes..."
            value={formData.remarks}
            onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
          />
        </div>

        {requestId && (
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
            <AttachmentManager entityType="request" entityId={requestId} />
          </div>
        )}

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-gray-900">Requested Items</h3>
            <button 
              onClick={addItem}
              className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              Add Item
            </button>
          </div>

          <div className="border border-gray-100 rounded-xl overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase font-medium">
                <tr>
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3 w-32">Quantity</th>
                  <th className="px-4 py-3">Remarks</th>
                  <th className="px-4 py-3 w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {formData.items.map((item, idx) => (
                  <tr key={idx}>
                    <td className="px-4 py-3">
                      <select 
                        className="w-full px-2 py-1.5 border border-gray-200 rounded bg-white"
                        value={item.item_id}
                        onChange={(e) => updateItem(idx, 'item_id', e.target.value)}
                      >
                        <option value="">Select Item</option>
                        {items.map(i => (
                          <option key={i.id} value={i.id}>{i.name} ({i.sku})</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <input 
                        type="number"
                        className="w-full px-2 py-1.5 border border-gray-200 rounded"
                        value={item.requested_quantity}
                        onChange={(e) => updateItem(idx, 'requested_quantity', parseFloat(e.target.value))}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input 
                        type="text"
                        className="w-full px-2 py-1.5 border border-gray-200 rounded"
                        placeholder="e.urgent..."
                        value={item.remarks}
                        onChange={(e) => updateItem(idx, 'remarks', e.target.value)}
                      />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button 
                        onClick={() => removeItem(idx)}
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {formData.items.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-400 italic">
                      No items added yet. Click "Add Item" to start.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {request && showPrintModal && (
        <DocumentPrintModal
          isOpen={showPrintModal}
          onClose={() => setShowPrintModal(false)}
          title="Stock Request"
          documentNumber={request.request_number}
          date={request.requested_date}
          status={request.status}
          details={[
            { label: 'Outlet', value: outlets.find(o => o.id === request.outlet_id)?.name || 'Unknown Outlet' },
            { label: 'Remarks', value: request.remarks || 'N/A' },
          ]}
          items={request.items || []}
          itemColumns={[
            { header: 'Item', key: 'item_id' },
            { header: 'Requested Qty', key: 'requested_quantity', align: 'right' },
            { header: 'Approved Qty', key: 'approved_quantity', align: 'right' },
            { header: 'Fulfilled Qty', key: 'fulfilled_quantity', align: 'right' },
            { header: 'Remarks', key: 'remarks' },
          ]}
          signatures={[
            'Requested By',
            'Approved By',
            'Fulfilled By'
          ]}
        />
      )}
    </div>
  );
};
