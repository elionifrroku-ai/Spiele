const MAX_EDGE = 768;
const VISION_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3";
const WASM_PATH = `${VISION_CDN}/wasm`;
const MODEL_PATH =
  "https://storage.googleapis.com/mediapipe-models/interactive_segmenter_v2/magic_touch/int8/latest/interactive_segmentation.task";

let segmenterPromise = null;
let lastImageKey = null;

export async function loadImageFile(file) {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return fitBitmap(bitmap);
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return rasterize(img);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

export async function loadImageUrl(src) {
  const img = new Image();
  img.decoding = "async";
  img.src = src;
  await img.decode();
  return rasterize(img);
}

async function rasterize(img) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(img, { imageOrientation: "from-image" });
  } catch {
    bitmap = await createImageBitmap(img);
  }
  return fitBitmap(bitmap);
}

function fitBitmap(bitmap) {
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, w, h);
  if (bitmap.close) bitmap.close();
  return { canvas, width: w, height: h };
}

export function warmupTapMagic() {
  return getSegmenter().catch(() => null);
}

async function getSegmenter() {
  if (!segmenterPromise) {
    segmenterPromise = createSegmenter().catch((err) => {
      segmenterPromise = null;
      throw err;
    });
  }
  return segmenterPromise;
}

async function createSegmenter() {
  const { FilesetResolver, InteractiveSegmenter } = await import(
    `${VISION_CDN}/vision_bundle.mjs`
  );
  const vision = await FilesetResolver.forVisionTasks(WASM_PATH, false);
  try {
    return await InteractiveSegmenter.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: MODEL_PATH,
        delegate: "CPU",
      },
    });
  } catch {
    return InteractiveSegmenter.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: MODEL_PATH,
        delegate: "GPU",
      },
    });
  }
}

export async function tapCutout(source, nx, ny) {
  const magic = await tryMagicTouch(source, nx, ny);
  if (magic && magic.coverage > 0.004 && magic.coverage < 0.85) {
    magic.method = "mediapipe";
    return magic;
  }
  const grown = regionGrow(source, nx, ny);
  if (grown && grown.coverage > 0.004 && grown.coverage < 0.55) {
    grown.method = "region-grow";
    return grown;
  }
  return null;
}

async function tryMagicTouch(source, nx, ny) {
  try {
    const segmenter = await getSegmenter();
    const key = source.canvas;
    if (lastImageKey !== key) {
      segmenter.setImage(source.canvas);
      lastImageKey = key;
    }
    const mask = segmenter.segment([
      {
        brushMode: 1,
        point: [{ x: clamp01(nx), y: clamp01(ny) }],
        isCompleted: true,
      },
    ]);
    const data = mask.getAsFloat32Array();
    const { width, height } = mask;
    mask.close();
    const binary = new Float32Array(width * height);
    for (let i = 0; i < binary.length; i++) binary[i] = data[i] >= 0.5 ? 1 : 0;
    keepSeedComponent(binary, width, height, nx, ny);
    featherMask(binary, width, height, 2);
    return maskToPng(source, binary, width, height);
  } catch {
    return null;
  }
}

function regionGrow(source, nx, ny) {
  const ctx = source.canvas.getContext("2d", { willReadFrequently: true });
  const { width, height } = source;
  const img = ctx.getImageData(0, 0, width, height);
  const pixels = img.data;
  const sx = clamp(Math.round(nx * (width - 1)), 0, width - 1);
  const sy = clamp(Math.round(ny * (height - 1)), 0, height - 1);
  const edges = sobel(pixels, width, height);
  const seed = (sy * width + sx) * 4;
  const sr = pixels[seed];
  const sg = pixels[seed + 1];
  const sb = pixels[seed + 2];
  const visited = new Uint8Array(width * height);
  const mask = new Float32Array(width * height);
  const q = [sx, sy];
  visited[sy * width + sx] = 1;
  let i = 0;
  const colorLimit = 48;
  const edgeLimit = 90;
  while (i < q.length) {
    const x = q[i++];
    const y = q[i++];
    const idx = y * width + x;
    mask[idx] = 1;
    const p = idx * 4;
    const dist = Math.hypot(pixels[p] - sr, pixels[p + 1] - sg, pixels[p + 2] - sb);
    if (dist > colorLimit && edges[idx] > edgeLimit) continue;
    const neighbors = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ];
    for (const [nx2, ny2] of neighbors) {
      if (nx2 < 0 || ny2 < 0 || nx2 >= width || ny2 >= height) continue;
      const nidx = ny2 * width + nx2;
      if (visited[nidx]) continue;
      const np = nidx * 4;
      const nd = Math.hypot(pixels[np] - sr, pixels[np + 1] - sg, pixels[np + 2] - sb);
      if (nd > colorLimit * 1.35) continue;
      if (edges[nidx] > 140 && nd > 18) continue;
      visited[nidx] = 1;
      q.push(nx2, ny2);
    }
  }
  closeHoles(mask, width, height);
  featherMask(mask, width, height, 1);
  return maskToPng(source, mask, width, height);
}

export function traceCutout(source, points) {
  if (!points || points.length < 8) return null;
  const { width, height } = source;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.moveTo(points[0].x * width, points[0].y * height);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x * width, points[i].y * height);
  }
  ctx.closePath();
  ctx.fill();
  const data = ctx.getImageData(0, 0, width, height).data;
  const mask = new Float32Array(width * height);
  for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4 + 3] > 8 ? 1 : 0;
  featherMask(mask, width, height, 2);
  const result = maskToPng(source, mask, width, height);
  if (result) result.method = "trace";
  return result;
}

function maskToPng(source, mask, maskW, maskH) {
  const { width, height, canvas } = source;
  let minX = maskW;
  let minY = maskH;
  let maxX = 0;
  let maxY = 0;
  let count = 0;
  for (let y = 0; y < maskH; y++) {
    for (let x = 0; x < maskW; x++) {
      if (mask[y * maskW + x] > 0.08) {
        count++;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  const coverage = count / (maskW * maskH);
  if (count < 80) return null;
  const pad = 6;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(maskW - 1, maxX + pad);
  maxY = Math.min(maskH - 1, maxY + pad);
  const outW = maxX - minX + 1;
  const outH = maxY - minY + 1;
  const src = canvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, width, height);
  const dest = document.createElement("canvas");
  dest.width = outW;
  dest.height = outH;
  const dctx = dest.getContext("2d");
  const out = dctx.createImageData(outW, outH);
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const mx = minX + x;
      const my = minY + y;
      const srcX = Math.round((mx / maskW) * (width - 1));
      const srcY = Math.round((my / maskH) * (height - 1));
      const si = (srcY * width + srcX) * 4;
      const di = (y * outW + x) * 4;
      const a = mask[my * maskW + mx];
      out.data[di] = src.data[si];
      out.data[di + 1] = src.data[si + 1];
      out.data[di + 2] = src.data[si + 2];
      out.data[di + 3] = Math.round(Math.min(1, a) * src.data[si + 3]);
    }
  }
  dctx.putImageData(out, 0, 0);
  return { canvas: dest, width: outW, height: outH, coverage };
}

export function canvasToBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
}

function keepSeedComponent(mask, width, height, nx, ny) {
  const sx = clamp(Math.round(nx * (width - 1)), 0, width - 1);
  const sy = clamp(Math.round(ny * (height - 1)), 0, height - 1);
  if (mask[sy * width + sx] < 1) {
    let found = false;
    for (let r = 1; r < 24 && !found; r++) {
      for (let dy = -r; dy <= r && !found; dy++) {
        for (let dx = -r; dx <= r && !found; dx++) {
          const x = sx + dx;
          const y = sy + dy;
          if (x < 0 || y < 0 || x >= width || y >= height) continue;
          if (mask[y * width + x] >= 1) {
            floodKeep(mask, width, height, x, y);
            found = true;
          }
        }
      }
    }
    if (!found) {
      mask.fill(0);
    }
    return;
  }
  floodKeep(mask, width, height, sx, sy);
}

function floodKeep(mask, width, height, sx, sy) {
  const keep = new Uint8Array(width * height);
  const q = [sx, sy];
  keep[sy * width + sx] = 1;
  let i = 0;
  while (i < q.length) {
    const x = q[i++];
    const y = q[i++];
    const n = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ];
    for (const [nx, ny] of n) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const idx = ny * width + nx;
      if (keep[idx] || mask[idx] < 1) continue;
      keep[idx] = 1;
      q.push(nx, ny);
    }
  }
  for (let p = 0; p < mask.length; p++) {
    if (!keep[p]) mask[p] = 0;
  }
}

function closeHoles(mask, width, height) {
  const copy = new Float32Array(mask);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      if (copy[idx] > 0) continue;
      let n = 0;
      if (copy[idx - 1]) n++;
      if (copy[idx + 1]) n++;
      if (copy[idx - width]) n++;
      if (copy[idx + width]) n++;
      if (n >= 3) mask[idx] = 1;
    }
  }
}

function featherMask(mask, width, height, radius) {
  if (radius <= 0) return;
  const src = new Float32Array(mask);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let n = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
          sum += src[yy * width + xx];
          n++;
        }
      }
      mask[y * width + x] = sum / n;
    }
  }
}

function sobel(pixels, width, height) {
  const mag = new Float32Array(width * height);
  const lum = (i) =>
    0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const a = lum(((y - 1) * width + (x - 1)) * 4);
      const b = lum(((y - 1) * width + x) * 4);
      const c = lum(((y - 1) * width + (x + 1)) * 4);
      const d = lum((y * width + (x - 1)) * 4);
      const f = lum((y * width + (x + 1)) * 4);
      const g = lum(((y + 1) * width + (x - 1)) * 4);
      const h = lum(((y + 1) * width + x) * 4);
      const i = lum(((y + 1) * width + (x + 1)) * 4);
      const gx = -a + c - 2 * d + 2 * f - g + i;
      const gy = -a - 2 * b - c + g + 2 * h + i;
      mag[y * width + x] = Math.hypot(gx, gy);
    }
  }
  return mag;
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function clamp01(v) {
  return clamp(v, 0, 1);
}
