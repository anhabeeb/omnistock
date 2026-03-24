import React from 'react';

interface PrintHeaderProps {
  title: string;
  filters?: string | Record<string, string | undefined>;
}

export const PrintHeader: React.FC<PrintHeaderProps> = ({ title, filters }) => {
  return (
    <div className="hidden print:block mb-8 border-b border-slate-300 pb-4 text-black">
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-4">
          <img src="/icon.png" alt="Logo" className="w-12 h-12 object-contain" />
          <div>
            <h1 className="text-2xl font-bold mb-1">{title}</h1>
            <p className="text-sm text-slate-600">OmniStock Inventory Management</p>
          </div>
        </div>
        <div className="text-right text-sm text-slate-600">
          <p>Generated: {new Date().toLocaleString()}</p>
          <p>By: System User</p>
        </div>
      </div>
      
      {filters && (
        <div className="mt-4 pt-4 border-t border-slate-200">
          <p className="text-sm font-semibold mb-2">Applied Filters:</p>
          <div className="flex flex-wrap gap-4 text-sm">
            {typeof filters === 'string' ? (
              <span>{filters}</span>
            ) : (
              Object.entries(filters).map(([key, value]) => value ? (
                <div key={key} className="flex gap-1">
                  <span className="text-slate-500 capitalize">{key.replace(/_/g, ' ')}:</span>
                  <span className="font-medium">{value}</span>
                </div>
              ) : null)
            )}
          </div>
        </div>
      )}
    </div>
  );
};
