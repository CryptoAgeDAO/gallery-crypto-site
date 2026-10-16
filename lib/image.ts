// 写真を長辺 1400px の JPEG に縮小する（iPhone の HEIC も Safari ならここで JPEG になる）
export async function shrink(file: File): Promise<Blob> {
  try {
    if (typeof createImageBitmap !== 'function') return file;
    const bmp = await createImageBitmap(file);
    const max = 1400;
    const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * s);
    c.height = Math.round(bmp.height * s);
    const ctx = c.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    const blob: Blob | null = await new Promise((r) => c.toBlob((b) => r(b), 'image/jpeg', 0.82));
    return blob || file;
  } catch {
    return file;
  }
}
