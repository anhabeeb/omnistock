import React from 'react';
import { Printer } from 'lucide-react';

interface PrintButtonProps {
  disabled?: boolean;
}

export const PrintButton: React.FC<PrintButtonProps> = ({ disabled }) => {
  return (
    <button
      onClick={() => window.print()}
      disabled={disabled}
      className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-slate-300 rounded-xl hover:bg-slate-700 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-slate-700"
      title="Print Document"
    >
      <Printer size={16} />
      <span>Print</span>
    </button>
  );
};
