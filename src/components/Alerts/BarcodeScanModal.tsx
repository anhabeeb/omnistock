import React from 'react';
import { X } from 'lucide-react';
import BarcodeScanner from '../Common/BarcodeScanner';

interface BarcodeScanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (code: string) => void;
}

const BarcodeScanModal: React.FC<BarcodeScanModalProps> = ({ isOpen, onClose, onScan }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-3xl overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
          <h3 className="text-lg font-bold text-white">Scan Barcode</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="p-6">
          <BarcodeScanner 
            onScan={(code) => {
              onScan(code);
              onClose();
            }} 
            onClose={onClose}
          />
          <p className="mt-4 text-center text-slate-500 text-xs">
            Position the barcode within the frame to scan
          </p>
        </div>
      </div>
    </div>
  );
};

export default BarcodeScanModal;
