import { useEffect, useRef } from 'react';
import { X, Printer } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useSettings } from '../../contexts/SettingsContext';

interface DocumentPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  documentNumber: string;
  date: string;
  status: string;
  details: { label: string; value: string }[];
  items: any[];
  itemColumns: { header: string; key: string; isCurrency?: boolean; align?: 'left' | 'right' | 'center' }[];
  totals?: { label: string; value: string | number; isCurrency?: boolean }[];
  signatures?: string[];
}

export default function DocumentPrintModal({
  isOpen,
  onClose,
  title,
  documentNumber,
  date,
  status,
  details,
  items,
  itemColumns,
  totals,
  signatures = ['Prepared By', 'Authorized By', 'Received By']
}: DocumentPrintModalProps) {
  const { format } = useSettings();
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('printing-modal');
    } else {
      document.body.classList.remove('printing-modal');
    }
    return () => {
      document.body.classList.remove('printing-modal');
    };
  }, [isOpen]);

  const handlePrint = () => {
    window.print();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm print:bg-transparent print:backdrop-blur-none">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="w-full max-w-4xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-3xl shadow-2xl flex flex-col max-h-[90vh] print:shadow-none print:border-none print:max-h-none"
        >
          {/* Modal Header (Not printed) */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-slate-800 no-print">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Print Document</h3>
            <div className="flex items-center gap-3">
              <button 
                onClick={handlePrint}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-2"
              >
                <Printer size={18} />
                <span>Print</span>
              </button>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl text-gray-500 dark:text-slate-400 transition-colors"
              >
                <X size={24} />
              </button>
            </div>
          </div>

          {/* Printable Content */}
          <div className="flex-1 overflow-y-auto p-8 print:p-0 print:overflow-visible bg-white text-black" ref={printRef}>
            <div className="print-only-block max-w-4xl mx-auto">
              
              {/* Document Header */}
              <div className="flex justify-between items-start border-b-2 border-gray-800 pb-6 mb-8">
                <div className="flex items-center gap-4">
                  <img src="/icon.png" alt="Logo" className="w-16 h-16 object-contain" />
                  <div>
                    <h1 className="text-3xl font-bold uppercase tracking-wider mb-2">{title}</h1>
                    <p className="text-gray-600 font-medium">OmniStock Inventory Management</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold font-mono text-gray-800">{documentNumber}</div>
                  <div className="text-gray-600 mt-1">Date: {new Date(date).toLocaleDateString()}</div>
                  <div className="mt-2 inline-block px-3 py-1 border border-gray-400 rounded text-sm font-bold uppercase tracking-wider">
                    {status}
                  </div>
                </div>
              </div>

              {/* Document Details */}
              <div className="grid grid-cols-2 gap-8 mb-8">
                <div className="space-y-3">
                  {details.slice(0, Math.ceil(details.length / 2)).map((detail, idx) => (
                    <div key={idx} className="flex">
                      <span className="w-32 text-gray-500 font-medium">{detail.label}:</span>
                      <span className="font-bold">{detail.value}</span>
                    </div>
                  ))}
                </div>
                <div className="space-y-3">
                  {details.slice(Math.ceil(details.length / 2)).map((detail, idx) => (
                    <div key={idx} className="flex">
                      <span className="w-32 text-gray-500 font-medium">{detail.label}:</span>
                      <span className="font-bold">{detail.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Items Table */}
              <table className="w-full text-left border-collapse mb-8">
                <thead>
                  <tr className="border-b-2 border-gray-800">
                    {itemColumns.map((col, idx) => (
                      <th key={idx} className={`py-3 font-bold text-gray-800 uppercase text-sm tracking-wider ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}>
                        {col.header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {items.map((item, rowIdx) => (
                    <tr key={rowIdx}>
                      {itemColumns.map((col, colIdx) => {
                        const value = item[col.key];
                        return (
                          <td key={colIdx} className={`py-3 text-sm ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}>
                            {col.isCurrency ? format(Number(value) || 0) : value}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Totals */}
              {totals && totals.length > 0 && (
                <div className="flex justify-end mb-12">
                  <div className="w-64 space-y-3">
                    {totals.map((total, idx) => (
                      <div key={idx} className={`flex justify-between ${idx === totals.length - 1 ? 'border-t-2 border-gray-800 pt-3 font-bold text-lg' : 'text-gray-600'}`}>
                        <span>{total.label}:</span>
                        <span>{total.isCurrency ? format(Number(total.value) || 0) : total.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Signatures */}
              <div className="grid grid-cols-3 gap-8 mt-24 pt-8 border-t border-gray-300">
                {signatures.map((sig, idx) => (
                  <div key={idx} className="text-center">
                    <div className="border-b border-gray-400 w-full mb-2"></div>
                    <span className="text-sm text-gray-500 font-medium uppercase tracking-wider">{sig}</span>
                  </div>
                ))}
              </div>

            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
