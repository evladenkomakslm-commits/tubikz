/**
 * Browser-side image compression. Keeps the wire payload small without
 * pulling in any npm dependency:
 *
 *   - downscales so the longer side ≤ MAX_DIM (default 1920)
 *   - re-encodes to JPEG @ QUALITY (default 0.85)
 *   - skips compression if the original is already smaller than the
 *     target on both axes AND below SKIP_BYTES (≤ ~600 KB) — that's
 *     usually a phone screenshot / a recently-shared image and re-
 *     encoding would only soften it.
 *
 * For non-photographic types (PNG with transparency, GIF, AVIF, etc.)
 * we just bail and return the original blob untouched — JPEG would
 * lose alpha or animation.
 */

const MAX_DIM = 1920;
const QUALITY = 0.85;
const SKIP_BYTES = 600 * 1024; // 600 KB

const PASSTHROUGH = new Set(['image/gif', 'image/svg+xml', 'image/avif', 'image/heic']);

export async function compressImage(file: File): Promise<File> {
  // Pass through anything we can't safely re-encode to JPEG.
  if (PASSTHROUGH.has(file.type)) return file;
  // Transparent PNGs would lose their alpha channel — leave them.
  if (file.type === 'image/png' && (await pngHasAlpha(file))) return file;

  const bitmap = await loadBitmap(file);
  if (!bitmap) return file;

  const { width, height } = bitmap;
  const scale = Math.min(1, MAX_DIM / Math.max(width, height));
  const small = scale === 1;
  if (small && file.size <= SKIP_BYTES) {
    if (typeof ImageBitmap !== 'undefined' && bitmap instanceof ImageBitmap) {
      bitmap.close();
    }
    return file;
  }

  const targetW = Math.round(width * scale);
  const targetH = Math.round(height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  if (typeof ImageBitmap !== 'undefined' && bitmap instanceof ImageBitmap) {
    bitmap.close();
  }

  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', QUALITY),
  );
  if (!blob) return file;
  if (blob.size >= file.size) return file; // re-encoding made it bigger somehow

  const name = swapExt(file.name, 'jpg');
  return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() });
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement | null> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file);
    } catch {
      // fall through to img fallback
    }
  }
  return await new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

function swapExt(name: string, ext: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? `${name}.${ext}` : `${name.slice(0, dot)}.${ext}`;
}

/**
 * Cheap alpha probe for PNGs — read the IHDR colour-type byte.
 * Type 4 (grey + alpha) and 6 (RGB + alpha) are alpha-bearing.
 */
async function pngHasAlpha(file: File): Promise<boolean> {
  try {
    const head = new Uint8Array(await file.slice(0, 32).arrayBuffer());
    // PNG signature is 8 bytes; IHDR starts at byte 8.
    // Within IHDR (length 13): width(4) height(4) bit-depth(1) colour-type(1)
    const colourType = head[25];
    return colourType === 4 || colourType === 6;
  } catch {
    return true; // unknown — be conservative and keep PNG
  }
}
