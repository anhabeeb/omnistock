import { BarcodeScanner } from "./BarcodeScanner";
import { CloseIcon } from "./AppIcons";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onScan: (value: string) => void;
}

export function BarcodeScanModal({ isOpen, onClose, onScan }: Props) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="page-popup-scrim barcode-modal-scrim" onClick={onClose}>
      <div className="page-popup-card barcode-modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="barcode-modal-header">
          <div>
            <p className="eyebrow">Barcode Scan</p>
            <h2>Scan Barcode</h2>
          </div>
          <button type="button" className="barcode-modal-close" onClick={onClose} aria-label="Close barcode scanner">
            <CloseIcon size={18} />
          </button>
        </div>
        <BarcodeScanner onScan={onScan} onClose={onClose} />
        <p className="barcode-modal-footnote">Position the barcode within the frame to scan it.</p>
      </div>
    </div>
  );
}
