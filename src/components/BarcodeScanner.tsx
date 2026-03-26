import { useEffect, useId, useState } from "react";

interface Props {
  onScan: (value: string) => void;
  onClose: () => void;
}

type Html5QrcodeScannerInstance = {
  render: (
    onSuccess: (decodedText: string) => void,
    onError: (errorMessage: string) => void,
  ) => void;
  clear: () => Promise<void>;
};

type Html5QrcodeScannerConstructor = new (
  elementId: string,
  config: { fps: number; qrbox: { width: number; height: number } },
  verbose?: boolean,
) => Html5QrcodeScannerInstance;

export function BarcodeScanner({ onScan, onClose }: Props) {
  const readerId = useId().replace(/:/g, "");
  const [status, setStatus] = useState("Starting barcode scanner...");

  useEffect(() => {
    let scanner: Html5QrcodeScannerInstance | null = null;
    let cancelled = false;

    async function startScanner() {
      try {
        const { Html5QrcodeScanner } = (await import("html5-qrcode")) as {
          Html5QrcodeScanner: Html5QrcodeScannerConstructor;
        };
        if (cancelled) {
          return;
        }

        setStatus("Align barcode or QR code within the frame to scan.");
        scanner = new Html5QrcodeScanner(
          readerId,
          { fps: 10, qrbox: { width: 250, height: 250 } },
          false,
        );

        scanner.render(
          (decodedText: string) => {
            onScan(decodedText);
            if (scanner) {
              void scanner.clear();
            }
            onClose();
          },
          () => {
            // Ignore transient scanner errors while the camera is live.
          },
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Barcode scanner could not start on this device.";
        setStatus(message);
      }
    }

    void startScanner();

    return () => {
      cancelled = true;
      if (scanner) {
        void scanner.clear().catch(() => {
          // Ignore cleanup failures when leaving the modal.
        });
      }
    };
  }, [onClose, onScan, readerId]);

  return (
    <div className="barcode-modal-scanner">
      <div id={readerId} className="barcode-modal-preview barcode-modal-reader" />
      <p className="barcode-modal-copy">{status}</p>
    </div>
  );
}
