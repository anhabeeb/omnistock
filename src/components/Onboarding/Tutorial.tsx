import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  ChevronRight, 
  ChevronLeft, 
  CheckCircle2, 
  Sparkles, 
  LayoutDashboard, 
  Users, 
  Settings, 
  FileText, 
  Warehouse, 
  Bell, 
  HelpCircle,
  Package,
  ArrowRightLeft,
  ClipboardCheck,
  Trash2,
  ScanBarcode
} from 'lucide-react';
import axios from 'axios';

interface TutorialStep {
  title: string;
  content: string;
  icon: React.ElementType;
}

interface TutorialProps {
  role: string;
  onComplete: () => void;
}

export const Tutorial: React.FC<TutorialProps> = ({ role, onComplete }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(true);

  const getTutorialSteps = (role: string): TutorialStep[] => {
    const commonStart = [
      {
        title: "Welcome to OmniStock",
        content: "We're excited to have you! This quick tour will show you how to navigate the system based on your role.",
        icon: Sparkles
      },
      {
        title: "Navigation Overview",
        content: "Use the sidebar on the left to switch between different modules. On mobile, you can access it via the menu button.",
        icon: LayoutDashboard
      }
    ];

    const commonEnd = [
      {
        title: "Alerts & Notifications",
        content: "Keep an eye on the bell icon for low stock, expiry warnings, and approval requests.",
        icon: Bell
      },
      {
        title: "Need Help?",
        content: "You can restart this tutorial anytime from your profile settings or the help menu.",
        icon: HelpCircle
      },
      {
        title: "You're All Set!",
        content: "Ready to start managing your inventory? Click finish to begin your journey.",
        icon: CheckCircle2
      }
    ];

    let roleSpecific: TutorialStep[] = [];

    switch (role) {
      case 'super_admin':
        roleSpecific = [
          {
            title: "Full Control",
            content: "As a Super Admin, you have access to everything: Users, Settings, Reports, and all operational data.",
            icon: Users
          },
          {
            title: "System Settings",
            content: "Configure global business rules, currencies, and inventory behavior in the Settings module.",
            icon: Settings
          },
          {
            title: "Strategic Insights",
            content: "Monitor business health through the KPI dashboard and detailed analytical reports.",
            icon: FileText
          }
        ];
        break;
      case 'admin':
        roleSpecific = [
          {
            title: "Operations Oversight",
            content: "Manage users, review approvals, and monitor daily operations across all godowns and outlets.",
            icon: ClipboardCheck
          },
          {
            title: "Reporting",
            content: "Generate and export reports for valuation, stock movements, and dead stock analysis.",
            icon: FileText
          }
        ];
        break;
      case 'warehouse_manager':
        roleSpecific = [
          {
            title: "Stock Management",
            content: "Oversee stock transfers, approve counts, and manage wastage entries for your assigned godowns.",
            icon: Warehouse
          },
          {
            title: "Approvals",
            content: "Review and approve stock counts and wastage entries submitted by your staff.",
            icon: ClipboardCheck
          },
          {
            title: "Transfers",
            content: "Manage inter-godown transfers and stock issues to outlets efficiently.",
            icon: ArrowRightLeft
          }
        ];
        break;
      case 'warehouse_staff':
        roleSpecific = [
          {
            title: "Daily Operations",
            content: "Create GRN drafts, issue stock, and perform regular stock counts using the mobile-friendly interface.",
            icon: Package
          },
          {
            title: "Barcode Scanning",
            content: "Use your device camera to scan barcodes for quick item identification and stock counting.",
            icon: ScanBarcode
          },
          {
            title: "Wastage Entry",
            content: "Quickly record damaged or expired items for review and approval.",
            icon: Trash2
          }
        ];
        break;
    }

    return [...commonStart, ...roleSpecific, ...commonEnd];
  };

  const steps = getTutorialSteps(role);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      handleFinish();
    }
  };

  const handlePrev = () => {
    setCurrentStep(prev => Math.max(prev - 1, 0));
  };

  const handleFinish = async () => {
    try {
      await axios.post('/api/onboarding/complete');
      setIsVisible(false);
      onComplete();
    } catch (err) {
      console.error("Failed to complete onboarding:", err);
      // Still close the tutorial locally
      setIsVisible(false);
      onComplete();
    }
  };

  if (!isVisible) return null;

  const StepIcon = steps[currentStep].icon;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden"
      >
        <div className="p-8">
          <div className="flex justify-between items-start mb-8">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500">
                <StepIcon size={32} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-zinc-100">{steps[currentStep].title}</h3>
                <p className="text-xs text-zinc-500 font-medium uppercase tracking-widest">Step {currentStep + 1} of {steps.length}</p>
              </div>
            </div>
            <button 
              onClick={handleFinish}
              className="p-2 text-zinc-500 hover:text-zinc-100 transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <div className="min-h-[120px]">
            <AnimatePresence mode="wait">
              <motion.p 
                key={currentStep}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="text-zinc-400 leading-relaxed text-lg"
              >
                {steps[currentStep].content}
              </motion.p>
            </AnimatePresence>
          </div>

          {/* Progress Dots */}
          <div className="flex gap-1.5 mt-8 mb-8">
            {steps.map((_, index) => (
              <div 
                key={index}
                className={`h-1 rounded-full transition-all duration-300 ${
                  index === currentStep ? 'w-8 bg-emerald-500' : 
                  index < currentStep ? 'w-4 bg-emerald-500/40' : 'w-2 bg-zinc-800'
                }`}
              />
            ))}
          </div>

          <div className="flex justify-between items-center">
            <button
              onClick={handlePrev}
              disabled={currentStep === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-zinc-500 hover:text-zinc-100 disabled:opacity-0 transition-all"
            >
              <ChevronLeft size={20} />
              Back
            </button>

            <button
              onClick={handleNext}
              className="flex items-center gap-2 px-8 py-3 bg-emerald-500 text-zinc-950 rounded-2xl font-bold hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/20"
            >
              {currentStep === steps.length - 1 ? "Finish" : "Next"}
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
