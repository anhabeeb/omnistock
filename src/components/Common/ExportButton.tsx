import React, { useState, useRef, useEffect } from 'react';
import { Download, FileSpreadsheet, FileText, ChevronDown } from 'lucide-react';
import { exportToCSV, exportToExcel } from '../../utils/export';

interface Column {
  header: string;
  key: string | ((row: any) => string | number);
}

interface ExportButtonProps {
  data: any[];
  filename: string;
  columns: Column[];
  disabled?: boolean;
}

export const ExportButton: React.FC<ExportButtonProps> = ({ data, filename, columns, disabled }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled || !data || data.length === 0}
        className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-slate-300 rounded-xl hover:bg-slate-700 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-slate-700"
        title="Export Data"
      >
        <Download size={16} />
        <span>Export</span>
        <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-slate-800 border border-slate-700 rounded-xl shadow-lg overflow-hidden z-50">
          <button
            onClick={() => {
              exportToCSV(data, filename, columns);
              setIsOpen(false);
            }}
            className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
          >
            <FileText size={16} className="text-blue-400" />
            Export as CSV
          </button>
          <button
            onClick={() => {
              exportToExcel(data, filename, columns);
              setIsOpen(false);
            }}
            className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
          >
            <FileSpreadsheet size={16} className="text-emerald-400" />
            Export as Excel
          </button>
        </div>
      )}
    </div>
  );
};
