const DEFAULT_MAX = 1280;
const DEFAULT_QUALITY = 0.82;

/** Sample a few pixels — used to detect canvas decode/encode failures that yield solid black. */
function isMostlyBlack(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  const sw = Math.min(w, 48);
  const sh = Math.min(h, 48);
  const { data } = ctx.getImageData(0, 0, sw, sh);
  let lit = 0;
  let checked = 0;
  // Stride every 4th pixel (16 bytes) to keep this cheap.
  for (let i = 0; i < data.length; i += 16) {
    checked += 1;
    if (data[i]! > 12 || data[i + 1]! > 12 || data[i + 2]! > 12) lit += 1;
  }
  return checked > 0 && lit === 0;
}

async function decodeBitmap(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, {
      imageOrientation: 'from-image',
      colorSpaceConversion: 'default',
    });
  } catch {
    return createImageBitmap(file);
  }
}

/**
 * Downscale and re-encode as JPEG for smaller uploads. Falls back to the original file on failure
 * or when canvas output is solid black (common with some HDR / iPhone / exotic JPEG pipelines).
 */
export async function compressImageForUpload(
  file: File,
  maxDimension: number = DEFAULT_MAX,
  quality: number = DEFAULT_QUALITY
): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  // GIF may be animated — leave untouched.
  if (file.type === 'image/gif') return file;

  try {
    const bmp = await decodeBitmap(file);
    const { width, height } = bmp;
    const scale = Math.min(1, maxDimension / Math.max(width, height, 1));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));

    // Already small enough and already JPEG — skip re-encode (avoids quality loss / black bugs).
    if (scale === 1 && file.type === 'image/jpeg' && file.size <= 900_000) {
      bmp.close();
      return file;
    }

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      bmp.close();
      return file;
    }

    // White underlay so PNG transparency does not become solid black JPEG.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close();

    if (isMostlyBlack(ctx, w, h)) {
      return file;
    }

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', quality);
    });
    if (!blob || blob.size === 0) return file;

    // Suspiciously tiny output for photo-sized canvas → likely blank/corrupt encode.
    if (w * h > 40_000 && blob.size < 1500) return file;

    const base = file.name.replace(/\.[^.]+$/, '') || 'image';
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}
