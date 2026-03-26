import { useEffect, useEffectEvent, useId, useState } from "react";

interface Props {
  onScan: (value: string) => void;
  onClose: () => void;
}

type Html5QrcodeCamera = {
  id: string;
  label: string;
};

type Html5QrcodeInstance = {
  start: (
    cameraConfig: string | { facingMode: "environment" | "user" },
    config: { fps: number; qrbox: { width: number; height: number } },
    onSuccess: (decodedText: string) => void,
    onError: (errorMessage: string) => void,
  ) => Promise<unknown>;
  stop: () => Promise<void>;
  clear: () => void;
};

type Html5QrcodeConstructor = {
  new (elementId: string, verbose?: boolean): Html5QrcodeInstance;
  getCameras: () => Promise<Html5QrcodeCamera[]>;
};

declare global {
  interface Window {
    Html5Qrcode?: Html5QrcodeConstructor;
    __Html5QrcodeLibrary__?: {
      Html5Qrcode?: Html5QrcodeConstructor;
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
  if (window.Html5Qrcode) {
    return true;
  }

  const fallback = window.__Html5QrcodeLibrary__?.Html5Qrcode;
  if (fallback) {
    window.Html5Qrcode = fallback;
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

function pickPreferredCamera(cameras: Html5QrcodeCamera[]): Html5QrcodeCamera | null {
  if (!cameras.length) {
    return null;
  }

  const rearCamera = cameras.find((camera) =>
    /back|rear|environment|world/i.test(camera.label),
  );

  return rearCamera ?? cameras[0];
}

export function BarcodeScanner({ onScan, onClose }: Props) {
  const readerId = useId().replace(/:/g, "");
  const [manualValue, setManualValue] = useState("");
  const [status, setStatus] = useState("Preparing barcode scanner...");
  const handleScannedValue = useEffectEvent((value: string) => {
    onScan(value);
    onClose();
  });

  useEffect(() => {
    let scanner: Html5QrcodeInstance | null = null;
    let started = false;
    let cancelled = false;
    let closed = false;

    function closeWithValue(value: string) {
      if (closed) {
        return;
      }

      closed = true;
      handleScannedValue(value);
    }

    async function startByPreferredCamera(html5Qrcode: Html5QrcodeInstance) {
      try {
        await html5Qrcode.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText: string) => {
            closeWithValue(decodedText);
          },
          () => {
            // Ignore transient scanner read failures while camera is active.
          },
        );
        started = true;
        return;
      } catch {
        const cameras = await window.Html5Qrcode!.getCameras();
        const preferredCamera = pickPreferredCamera(cameras);

        if (!preferredCamera) {
          throw new Error("No camera was found on this device.");
        }

        await html5Qrcode.start(
          preferredCamera.id,
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText: string) => {
            closeWithValue(decodedText);
          },
          () => {
            // Ignore transient scanner read failures while camera is active.
          },
        );
        started = true;
      }
    }

    async function startScanner() {
      await ensureScannerScript();
      if (cancelled) {
        return;
      }

      if (!ensureScannerGlobal() || !window.Html5Qrcode) {
        throw new Error("Scanner engine is unavailable on this device.");
      }

      scanner = new window.Html5Qrcode(readerId, false);
      setStatus("Requesting camera access...");

      await startByPreferredCamera(scanner);

      if (cancelled || closed) {
        return;
      }

      setStatus("Align barcode within the frame to scan.");
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
      if (scanner && started) {
        void scanner
          .stop()
          .catch(() => {
            // Ignore cleanup failures when leaving the modal.
          })
          .finally(() => {
            try {
              scanner?.clear();
            } catch {
              // Ignore cleanup failures when the scanner was not fully initialized.
            }
          });
        return;
      }
      if (scanner) {
        try {
          scanner.clear();
        } catch {
          // Ignore cleanup failures when the scanner was not fully initialized.
        }
      }
    };
  }, [readerId]);

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
