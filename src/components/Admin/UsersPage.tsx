import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { 
  Search, 
  MoreVertical, 
  Shield, 
  CheckCircle2, 
  XCircle,
  Edit2,
  Lock,
  UserPlus,
  UserMinus,
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { TableSkeleton } from '../Common/LoadingSkeleton';
import { cn } from '../../utils/cn';
import { ExportButton } from '../Common/ExportButton';
import { PrintButton } from '../Common/PrintButton';
import { PrintHeader } from '../Common/PrintHeader';
import { asArray } from '../../utils/apiShape';

interface User {
  id: string;
  username: string;
  email: string;
  full_name: string;
  phone?: string;
  role_id: string;
  role_name: string;
  is_active: number;
  last_login?: string;
  created_at: string;
}

interface Role {
  id: string;
  name: string;
  description?: string;
}

function RoleCard({ role }: { role: Role }) {
  const { data: permissions = [], isLoading } = useQuery<string[]>({
    queryKey: ['role-permissions', role.id],
    queryFn: async () => {
      const res = await fetch(`/api/roles/${role.id}/permissions`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) throw new Error('Failed to fetch permissions');
      return asArray<string>(await res.json());
    }
  });

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-4">
      <h4 className="font-bold text-white mb-1">{role.name}</h4>
      <p className="text-xs text-slate-500 mb-4">{role.description}</p>
      
      <div className="space-y-1.5">
        {isLoading ? (
          <div className="h-4 bg-slate-700 rounded animate-pulse w-full" />
        ) : (
          permissions.map(p => (
            <div key={p} className="flex items-center gap-2 text-[10px] text-slate-400">
              <div className="w-1 h-1 rounded-full bg-emerald-500" />
              {p}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function UsersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string | ''>('');
  const [statusFilter, setStatusFilter] = useState<number | ''>('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resettingUser, setResettingUser] = useState<User | null>(null);

  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const hasPermission = (p: string) => currentUser.role === 'super_admin' || currentUser.permissions?.includes(p);
  const canManageTargetUser = (targetUser: User) => currentUser.role === 'super_admin' || targetUser.role_name !== 'super_admin';

  const canView = hasPermission('users.view');

  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ['users', search, roleFilter, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (roleFilter) params.append('role_id', roleFilter.toString());
      if (statusFilter !== '') params.append('is_active', statusFilter.toString());
      
      const res = await fetch(`/api/users?${params.toString()}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) throw new Error('Failed to fetch users');
      return asArray<User>(await res.json());
    },
    enabled: canView
  });

  const { data: roles = [] } = useQuery<Role[]>({
    queryKey: ['roles'],
    queryFn: async () => {
      const res = await fetch('/api/roles', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) throw new Error('Failed to fetch roles');
      return asArray<Role>(await res.json());
    },
    enabled: canView
  });

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

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string, active: boolean }) => {
      const endpoint = active ? 'deactivate' : 'reactivate';
      const res = await fetch(`/api/users/${id}/${endpoint}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      const payload = await res.json().catch(() => null) as { message?: string } | null;
      if (!res.ok) throw new Error(payload?.message || 'Failed to toggle status');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : 'Failed to toggle status');
    }
  });

  const saveUserMutation = useMutation({
    mutationFn: async (userData: any) => {
      const isEdit = !!userData.id;
      const res = await fetch(isEdit ? `/api/users/${userData.id}` : '/api/users', {
        method: isEdit ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(userData),
      });
      const payload = await res.json().catch(() => null) as { message?: string } | null;
      if (!res.ok) throw new Error(payload?.message || 'Failed to save user');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setIsModalOpen(false);
      setEditingUser(null);
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : 'Failed to save user');
    }
  });

  if (isLoading) return <TableSkeleton />;

  const exportColumns = [
    { header: 'Username', key: 'username' },
    { header: 'Full Name', key: 'full_name' },
    { header: 'Email', key: 'email' },
    { header: 'Phone', key: 'phone' },
    { header: 'Role', key: 'role_name' },
    { header: 'Status', key: 'is_active' },
    { header: 'Last Login', key: 'last_login' }
  ];

  const exportData = users.map(u => ({
    ...u,
    role_name: u.role_name || 'Unassigned Role',
    is_active: u.is_active ? 'Active' : 'Inactive',
    last_login: u.last_login ? new Date(u.last_login).toLocaleString() : 'Never'
  }));
  const assignableRoles = currentUser.role === 'super_admin'
    ? roles
    : roles.filter((role) => role.id !== 'role_super_admin');

  return (
    <div className="space-y-6">
      <PrintHeader title="User Management" filters={`Search: ${search || 'All'} | Role: ${roles.find(r => r.id === roleFilter)?.name || 'All'} | Status: ${statusFilter === 1 ? 'Active' : statusFilter === 0 ? 'Inactive' : 'All'}`} />
      <div className="flex items-center justify-between no-print">
        <div>
          <h2 className="text-2xl font-bold text-white">User Management</h2>
          <p className="text-slate-400 text-sm mt-1">Manage system users, roles and permissions.</p>
        </div>
        <div className="flex items-center gap-3">
          <ExportButton data={exportData} filename="users-list" columns={exportColumns} />
          <PrintButton />
          {hasPermission('users.create') && (
            <button 
              onClick={() => { setEditingUser(null); setIsModalOpen(true); }}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-2"
            >
              <UserPlus size={18} />
              <span>Add User</span>
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 flex flex-wrap items-center gap-4 no-print">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
          <input 
            type="text" 
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
          />
        </div>
        <select 
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
        >
          <option value="">All Roles</option>
          {roles.map(role => (
            <option key={role.id} value={role.id}>{role.name}</option>
          ))}
        </select>
        <select 
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value === '' ? '' : parseInt(e.target.value))}
          className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
        >
          <option value="">All Status</option>
          <option value="1">Active</option>
          <option value="0">Inactive</option>
        </select>
      </div>

      {/* Users Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-800/50">
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">User</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Role</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Last Login</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-slate-800/30 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-emerald-500 font-bold">
                        {user.full_name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-medium text-white">{user.full_name}</p>
                        <p className="text-xs text-slate-500">@{user.username}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                      <Shield size={12} />
                      {user.role_name || 'Unassigned Role'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {user.is_active ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                        <CheckCircle2 size={12} />
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-500 border border-rose-500/20">
                        <XCircle size={12} />
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-400">
                    {user.last_login ? new Date(user.last_login).toLocaleString() : 'Never'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {hasPermission('users.update') && canManageTargetUser(user) && (
                        <>
                          <button 
                            onClick={() => { setEditingUser(user); setIsModalOpen(true); }}
                            className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
                            title="Edit User"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button 
                            onClick={() => { setResettingUser(user); setIsResetModalOpen(true); }}
                            className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
                            title="Reset Password"
                          >
                            <Lock size={16} />
                          </button>
                          {hasPermission('onboarding.reset') && (
                            <button 
                              onClick={async () => {
                                if (window.confirm(`Are you sure you want to reset the tutorial for ${user.full_name}?`)) {
                                  try {
                                    const res = await fetch(`/api/onboarding/reset/${user.id}`, {
                                      method: 'POST',
                                      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
                                    });
                                    if (res.ok) toast.success('Tutorial reset successfully');
                                    else toast.error('Failed to reset tutorial');
                                  } catch (err) {
                                    toast.error('Error resetting tutorial');
                                  }
                                }
                              }}
                              className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
                              title="Reset Tutorial"
                            >
                              <Sparkles size={16} />
                            </button>
                          )}
                        </>
                      )}
                      {hasPermission('users.deactivate') && canManageTargetUser(user) && user.id !== currentUser.id && (
                        <button 
                          onClick={() => toggleStatusMutation.mutate({ id: user.id, active: !!user.is_active })}
                          className={cn(
                            "p-2 hover:bg-slate-800 rounded-lg transition-colors",
                            user.is_active ? "text-rose-400 hover:text-rose-300" : "text-emerald-400 hover:text-emerald-300"
                          )}
                          title={user.is_active ? "Deactivate" : "Reactivate"}
                        >
                          {user.is_active ? <UserMinus size={16} /> : <UserPlus size={16} />}
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

      {/* Role Permissions Viewer */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
            <Shield size={24} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Role Permissions Reference</h3>
            <p className="text-slate-400 text-sm">View permissions assigned to each system role.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {roles.map(role => (
            <div key={role.id}>
              <RoleCard role={role} />
            </div>
          ))}
        </div>
      </div>

      {/* User Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-slate-800 flex items-center justify-between">
                <h3 className="text-xl font-bold text-white">{editingUser ? 'Edit User' : 'Create New User'}</h3>
                <button onClick={() => setIsModalOpen(false)} className="text-slate-500 hover:text-white"><MoreVertical size={20} /></button>
              </div>
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  const data = Object.fromEntries(formData.entries());
                  if (editingUser) data.id = editingUser.id;
                  saveUserMutation.mutate(data);
                }}
                className="p-6 space-y-4"
              >
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-400">Full Name</label>
                  <input 
                    name="full_name"
                    defaultValue={editingUser?.full_name}
                    required
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-400">Username</label>
                    <input 
                      name="username"
                      defaultValue={editingUser?.username}
                      required
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-400">Role</label>
                    <select 
                      name="role_id"
                      defaultValue={editingUser?.role_id}
                      required
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                    >
                      {assignableRoles.map(role => (
                        <option key={role.id} value={role.id}>{role.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-400">Email Address</label>
                  <input 
                    name="email"
                    type="email"
                    defaultValue={editingUser?.email}
                    required
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-400">Phone (Optional)</label>
                  <input 
                    name="phone"
                    defaultValue={editingUser?.phone}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-400">{editingUser ? 'New Password (Leave blank to keep current)' : 'Password'}</label>
                  <input 
                    name="password"
                    type="password"
                    required={!editingUser}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
                <div className="pt-4 flex gap-3">
                  <button 
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 bg-slate-800 hover:bg-slate-700 text-white py-2 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={saveUserMutation.isPending}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded-xl shadow-lg shadow-emerald-600/20 transition-all"
                  >
                    {saveUserMutation.isPending ? 'Saving...' : 'Save User'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Reset Password Modal */}
      <AnimatePresence>
        {isResetModalOpen && resettingUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-slate-800 flex items-center justify-between">
                <h3 className="text-xl font-bold text-white">Reset Password</h3>
                <button onClick={() => setIsResetModalOpen(false)} className="text-slate-500 hover:text-white"><XCircle size={20} /></button>
              </div>
              <form 
                onSubmit={async (e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  const password = formData.get('password') as string;
                  
                  const res = await fetch(`/api/users/${resettingUser.id}/reset-password`, {
                    method: 'POST',
                    headers: { 
                      'Content-Type': 'application/json',
                      Authorization: `Bearer ${localStorage.getItem('token')}`
                    },
                    body: JSON.stringify({ password }),
                  });
                  
                  if (res.ok) {
                    setIsResetModalOpen(false);
                    setResettingUser(null);
                    toast.success('Password reset successfully');
                  } else {
                    toast.error('Failed to reset password');
                  }
                }}
                className="p-6 space-y-4"
              >
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-400">New Password for {resettingUser.full_name}</label>
                  <input 
                    name="password"
                    type="password"
                    required
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
                <div className="pt-4 flex gap-3">
                  <button 
                    type="button"
                    onClick={() => setIsResetModalOpen(false)}
                    className="flex-1 bg-slate-800 hover:bg-slate-700 text-white py-2 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded-xl shadow-lg shadow-emerald-600/20 transition-all"
                  >
                    Reset Password
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
