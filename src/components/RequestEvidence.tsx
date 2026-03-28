import { useId, useState } from "react";
import type { RequestAttachment, RequestAttachmentInput } from "../../shared/types";
import {
  formatAttachmentSize,
  readEvidenceFiles,
  REQUEST_EVIDENCE_MAX_FILES,
} from "../lib/evidence";

type EvidenceAttachmentLike = Pick<
  RequestAttachmentInput,
  "fileName" | "mimeType" | "sizeBytes" | "dataUrl"
> &
  Partial<Pick<RequestAttachment, "uploadedAt" | "uploadedByName">>;

interface RequestEvidenceUploaderProps {
  title?: string;
  hint?: string;
  attachments: RequestAttachmentInput[];
  onChange: (attachments: RequestAttachmentInput[]) => void;
  disabled?: boolean;
}

interface RequestEvidenceListProps {
  title?: string;
  attachments: EvidenceAttachmentLike[];
  emptyLabel?: string;
}

function isImageAttachment(attachment: EvidenceAttachmentLike): boolean {
  return attachment.mimeType.startsWith("image/");
}

export function RequestEvidenceList({
  title = "Evidence files",
  attachments,
  emptyLabel = "No evidence files attached.",
}: RequestEvidenceListProps) {
  return (
    <div className="evidence-section">
      <div className="evidence-section__header">
        <div>
          <p className="eyebrow">Evidence</p>
          <h3>{title}</h3>
        </div>
      </div>
      {attachments.length > 0 ? (
        <div className="evidence-list">
          {attachments.map((attachment) => (
            <article key={`${attachment.fileName}-${attachment.dataUrl.slice(0, 32)}`} className="evidence-card">
              {isImageAttachment(attachment) ? (
                <div className="evidence-thumb">
                  <img src={attachment.dataUrl} alt={attachment.fileName} loading="lazy" />
                </div>
              ) : (
                <div className="evidence-thumb evidence-thumb--file">PDF</div>
              )}
              <div className="evidence-card__body">
                <strong>{attachment.fileName}</strong>
                <small>
                  {formatAttachmentSize(attachment.sizeBytes)}
                  {attachment.uploadedAt ? ` • ${new Date(attachment.uploadedAt).toLocaleString()}` : ""}
                </small>
                {attachment.uploadedByName ? <small>Uploaded by {attachment.uploadedByName}</small> : null}
              </div>
              <div className="evidence-card__actions">
                <a href={attachment.dataUrl} target="_blank" rel="noreferrer">
                  Open
                </a>
                <a href={attachment.dataUrl} download={attachment.fileName}>
                  Download
                </a>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="helper-text">{emptyLabel}</p>
      )}
    </div>
  );
}

export function RequestEvidenceUploader({
  title = "Evidence files",
  hint = "Attach photo or PDF evidence. Images are compressed automatically for sync safety.",
  attachments,
  onChange,
  disabled = false,
}: RequestEvidenceUploaderProps) {
  const cameraInputId = useId();
  const fileInputId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function handleFiles(files: FileList | null) {
    if (!files?.length) {
      return;
    }

    setBusy(true);
    setError(undefined);
    try {
      const prepared = await readEvidenceFiles(files, { existingAttachments: attachments });
      onChange([...attachments, ...prepared]);
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : "Could not prepare these evidence files.",
      );
    } finally {
      setBusy(false);
    }
  }

  function removeAttachment(index: number) {
    onChange(attachments.filter((_, attachmentIndex) => attachmentIndex !== index));
  }

  return (
    <div className="evidence-section evidence-section--editor">
      <div className="evidence-section__header">
        <div>
          <p className="eyebrow">Evidence</p>
          <h3>{title}</h3>
        </div>
        <span className="status-chip neutral">
          {attachments.length}/{REQUEST_EVIDENCE_MAX_FILES}
        </span>
      </div>
      <p className="helper-text">{hint}</p>

      <div className="evidence-toolbar">
        <label className={`secondary-button evidence-trigger${disabled || busy ? " disabled" : ""}`} htmlFor={cameraInputId}>
          Add Photo
          <input
            id={cameraInputId}
            type="file"
            accept="image/*"
            capture="environment"
            disabled={disabled || busy || attachments.length >= REQUEST_EVIDENCE_MAX_FILES}
            onClick={(event) => {
              event.currentTarget.value = "";
            }}
            onChange={(event) => {
              void handleFiles(event.target.files);
            }}
          />
        </label>
        <label className={`secondary-button evidence-trigger${disabled || busy ? " disabled" : ""}`} htmlFor={fileInputId}>
          Add File
          <input
            id={fileInputId}
            type="file"
            accept="image/*,application/pdf"
            disabled={disabled || busy || attachments.length >= REQUEST_EVIDENCE_MAX_FILES}
            onClick={(event) => {
              event.currentTarget.value = "";
            }}
            onChange={(event) => {
              void handleFiles(event.target.files);
            }}
          />
        </label>
        {busy ? <span className="helper-text">Preparing files...</span> : null}
      </div>

      {attachments.length > 0 ? (
        <div className="evidence-list">
          {attachments.map((attachment, index) => (
            <article key={`${attachment.fileName}-${attachment.dataUrl.slice(0, 32)}`} className="evidence-card">
              {isImageAttachment(attachment) ? (
                <div className="evidence-thumb">
                  <img src={attachment.dataUrl} alt={attachment.fileName} loading="lazy" />
                </div>
              ) : (
                <div className="evidence-thumb evidence-thumb--file">PDF</div>
              )}
              <div className="evidence-card__body">
                <strong>{attachment.fileName}</strong>
                <small>{formatAttachmentSize(attachment.sizeBytes)}</small>
              </div>
              <div className="evidence-card__actions">
                <a href={attachment.dataUrl} target="_blank" rel="noreferrer">
                  Open
                </a>
                <button type="button" className="text-button" onClick={() => removeAttachment(index)}>
                  Remove
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {error ? <p className="feedback-copy error-copy">{error}</p> : null}
    </div>
  );
}
