import { useEffect, useRef, useState } from "react";

type DetectorResult = Array<{ rawValue?: string }>;
type DetectorInstance = {
  detect(source: ImageBitmapSource): Promise<DetectorResult>;
};
type DetectorConstructor = new (options?: {
  formats?: string[];
}) => DetectorInstance;

interface Props {
  onDetected: (value: string) => void;
}

export function BarcodeScanner({ onDetected }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [manualValue, setManualValue] = useState("");
  const [status, setStatus] = useState("Idle");
  const [active, setActive] = useState(false);

  const detectorSupported =
    typeof window !== "undefined" &&
    "BarcodeDetector" in window &&
    typeof navigator.mediaDevices?.getUserMedia === "function";

  useEffect(() => {
    if (!active || !detectorSupported) {
      return undefined;
    }

    let cancelled = false;
    let frameHandle = 0;
    let busy = false;

    const stop = () => {
      if (frameHandle) {
        cancelAnimationFrame(frameHandle);
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };

    const start = async () => {
      try {
        setStatus("Opening camera");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const BarcodeDetectorCtor = (
          window as Window & { BarcodeDetector?: DetectorConstructor }
        ).BarcodeDetector;

        if (!BarcodeDetectorCtor) {
          setStatus("Barcode detector unavailable");
          return;
        }

        const detector = new BarcodeDetectorCtor({
          formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "qr_code"],
        });

        const scan = async () => {
          if (cancelled || !videoRef.current) {
            return;
          }

          if (!busy) {
            busy = true;
            try {
              const barcodes = await detector.detect(videoRef.current);
              const match = barcodes.find((barcode) => barcode.rawValue?.trim());
              if (match?.rawValue) {
                onDetected(match.rawValue);
                setStatus(`Detected ${match.rawValue}`);
                setActive(false);
                stop();
                return;
              }
            } catch {
              setStatus("Scanning");
            } finally {
              busy = false;
            }
          }

          frameHandle = requestAnimationFrame(scan);
        };

        setStatus("Scanning");
        frameHandle = requestAnimationFrame(scan);
      } catch {
        setStatus("Camera access failed");
        setActive(false);
      }
    };

    void start();

    return () => {
      cancelled = true;
      stop();
    };
  }, [active, detectorSupported, onDetected]);

  function submitManualValue() {
    const value = manualValue.trim();
    if (!value) {
      return;
    }
    onDetected(value);
    setStatus(`Entered ${value}`);
    setManualValue("");
  }

  return (
    <section className="scanner-panel">
      <div className="scanner-copy">
        <h3>Barcode Quick Search</h3>
        <p>
          Scan using the device camera when supported, or paste a barcode from a handheld
          scanner.
        </p>
      </div>

      <div className="scanner-actions">
        <button
          type="button"
          className="secondary-button"
          onClick={() => setActive((value) => !value)}
          disabled={!detectorSupported}
        >
          {active ? "Stop camera" : "Start camera scan"}
        </button>
        {!detectorSupported ? (
          <span className="status-chip muted">Camera scanning depends on BarcodeDetector support.</span>
        ) : null}
      </div>

      <div className="scanner-manual">
        <input
          value={manualValue}
          onChange={(event) => setManualValue(event.target.value)}
          placeholder="Scan or type barcode / SKU"
        />
        <button type="button" className="primary-button" onClick={submitManualValue}>
          Match item
        </button>
      </div>

      {active ? (
        <video ref={videoRef} className="camera-feed" muted playsInline />
      ) : (
        <div className="camera-placeholder">Camera preview appears here while scanning.</div>
      )}

      <p className="scanner-status">{status}</p>
    </section>
  );
}
