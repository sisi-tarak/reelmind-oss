// Whichever board view is on screen (workflow or 3D) registers how to take a picture of itself,
// so exports and share tools don't need to know which view is active.
export interface CaptureRequest {
  /** Reel ids to frame; the picture is cropped to them and what they connect to. Empty = everything. */
  reelIds?: Set<string>;
  format: 'png' | 'jpeg';
  /** Show everything at full strength, ignoring any focus or filter fading. */
  clean?: boolean;
}

type Capture = (req: CaptureRequest) => Promise<string>;

let current: Capture | null = null;

export function registerCapture(fn: Capture | null) {
  current = fn;
}

export async function captureBoard(req: CaptureRequest): Promise<string | null> {
  return current ? current(req) : null;
}

export function dataUrlToBlob(dataUrl: string) {
  const [head, body] = dataUrl.split(',');
  const mime = head.match(/data:([^;]+)/)?.[1] || 'application/octet-stream';
  const bytes = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: mime });
}

export function downloadBlob(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function fileStamp() {
  return new Date().toISOString().slice(0, 10);
}

export function slug(s: string) {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'reelmind'
  );
}
