import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion, AnimatePresence } from 'motion/react';
import { 
  CheckCircle2, 
  ChevronRight, 
  ChevronLeft, 
  Building2, 
  User, 
  Settings, 
  Warehouse, 
  Store, 
  Users, 
  Package,
  Loader2,
  AlertCircle
} from 'lucide-react';
import axios from 'axios';

const setupSchema = z.object({
  settings: z.object({
    company_name: z.string().min(2, "Company name is required"),
    system_name: z.string().min(2, "System name is required"),
    default_currency: z.string().min(1, "Default currency is required"),
    currency_symbol: z.string().min(1, "Currency symbol is required"),
    currency_position: z.enum(["before", "after"]),
    decimal_places: z.number().int().min(0).max(4),
    timezone: z.string().min(1, "Timezone is required"),
    date_format: z.string().min(1, "Date format is required"),
    default_theme: z.enum(["light", "dark"]),
    allow_negative_stock: z.boolean(),
    default_fefo_behavior: z.boolean(),
    expiry_warning_threshold_days: z.number().int().min(1),
    low_stock_threshold_percent: z.number().min(0).max(100),
    stock_count_approval_required: z.boolean(),
    wastage_approval_required: z.boolean(),
    user_theme_override_allowed: z.boolean(),
    dark_mode_enabled: z.boolean(),
    light_mode_enabled: z.boolean(),
  }),
  admin: z.object({
    full_name: z.string().min(2, "Full name is required"),
    username: z.string().min(3, "Username must be at least 3 characters"),
    email: z.string().email("Invalid email address"),
    phone: z.string().optional(),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirm_password: z.string()
  }).refine(data => data.password === data.confirm_password, {
    message: "Passwords do not match",
    path: ["confirm_password"]
  }),
  godowns: z.array(z.object({
    code: z.string().min(2, "Code is required"),
    name: z.string().min(2, "Name is required"),
    address: z.string().optional(),
    is_active: z.boolean()
  })).min(1, "At least one godown is required"),
  outlets: z.array(z.object({
    code: z.string().min(2, "Code is required"),
    name: z.string().min(2, "Name is required"),
    address: z.string().optional(),
    is_active: z.boolean()
  })).min(1, "At least one outlet is required"),
  additionalUsers: z.array(z.object({
    full_name: z.string().min(2),
    username: z.string().min(3),
    email: z.string().email(),
    password: z.string().min(8),
    role_id: z.string()
  })).optional()
});

type SetupData = z.infer<typeof setupSchema>;

const STEPS = [
  { id: 'welcome', title: 'Welcome', icon: Package },
  { id: 'company', title: 'Company', icon: Building2 },
  { id: 'admin', title: 'Super Admin', icon: User },
  { id: 'inventory', title: 'Inventory', icon: Settings },
  { id: 'godowns', title: 'Godowns', icon: Warehouse },
  { id: 'outlets', title: 'Outlets', icon: Store },
  { id: 'users', title: 'Users', icon: Users },
  { id: 'review', title: 'Review', icon: CheckCircle2 },
];

interface SetupWizardProps {
  onComplete?: () => void;
}

export const SetupWizard: React.FC<SetupWizardProps> = ({ onComplete }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await axios.get('/api/setup/status');
        if (res.data.is_initialized) {
          if (onComplete) onComplete();
          navigate('/login');
        }
      } catch (err) {
        console.error("Failed to check setup status:", err);
      } finally {
        setIsChecking(false);
      }
    };
    checkStatus();
  }, [navigate, onComplete]);

  const { register, control, handleSubmit, watch, formState: { errors }, trigger } = useForm<SetupData>({
    resolver: zodResolver(setupSchema),
    defaultValues: {
      settings: {
        company_name: '',
        system_name: 'OmniStock',
        default_currency: 'MVR',
        currency_symbol: 'MVR',
        currency_position: 'before',
        decimal_places: 2,
        timezone: 'Asia/Male',
        date_format: 'YYYY-MM-DD',
        default_theme: 'dark',
        allow_negative_stock: false,
        default_fefo_behavior: true,
        expiry_warning_threshold_days: 30,
        low_stock_threshold_percent: 20,
        stock_count_approval_required: true,
        wastage_approval_required: true,
        user_theme_override_allowed: true,
        dark_mode_enabled: true,
        light_mode_enabled: true,
      },
      admin: {
        full_name: '',
        username: 'admin',
        email: '',
        phone: '',
        password: '',
        confirm_password: ''
      },
      godowns: [{ code: 'WH01', name: 'Main Warehouse', address: '', is_active: true }],
      outlets: [{ code: 'OT01', name: 'Main Outlet', address: '', is_active: true }],
      additionalUsers: []
    }
  });

  const { fields: godownFields, append: appendGodown, remove: removeGodown } = useFieldArray({ control, name: "godowns" });
  const { fields: outletFields, append: appendOutlet, remove: removeOutlet } = useFieldArray({ control, name: "outlets" });
  const { fields: userFields, append: appendUser, remove: removeUser } = useFieldArray({ control, name: "additionalUsers" });

  const nextStep = async () => {
    const fieldsToValidate = getFieldsForStep(currentStep);
    if (fieldsToValidate.length === 0) {
      setCurrentStep(prev => Math.min(prev + 1, STEPS.length - 1));
      return;
    }
    const isValid = await trigger(fieldsToValidate as any);
    if (isValid) {
      setCurrentStep(prev => Math.min(prev + 1, STEPS.length - 1));
    }
  };

  const prevStep = () => setCurrentStep(prev => Math.max(prev - 1, 0));

  const getFieldsForStep = (step: number) => {
    switch (step) {
      case 1: return ['settings.company_name', 'settings.system_name', 'settings.default_currency', 'settings.currency_symbol'];
      case 2: return ['admin.full_name', 'admin.username', 'admin.email', 'admin.password', 'admin.confirm_password'];
      case 3: return ['settings.low_stock_threshold_percent', 'settings.expiry_warning_threshold_days'];
      case 4: return ['godowns'];
      case 5: return ['outlets'];
      case 6: return ['additionalUsers'];
      default: return [];
    }
  };

  const onSubmit = async (data: SetupData) => {
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await axios.post('/api/setup/initialize', data);
      if (response.data.success) {
        if (onComplete) onComplete();
        navigate('/login', { state: { message: "System initialized! Please login with your super admin account." } });
      } else {
        setError(response.data.message || "Initialization failed");
      }
    } catch (err: any) {
      setError(err.response?.data?.message || "An error occurred during setup");
    } finally {
      setIsSubmitting(false);
    }
  };

  const watchAll = watch();

  if (isChecking) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="animate-spin text-emerald-500" size={48} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-4xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row">
        {/* Sidebar */}
        <div className="w-full md:w-64 bg-zinc-950 p-6 border-b md:border-b-0 md:border-r border-zinc-800">
          <div className="flex items-center gap-3 mb-8">
            <img src="/icon.png" alt="OmniStock Logo" className="w-10 h-10 object-contain" />
            <h1 className="text-xl font-bold tracking-tight">OmniStock</h1>
          </div>
          
          <nav className="space-y-2">
            {STEPS.map((step, index) => (
              <div 
                key={step.id}
                className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${
                  index === currentStep ? 'bg-emerald-500/10 text-emerald-500' : 
                  index < currentStep ? 'text-zinc-400' : 'text-zinc-600'
                }`}
              >
                <step.icon size={18} />
                <span className="text-sm font-medium">{step.title}</span>
                {index < currentStep && <CheckCircle2 size={14} className="ml-auto" />}
              </div>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col min-h-[500px]">
          <div className="p-8 flex-1">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="h-full"
              >
                {currentStep === 0 && (
                  <div className="space-y-6">
                    <h2 className="text-3xl font-bold">Welcome to OmniStock</h2>
                    <p className="text-zinc-400 leading-relaxed">
                      OmniStock is a professional-grade inventory management system. 
                      Before we get started, we need to set up some initial configurations 
                      for your business.
                    </p>
                    <div className="bg-emerald-500/5 border border-emerald-500/20 p-4 rounded-xl flex gap-3">
                      <AlertCircle className="text-emerald-500 shrink-0" />
                      <p className="text-sm text-emerald-500/80">
                        This setup wizard will only run once. Please ensure all details are correct.
                      </p>
                    </div>
                  </div>
                )}

                {currentStep === 1 && (
                  <div className="space-y-6">
                    <h2 className="text-2xl font-bold">Company Details</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Company Name</label>
                        <input 
                          {...register('settings.company_name')}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 focus:outline-none focus:border-emerald-500 transition-colors"
                          placeholder="e.g. Acme Corp"
                        />
                        {errors.settings?.company_name && <p className="text-xs text-red-500">{errors.settings.company_name.message}</p>}
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">System Name</label>
                        <input 
                          {...register('settings.system_name')}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 focus:outline-none focus:border-emerald-500 transition-colors"
                          placeholder="e.g. OmniStock"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Default Currency</label>
                        <input 
                          {...register('settings.default_currency')}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 focus:outline-none focus:border-emerald-500 transition-colors"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Currency Symbol</label>
                        <input 
                          {...register('settings.currency_symbol')}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 focus:outline-none focus:border-emerald-500 transition-colors"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {currentStep === 2 && (
                  <div className="space-y-6">
                    <h2 className="text-2xl font-bold">Super Admin Account</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Full Name</label>
                        <input 
                          {...register('admin.full_name')}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 focus:outline-none focus:border-emerald-500 transition-colors"
                        />
                        {errors.admin?.full_name && <p className="text-xs text-red-500">{errors.admin.full_name.message}</p>}
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Username</label>
                        <input 
                          {...register('admin.username')}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 focus:outline-none focus:border-emerald-500 transition-colors"
                        />
                        {errors.admin?.username && <p className="text-xs text-red-500">{errors.admin.username.message}</p>}
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Email</label>
                        <input 
                          {...register('admin.email')}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 focus:outline-none focus:border-emerald-500 transition-colors"
                        />
                        {errors.admin?.email && <p className="text-xs text-red-500">{errors.admin.email.message}</p>}
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Phone (Optional)</label>
                        <input 
                          {...register('admin.phone')}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 focus:outline-none focus:border-emerald-500 transition-colors"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Password</label>
                        <input 
                          type="password"
                          {...register('admin.password')}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 focus:outline-none focus:border-emerald-500 transition-colors"
                        />
                        {errors.admin?.password && <p className="text-xs text-red-500">{errors.admin.password.message}</p>}
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Confirm Password</label>
                        <input 
                          type="password"
                          {...register('admin.confirm_password')}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 focus:outline-none focus:border-emerald-500 transition-colors"
                        />
                        {errors.admin?.confirm_password && <p className="text-xs text-red-500">{errors.admin.confirm_password.message}</p>}
                      </div>
                    </div>
                  </div>
                )}

                {currentStep === 3 && (
                  <div className="space-y-6">
                    <h2 className="text-2xl font-bold">Inventory Settings</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="flex items-center justify-between p-4 bg-zinc-950 border border-zinc-800 rounded-xl">
                        <div>
                          <p className="font-medium">Allow Negative Stock</p>
                          <p className="text-xs text-zinc-500">Allow sales when stock is zero</p>
                        </div>
                        <input type="checkbox" {...register('settings.allow_negative_stock')} className="w-5 h-5 accent-emerald-500" />
                      </div>
                      <div className="flex items-center justify-between p-4 bg-zinc-950 border border-zinc-800 rounded-xl">
                        <div>
                          <p className="font-medium">Default FEFO</p>
                          <p className="text-xs text-zinc-500">First Expiry First Out behavior</p>
                        </div>
                        <input type="checkbox" {...register('settings.default_fefo_behavior')} className="w-5 h-5 accent-emerald-500" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Expiry Warning (Days)</label>
                        <input 
                          type="number"
                          {...register('settings.expiry_warning_threshold_days', { valueAsNumber: true })}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 focus:outline-none focus:border-emerald-500 transition-colors"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Low Stock Threshold (%)</label>
                        <input 
                          type="number"
                          {...register('settings.low_stock_threshold_percent', { valueAsNumber: true })}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 focus:outline-none focus:border-emerald-500 transition-colors"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {currentStep === 4 && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <h2 className="text-2xl font-bold">Godowns / Warehouses</h2>
                      <button 
                        type="button"
                        onClick={() => appendGodown({ code: '', name: '', address: '', is_active: true })}
                        className="text-xs bg-emerald-500 text-zinc-950 px-3 py-1.5 rounded-lg font-bold hover:bg-emerald-400 transition-colors"
                      >
                        Add Godown
                      </button>
                    </div>
                    <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2">
                      {godownFields.map((field, index) => (
                        <div key={field.id} className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-zinc-500">Godown #{index + 1}</span>
                            {godownFields.length > 1 && (
                              <button type="button" onClick={() => removeGodown(index)} className="text-xs text-red-500 hover:text-red-400">Remove</button>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <input 
                              {...register(`godowns.${index}.code`)}
                              placeholder="Code (e.g. WH01)"
                              className="bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-sm focus:outline-none focus:border-emerald-500"
                            />
                            <input 
                              {...register(`godowns.${index}.name`)}
                              placeholder="Name"
                              className="bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-sm focus:outline-none focus:border-emerald-500"
                            />
                          </div>
                          <input 
                            {...register(`godowns.${index}.address`)}
                            placeholder="Address"
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-sm focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {currentStep === 5 && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <h2 className="text-2xl font-bold">Outlets / Restaurants</h2>
                      <button 
                        type="button"
                        onClick={() => appendOutlet({ code: '', name: '', address: '', is_active: true })}
                        className="text-xs bg-emerald-500 text-zinc-950 px-3 py-1.5 rounded-lg font-bold hover:bg-emerald-400 transition-colors"
                      >
                        Add Outlet
                      </button>
                    </div>
                    <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2">
                      {outletFields.map((field, index) => (
                        <div key={field.id} className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-zinc-500">Outlet #{index + 1}</span>
                            {outletFields.length > 1 && (
                              <button type="button" onClick={() => removeOutlet(index)} className="text-xs text-red-500 hover:text-red-400">Remove</button>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <input 
                              {...register(`outlets.${index}.code`)}
                              placeholder="Code (e.g. OT01)"
                              className="bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-sm focus:outline-none focus:border-emerald-500"
                            />
                            <input 
                              {...register(`outlets.${index}.name`)}
                              placeholder="Name"
                              className="bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-sm focus:outline-none focus:border-emerald-500"
                            />
                          </div>
                          <input 
                            {...register(`outlets.${index}.address`)}
                            placeholder="Address"
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-sm focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {currentStep === 6 && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <h2 className="text-2xl font-bold">Additional Users (Optional)</h2>
                      <button 
                        type="button"
                        onClick={() => appendUser({ full_name: '', username: '', email: '', password: '', role_id: 'role_admin' })}
                        className="text-xs bg-emerald-500 text-zinc-950 px-3 py-1.5 rounded-lg font-bold hover:bg-emerald-400 transition-colors"
                      >
                        Add User
                      </button>
                    </div>
                    <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2">
                      {userFields.map((field, index) => (
                        <div key={field.id} className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-zinc-500">User #{index + 1}</span>
                            <button type="button" onClick={() => removeUser(index)} className="text-xs text-red-500 hover:text-red-400">Remove</button>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <input {...register(`additionalUsers.${index}.full_name`)} placeholder="Full Name" className="bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-sm" />
                            <input {...register(`additionalUsers.${index}.username`)} placeholder="Username" className="bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-sm" />
                            <input {...register(`additionalUsers.${index}.email`)} placeholder="Email" className="bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-sm" />
                            <input type="password" {...register(`additionalUsers.${index}.password`)} placeholder="Password" className="bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-sm" />
                            <select {...register(`additionalUsers.${index}.role_id`)} className="bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-sm col-span-2">
                              <option value="role_admin">Admin</option>
                              <option value="role_warehouse_manager">Warehouse Manager</option>
                              <option value="role_warehouse_staff">Warehouse Staff</option>
                            </select>
                          </div>
                        </div>
                      ))}
                      {userFields.length === 0 && (
                        <div className="text-center py-8 text-zinc-500 italic">
                          No additional users added. You can add them later.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {currentStep === 7 && (
                  <div className="space-y-6">
                    <h2 className="text-2xl font-bold">Review & Confirm</h2>
                    <div className="space-y-4 max-h-[350px] overflow-y-auto pr-2 text-sm">
                      <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl space-y-2">
                        <h3 className="font-bold text-emerald-500 uppercase text-xs">System & Company</h3>
                        <p><span className="text-zinc-500">Company:</span> {watchAll.settings.company_name}</p>
                        <p><span className="text-zinc-500">System:</span> {watchAll.settings.system_name}</p>
                        <p><span className="text-zinc-500">Currency:</span> {watchAll.settings.default_currency} ({watchAll.settings.currency_symbol})</p>
                      </div>
                      <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl space-y-2">
                        <h3 className="font-bold text-emerald-500 uppercase text-xs">Super Admin</h3>
                        <p><span className="text-zinc-500">Name:</span> {watchAll.admin.full_name}</p>
                        <p><span className="text-zinc-500">Username:</span> {watchAll.admin.username}</p>
                        <p><span className="text-zinc-500">Email:</span> {watchAll.admin.email}</p>
                      </div>
                      <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl space-y-2">
                        <h3 className="font-bold text-emerald-500 uppercase text-xs">Infrastructure</h3>
                        <p><span className="text-zinc-500">Godowns:</span> {watchAll.godowns.length}</p>
                        <p><span className="text-zinc-500">Outlets:</span> {watchAll.outlets.length}</p>
                      </div>
                    </div>
                    {error && (
                      <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex gap-2 items-center text-red-500 text-sm">
                        <AlertCircle size={16} />
                        <span>{error}</span>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-zinc-800 bg-zinc-950/50 flex justify-between items-center">
            <button
              type="button"
              onClick={prevStep}
              disabled={currentStep === 0 || isSubmitting}
              className="flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-zinc-400 hover:text-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={20} />
              Back
            </button>
            
            {currentStep === STEPS.length - 1 ? (
              <button
                type="button"
                onClick={handleSubmit(onSubmit as any)}
                disabled={isSubmitting}
                className="flex items-center gap-2 px-6 py-2 bg-emerald-500 text-zinc-950 rounded-xl font-bold hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-emerald-500/20"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={20} className="animate-spin" />
                    Initializing...
                  </>
                ) : (
                  <>
                    Complete Setup
                    <CheckCircle2 size={20} />
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={nextStep}
                className="flex items-center gap-2 px-6 py-2 bg-emerald-500 text-zinc-950 rounded-xl font-bold hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/20"
              >
                Next
                <ChevronRight size={20} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
