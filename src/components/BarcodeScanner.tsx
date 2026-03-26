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

declare global {
  interface Window {
    Html5QrcodeScanner?: Html5QrcodeScannerConstructor;
  }
}

let scannerScriptPromise: Promise<void> | null = null;

function ensureScannerScript(): Promise<void> {
  if (window.Html5QrcodeScanner) {
    return Promise.resolve();
  }

  if (scannerScriptPromise) {
    return scannerScriptPromise;
  }

  const loadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-omnistock-scanner="html5-qrcode"]',
    );

    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Scanner script failed to load.")),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.src = `${import.meta.env.BASE_URL}vendor/html5-qrcode.min.js`;
    script.async = true;
    script.dataset.omnistockScanner = "html5-qrcode";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Scanner script failed to load."));
    document.head.appendChild(script);
  }).catch((error) => {
    scannerScriptPromise = null;
    throw error;
  });

  scannerScriptPromise = loadPromise;
  return loadPromise;
}

export function BarcodeScanner({ onScan, onClose }: Props) {
  const readerId = useId().replace(/:/g, "");
  const [manualValue, setManualValue] = useState("");
  const [status, setStatus] = useState("Starting barcode scanner...");

  useEffect(() => {
    let scanner: Html5QrcodeScannerInstance | null = null;
    let cancelled = false;

    async function startScanner() {
      try {
        await ensureScannerScript();
        if (cancelled) {
          return;
        }

        if (!window.Html5QrcodeScanner) {
          throw new Error("Scanner engine is unavailable on this device.");
        }

        setStatus("Align barcode or QR code within the frame to scan.");
        scanner = new window.Html5QrcodeScanner(
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
        setStatus(`${message} Enter the barcode manually.`);
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

  function submitManualValue() {
    const normalized = manualValue.trim();
    if (!normalized) {
      setStatus("Enter a barcode value before submitting.");
      return;
    }

    onScan(normalized);
    onClose();
  }

  return (
    <div className="barcode-modal-scanner">
      <div id={readerId} className="barcode-modal-preview barcode-modal-reader" />
      <p className="barcode-modal-copy">{status}</p>
      <div className="barcode-manual-entry">
        <input
          value={manualValue}
          onChange={(event) => setManualValue(event.target.value)}
          placeholder="Enter barcode or SKU manually"
        />
        <button type="button" className="primary-button" onClick={submitManualValue}>
          Match Item
        </button>
      </div>
    </div>
  );
}
