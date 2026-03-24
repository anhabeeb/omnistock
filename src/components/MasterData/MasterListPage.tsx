import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Search, Plus, MoreVertical, Edit, Trash2, Power, PowerOff, History, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import axios from "axios";
import { EntityActivity } from "../Activity/EntityActivity";
import { asArray } from "../../utils/apiShape";

export interface MasterDataColumn {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'email' | 'textarea' | 'checkbox';
  required?: boolean;
  hideInTable?: boolean;
}

interface MasterListPageProps {
  title: string;
  endpoint: string;
  columns: MasterDataColumn[];
  user: any;
  permissions: {
    view: string;
    create: string;
    update: string;
    delete: string;
  };
}

export const MasterListPage = ({ title, endpoint, columns, user, permissions }: MasterListPageProps) => {
  const queryClient = useQueryClient();
  const { id } = useParams();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [viewingHistoryItem, setViewingHistoryItem] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});
  const [search, setSearch] = useState("");

  const hasPermission = (action: keyof typeof permissions | 'deactivate') => {
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    
    // Deactivate uses the delete permission string (e.g., master.items.deactivate)
    const permissionKey = action === 'deactivate' ? 'delete' : action;
    return user.permissions?.includes(permissions[permissionKey]);
  };

  const canCreate = hasPermission('create');
  const canUpdate = hasPermission('update');
  const canDeactivate = hasPermission('deactivate');
  const canReactivate = canUpdate || canDeactivate;
  const canDelete = hasPermission('delete');
  const canView = hasPermission('view');

  const { data = [], isLoading } = useQuery<any[]>({
    queryKey: ["master-data", endpoint],
    queryFn: async () => {
      const res = await axios.get(`/api/${endpoint}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
      });
      return asArray<any>(res.data);
    },
    enabled: !!user && canView,
    staleTime: 0, // Always revalidate on mount/focus for master data
    gcTime: 1000 * 60 * 5, // Keep in cache for 5 minutes
  });

  // Handle initial ID from URL
  useEffect(() => {
    if (id && data.length > 0) {
      const item = data.find(i => i.id === id);
      if (item) {
        setViewingHistoryItem(item);
      }
    }
  }, [id, data]);

  if (!canView) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-slate-300 mb-2">Access Denied</h2>
          <p className="text-slate-500">You do not have permission to view this page.</p>
        </div>
      </div>
    );
  }

  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      const config = { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } };
      if (editingItem) {
        await axios.put(`/api/${endpoint}/${editingItem.id}`, data, config);
      } else {
        await axios.post(`/api/${endpoint}`, data, config);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["master-data", endpoint] });
      setIsModalOpen(false);
      setEditingItem(null);
      setFormData({});
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "An error occurred");
    }
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async (item: any) => {
      const config = { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } };
      const action = item.is_active ? 'deactivate' : 'reactivate';
      await axios.post(`/api/${endpoint}/${item.id}/${action}`, {}, config);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["master-data", endpoint] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "An error occurred");
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const config = { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } };
      await axios.delete(`/api/${endpoint}/${id}`, config);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["master-data", endpoint] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "An error occurred");
    }
  });

  const handleEdit = (item: any) => {
    setEditingItem(item);
    setFormData(item);
    setIsModalOpen(true);
  };

  const handleAddNew = () => {
    setEditingItem(null);
    const initialData: any = {};
    columns.forEach(col => {
      if (col.type === 'checkbox') {
        initialData[col.key] = col.key === 'is_active' ? true : false;
      }
    });
    setFormData(initialData);
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(formData);
  };

  const filteredData = data.filter(item => 
    columns.some(col => String(item[col.key] || '').toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">{title}</h2>
        {canCreate && (
          <button 
            onClick={handleAddNew}
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-2"
          >
            <Plus size={18} />
            <span>Add New</span>
          </button>
        )}
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center gap-4 bg-slate-900/50">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
            <input 
              type="text" 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${title.toLowerCase()}...`}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-800/50">
                {columns.filter(col => !col.hideInTable).map(col => (
                  <th key={col.key} className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    {col.label}
                  </th>
                ))}
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {isLoading ? (
                [1,2,3,4,5].map(i => (
                  <tr key={i} className="animate-pulse">
                    {columns.filter(col => !col.hideInTable).map(col => (
                      <td key={col.key} className="px-6 py-4"><div className="h-4 bg-slate-800 rounded w-24" /></td>
                    ))}
                    <td className="px-6 py-4"><div className="h-4 bg-slate-800 rounded w-8 ml-auto" /></td>
                  </tr>
                ))
              ) : filteredData.map((item: any, i: number) => (
                <tr key={i} className="hover:bg-slate-800/30 transition-colors group">
                  {columns.filter(col => !col.hideInTable).map(col => (
                    <td key={col.key} className="px-6 py-4 text-sm text-slate-300">
                      {col.key === 'is_active' ? (
                        <span className={`px-2 py-1 rounded-full text-xs ${item.is_active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                          {item.is_active ? 'Active' : 'Inactive'}
                        </span>
                      ) : (
                        item[col.key]
                      )}
                    </td>
                  ))}
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      {canUpdate && (
                        <button onClick={() => handleEdit(item)} className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors" title="Edit">
                          <Edit size={16} />
                        </button>
                      )}
                      <button 
                        onClick={() => setViewingHistoryItem(item)} 
                        className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-emerald-400 transition-colors"
                        title="View History"
                      >
                        <History size={16} />
                      </button>
                      {((item.is_active && canDeactivate) || (!item.is_active && canReactivate)) && (
                        <button onClick={() => toggleStatusMutation.mutate(item)} className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors">
                          {item.is_active ? <PowerOff size={16} className="text-rose-400" /> : <Power size={16} className="text-emerald-400" />}
                        </button>
                      )}
                      {canDelete && (
                        <button onClick={() => { if(window.confirm('Are you sure you want to delete this item?')) deleteMutation.mutate(item.id) }} className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-rose-400 transition-colors">
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-slate-800 flex items-center justify-between">
                <h3 className="text-xl font-bold text-white">
                  {editingItem ? `Edit ${title}` : `Add New ${title}`}
                </h3>
                <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white">
                  <MoreVertical size={20} className="rotate-90" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {columns.map(col => (
                    <div key={col.key} className={col.type === 'textarea' ? 'md:col-span-2' : ''}>
                      <label className="block text-sm font-medium text-slate-400 mb-2">
                        {col.label} {col.required && <span className="text-rose-500">*</span>}
                      </label>
                      {col.type === 'textarea' ? (
                        <textarea
                          required={col.required}
                          value={formData[col.key] || ''}
                          onChange={e => setFormData({...formData, [col.key]: e.target.value})}
                          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                          rows={3}
                        />
                      ) : col.type === 'checkbox' ? (
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!formData[col.key]}
                            onChange={e => setFormData({...formData, [col.key]: e.target.checked})}
                            className="w-5 h-5 rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 bg-slate-800"
                          />
                          <span className="text-slate-300">Enable</span>
                        </label>
                      ) : (
                        <input
                          type={col.type || 'text'}
                          required={col.required}
                          value={formData[col.key] || ''}
                          onChange={e => setFormData({...formData, [col.key]: col.type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value})}
                          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                        />
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-8 flex justify-end gap-4">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-6 py-2 rounded-xl text-slate-300 hover:bg-slate-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saveMutation.isPending}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded-xl shadow-lg shadow-emerald-600/20 transition-all disabled:opacity-50"
                  >
                    {saveMutation.isPending ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {viewingHistoryItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-end p-0 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="bg-slate-900 border-l border-slate-800 w-full max-w-md h-full shadow-2xl flex flex-col"
            >
              <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
                <div>
                  <h3 className="text-xl font-bold text-white">History</h3>
                  <p className="text-sm text-slate-400">{viewingHistoryItem.name || viewingHistoryItem.code}</p>
                </div>
                <button 
                  onClick={() => setViewingHistoryItem(null)} 
                  className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              
              <div className="flex-1 overflow-hidden p-6">
                <EntityActivity 
                  entityType={endpoint.endsWith('s') ? endpoint.slice(0, -1) : endpoint} 
                  entityId={viewingHistoryItem.id} 
                  hideHeader={true}
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
