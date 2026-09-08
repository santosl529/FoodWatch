/**
 * Downscales and re-encodes a photo in the browser before upload.
 *
 * Two problems, one fix, no dependency:
 *
 * 1. **HEIC.** iPhones shoot HEIC, which most browsers cannot render — so the
 *    preview in the create form was blank for exactly the users most likely to
 *    post. Drawing to a canvas and re-encoding as JPEG fixes that on the
 *    devices that matter, since iOS Safari decodes HEIC natively.
 * 2. **Size.** A modern phone photo is 3-5 MB. On campus wifi that is several
 *    seconds of the ~15s posting budget (PRD §1) spent staring at a spinner.
 *    Long edge 1600px at JPEG 0.8 lands around 200-400 KB, which is plenty for
 *    a feed thumbnail and a detail view.
 *
 * Returns the original file untouched if anything fails — a compression problem
 * must never block posting.
 */
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.8;

export async function compressPhoto(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);

    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY);
    });
    if (!blob) return file;

    // Keep the original if re-encoding somehow made it bigger — small PNGs and
    // already-compressed images can come out larger as JPEG.
    if (blob.size >= file.size && file.type !== "image/heic") return file;

    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    // Unsupported format, memory pressure, a browser without createImageBitmap
    // — upload what the user picked rather than failing the post.
    return file;
  }
}
