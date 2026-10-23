"use client";

// Shrinks a photo in the browser before upload: scales it down to fit MAX_SIDE and
// re-encodes it as WebP. A 3 MB phone photo ends up around 40-100 KB.

const MAX_SIDE = 900;   // longest side in pixels; plenty for a menu card
const QUALITY = 0.8;

export interface Compressed {
  blob: Blob;
  width: number;
  height: number;
  originalBytes: number;
}

export async function compressToWebp(file: File): Promise<Compressed> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.');

  // imageOrientation keeps phone photos upright (they carry a rotation flag).
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('This image could not be read. Try a JPG or PNG.');
  }

  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Your browser cannot process images.');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', QUALITY));
  // Browsers that cannot encode WebP silently return a PNG; refuse rather than upload the wrong thing.
  if (!blob || blob.type !== 'image/webp') throw new Error('Your browser cannot convert to WebP. Please use Chrome, Edge or Firefox.');
  return { blob, width, height, originalBytes: file.size };
}
