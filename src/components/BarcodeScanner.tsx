import { useEffect, useRef } from "react";

interface Props {
  onScan: (value: string) => void;
  onClose: () => void;
}

type ScannerInstance = {
  render: (
    onSuccess: (decodedText: string) => void,
    onError: (errorMessage: string) => void,
  ) => void;
  clear: () => Promise<void>;
};

export function BarcodeScanner({ onScan, onClose }: Props) {
  const elementIdRef = useRef(`barcode-reader-${Math.random().toString(36).slice(2, 10)}`);

  useEffect(() => {
    let scanner: ScannerInstance | null = null;
    let disposed = false;

    async function initScanner() {
      try {
        const module = (await import("html5-qrcode/esm/index.js")) as {
          Html5QrcodeScanner: new (
            elementId: string,
            config: { fps: number; qrbox: { width: number; height: number } },
            verbose?: boolean,
          ) => ScannerInstance;
        };

        if (disposed) {
          return;
        }

        scanner = new module.Html5QrcodeScanner(
          elementIdRef.current,
          { fps: 10, qrbox: { width: 250, height: 250 } },
          false,
        );

        scanner.render(
          (decodedText: string) => {
            onScan(decodedText);
            void scanner?.clear();
            onClose();
          },
          () => {
            // Ignore live scan noise and only react on successful scans.
          },
        );
      } catch (error) {
        console.error("Failed to initialize barcode scanner", error);
      }
    }

    void initScanner();

    return () => {
      disposed = true;
      if (scanner) {
        void scanner.clear().catch((error) => {
          console.error("Failed to clear barcode scanner", error);
        });
      }
    };
  }, [onClose, onScan]);

  return (
    <div className="barcode-modal-scanner">
      <div id={elementIdRef.current} />
      <p className="barcode-modal-copy">Align the barcode inside the frame to scan it.</p>
    </div>
  );
}
