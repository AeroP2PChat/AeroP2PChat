import createPica from "pica";

const resizer = createPica({ concurrency: 2, tile: 1024 });
const MAX_IMAGE_EDGE = 2560;
const MIN_OPTIMIZATION_BYTES = 1.25 * 1024 * 1024;

function optimizedFileName(name, mimeType) {
  const extension = mimeType === "image/png" ? ".png" : ".jpg";
  const stem = String(name || "image").replace(/\.[^.]+$/u, "") || "image";
  return `${stem}${extension}`;
}

export async function optimizeImageForTransfer(file) {
  if (
    !(file instanceof Blob) ||
    !["image/jpeg", "image/png", "image/webp"].includes(file.type)
  ) {
    return { file, optimized: false };
  }

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < MIN_OPTIMIZATION_BYTES) {
      return { file, optimized: false };
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    await resizer.resize(bitmap, canvas, {
      filter: "mks2013",
      unsharpAmount: 80,
      unsharpRadius: 0.6,
      unsharpThreshold: 2,
    });
    const outputType = file.type === "image/png" ? "image/png" : "image/jpeg";
    const blob = await resizer.toBlob(canvas, outputType, 0.88);
    if (blob.size >= file.size * 0.94) {
      return { file, optimized: false };
    }
    return {
      file: new File([blob], optimizedFileName(file.name, outputType), {
        type: outputType,
        lastModified: file.lastModified || Date.now(),
      }),
      optimized: true,
      originalSize: file.size,
    };
  } finally {
    bitmap.close();
  }
}
