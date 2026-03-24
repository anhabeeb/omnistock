import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Filter, 
  ChevronRight, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  XCircle,
  Truck,
  Printer
} from 'lucide-react';
import { StockRequest, Outlet } from '../../types';
import { ExportButton } from '../Common/ExportButton';
import { PrintButton } from '../Common/PrintButton';
import { PrintHeader } from '../Common/PrintHeader';
import DocumentPrintModal from '../Common/DocumentPrintModal';
import { asArray } from '../../utils/apiShape';

interface StockRequestListProps {
  onNewRequest: () => void;
  onViewRequest: (id: string) => void;
}

export const StockRequestList: React.FC<StockRequestListProps> = ({ onNewRequest, onViewRequest }) => {
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const hasPermission = (p: string) => currentUser.role === 'super_admin' || currentUser.permissions?.includes(p);
  const canView = hasPermission('requests.view');

  const [requests, setRequests] = useState<StockRequest[]>([]);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [printDoc, setPrintDoc] = useState<any>(null);

  useEffect(() => {
    if (canView) {
      fetchData();
    } else {
      setLoading(false);
    }
  }, [canView]);

  const fetchData = async () => {
    try {
      const [reqRes, outRes] = await Promise.all([
        fetch('/api/requests', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }),
        fetch('/api/lookups/outlets?activeOnly=true', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      ]);
      if (reqRes.ok) setRequests(asArray<StockRequest>(await reqRes.json()));
      if (outRes.ok) setOutlets(asArray<Outlet>(await outRes.json()));
    } catch (error) {
      console.error('Error fetching requests:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!canView) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-red-500 mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Access Denied</h2>
          <p className="text-slate-400">You do not have permission to view stock requests.</p>
        </div>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'draft': return <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-medium flex items-center gap-1"><Clock className="w-3 h-3" /> Draft</span>;
      case 'submitted': return <span className="px-2 py-1 bg-blue-100 text-blue-600 rounded-full text-xs font-medium flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Submitted</span>;
      case 'approved': return <span className="px-2 py-1 bg-emerald-100 text-emerald-600 rounded-full text-xs font-medium flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Approved</span>;
      case 'partially_fulfilled': return <span className="px-2 py-1 bg-orange-100 text-orange-600 rounded-full text-xs font-medium flex items-center gap-1"><Truck className="w-3 h-3" /> Partial</span>;
      case 'fulfilled': return <span className="px-2 py-1 bg-emerald-100 text-emerald-600 rounded-full text-xs font-medium flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Fulfilled</span>;
      case 'cancelled': return <span className="px-2 py-1 bg-red-100 text-red-600 rounded-full text-xs font-medium flex items-center gap-1"><XCircle className="w-3 h-3" /> Cancelled</span>;
      default: return <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">{status}</span>;
    }
  };

  const filteredRequests = requests.filter((r) => {
    const outletName = outlets.find((o) => o.id === r.outlet_id)?.name || '';
    return (
      r.request_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      outletName.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  if (loading) return <div className="p-8 text-center">Loading requests...</div>;

  const exportColumns = [
    { header: 'Request #', key: 'request_number' },
    { header: 'Outlet', key: 'outlet_name' },
    { header: 'Date', key: 'requested_date' },
    { header: 'Status', key: 'status' },
    { header: 'Created By', key: 'created_by' }
  ];

  const exportData = filteredRequests.map(r => ({
    ...r,
    outlet_name: outlets.find(o => o.id === r.outlet_id)?.name || 'Unknown Outlet',
    requested_date: new Date(r.requested_date).toLocaleDateString()
  }));

  const handlePrintDoc = async (e: React.MouseEvent, req: any) => {
    e.stopPropagation();
    try {
      const response = await fetch(`/api/requests/${req.id}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      if (!response.ok) throw new Error('Failed to fetch request details');
      const details = await response.json();
      setPrintDoc(details);
    } catch (error) {
      console.error("Failed to load request details for printing", error);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <PrintHeader title="Stock Requests" filters={`Search: ${searchTerm || 'All'}`} />
      <div className="flex justify-between items-center no-print">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Stock Requests</h1>
          <p className="text-sm text-gray-500">Manage outlet stock requests and warehouse dispatches</p>
        </div>
        <div className="flex items-center gap-3">
          <ExportButton data={exportData} filename="stock-requests" columns={exportColumns} />
          <PrintButton />
          <button 
            onClick={onNewRequest}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Request
          </button>
        </div>
      </div>

      <div className="flex gap-4 items-center bg-white p-4 rounded-xl border border-gray-100 shadow-sm no-print">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input 
            type="text"
            placeholder="Search by request # or outlet..."
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-sm font-medium">
          <Filter className="w-4 h-4" />
          Filters
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase font-medium">
              <tr>
                <th className="px-6 py-3">Request #</th>
                <th className="px-6 py-3">Outlet</th>
                <th className="px-6 py-3">Date</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Created By</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {filteredRequests.map((req) => (
                <tr 
                  key={req.id} 
                  className="hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => onViewRequest(req.id)}
                >
                  <td className="px-6 py-4 font-medium text-gray-900">{req.request_number}</td>
                  <td className="px-6 py-4 text-gray-600">
                    {outlets.find(o => o.id === req.outlet_id)?.name || 'Unknown Outlet'}
                  </td>
                  <td className="px-6 py-4 text-gray-500">
                    {new Date(req.requested_date).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    {getStatusBadge(req.status)}
                  </td>
                  <td className="px-6 py-4 text-gray-500">
                    {req.created_by}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={(e) => handlePrintDoc(e, req)}
                      className="p-2 hover:bg-gray-200 rounded-lg text-gray-400 hover:text-gray-600 transition-colors mr-2"
                      title="Print Document"
                    >
                      <Printer size={16} />
                    </button>
                    <ChevronRight className="w-4 h-4 text-gray-400 inline" />
                  </td>
                </tr>
              ))}
              {filteredRequests.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-400">
                    No stock requests found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {printDoc && (
        <DocumentPrintModal
          isOpen={!!printDoc}
          onClose={() => setPrintDoc(null)}
          title="Stock Request"
          documentNumber={printDoc.request_number}
          date={printDoc.requested_date}
          status={printDoc.status}
          details={[
            { label: 'Outlet', value: outlets.find(o => o.id === printDoc.outlet_id)?.name || 'Unknown Outlet' },
            { label: 'Remarks', value: printDoc.remarks || 'N/A' },
          ]}
          items={printDoc.items || []}
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
