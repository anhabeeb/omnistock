import { BarcodeScanner } from "./BarcodeScanner";

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
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Barcode Scan</p>
            <h2>Scan Item Barcode</h2>
          </div>
          <button type="button" className="secondary-button" onClick={onClose}>
            Close
          </button>
        </div>
        <BarcodeScanner onScan={onScan} onClose={onClose} />
      </div>
    </div>
  );
}
