import type { RequestAttachmentInput } from "../../shared/types";

export const REQUEST_EVIDENCE_MAX_FILES = 4;
export const REQUEST_EVIDENCE_MAX_ATTACHMENT_BYTES = 450_000;
export const REQUEST_EVIDENCE_MAX_TOTAL_BYTES = 1_200_000;

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^/.]+$/, "");
}

function withExtension(fileName: string, extension: string): string {
  return `${stripExtension(fileName) || "evidence"}${extension}`;
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Could not prepare this evidence file."));
        return;
      }
      resolve(blob);
    }, mimeType, quality);
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read this evidence file."));
    reader.readAsDataURL(blob);
  });
}

function fileToDataUrl(file: File): Promise<string> {
  return blobToDataUrl(file);
}

function loadImage(file: File): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(file);

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`Could not open ${file.name} as an image.`));
    };
    image.src = objectUrl;
  });
}

async function normalizeImageAttachment(file: File): Promise<RequestAttachmentInput> {
  const image = await loadImage(file);
  const baseWidth = image.naturalWidth || image.width;
  const baseHeight = image.naturalHeight || image.height;
  const maxDimension = 1600;
  const fitScale =
    Math.max(baseWidth, baseHeight) > maxDimension
      ? maxDimension / Math.max(baseWidth, baseHeight)
      : 1;
  const attemptMatrix = [
    { scale: fitScale, quality: 0.88 },
    { scale: fitScale * 0.92, quality: 0.78 },
    { scale: fitScale * 0.82, quality: 0.7 },
    { scale: fitScale * 0.72, quality: 0.62 },
    { scale: fitScale * 0.62, quality: 0.54 },
  ];
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("This browser could not prepare the selected evidence image.");
  }

  for (const attempt of attemptMatrix) {
    const width = Math.max(1, Math.round(baseWidth * attempt.scale));
    const height = Math.max(1, Math.round(baseHeight * attempt.scale));
    canvas.width = width;
    canvas.height = height;
    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    const blob = await canvasToBlob(canvas, "image/jpeg", attempt.quality);
    if (blob.size <= REQUEST_EVIDENCE_MAX_ATTACHMENT_BYTES) {
      return {
        fileName: withExtension(file.name, ".jpg"),
        mimeType: blob.type || "image/jpeg",
        sizeBytes: blob.size,
        dataUrl: await blobToDataUrl(blob),
      };
    }
  }

  throw new Error(`${file.name} is too large. Try a smaller photo or crop it before attaching.`);
}

async function normalizeDocumentAttachment(file: File): Promise<RequestAttachmentInput> {
  if (file.size > REQUEST_EVIDENCE_MAX_ATTACHMENT_BYTES) {
    throw new Error(`${file.name} is too large. Keep PDF evidence below 450 KB.`);
  }

  return {
    fileName: file.name,
    mimeType: file.type || "application/pdf",
    sizeBytes: file.size,
    dataUrl: await fileToDataUrl(file),
  };
}

async function normalizeEvidenceFile(file: File): Promise<RequestAttachmentInput> {
  if (file.type.startsWith("image/")) {
    return normalizeImageAttachment(file);
  }

  if (file.type === "application/pdf") {
    return normalizeDocumentAttachment(file);
  }

  throw new Error(`${file.name} must be an image or PDF evidence file.`);
}

export function formatAttachmentSize(sizeBytes: number): string {
  if (sizeBytes >= 1_000_000) {
    return `${(sizeBytes / 1_000_000).toFixed(2)} MB`;
  }
  if (sizeBytes >= 1_000) {
    return `${Math.round(sizeBytes / 1_000)} KB`;
  }
  return `${sizeBytes} B`;
}

export async function readEvidenceFiles(
  filesLike: FileList | File[] | null | undefined,
  options: { existingAttachments?: RequestAttachmentInput[] } = {},
): Promise<RequestAttachmentInput[]> {
  const files = Array.from(filesLike ?? []);
  const existingAttachments = options.existingAttachments ?? [];
  if (!files.length) {
    return [];
  }

  if (existingAttachments.length >= REQUEST_EVIDENCE_MAX_FILES) {
    throw new Error(`Only ${REQUEST_EVIDENCE_MAX_FILES} evidence files can be attached.`);
  }

  const slotsRemaining = REQUEST_EVIDENCE_MAX_FILES - existingAttachments.length;
  const selectedFiles = files.slice(0, slotsRemaining);
  if (files.length > slotsRemaining) {
    throw new Error(`Only ${REQUEST_EVIDENCE_MAX_FILES} evidence files can be attached.`);
  }

  const nextAttachments: RequestAttachmentInput[] = [];
  for (const file of selectedFiles) {
    nextAttachments.push(await normalizeEvidenceFile(file));
  }

  const totalBytes = [...existingAttachments, ...nextAttachments].reduce(
    (sum, attachment) => sum + attachment.sizeBytes,
    0,
  );
  if (totalBytes > REQUEST_EVIDENCE_MAX_TOTAL_BYTES) {
    throw new Error("The combined evidence files are too large for one request.");
  }

  return nextAttachments;
}
