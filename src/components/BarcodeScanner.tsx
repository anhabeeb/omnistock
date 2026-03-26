import { useEffect, useEffectEvent, useId, useState } from "react";

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
    __Html5QrcodeLibrary__?: {
      Html5QrcodeScanner?: Html5QrcodeScannerConstructor;
    };
  }
}

let scannerScriptPromise: Promise<void> | null = null;

function waitForScannerGlobal(timeoutMs = 4000): Promise<void> {
  const startedAt = Date.now();

  return new Promise<void>((resolve, reject) => {
    const poll = () => {
      if (ensureScannerGlobal()) {
        resolve();
        return;
      }

      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error("Scanner engine took too long to start."));
        return;
      }

      window.setTimeout(poll, 80);
    };

    poll();
  });
}

function ensureScannerGlobal(): boolean {
  if (window.Html5QrcodeScanner) {
    return true;
  }

  const fallback = window.__Html5QrcodeLibrary__?.Html5QrcodeScanner;
  if (fallback) {
    window.Html5QrcodeScanner = fallback;
    return true;
  }

  return false;
}

function ensureScannerScript(): Promise<void> {
  if (ensureScannerGlobal()) {
    return Promise.resolve();
  }

  if (scannerScriptPromise) {
    return scannerScriptPromise;
  }

  const loadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-omnistock-scanner="html5-qrcode"]',
    );

    const completeWhenReady = () => {
      void waitForScannerGlobal().then(resolve).catch(reject);
    };

    if (existing) {
      if (ensureScannerGlobal()) {
        resolve();
        return;
      }

      if (existing.dataset.loaded === "true") {
        completeWhenReady();
        return;
      }

      existing.addEventListener("load", completeWhenReady, { once: true });
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
    script.onload = () => {
      script.dataset.loaded = "true";
      completeWhenReady();
    };
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
  const handleScannedValue = useEffectEvent((value: string) => {
    onScan(value);
    onClose();
  });

  useEffect(() => {
    let scanner: Html5QrcodeScannerInstance | null = null;
    let cancelled = false;
    let closed = false;

    function closeWithValue(value: string) {
      if (closed) {
        return;
      }

      closed = true;
      handleScannedValue(value);
    }

    async function startScanner() {
      await ensureScannerScript();
      if (cancelled) {
        return;
      }

      if (!ensureScannerGlobal() || !window.Html5QrcodeScanner) {
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
          closeWithValue(decodedText);
          if (scanner) {
            void scanner.clear();
          }
        },
        () => {
          // Ignore transient scanner errors while the camera is live.
        },
      );
    }

    void startScanner().catch((error) => {
      const message =
        error instanceof Error
          ? error.message
          : "Barcode scanner could not start on this device.";
      setStatus(`${message} Enter the barcode manually.`);
    });

    return () => {
      cancelled = true;
      if (scanner) {
        void scanner.clear().catch(() => {
          // Ignore cleanup failures when leaving the modal.
        });
      }
    };
  }, [handleScannedValue, readerId]);

  function submitManualValue() {
    const normalized = manualValue.trim();
    if (!normalized) {
      setStatus("Enter a barcode value before submitting.");
      return;
    }

    handleScannedValue(normalized);
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
