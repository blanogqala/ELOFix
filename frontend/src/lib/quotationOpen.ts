/** Mobile-safe helpers for viewing / saving quotation blobs (auth already applied via axios). */

const BLOB_URL_TTL_MS = 60_000;

export function isAppleTouchDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/i.test(ua)) return true;
  // iPadOS reports as MacIntel with touch
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

function revokeLater(url: string, ms = BLOB_URL_TTL_MS): void {
  window.setTimeout(() => URL.revokeObjectURL(url), ms);
}

export type QuotationViewResult =
  | { mode: 'tab'; blobUrl: string }
  | { mode: 'inline'; blobUrl: string };

/**
 * Present a quotation blob for viewing.
 * Pass a window opened synchronously in the click handler (`window.open('about:blank')`)
 * so mobile browsers do not block the popup after the async fetch.
 */
export function presentQuotationForView(
  blob: Blob,
  previewWindow: Window | null
): QuotationViewResult {
  const blobUrl = URL.createObjectURL(blob);

  if (previewWindow && !previewWindow.closed) {
    try {
      previewWindow.location.href = blobUrl;
      try {
        previewWindow.opener = null;
      } catch {
        /* ignore */
      }
      revokeLater(blobUrl);
      return { mode: 'tab', blobUrl };
    } catch {
      closePreviewWindow(previewWindow);
    }
  }

  // Popup blocked — caller should show an in-app preview with this URL.
  return { mode: 'inline', blobUrl };
}

export type QuotationDownloadResult =
  | { mode: 'shared' }
  | { mode: 'anchor' }
  | { mode: 'opened'; hint: string };

export interface DownloadQuotationOptions {
  /**
   * Blank window opened synchronously on click (iOS). Used when Web Share is
   * unavailable so navigation after the async fetch is not popup-blocked.
   * Closed automatically when share succeeds.
   */
  fallbackWindow?: Window | null;
}

/**
 * Save / share a quotation blob. Prefers Web Share (iOS), then `<a download>`,
 * then open-in-tab with a save hint when download is unreliable.
 */
export async function downloadQuotationBlob(
  blob: Blob,
  fileName: string,
  options: DownloadQuotationOptions = {}
): Promise<QuotationDownloadResult> {
  const safeName = fileName?.trim() || 'quotation';
  const mime = blob.type || 'application/octet-stream';
  const file = new File([blob], safeName, { type: mime });
  const fallbackWindow = options.fallbackWindow ?? null;

  // Web Share with files is the reliable "save" path on iOS Safari.
  if (isAppleTouchDevice() && typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      const payload: ShareData = { files: [file], title: safeName };
      if (!navigator.canShare || navigator.canShare(payload)) {
        await navigator.share(payload);
        closePreviewWindow(fallbackWindow);
        return { mode: 'shared' };
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        closePreviewWindow(fallbackWindow);
        return { mode: 'shared' };
      }
      // Fall through to open-with-hint.
    }
  }

  const url = URL.createObjectURL(blob);

  // iOS often ignores `<a download>` for PDFs/images — open and prompt Save/Share.
  if (isAppleTouchDevice()) {
    if (fallbackWindow && !fallbackWindow.closed) {
      try {
        fallbackWindow.location.href = url;
        revokeLater(url);
        return {
          mode: 'opened',
          hint: 'Use Share or Save to Files in the browser to keep a copy.',
        };
      } catch {
        closePreviewWindow(fallbackWindow);
      }
    }
    // Last resort (may be blocked after await).
    window.open(url, '_blank', 'noopener,noreferrer');
    revokeLater(url);
    return {
      mode: 'opened',
      hint: 'Use Share or Save to Files in the browser to keep a copy.',
    };
  }

  closePreviewWindow(fallbackWindow);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = safeName;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  revokeLater(url);
  return { mode: 'anchor' };
}

/** Close a blank preview tab opened for View/Download if the fetch failed. */
export function closePreviewWindow(previewWindow: Window | null): void {
  if (!previewWindow || previewWindow.closed) return;
  try {
    previewWindow.close();
  } catch {
    /* ignore */
  }
}
