import React, { useState } from 'react';
import { 
  LayoutDashboard, Package, ArrowUpRight, ArrowDownLeft, 
  RefreshCw, Trash2, Search, User, LogOut, Menu, X, 
  BarChart3, AlertCircle, ScanLine
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SyncStatus } from '../SyncStatus';

interface MobileLayoutProps {
  children: React.ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
  user: any;
  onLogout: () => void;
}

export default function MobileLayout({ children, activeTab, onTabChange, user, onLogout }: MobileLayoutProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const tabs = [
    { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
    { id: 'inventory', label: 'Stock', icon: Package, permission: 'inventory.view' },
    { id: 'operations', label: 'Ops', icon: ScanLine, permission: 'inventory.view' },
    { id: 'alerts', label: 'Alerts', icon: AlertCircle, permission: 'alerts.view' },
  ];

  const filteredTabs = tabs.filter(tab => !tab.permission || user?.role === 'super_admin' || user?.permissions?.includes(tab.permission));

  const menuItems = [
    { id: 'grn', label: 'Receive Stock (GRN)', icon: ArrowDownLeft, permission: 'inventory.grn.create' },
    { id: 'issue', label: 'Issue to Outlet', icon: ArrowUpRight, permission: 'inventory.issue.create' },
    { id: 'transfer', label: 'Transfer Stock', icon: RefreshCw, permission: 'inventory.transfer.create' },
    { id: 'stock-count', label: 'Stock Count', icon: Search, permission: 'stockcount.create' },
    { id: 'wastage', label: 'Wastage Entry', icon: Trash2, permission: 'wastage.create' },
    { id: 'finance', label: 'Finance & Profit', icon: BarChart3, permission: 'finance.view' },
  ];

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-black/80 backdrop-blur-xl border-b border-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="/icon.png" alt="OmniStock Logo" className="w-8 h-8 object-contain" />
          <span className="font-bold text-lg tracking-tight">OmniStock</span>
        </div>
        <div className="flex items-center gap-3">
          <SyncStatus className="static shadow-none border-none bg-transparent p-0" />
          <button 
            onClick={() => setIsMenuOpen(true)}
            className="p-2 bg-slate-900 rounded-xl border border-slate-800 text-slate-400"
          >
            <Menu size={20} />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 pb-24 overflow-x-hidden">
        {children}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-xl border-t border-slate-800 px-6 py-3 flex items-center justify-between">
        {filteredTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex flex-col items-center gap-1 transition-colors ${
              activeTab === tab.id ? "text-emerald-500" : "text-slate-500"
            }`}
          >
            <tab.icon size={22} />
            <span className="text-[10px] font-medium uppercase tracking-wider">{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* Side Menu Overlay */}
      <AnimatePresence>
        {isMenuOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMenuOpen(false)}
              className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              className="fixed top-0 right-0 bottom-0 z-[70] w-4/5 max-w-sm bg-slate-900 border-l border-slate-800 p-6 flex flex-col"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center text-slate-400">
                    <User size={20} />
                  </div>
                  <div>
                    <p className="font-bold text-white">{user?.fullName || user?.username}</p>
                    <p className="text-xs text-slate-500 uppercase tracking-widest">{user?.role?.replace('_', ' ')}</p>
                  </div>
                </div>
                <button onClick={() => setIsMenuOpen(false)} className="p-2 text-slate-400 hover:text-white">
                  <X size={24} />
                </button>
              </div>

              <div className="flex-1 space-y-2 overflow-y-auto custom-scrollbar">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-2 mb-2">Operations</p>
                {menuItems.filter(item => !item.permission || user?.role === 'super_admin' || user?.permissions?.includes(item.permission)).map(item => (
                  <button
                    key={item.id}
                    onClick={() => {
                      onTabChange(item.id);
                      setIsMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all ${
                      activeTab === item.id 
                        ? "bg-emerald-600/10 text-emerald-500 border border-emerald-500/20" 
                        : "text-slate-400 hover:bg-slate-800 hover:text-white border border-transparent"
                    }`}
                  >
                    <item.icon size={20} />
                    <span className="font-medium">{item.label}</span>
                  </button>
                ))}
              </div>

              <div className="pt-6 border-t border-slate-800">
                <button 
                  onClick={onLogout}
                  className="w-full flex items-center gap-4 p-4 rounded-2xl text-rose-500 hover:bg-rose-500/10 transition-all"
                >
                  <LogOut size={20} />
                  <span className="font-medium">Logout</span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
