import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { 
  Search, Package, ChevronRight, ScanLine, AlertCircle
} from 'lucide-react';
import BarcodeScanner from '../Common/BarcodeScanner';
import { TableSkeleton } from '../Common/LoadingSkeleton';
import type { Item } from '../../types';

export default function MobileInventory() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);

  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const hasPermission = (permission: string) => {
    if (currentUser.role === 'super_admin') return true;
    return currentUser.permissions?.includes(permission);
  };
  const canView = hasPermission('inventory.view');

  const fetchItems = async () => {
    if (!canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const token = localStorage.getItem('token');
    const res = await fetch('/api/lookups/items?activeOnly=true', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json() as Item[];
      setItems(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchItems();
  }, [canView]);

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-slate-900 rounded-3xl border border-slate-800 p-8 text-center m-4">
        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4">
          <AlertCircle className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Access Denied</h2>
        <p className="text-slate-400 max-w-md">
          You do not have permission to view inventory.
        </p>
      </div>
    );
  }

  const handleScan = async (code: string) => {
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/items/lookup-by-code?code=${code}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json() as Item;
      setSelectedItem(data);
    } else {
      toast.error("Item not found");
    }
  };

  const filteredItems = items.filter(i => 
    i.name.toLowerCase().includes(search.toLowerCase()) || 
    i.sku.toLowerCase().includes(search.toLowerCase())
  );

  if (selectedItem) {
    return (
      <div className="p-4 space-y-6">
        <button 
          onClick={() => setSelectedItem(null)}
          className="flex items-center gap-2 text-slate-400 text-[10px] font-bold uppercase tracking-widest"
        >
          <ChevronRight className="rotate-180" size={14} />
          Back to list
        </button>

        <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl space-y-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-slate-800 rounded-2xl flex items-center justify-center text-slate-400">
              <Package size={28} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight leading-tight">{selectedItem.name}</h2>
              <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">{selectedItem.sku}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-800">
              <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Stock Level</p>
              <p className="text-base font-bold text-white">1,240 <span className="text-[10px] text-slate-500 font-normal">units</span></p>
            </div>
            <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-800">
              <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Reorder</p>
              <p className="text-base font-bold text-white">{selectedItem.reorder_level} <span className="text-[10px] text-slate-500 font-normal">units</span></p>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Batches</h3>
            <div className="space-y-2">
              {[1, 2].map(i => (
                <div key={i} className="bg-slate-800/50 p-3 rounded-2xl border border-slate-800 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-white">BATCH-00{i}</p>
                    <p className="text-[10px] text-slate-500">Exp: 2026-12-31</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-emerald-500">620 units</p>
                    <p className="text-[9px] text-slate-500 uppercase tracking-widest">Main Godown</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Inventory</h1>
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">Stock Lookup</p>
        </div>
        <button 
          onClick={() => setShowScanner(true)}
          className="p-3 bg-emerald-600 rounded-2xl shadow-lg shadow-emerald-600/20 text-white"
        >
          <ScanLine size={20} />
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
        <input 
          type="text"
          placeholder="Search items or SKU..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-slate-900 border border-slate-800 rounded-2xl pl-12 pr-4 py-3 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
        />
      </div>

      <div className="space-y-2">
        {loading ? (
          <TableSkeleton rows={6} />
        ) : filteredItems.map(item => (
          <button 
            key={item.id}
            onClick={() => setSelectedItem(item)}
            className="w-full bg-slate-900 border border-slate-800 p-3 rounded-2xl flex items-center justify-between hover:bg-slate-800 transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center text-slate-400">
                <Package size={18} />
              </div>
              <div className="text-left">
                <p className="text-sm font-bold text-white leading-tight">{item.name}</p>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">{item.sku}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-right mr-2">
                <p className="text-xs font-bold text-emerald-500">1,240</p>
                <p className="text-[9px] text-slate-500 uppercase tracking-widest">Units</p>
              </div>
              <ChevronRight size={16} className="text-slate-700" />
            </div>
          </button>
        ))}
      </div>

      {showScanner && (
        <BarcodeScanner 
          onScan={handleScan}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  );
}
