import { useState, useEffect } from 'react';
import { 
  AlertCircle, AlertTriangle, Clock, TrendingDown, 
  Trash2, RefreshCw, ArrowRight, CheckCircle2
} from 'lucide-react';
import { motion } from 'motion/react';
import { SmartAlert } from '../../types';
import { asArray } from '../../utils/apiShape';

export default function SmartAlertsCenter() {
  const [alerts, setAlerts] = useState<SmartAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const hasPermission = (permission: string) => {
    if (currentUser.role === 'super_admin') return true;
    return currentUser.permissions?.includes(permission);
  };
  const canView = hasPermission('alerts.view');

  const fetchAlerts = async () => {
    if (!canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const token = localStorage.getItem('token');
    const res = await fetch('/api/smart-alerts', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      const data = asArray<SmartAlert>(await res.json());
      setAlerts(data);
    } else {
      setAlerts([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAlerts();
  }, [canView]);

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-slate-900 rounded-3xl border border-slate-800 p-8 text-center m-4">
        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4">
          <AlertCircle className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Access Denied</h2>
        <p className="text-slate-400 max-w-md">
          You do not have permission to view alerts.
        </p>
      </div>
    );
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'rose';
      case 'high': return 'orange';
      case 'medium': return 'amber';
      default: return 'blue';
    }
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'low_stock_forecast': return AlertTriangle;
      case 'expiry_risk': return Clock;
      case 'unusual_issue': return TrendingDown;
      case 'high_wastage': return Trash2;
      default: return AlertCircle;
    }
  };

  const filteredAlerts = alerts.filter(a => filter === 'all' || a.severity === filter);

  const acknowledgeAlert = async (id: string) => {
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/smart-alerts/${id}/acknowledge`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      setAlerts(prev => prev.filter(a => a.id !== id));
    }
  };

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Smart Alerts</h1>
          <p className="text-slate-500 text-xs">Rule-based Anomaly Detection</p>
        </div>
        <button 
          onClick={fetchAlerts}
          className="p-2 bg-slate-900 rounded-xl border border-slate-800 text-slate-400"
        >
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
        {['all', 'critical', 'high', 'medium', 'low'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${
              filter === f 
                ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/20" 
                : "bg-slate-900 text-slate-500 border border-slate-800"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {loading ? (
          [1,2,3].map(i => <div key={i} className="h-32 bg-slate-900 rounded-3xl animate-pulse" />)
        ) : filteredAlerts.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 p-12 rounded-3xl text-center space-y-4">
            <div className="w-16 h-16 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 size={32} />
            </div>
            <div>
              <p className="text-white font-bold">All Systems Normal</p>
              <p className="text-slate-500 text-xs">No active anomalies detected</p>
            </div>
          </div>
        ) : filteredAlerts.map(alert => {
          const Icon = getAlertIcon(alert.type);
          const color = getSeverityColor(alert.severity);
          return (
            <motion.div
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              key={alert.id}
              className={`bg-slate-900 border border-slate-800 p-6 rounded-3xl space-y-4 relative overflow-hidden`}
            >
              <div className={`absolute top-0 left-0 w-1 h-full bg-${color}-500`} />
              
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-3 rounded-2xl bg-${color}-500/10 text-${color}-500`}>
                    <Icon size={20} />
                  </div>
                  <div>
                    <p className={`text-[10px] font-bold text-${color}-500 uppercase tracking-widest`}>{alert.severity}</p>
                    <h3 className="text-base font-bold text-white">{alert.affected_name}</h3>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest">{new Date(alert.generated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                  <button 
                    onClick={() => acknowledgeAlert(alert.id)}
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-emerald-500 transition-all"
                    title="Acknowledge & Dismiss"
                  >
                    <CheckCircle2 size={14} />
                  </button>
                </div>
              </div>

              <p className="text-sm text-slate-400 leading-relaxed">{alert.reason}</p>

              <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-800 space-y-2">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Suggested Action</p>
                <p className="text-xs text-white font-medium">{alert.suggested_action}</p>
              </div>

              <button className="w-full flex items-center justify-center gap-2 p-3 bg-slate-800 hover:bg-slate-700 rounded-2xl text-xs font-bold uppercase tracking-widest text-white transition-all">
                Investigate Details
                <ArrowRight size={14} />
              </button>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
