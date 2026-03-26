import { useEffect, useRef, useState } from "react";

interface Props {
  onScan: (value: string) => void;
  onClose: () => void;
}

type BarcodeDetectionResult = {
  rawValue?: string;
};

type BarcodeDetectorInstance = {
  detect: (source: ImageBitmapSource) => Promise<BarcodeDetectionResult[]>;
};

type BarcodeDetectorConstructor = new (options?: {
  formats?: string[];
}) => BarcodeDetectorInstance;

const SCAN_FORMATS = [
  "code_128",
  "code_39",
  "codabar",
  "ean_13",
  "ean_8",
  "itf",
  "upc_a",
  "upc_e",
  "qr_code",
];

function getBarcodeDetector(): BarcodeDetectorConstructor | null {
  const detector = (globalThis as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
  return detector ?? null;
}

export function BarcodeScanner({ onScan, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const detectorRef = useRef<BarcodeDetectorInstance | null>(null);
  const [manualValue, setManualValue] = useState("");
  const [status, setStatus] = useState("Starting camera...");
  const [cameraReady, setCameraReady] = useState(false);

  useEffect(() => {
    let disposed = false;

    async function startScanner() {
      const Detector = getBarcodeDetector();
      if (!Detector) {
        setStatus("Camera scanning is not supported in this browser. Enter the barcode manually below.");
        return;
      }

      detectorRef.current = new Detector({ formats: SCAN_FORMATS });

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
          },
          audio: false,
        });

        if (disposed) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setCameraReady(true);
        setStatus("Align the barcode inside the frame to scan it.");

        const scanFrame = async () => {
          if (disposed || !videoRef.current || !detectorRef.current) {
            return;
          }

          try {
            if (videoRef.current.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
              const results = await detectorRef.current.detect(videoRef.current);
              const value = results.find((entry) => entry.rawValue?.trim())?.rawValue?.trim();
              if (value) {
                onScan(value);
                onClose();
                return;
              }
            }
          } catch {
            // Ignore transient frame detection errors.
          }

          rafRef.current = window.setTimeout(() => {
            void scanFrame();
          }, 300) as unknown as number;
        };

        void scanFrame();
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Camera access was not available. Enter the barcode manually below.";
        setStatus(message);
      }
    }

    void startScanner();

    return () => {
      disposed = true;
      if (rafRef.current !== null) {
        window.clearTimeout(rafRef.current);
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [onClose, onScan]);

  function handleManualSubmit() {
    const nextValue = manualValue.trim();
    if (!nextValue) {
      setStatus("Enter a barcode, SKU, or item code before continuing.");
      return;
    }

    onScan(nextValue);
    onClose();
  }

  return (
    <div className="barcode-modal-scanner">
      <div className="barcode-modal-preview">
        {cameraReady ? (
          <video ref={videoRef} className="barcode-modal-video" playsInline muted autoPlay />
        ) : (
          <div className="barcode-modal-placeholder">{status}</div>
        )}
      </div>
      <p className="barcode-modal-copy">{status}</p>
      <div className="barcode-modal-manual">
        <input
          value={manualValue}
          onChange={(event) => setManualValue(event.target.value)}
          placeholder="Enter barcode, SKU, or item code"
        />
        <button type="button" className="primary-button" onClick={handleManualSubmit}>
          Use Code
        </button>
      </div>
    </div>
  );
}
