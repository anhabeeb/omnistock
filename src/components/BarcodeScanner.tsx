import { useEffect, useId, useRef, useState } from "react";

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

type DetectedBarcode = {
  rawValue?: string;
};

type BarcodeDetectorInstance = {
  detect: (source: ImageBitmapSource) => Promise<DetectedBarcode[]>;
};

type BarcodeDetectorConstructor = new (config?: {
  formats?: string[];
}) => BarcodeDetectorInstance;

declare global {
  interface Window {
    Html5QrcodeScanner?: Html5QrcodeScannerConstructor;
    __Html5QrcodeLibrary__?: {
      Html5QrcodeScanner?: Html5QrcodeScannerConstructor;
    };
    BarcodeDetector?: BarcodeDetectorConstructor;
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
  const [useNativeFallback, setUseNativeFallback] = useState(false);
  const fallbackVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    let scanner: Html5QrcodeScannerInstance | null = null;
    let fallbackStream: MediaStream | null = null;
    let frameHandle: number | null = null;
    let cancelled = false;
    let closed = false;

    function closeWithValue(value: string) {
      if (closed) {
        return;
      }

      closed = true;
      onScan(value);
      onClose();
    }

    function stopFallbackStream() {
      if (frameHandle !== null) {
        cancelAnimationFrame(frameHandle);
        frameHandle = null;
      }

      if (fallbackStream) {
        fallbackStream.getTracks().forEach((track) => track.stop());
        fallbackStream = null;
      }

      const video = fallbackVideoRef.current;
      if (video) {
        video.srcObject = null;
      }
    }

    async function startNativeFallback(errorMessage?: string) {
      setStatus("Preparing camera scanner...");
      setUseNativeFallback(true);

      if (!window.BarcodeDetector) {
        throw new Error(
          errorMessage ?? "Camera scanning is not supported on this device.",
        );
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          errorMessage ?? "Camera access is not supported on this device.",
        );
      }

      let video = fallbackVideoRef.current;
      if (!video) {
        for (let attempt = 0; attempt < 20; attempt += 1) {
          await new Promise<void>((resolve) => {
            window.setTimeout(resolve, 50);
          });
          video = fallbackVideoRef.current;
          if (video) {
            break;
          }
        }
      }

      if (!video) {
        throw new Error("Camera preview could not be prepared.");
      }

      try {
        fallbackStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
          },
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "NotAllowedError") {
          throw new Error("Camera permission was denied for barcode scanning.");
        }

        if (error instanceof DOMException && error.name === "NotFoundError") {
          throw new Error("No camera was found on this device.");
        }

        throw error;
      }

      if (cancelled) {
        stopFallbackStream();
        return;
      }

      video.srcObject = fallbackStream;
      video.setAttribute("playsinline", "true");
      await video.play();

      const detector = new window.BarcodeDetector({
        formats: [
          "qr_code",
          "code_128",
          "code_39",
          "ean_13",
          "ean_8",
          "upc_a",
          "upc_e",
          "itf",
          "codabar",
        ],
      });

      setStatus("Align barcode within the frame to scan.");

      const scanFrame = async () => {
        if (cancelled || closed) {
          return;
        }

        try {
          if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            const results = await detector.detect(video);
            const match = results.find((item) => item.rawValue?.trim());
            if (match?.rawValue) {
              stopFallbackStream();
              closeWithValue(match.rawValue.trim());
              return;
            }
          }
        } catch {
          // Ignore transient detection failures and keep scanning.
        }

        frameHandle = requestAnimationFrame(() => {
          void scanFrame();
        });
      };

      frameHandle = requestAnimationFrame(() => {
        void scanFrame();
      });
    }

    async function startScanner() {
      try {
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
      } catch (error) {
        try {
          const message =
            error instanceof Error
              ? error.message
              : "Barcode scanner could not start on this device.";
          await startNativeFallback(message);
        } catch (fallbackError) {
          const message =
            fallbackError instanceof Error
              ? fallbackError.message
              : "Barcode scanner could not start on this device.";
          setStatus(`${message} Enter the barcode manually.`);
        }
      }
    }

    void startScanner();

    return () => {
      cancelled = true;
      stopFallbackStream();
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
      {useNativeFallback ? (
        <div className="barcode-modal-preview barcode-modal-fallback">
          <video ref={fallbackVideoRef} muted autoPlay playsInline />
        </div>
      ) : (
        <div id={readerId} className="barcode-modal-preview barcode-modal-reader" />
      )}
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
