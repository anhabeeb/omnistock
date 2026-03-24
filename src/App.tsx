import React, { useState, useEffect, Suspense, lazy } from "react";
import { 
  BrowserRouter as Router, 
  Routes, 
  Route, 
  Navigate, 
  Link, 
  useLocation 
} from "react-router-dom";
import { useQuery, useQueryClient, QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { SettingsProvider, useSettings } from "./contexts/SettingsContext";
import { LocalSyncService } from "./services/localSync";
import { EventListenerService } from "./services/eventListener";
import UsersPage from "./components/Admin/UsersPage";
import { useRealtimeSync } from "./realtime/useRealtimeSync";
import { realtimeClient } from "./realtime/client";
import { SyncStatus } from "./components/SyncStatus";
import SettingsPage from "./components/Admin/SettingsPage";
import { SetupWizard } from "./components/Setup/SetupWizard";
import { Tutorial } from "./components/Onboarding/Tutorial";
import axios from "axios";
import toast, { Toaster } from "react-hot-toast";
import { 
  LayoutDashboard, 
  Package, 
  Truck, 
  Warehouse, 
  Store, 
  Users, 
  Settings, 
  LogOut, 
  Menu, 
  X, 
  AlertTriangle,
  Clock,
  DollarSign,
  BarChart3,
  Plus,
  ArrowRightLeft,
  ClipboardList,
  History,
  AlertCircle,
  PlusCircle,
  FileText,
  Settings2,
  Trash2,
  Moon,
  Sun
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// --- Components ---
const GRNForm = lazy(() => import("./components/Inventory/GRNForm"));
const StockIssueForm = lazy(() => import("./components/Inventory/StockIssueForm"));
const TransferForm = lazy(() => import("./components/Inventory/TransferForm"));
const AdjustmentForm = lazy(() => import("./components/Inventory/AdjustmentForm"));
const BatchStock = lazy(() => import("./components/Inventory/BatchStock"));
const ExpiryAlerts = lazy(() => import("./components/Inventory/ExpiryAlerts"));
const MovementLedger = lazy(() => import("./components/Inventory/MovementLedger"));
const AnalyticsDashboard = lazy(() => import("./components/Dashboard/AnalyticsDashboard"));
const Reports = lazy(() => import("./components/Dashboard/Reports"));
const StockCount = lazy(() => import("./components/Inventory/StockCount"));
const Wastage = lazy(() => import("./components/Inventory/Wastage"));
const Alerts = lazy(() => import("./components/Inventory/Alerts"));
const MobileLayout = lazy(() => import("./components/Layout/MobileLayout"));
const MobileDashboard = lazy(() => import("./components/Dashboard/MobileDashboard"));
const MobileInventory = lazy(() => import("./components/Inventory/MobileInventory"));
const MobileOperations = lazy(() => import("./components/Operations/MobileOperations"));
const SmartAlertsCenter = lazy(() => import("./components/Alerts/SmartAlertsCenter"));
const FinanceDashboard = lazy(() => import("./components/Finance/FinanceDashboard"));
const ActivityFeed = lazy(() => import("./components/Activity/ActivityFeed"));

// --- Phase 5 Components ---
const KPIDashboard = lazy(() => import("./components/Intelligence/KPIDashboard").then(m => ({ default: m.KPIDashboard })));
const WastageAnalytics = lazy(() => import("./components/Intelligence/WastageAnalytics").then(m => ({ default: m.WastageAnalytics })));
const ExpiryRiskDashboard = lazy(() => import("./components/Intelligence/ExpiryRiskDashboard").then(m => ({ default: m.ExpiryRiskDashboard })));
const DiscrepancyAnalytics = lazy(() => import("./components/Intelligence/DiscrepancyAnalytics").then(m => ({ default: m.DiscrepancyAnalytics })));
const StockRequestList = lazy(() => import("./components/Operations/StockRequestList").then(m => ({ default: m.StockRequestList })));
const StockRequestForm = lazy(() => import("./components/Operations/StockRequestForm").then(m => ({ default: m.StockRequestForm })));
const NotificationCenter = lazy(() => import("./components/Layout/NotificationCenter").then(m => ({ default: m.NotificationCenter })));

import { LoadingSkeleton } from "./components/Common/LoadingSkeleton";
import { MasterListPage } from "./components/MasterData/MasterListPage";
import { AppErrorBoundary } from "./components/Common/AppErrorBoundary";

// --- Utils ---
function useWindowSize() {
  const [windowSize, setWindowSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
  });

  useEffect(() => {
    function handleResize() {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    }
    window.addEventListener("resize", handleResize);
    handleResize();
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return windowSize;
}

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
interface User {
  id: string;
  username: string;
  role: string;
  fullName: string;
  permissions: string[];
}

// --- Permission Gate ---
const PermissionGate = ({ 
  permission, 
  children, 
  user,
  fallback = null 
}: { 
  permission: string, 
  children: React.ReactNode, 
  user: User,
  fallback?: React.ReactNode
}) => {
  const hasPermission = user.role === 'super_admin' || user.permissions?.includes(permission);
  if (!hasPermission) return <>{fallback}</>;
  return <>{children}</>;
};

// --- Components ---

const SidebarItem = ({ icon: Icon, label, to, active }: { icon: any, label: string, to: string, active?: boolean }) => (
  <Link 
    to={to}
    className={cn(
      "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group",
      active 
        ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/20" 
        : "text-slate-400 hover:bg-slate-800 hover:text-white"
    )}
  >
    <Icon size={20} className={cn("transition-transform duration-200", active ? "scale-110" : "group-hover:scale-110")} />
    <span className="font-medium">{label}</span>
    {active && <motion.div layoutId="active-pill" className="ml-auto w-1.5 h-1.5 rounded-full bg-white" />}
  </Link>
);

const Layout = ({ user, onLogout }: { user: User, onLogout: () => void }) => {
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const location = useLocation();
  const { theme, setTheme } = useSettings();

  return (
    <div className={cn("flex h-screen overflow-hidden font-sans", theme === 'dark' ? "bg-slate-950 text-slate-200" : "bg-slate-50 text-slate-800")}>
      {/* Sidebar */}
      <aside className={cn(
        "transition-all duration-300 flex flex-col border-r",
        theme === 'dark' ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200",
        isSidebarOpen ? "w-64" : "w-20"
      )}>
        <div className="p-6 flex items-center gap-3">
          <img src="/icon.png" alt="OmniStock Logo" className="w-10 h-10 object-contain" />
          {isSidebarOpen && (
            <motion.span 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className={cn("text-xl font-bold tracking-tight", theme === 'dark' ? "text-white" : "text-slate-900")}
            >
              OmniStock
            </motion.span>
          )}
        </div>

        <nav className="flex-1 px-3 space-y-1 mt-4 overflow-y-auto custom-scrollbar">
          <div className="px-4 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">General</div>
          <SidebarItem icon={LayoutDashboard} label="Dashboard" to="/" active={location.pathname === "/"} />
          
          <div className="px-4 py-2 mt-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Reports & Analytics</div>
          <PermissionGate user={user} permission="kpi.view">
            <SidebarItem icon={BarChart3} label="Analytics" to="/analytics" active={location.pathname === "/analytics"} />
          </PermissionGate>
          
          <PermissionGate user={user} permission="finance.view">
            <SidebarItem icon={DollarSign} label="Finance & Profit" to="/finance" active={location.pathname === "/finance"} />
          </PermissionGate>
          
          <PermissionGate user={user} permission="alerts.view">
            <SidebarItem icon={AlertCircle} label="Smart Alerts" to="/smart-alerts" active={location.pathname === "/smart-alerts"} />
          </PermissionGate>
          
          <PermissionGate user={user} permission="reports.view">
            <SidebarItem icon={FileText} label="Advanced Reports" to="/reports" active={location.pathname === "/reports"} />
          </PermissionGate>
          <PermissionGate user={user} permission="alerts.view">
            <SidebarItem icon={AlertTriangle} label="System Alerts" to="/alerts" active={location.pathname === "/alerts"} />
          </PermissionGate>
          <PermissionGate user={user} permission="inventory.view">
            <SidebarItem icon={History} label="Movement Ledger" to="/ledger" active={location.pathname === "/ledger"} />
          </PermissionGate>

          <div className="px-4 py-2 mt-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Warehouse Intelligence</div>
          <PermissionGate user={user} permission="kpi.view">
            <SidebarItem icon={BarChart3} label="Warehouse KPIs" to="/intelligence/kpis" active={location.pathname === "/intelligence/kpis"} />
          </PermissionGate>
          <PermissionGate user={user} permission="wastage.view">
            <SidebarItem icon={Trash2} label="Wastage Analytics" to="/intelligence/wastage" active={location.pathname === "/intelligence/wastage"} />
          </PermissionGate>
          <PermissionGate user={user} permission="alerts.view">
            <SidebarItem icon={Clock} label="Expiry Risk" to="/intelligence/expiry" active={location.pathname === "/intelligence/expiry"} />
          </PermissionGate>
          <PermissionGate user={user} permission="alerts.view">
            <SidebarItem icon={AlertTriangle} label="Shrinkage Analytics" to="/intelligence/shrinkage" active={location.pathname === "/intelligence/shrinkage"} />
          </PermissionGate>

          <div className="px-4 py-2 mt-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Warehouse Control</div>
          {(user.role === 'super_admin' || user.permissions?.includes('requests.view') || user.permissions?.includes('requests.create')) && (
            <SidebarItem icon={Truck} label="Stock Requests" to="/requests" active={location.pathname === "/requests"} />
          )}

          <div className="px-4 py-2 mt-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Inventory Ops</div>
          <PermissionGate user={user} permission="inventory.grn.create">
            <SidebarItem icon={PlusCircle} label="New GRN" to="/grn/new" active={location.pathname === "/grn/new"} />
          </PermissionGate>
          <PermissionGate user={user} permission="inventory.issue.create">
            <SidebarItem icon={FileText} label="New Issue" to="/issues/new" active={location.pathname === "/issues/new"} />
          </PermissionGate>
          <PermissionGate user={user} permission="inventory.transfer.create">
            <SidebarItem icon={ArrowRightLeft} label="New Transfer" to="/transfers/new" active={location.pathname === "/transfers/new"} />
          </PermissionGate>
          <PermissionGate user={user} permission="inventory.adjustment.create">
            <SidebarItem icon={Settings2} label="New Adjustment" to="/adjustments/new" active={location.pathname === "/adjustments/new"} />
          </PermissionGate>
          <PermissionGate user={user} permission="stockcount.create">
            <SidebarItem icon={ClipboardList} label="Stock Count" to="/stock-count" active={location.pathname === "/stock-count"} />
          </PermissionGate>
          <PermissionGate user={user} permission="wastage.create">
            <SidebarItem icon={Trash2} label="Wastage" to="/wastage" active={location.pathname === "/wastage"} />
          </PermissionGate>

          <div className="px-4 py-2 mt-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Master Data</div>
          <PermissionGate user={user} permission="master.items.view">
            <SidebarItem icon={Package} label="Items" to="/items" active={location.pathname === "/items"} />
          </PermissionGate>
          <PermissionGate user={user} permission="master.suppliers.view">
            <SidebarItem icon={Truck} label="Suppliers" to="/suppliers" active={location.pathname === "/suppliers"} />
          </PermissionGate>
          <PermissionGate user={user} permission="master.godowns.view">
            <SidebarItem icon={Warehouse} label="Godowns" to="/godowns" active={location.pathname === "/godowns"} />
          </PermissionGate>
          <PermissionGate user={user} permission="master.outlets.view">
            <SidebarItem icon={Store} label="Outlets" to="/outlets" active={location.pathname === "/outlets"} />
          </PermissionGate>
          
          <PermissionGate user={user} permission="users.view">
            <div className="px-4 py-2 mt-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Administration</div>
            <SidebarItem icon={Users} label="Users" to="/users" active={location.pathname === "/users"} />
          </PermissionGate>
          
          <PermissionGate user={user} permission="settings.view">
            <SidebarItem icon={Settings} label="Settings" to="/settings" active={location.pathname === "/settings"} />
          </PermissionGate>
          
          <PermissionGate user={user} permission="activity.view">
            <SidebarItem icon={History} label="Activity Feed" to="/activity" active={location.pathname === "/activity"} />
          </PermissionGate>
          
          <div className="pt-4 pb-2 px-4">
            <div className={cn("h-px", theme === 'dark' ? "bg-slate-800" : "bg-slate-200")} />
          </div>
        </nav>

        <div className={cn("p-4 border-t", theme === 'dark' ? "border-slate-800" : "border-slate-200")}>
          <div className="flex gap-2 mb-2">
            <button 
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className={cn(
                "flex-1 flex items-center justify-center py-2 rounded-xl transition-all",
                theme === 'dark' ? "bg-slate-800 text-slate-400 hover:text-white" : "bg-slate-100 text-slate-500 hover:text-slate-900"
              )}
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
          <button 
            onClick={onLogout}
            className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-slate-400 hover:bg-red-500/10 hover:text-red-500 transition-colors group"
          >
            <LogOut size={20} className="group-hover:translate-x-1 transition-transform" />
            {isSidebarOpen && <span className="font-medium">Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        <SyncStatus />
        <header className={cn(
          "h-16 border-b backdrop-blur-xl flex items-center justify-between px-8",
          theme === 'dark' ? "border-slate-800 bg-slate-900/50" : "border-slate-200 bg-white/50"
        )}>
          <div className="flex items-center gap-4">
            <button onClick={() => setSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400">
              {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <h1 className={cn("text-lg font-semibold", theme === 'dark' ? "text-white" : "text-slate-900")}>
              {location.pathname === "/" ? "Dashboard Overview" : 
               location.pathname.slice(1).split('/')[0].charAt(0).toUpperCase() + location.pathname.slice(1).split('/')[0].slice(1)}
            </h1>
          </div>

          <div className="flex items-center gap-4">
            <NotificationCenter />
            <div className="flex flex-col items-end">
              <span className={cn("text-sm font-medium", theme === 'dark' ? "text-white" : "text-slate-900")}>{user.fullName}</span>
              <span className="text-xs text-slate-400 uppercase tracking-wider">{(user.role || 'Unassigned').replace("_", " ")}</span>
            </div>
            <div className={cn("w-10 h-10 rounded-full border flex items-center justify-center font-bold", theme === 'dark' ? "bg-slate-800 border-slate-700 text-emerald-400" : "bg-slate-100 border-slate-200 text-emerald-600")}>
              {user.fullName.charAt(0)}
            </div>
          </div>
        </header>

        <div className={cn("flex-1 overflow-y-auto p-8", theme === 'dark' ? "bg-slate-950/50" : "bg-slate-50")}>
          <AppErrorBoundary resetKey={location.pathname}>
            <Suspense fallback={<LoadingSkeleton />}>
              <AnimatePresence mode="wait">
                <motion.div
                  key={location.pathname}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  <Routes>
                  <Route path="/" element={<DashboardPage />} />
                  <Route path="/analytics" element={<AnalyticsDashboard />} />
                  <Route path="/reports" element={<Reports />} />
                  <Route path="/alerts" element={<Alerts />} />
                  <Route path="/smart-alerts" element={<SmartAlertsCenter />} />
                  <Route path="/finance" element={<FinanceDashboard />} />
                  <Route path="/stock-count" element={<StockCount />} />
                  <Route path="/wastage" element={<Wastage />} />
                  <Route path="/grn/new" element={<GRNForm />} />
                  <Route path="/issues/new" element={<StockIssueForm />} />
                  <Route path="/transfers/new" element={<TransferForm />} />
                  <Route path="/adjustments/new" element={<AdjustmentForm />} />
                  <Route path="/stock" element={<BatchStock />} />
                  <Route path="/expiry" element={<ExpiryAlerts />} />
                  <Route path="/ledger/:id?" element={<MovementLedger />} />
                  
                  {/* Phase 5 Routes */}
                  <Route path="/intelligence/kpis" element={<KPIDashboard />} />
                  <Route path="/intelligence/wastage" element={<WastageAnalytics />} />
                  <Route path="/intelligence/expiry" element={<ExpiryRiskDashboard />} />
                  <Route path="/intelligence/shrinkage" element={<DiscrepancyAnalytics />} />
                  <Route path="/requests" element={<StockRequestList onNewRequest={() => window.location.href = '/requests/new'} onViewRequest={(id) => window.location.href = `/requests/${id}`} />} />
                  <Route path="/requests/new" element={<StockRequestForm onClose={() => window.location.href = '/requests'} onSuccess={() => window.location.href = '/requests'} />} />
                  <Route path="/requests/:id" element={<StockRequestForm requestId={window.location.pathname.split('/').pop()} onClose={() => window.location.href = '/requests'} onSuccess={() => window.location.href = '/requests'} />} />

                  <Route path="/users" element={<UsersPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/activity" element={<ActivityFeed />} />

                  <Route path="/items/:id?" element={
                    <MasterListPage 
                      title="Items Master" 
                      endpoint="items" 
                      user={user}
                      permissions={{
                        view: 'master.items.view',
                        create: 'master.items.create',
                        update: 'master.items.update',
                        delete: 'master.items.deactivate'
                      }}
                      columns={[
                        { key: "sku", label: "SKU", required: true },
                        { key: "barcode", label: "Barcode" },
                        { key: "name", label: "Item Name", required: true },
                        { key: "description", label: "Description", type: "textarea", hideInTable: true },
                        { key: "category_id", label: "Category ID", type: "number", hideInTable: true },
                        { key: "base_unit_id", label: "Base Unit ID", type: "number", hideInTable: true },
                        { key: "is_perishable", label: "Perishable", type: "checkbox", hideInTable: true },
                        { key: "track_batches", label: "Track Batches", type: "checkbox", hideInTable: true },
                        { key: "track_expiry", label: "Track Expiry", type: "checkbox", hideInTable: true },
                        { key: "reorder_level", label: "Reorder Level", type: "number" },
                        { key: "min_stock", label: "Min Stock", type: "number", hideInTable: true },
                        { key: "max_stock", label: "Max Stock", type: "number", hideInTable: true },
                        { key: "is_active", label: "Active", type: "checkbox" }
                      ]} 
                    />
                  } />
                  <Route path="/suppliers/:id?" element={
                    <MasterListPage 
                      title="Suppliers" 
                      endpoint="suppliers" 
                      user={user}
                      permissions={{
                        view: 'master.suppliers.view',
                        create: 'master.suppliers.create',
                        update: 'master.suppliers.update',
                        delete: 'master.suppliers.deactivate'
                      }}
                      columns={[
                        { key: "code", label: "Code", required: true },
                        { key: "name", label: "Supplier Name", required: true },
                        { key: "contact_person", label: "Contact Person" },
                        { key: "email", label: "Email", type: "email", hideInTable: true },
                        { key: "phone", label: "Phone" },
                        { key: "address", label: "Address", type: "textarea", hideInTable: true },
                        { key: "is_active", label: "Active", type: "checkbox" }
                      ]} 
                    />
                  } />
                  <Route path="/godowns/:id?" element={
                    <MasterListPage 
                      title="Godowns" 
                      endpoint="godowns" 
                      user={user}
                      permissions={{
                        view: 'master.godowns.view',
                        create: 'master.godowns.create',
                        update: 'master.godowns.update',
                        delete: 'master.godowns.deactivate'
                      }}
                      columns={[
                        { key: "code", label: "Code", required: true },
                        { key: "name", label: "Godown Name", required: true },
                        { key: "address", label: "Address", type: "textarea", hideInTable: true },
                        { key: "is_active", label: "Active", type: "checkbox" }
                      ]} 
                    />
                  } />
                  <Route path="/outlets/:id?" element={
                    <MasterListPage 
                      title="Outlets" 
                      endpoint="outlets" 
                      user={user}
                      permissions={{
                        view: 'master.outlets.view',
                        create: 'master.outlets.create',
                        update: 'master.outlets.update',
                        delete: 'master.outlets.deactivate'
                      }}
                      columns={[
                        { key: "code", label: "Code", required: true },
                        { key: "name", label: "Outlet Name", required: true },
                        { key: "address", label: "Address", type: "textarea", hideInTable: true },
                        { key: "manager_id", label: "Manager ID", hideInTable: true },
                        { key: "is_active", label: "Active", type: "checkbox" }
                      ]} 
                    />
                  } />
                  <Route path="*" element={<Navigate to="/" />} />
                  </Routes>
                </motion.div>
              </AnimatePresence>
            </Suspense>
          </AppErrorBoundary>
        </div>
      </main>
    </div>
  );
};

// --- Pages ---

const LoginPage = ({ onLogin }: { onLogin: (user: User, token: string) => void }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [setupMessage, setSetupMessage] = useState("");

  const handleSetup = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/setup/init", { method: "POST" , headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      const data = await res.json() as any;
      if (res.ok) {
        setSetupMessage("Database initialized! You can now login.");
        setNeedsSetup(false);
      } else {
        toast.error(data.message || "Setup failed");
      }
    } catch (err) {
      toast.error("Setup failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}`,  "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json() as any;
      if (res.ok) {
        onLogin(data.user, data.token);
      } else if (data.needsSetup) {
        setNeedsSetup(true);
        setSetupMessage(data.message);
      } else {
        toast.error(data.message);
      }
    } catch (err) {
      toast.error("Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl"
      >
        <div className="flex flex-col items-center mb-8">
          <img src="/trans_logo.png" alt="OmniStock Logo" className="h-24 object-contain mb-4" />
          <h2 className="text-2xl font-bold text-white">OmniStock</h2>
          <p className="text-slate-400 mt-1">Warehouse Management System</p>
        </div>

        {setupMessage && (
          <div className={cn("mb-6 p-4 rounded-xl text-sm font-medium text-center", needsSetup ? "bg-amber-500/10 text-amber-500 border border-amber-500/20" : "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20")}>
            {setupMessage}
          </div>
        )}

        {needsSetup ? (
          <div className="space-y-6">
            <p className="text-slate-400 text-center text-sm">
              It looks like the database hasn't been set up yet. Click the button below to initialize the system with the default admin account.
            </p>
            <button 
              onClick={handleSetup}
              disabled={loading}
              className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-amber-600/20 transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? "Initializing..." : "Initialize Database"}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6" autoComplete="off">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Username</label>
              <input 
                type="text" 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="off"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                placeholder="Enter your username"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Password</label>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                placeholder="Enter your password"
              />
            </div>
            <button 
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-emerald-600/20 transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? "Authenticating..." : "Sign In"}
            </button>
          </form>
        )}
      </motion.div>
    </div>
  );
};

const DashboardPage = () => {
  const { format } = useSettings();

  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const hasPermission = (permission: string) => {
    if (currentUser.role === 'super_admin') return true;
    return currentUser.permissions?.includes(permission);
  };
  const canView = hasPermission('kpi.view');

  const { data: stats, isLoading: statsLoading } = useQuery<{
    totalValue: number;
    totalQuantity: number;
    lowStockCount: number;
    nearExpiryCount: number;
  }>({
    queryKey: ["dashboard-summary"],
    queryFn: async () => {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/dashboard/summary", { 
        headers: { Authorization: `Bearer ${token}` } 
      });
      if (!res.ok) throw new Error("Failed to fetch dashboard summary");
      return res.json();
    },
    staleTime: 60000, // 60 seconds
    gcTime: 1000 * 60 * 10, // 10 minutes
    enabled: canView,
  });

  const { data: recentMovements = [], isLoading: movementsLoading } = useQuery<any[]>({
    queryKey: ["recent-movements"],
    queryFn: async () => {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/inventory/movements", { 
        headers: { Authorization: `Bearer ${token}` } 
      });
      if (!res.ok) throw new Error("Failed to fetch movements");
      const data = await res.json();
      return Array.isArray(data) ? data.slice(0, 5) : [];
    },
    staleTime: 60000, // 60 seconds
    gcTime: 1000 * 60 * 10, // 10 minutes
    enabled: canView,
  });

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-slate-900 rounded-3xl border border-slate-800 p-8 text-center">
        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4">
          <AlertCircle className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Access Denied</h2>
        <p className="text-slate-400 max-w-md">
          You do not have permission to view the dashboard. Please contact your system administrator if you believe this is an error.
        </p>
      </div>
    );
  }

  if (statsLoading || movementsLoading) return (
    <div className="animate-pulse space-y-8">
      <div className="h-12 bg-slate-900 rounded-xl w-1/3" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[1,2,3,4].map(i => <div key={i} className="h-32 bg-slate-900 rounded-3xl" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 h-96 bg-slate-900 rounded-3xl" />
        <div className="h-96 bg-slate-900 rounded-3xl" />
      </div>
    </div>
  );

  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight">Welcome back, Admin</h2>
          <p className="text-slate-400 mt-1">Here's what's happening in your warehouses today.</p>
        </div>
        <div className="flex gap-3">
          <Link to="/ledger" className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-xl border border-slate-700 transition-colors flex items-center gap-2">
            <Clock size={18} />
            <span>History</span>
          </Link>
          <Link to="/grn/new" className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-2">
            <Plus size={18} />
            <span>New Receipt</span>
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard icon={DollarSign} label="Stock Value" value={format(stats?.totalValue || 0)} color="emerald" />
        <StatCard icon={Package} label="Total Quantity" value={stats?.totalQuantity || 0} color="blue" />
        <StatCard icon={AlertTriangle} label="Low Stock" value={stats?.lowStockCount || 0} color="amber" />
        <StatCard icon={Clock} label="Near Expiry" value={stats?.nearExpiryCount || 0} color="rose" />
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-3xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-white">Recent Movements</h3>
            <Link to="/ledger" className="text-emerald-400 text-sm font-medium hover:underline">View All</Link>
          </div>
          <div className="space-y-4">
            {recentMovements.length === 0 ? (
              <p className="text-slate-500 text-center py-8">No recent movements found.</p>
            ) : recentMovements.map((m, i) => (
              <div key={i} className="flex items-center justify-between p-4 bg-slate-800/50 border border-slate-700/50 rounded-2xl">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${m.base_quantity > 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                    <Package size={20} />
                  </div>
                  <div>
                    <p className="font-medium text-white">{m.item_name}</p>
                    <p className="text-xs text-slate-400 uppercase tracking-wider">{m.movement_type.replace('_', ' ')} • {m.godown_name}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-bold ${m.base_quantity > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {m.base_quantity > 0 ? `+${m.base_quantity}` : m.base_quantity}
                  </p>
                  <p className="text-xs text-slate-500">{new Date(m.created_at).toLocaleTimeString()}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
          <h3 className="text-xl font-bold text-white mb-6">Warehouse Status</h3>
          <div className="space-y-6">
            {["Main Central", "Cold Storage"].map((name, i) => (
              <div key={i} className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-300">{name}</span>
                  <span className="text-slate-400">{75 + i * 10}% Capacity</span>
                </div>
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${75 + i * 10}%` }}
                    className={cn("h-full rounded-full", i === 0 ? "bg-emerald-500" : "bg-blue-500")} 
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ icon: Icon, label, value, color }: { icon: any, label: string, value: any, color: string }) => {
  const colors: any = {
    emerald: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    blue: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    amber: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    rose: "bg-rose-500/10 text-rose-500 border-rose-500/20"
  };

  return (
    <div className={cn("p-6 rounded-3xl border bg-slate-900/50 backdrop-blur-sm", colors[color])}>
      <div className="flex items-center justify-between mb-4">
        <div className={cn("p-2 rounded-xl", colors[color].split(" ")[0])}>
          <Icon size={24} />
        </div>
        <BarChart3 size={20} className="opacity-20" />
      </div>
      <p className="text-slate-400 text-sm font-medium">{label}</p>
      <p className="text-2xl font-bold text-white mt-1">{value}</p>
    </div>
  );
};

// --- Main App ---

function AppContent() {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isInitialized, setIsInitialized] = useState<boolean | null>(null);
  const [showTutorial, setShowTutorial] = useState(false);

  useEffect(() => {
    if (user) {
      EventListenerService.start(queryClient);
    } else {
      EventListenerService.stop();
    }
    return () => EventListenerService.stop();
  }, [user, queryClient]);

  useRealtimeSync(!!user);
  const { width } = useWindowSize();
  const isMobile = width < 768;
  const [mobileTab, setMobileTab] = useState('dashboard');

  useEffect(() => {
    const initialize = async () => {
      // 1. Check if system is initialized
      try {
        const res = await axios.get('/api/setup/status');
        setIsInitialized(res.data.is_initialized);
      } catch (err) {
        console.error("Failed to check setup status:", err);
        setIsInitialized(true); // Assume initialized to avoid blocking if API fails
      }

      // 2. Check auth and onboarding
      const token = localStorage.getItem("token");
      if (token) {
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        try {
          const sessionRes = await axios.get('/api/auth/me');
          const currentUser = sessionRes.data?.user;

          if (!currentUser) {
            throw new Error('Missing session user');
          }

          setUser(currentUser);
          localStorage.setItem("user", JSON.stringify(currentUser));
          window.dispatchEvent(new Event('auth-changed'));

          // Hydrate TanStack Query from IndexedDB for master data the current user can access directly.
          const types = LocalSyncService.getPermittedMasterDataTypes();

          for (const type of types) {
            const localData = await LocalSyncService.getLocalData(type);
            if (localData && localData.length > 0) {
              const endpoint = type === 'item' ? 'items' :
                               type === 'supplier' ? 'suppliers' :
                               type === 'godown' ? 'godowns' :
                               type === 'outlet' ? 'outlets' :
                               type === 'category' ? 'categories' :
                               type === 'unit' ? 'units' : type;

              queryClient.setQueryData(["master-data", endpoint], localData);
            }
          }

          LocalSyncService.syncAll().catch(console.error);
          EventListenerService.start(queryClient);

          try {
            const res = await axios.get('/api/onboarding/status');
            if (res.data && (res.data.tutorial_completed === 0 || res.data.force_tutorial === 1)) {
              setShowTutorial(true);
            }
          } catch (err) {
            console.error("Failed to check onboarding status:", err);
          }
        } catch (err) {
          console.error("Failed to restore session:", err);
          realtimeClient.disconnect();
          setUser(null);
          localStorage.removeItem("user");
          localStorage.removeItem("token");
          delete axios.defaults.headers.common['Authorization'];
          window.dispatchEvent(new Event('auth-changed'));
        }
      }
      
      setIsReady(true);
    };

    initialize();
  }, []);

  const checkOnboarding = async () => {
    try {
      const res = await axios.get('/api/onboarding/status');
      if (res.data && (res.data.tutorial_completed === 0 || res.data.force_tutorial === 1)) {
        setShowTutorial(true);
      }
    } catch (err) {
      console.error("Failed to check onboarding status:", err);
    }
  };

  const handleLogin = (user: User, token: string) => {
    setUser(user);
    localStorage.setItem("user", JSON.stringify(user));
    localStorage.setItem("token", token);
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    window.dispatchEvent(new Event('auth-changed'));
    checkOnboarding();
  };

  const handleLogout = () => {
    realtimeClient.disconnect();
    setUser(null);
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    delete axios.defaults.headers.common['Authorization'];
    window.dispatchEvent(new Event('auth-changed'));
  };

  if (!isReady || isInitialized === null) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
    </div>
  );

  if (!isInitialized) {
    return (
      <Router>
        <Routes>
          <Route path="/setup" element={<SetupWizard onComplete={() => setIsInitialized(true)} />} />
          <Route path="*" element={<Navigate to="/setup" />} />
        </Routes>
      </Router>
    );
  }

  if (user && isMobile) {
    return (
      <Router>
        <Suspense fallback={<LoadingSkeleton />}>
          {showTutorial && <Tutorial role={user.role} onComplete={() => setShowTutorial(false)} />}
          <MobileLayout 
            user={user} 
            activeTab={mobileTab} 
            onTabChange={setMobileTab}
            onLogout={handleLogout}
          >
            <AppErrorBoundary resetKey={mobileTab}>
              <AnimatePresence mode="wait">
                <motion.div
                  key={mobileTab}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  {mobileTab === 'dashboard' && <MobileDashboard onTabChange={setMobileTab} />}
                  {mobileTab === 'inventory' && <MobileInventory />}
                  {mobileTab === 'operations' && <MobileOperations onAction={setMobileTab} />}
                  {mobileTab === 'alerts' && <SmartAlertsCenter />}
                  {mobileTab === 'smart-alerts' && <SmartAlertsCenter />}
                  {mobileTab === 'grn' && <GRNForm />}
                  {mobileTab === 'issue' && <StockIssueForm />}
                  {mobileTab === 'transfer' && <TransferForm />}
                  {mobileTab === 'stock-count' && <StockCount />}
                  {mobileTab === 'wastage' && <Wastage />}
                  {mobileTab === 'finance' && <FinanceDashboard />}
                </motion.div>
              </AnimatePresence>
            </AppErrorBoundary>
          </MobileLayout>
        </Suspense>
      </Router>
    );
  }

  return (
    <Router>
      {showTutorial && user && <Tutorial role={user.role} onComplete={() => setShowTutorial(false)} />}
      {!user ? (
        <Routes>
          <Route path="/login" element={<LoginPage onLogin={handleLogin} />} />
          <Route path="*" element={<Navigate to="/login" />} />
        </Routes>
      ) : (
        <Layout user={user} onLogout={handleLogout} />
      )}
    </Router>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SettingsProvider>
        <Toaster position="top-right" />
        <AppContent />
      </SettingsProvider>
    </QueryClientProvider>
  );
}
