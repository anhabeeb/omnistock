import { useEffect } from 'react';
import { X } from 'lucide-react';

interface BarcodeScannerProps {
  onScan: (decodedText: string) => void;
  onClose: () => void;
}

export default function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  useEffect(() => {
    let scanner: any = null;

    const initScanner = async () => {
      const { Html5QrcodeScanner } = await import('html5-qrcode');
      scanner = new Html5QrcodeScanner(
        "reader",
        { fps: 10, qrbox: { width: 250, height: 250 } },
        /* verbose= */ false
      );

      scanner.render(
        (decodedText: string) => {
          onScan(decodedText);
          if (scanner) {
            scanner.clear();
          }
          onClose();
        },
        (_error: any) => {
          // console.warn(error);
        }
      );
    };

    initScanner();

    return () => {
      if (scanner) {
        scanner.clear().catch((error: any) => console.error("Failed to clear scanner", error));
      }
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-900 rounded-3xl overflow-hidden relative">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 bg-slate-800 rounded-full text-white"
        >
          <X size={24} />
        </button>
        <div id="reader" className="w-full"></div>
        <div className="p-6 text-center">
          <p className="text-slate-400 text-sm">Align barcode/QR code within the frame to scan</p>
        </div>
      </div>
    </div>
  );
}
