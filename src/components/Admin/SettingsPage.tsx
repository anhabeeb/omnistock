import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { 
  Globe, 
  Warehouse, 
  Palette, 
  Bell, 
  Save, 
  AlertTriangle, 
  Clock, 
  ShieldCheck,
  Moon,
  Sun
} from 'lucide-react';
import { SystemReset } from './SystemReset';
import { motion, AnimatePresence } from 'motion/react';
import { useSettings } from '../../contexts/SettingsContext';
import { cn } from '../../utils/cn';
import axios from 'axios';

export default function SettingsPage() {
  const { settings, updateSettings, theme, setTheme, isLoading, error } = useSettings();
  const [activeTab, setActiveTab] = useState('general');
  const [isSaving, setIsSaving] = useState(false);

  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const hasPermission = (p: string) => currentUser.role === 'super_admin' || currentUser.permissions?.includes(p);
  const canView = hasPermission('settings.view');
  const canUpdate = hasPermission('settings.update');

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

  if (isLoading) {
    return <div className="p-6 text-slate-400">Loading settings...</div>;
  }

  if (error) {
    return (
      <div className="p-6 rounded-2xl border border-red-500/20 bg-red-500/5 text-red-300">
        {error}
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="p-6 rounded-2xl border border-amber-500/20 bg-amber-500/5 text-amber-300">
        No settings available.
      </div>
    );
  }

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSaving(true);
    const formData = new FormData(e.currentTarget);
    const data: any = {};
    
    const numericFields = [
      'decimal_places',
      'expiry_warning_threshold_days',
      'low_stock_threshold_percent',
      'notification_threshold_high'
    ];

    const checkboxFields = [
      'allow_negative_stock',
      'default_fefo_behavior',
      'stock_count_approval_required',
      'wastage_approval_required',
      'dark_mode_enabled',
      'light_mode_enabled',
      'user_theme_override_allowed',
      'enable_expiry_alerts',
      'enable_low_stock_alerts',
      'enable_wastage_alerts'
    ];

    for (const [key, value] of formData.entries()) {
      if (checkboxFields.includes(key)) {
        data[key] = value === 'on' ? 1 : 0;
      } else if (numericFields.includes(key)) {
        data[key] = Number(value);
      } else {
        data[key] = value;
      }
    }

    checkboxFields.forEach((cb) => {
      if (!formData.has(cb)) data[cb] = 0;
    });

    try {
      if (!canUpdate) {
        toast.error("You do not have permission to update settings");
        return;
      }

      await updateSettings(data);
    } finally {
      setIsSaving(false);
    }
  };

  const tabs = [
    { id: 'general', label: 'General', icon: Globe },
    { id: 'inventory', label: 'Inventory', icon: Warehouse },
    { id: 'ui', label: 'UI & Theme', icon: Palette },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'tutorial', label: 'Tutorial', icon: Clock },
    { id: 'danger', label: 'Danger Zone', icon: AlertTriangle },
  ];

  const handleRestartTutorial = async () => {
    try {
      await axios.post('/api/onboarding/self-reset');
      window.location.reload(); // Reload to trigger the tutorial check in App.tsx
    } catch (err) {
      toast.error("Failed to reset tutorial");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">System Settings</h2>
          <p className="text-slate-400 text-sm mt-1">Configure global system behavior and preferences.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Sidebar Tabs */}
        <div className="space-y-2">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-200",
                activeTab === tab.id 
                  ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/20" 
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              )}
            >
              <tab.icon size={20} />
              <span className="font-medium">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="lg:col-span-3 bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden">
          <form onSubmit={handleSave}>
            <div className="p-8">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-8"
                >
                  {activeTab === 'general' && (
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-slate-400">System Name</label>
                          <input name="system_name" defaultValue={settings.system_name} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none" />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-slate-400">Company Name</label>
                          <input name="company_name" defaultValue={settings.company_name} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none" />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-slate-400">Default Currency Code</label>
                          <input name="default_currency" defaultValue={settings.default_currency} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none" />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-slate-400">Currency Symbol</label>
                          <input name="currency_symbol" defaultValue={settings.currency_symbol} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none" />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-slate-400">Currency Position</label>
                          <select name="currency_position" defaultValue={settings.currency_position} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none">
                            <option value="before">Before Amount (e.g. $ 100)</option>
                            <option value="after">After Amount (e.g. 100 MVR)</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-slate-400">Decimal Places</label>
                          <input name="decimal_places" type="number" defaultValue={settings.decimal_places} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none" />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-slate-400">Date Format</label>
                          <select name="date_format" defaultValue={settings.date_format} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none">
                            <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                            <option value="DD-MM-YYYY">DD-MM-YYYY</option>
                            <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-slate-400">Timezone</label>
                          <select name="timezone" defaultValue={settings.timezone} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none">
                            <option value="UTC">UTC</option>
                            <option value="Asia/Male">Asia/Male (MVR)</option>
                            <option value="Asia/Dubai">Asia/Dubai</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === 'inventory' && (
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-4">
                          <h4 className="text-sm font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                            <ShieldCheck size={16} />
                            Controls
                          </h4>
                          <div className="space-y-4">
                            <label className="flex items-center justify-between p-4 bg-slate-800/50 rounded-2xl border border-slate-700/50 cursor-pointer">
                              <span className="text-sm text-slate-300">Allow Negative Stock</span>
                              <input name="allow_negative_stock" type="checkbox" defaultChecked={!!settings.allow_negative_stock} className="w-5 h-5 rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 bg-slate-800" />
                            </label>
                            <label className="flex items-center justify-between p-4 bg-slate-800/50 rounded-2xl border border-slate-700/50 cursor-pointer">
                              <span className="text-sm text-slate-300">Default FEFO Behavior</span>
                              <input name="default_fefo_behavior" type="checkbox" defaultChecked={!!settings.default_fefo_behavior} className="w-5 h-5 rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 bg-slate-800" />
                            </label>
                            <label className="flex items-center justify-between p-4 bg-slate-800/50 rounded-2xl border border-slate-700/50 cursor-pointer">
                              <span className="text-sm text-slate-300">Stock Count Approval Required</span>
                              <input name="stock_count_approval_required" type="checkbox" defaultChecked={!!settings.stock_count_approval_required} className="w-5 h-5 rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 bg-slate-800" />
                            </label>
                            <label className="flex items-center justify-between p-4 bg-slate-800/50 rounded-2xl border border-slate-700/50 cursor-pointer">
                              <span className="text-sm text-slate-300">Wastage Approval Required</span>
                              <input name="wastage_approval_required" type="checkbox" defaultChecked={!!settings.wastage_approval_required} className="w-5 h-5 rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 bg-slate-800" />
                            </label>
                          </div>
                        </div>
                        <div className="space-y-4">
                          <h4 className="text-sm font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                            <AlertTriangle size={16} />
                            Thresholds
                          </h4>
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <label className="text-sm font-medium text-slate-400">Expiry Warning (Days)</label>
                              <input name="expiry_warning_threshold_days" type="number" defaultValue={settings.expiry_warning_threshold_days} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none" />
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-medium text-slate-400">Low Stock Threshold (%)</label>
                              <input name="low_stock_threshold_percent" type="number" step="0.1" defaultValue={settings.low_stock_threshold_percent} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === 'ui' && (
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-4">
                          <h4 className="text-sm font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                            <Palette size={16} />
                            Theme Configuration
                          </h4>
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <label className="text-sm font-medium text-slate-400">Default Theme</label>
                              <select name="default_theme" defaultValue={settings.default_theme} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none">
                                <option value="dark">Dark Mode</option>
                                <option value="light">Light Mode</option>
                              </select>
                            </div>
                            <label className="flex items-center justify-between p-4 bg-slate-800/50 rounded-2xl border border-slate-700/50 cursor-pointer">
                              <span className="text-sm text-slate-300">Allow User Theme Override</span>
                              <input name="user_theme_override_allowed" type="checkbox" defaultChecked={!!settings.user_theme_override_allowed} className="w-5 h-5 rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 bg-slate-800" />
                            </label>
                            <label className="flex items-center justify-between p-4 bg-slate-800/50 rounded-2xl border border-slate-700/50 cursor-pointer">
                              <span className="text-sm text-slate-300">Enable Dark Mode</span>
                              <input name="dark_mode_enabled" type="checkbox" defaultChecked={!!settings.dark_mode_enabled} className="w-5 h-5 rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 bg-slate-800" />
                            </label>
                            <label className="flex items-center justify-between p-4 bg-slate-800/50 rounded-2xl border border-slate-700/50 cursor-pointer">
                              <span className="text-sm text-slate-300">Enable Light Mode</span>
                              <input name="light_mode_enabled" type="checkbox" defaultChecked={!!settings.light_mode_enabled} className="w-5 h-5 rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 bg-slate-800" />
                            </label>
                          </div>
                        </div>
                        <div className="space-y-4">
                          <h4 className="text-sm font-bold text-slate-500 uppercase tracking-widest">Preview</h4>
                          <div className="p-6 rounded-3xl border border-slate-800 bg-slate-900 flex flex-col items-center justify-center gap-4">
                            <div className="flex gap-2">
                              <button 
                                type="button"
                                onClick={() => setTheme('light')}
                                className={cn("p-4 rounded-2xl border transition-all", theme === 'light' ? "bg-white text-slate-900 border-emerald-500 shadow-lg" : "bg-slate-800 text-slate-400 border-slate-700")}
                              >
                                <Sun size={24} />
                              </button>
                              <button 
                                type="button"
                                onClick={() => setTheme('dark')}
                                className={cn("p-4 rounded-2xl border transition-all", theme === 'dark' ? "bg-slate-950 text-white border-emerald-500 shadow-lg" : "bg-slate-800 text-slate-400 border-slate-700")}
                              >
                                <Moon size={24} />
                              </button>
                            </div>
                            <p className="text-sm text-slate-400">Current Theme: <span className="text-white font-bold capitalize">{theme}</span></p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === 'notifications' && (
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-4">
                          <h4 className="text-sm font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                            <Bell size={16} />
                            Alert Subscriptions
                          </h4>
                          <div className="space-y-4">
                            <label className="flex items-center justify-between p-4 bg-slate-800/50 rounded-2xl border border-slate-700/50 cursor-pointer">
                              <span className="text-sm text-slate-300">Enable Expiry Alerts</span>
                              <input name="enable_expiry_alerts" type="checkbox" defaultChecked={!!settings.enable_expiry_alerts} className="w-5 h-5 rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 bg-slate-800" />
                            </label>
                            <label className="flex items-center justify-between p-4 bg-slate-800/50 rounded-2xl border border-slate-700/50 cursor-pointer">
                              <span className="text-sm text-slate-300">Enable Low Stock Alerts</span>
                              <input name="enable_low_stock_alerts" type="checkbox" defaultChecked={!!settings.enable_low_stock_alerts} className="w-5 h-5 rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 bg-slate-800" />
                            </label>
                            <label className="flex items-center justify-between p-4 bg-slate-800/50 rounded-2xl border border-slate-700/50 cursor-pointer">
                              <span className="text-sm text-slate-300">Enable Wastage Alerts</span>
                              <input name="enable_wastage_alerts" type="checkbox" defaultChecked={!!settings.enable_wastage_alerts} className="w-5 h-5 rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 bg-slate-800" />
                            </label>
                          </div>
                        </div>
                        <div className="space-y-4">
                          <h4 className="text-sm font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                            <AlertTriangle size={16} />
                            Notification Severity
                          </h4>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-400">High Severity Threshold (%)</label>
                            <input name="notification_threshold_high" type="number" step="0.1" defaultValue={settings.notification_threshold_high} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none" />
                            <p className="text-xs text-slate-500">Alerts above this threshold will be marked as Critical.</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  {activeTab === 'tutorial' && (
                    <div className="space-y-6">
                      <div className="max-w-md">
                        <h4 className="text-lg font-bold text-white mb-2">Onboarding Tutorial</h4>
                        <p className="text-slate-400 text-sm mb-6">
                          If you want to revisit the system tour, you can restart the tutorial here. 
                          This will show the guided walkthrough next time you visit the dashboard.
                        </p>
                        <button
                          type="button"
                          onClick={handleRestartTutorial}
                          className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl border border-slate-700 transition-all font-bold flex items-center gap-2"
                        >
                          <Clock size={18} />
                          Restart Tutorial
                        </button>
                      </div>
                    </div>
                  )}

                  {activeTab === 'danger' && (
                    <div className="space-y-6">
                      <SystemReset />
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="p-8 bg-slate-800/30 border-t border-slate-800 flex justify-end">
              <button
                type="submit"
                disabled={isSaving || !canUpdate}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-3 rounded-2xl shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-2 font-bold"
              >
                {isSaving ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Save size={20} />
                )}
                <span>{isSaving ? 'Saving Changes...' : canUpdate ? 'Save All Settings' : 'View Only'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
