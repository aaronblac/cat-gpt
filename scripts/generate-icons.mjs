#!/usr/bin/env node
/**
 * Generates the CatGPT app icons with zero dependencies.
 * Draws a neon cat sigil into a pixel buffer, downsamples for anti-aliasing,
 * and writes real PNGs via zlib + a hand-rolled CRC32.
 *
 *   npm run icons
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");

const C = {
  bg: [4, 6, 11],
  bgDeep: [2, 3, 7],
  bgGlow: [10, 26, 44],
  cyan: [94, 231, 255],
  violet: [123, 140, 255],
  pink: [255, 92, 200],
  ink: [4, 8, 16],
  white: [234, 246, 255],
};

const hex = ([r, g, b]) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;

function makeBuffer(w, h) {
  return new Uint8ClampedArray(w * h * 4);
}

function blend(buf, w, x, y, color, alpha) {
  if (alpha <= 0) return;
  const i = (y * w + x) * 4;
  const a = Math.min(1, alpha);
  buf[i] = buf[i] * (1 - a) + color[0] * a;
  buf[i + 1] = buf[i + 1] * (1 - a) + color[1] * a;
  buf[i + 2] = buf[i + 2] * (1 - a) + color[2] * a;
  buf[i + 3] = Math.max(buf[i + 3], Math.round(a * 255));
}

function maskEllipse(x, y, cx, cy, rx, ry) {
  const dx = (x - cx) / rx;
  const dy = (y - cy) / ry;
  return dx * dx + dy * dy <= 1;
}

function maskTriangle(x, y, ax, ay, bx, by, cx, cy) {
  const d1 = (x - bx) * (ay - by) - (ax - bx) * (y - by);
  const d2 = (x - cx) * (by - cy) - (bx - cx) * (y - cy);
  const d3 = (x - ax) * (cy - ay) - (cx - ax) * (y - ay);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

function maskRing(x, y, cx, cy, radius, thickness) {
  const d = Math.hypot(x - cx, y - cy);
  return Math.abs(d - radius) <= thickness;
}

function maskRect(x, y, x0, y0, x1, y1) {
  return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

function mix(a, b, t) {
  const k = Math.min(1, Math.max(0, t));
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

/** Paint every pixel whose normalized coordinate satisfies `test`. */
function paint(buf, size, test, color, alpha = 1) {
  for (let y = 0; y < size; y += 1) {
    const ny = (y + 0.5) / size;
    for (let x = 0; x < size; x += 1) {
      const nx = (x + 0.5) / size;
      if (test(nx, ny)) blend(buf, size, x, y, color, alpha);
    }
  }
}

function insetTriangle(points, amount) {
  const cx = (points[0][0] + points[1][0] + points[2][0]) / 3;
  const cy = (points[0][1] + points[1][1] + points[2][1]) / 3;
  return points.map(([x, y]) => [x + (cx - x) * amount, y + (cy - y) * amount]);
}

function renderIcon(size, { maskable = false } = {}) {
  const S = size * 2; // supersample, then average down for smooth edges
  const buf = makeBuffer(S, S);
  const k = maskable ? 0.76 : 0.94;
  const map = (px, py) => [0.5 + (px - 0.5) * k, 0.5 + (py - 0.5) * k];
  const [hx, hy] = map(0.5, 0.555);
  const rx = 0.232 * k;
  const ry = 0.203 * k;

  // Background: deep radial with a subtle electric bloom behind the cat.
  for (let y = 0; y < S; y += 1) {
    const ny = (y + 0.5) / S;
    for (let x = 0; x < S; x += 1) {
      const nx = (x + 0.5) / S;
      const radial = Math.hypot(nx - 0.5, ny - 0.46) / 0.72;
      let color = mix(C.bgGlow, C.bgDeep, radial);
      const bloom = Math.exp(-Math.pow(Math.hypot(nx - 0.5, ny - 0.52) / 0.34, 2));
      color = mix(color, [24, 68, 104], bloom * 0.55);
      blend(buf, S, x, y, color, 1);
    }
  }

  // Outer neon ring.
  paint(buf, S, (x, y) => maskRing(x, y, 0.5, 0.5, 0.442 * k, 0.006 * k), C.cyan, 0.5);
  paint(
    buf,
    S,
    (x, y) => maskRing(x, y, 0.5, 0.5, 0.442 * k, 0.018 * k),
    C.cyan,
    0.08,
  );

  const leftEar = [
    [0.302, 0.44],
    [0.252, 0.215],
    [0.448, 0.355],
  ];
  const rightEar = [
    [0.698, 0.44],
    [0.748, 0.215],
    [0.552, 0.355],
  ];
  const earTest = (points) => (x, y) => {
    const [a, b, c] = points.map(([px, py]) => {
      const [mx, my] = map(px, py);
      return [mx, my];
    });
    return maskTriangle(x, y, a[0], a[1], b[0], b[1], c[0], c[1]);
  };

  // Soft halo around the head, layered so there is no hard edge.
  for (const [expand, alpha] of [
    [0.085, 0.035],
    [0.062, 0.045],
    [0.038, 0.055],
    [0.018, 0.07],
  ]) {
    paint(
      buf,
      S,
      (x, y) => maskEllipse(x, y, hx, hy, rx + expand * k, ry + expand * k),
      C.cyan,
      alpha,
    );
  }

  // Ears + head: cyan edge first, then a dark inset leaves a glowing outline.
  paint(buf, S, earTest(leftEar), C.cyan, 0.92);
  paint(buf, S, earTest(rightEar), C.cyan, 0.92);
  paint(buf, S, (x, y) => maskEllipse(x, y, hx, hy, rx, ry), C.cyan, 0.95);

  paint(buf, S, earTest(insetTriangle(leftEar, 0.22)), C.bgGlow, 1);
  paint(buf, S, earTest(insetTriangle(rightEar, 0.22)), C.bgGlow, 1);
  paint(buf, S, (x, y) => maskEllipse(x, y, hx, hy, rx - 0.013, ry - 0.013), C.bgGlow, 1);
  paint(buf, S, (x, y) => maskEllipse(x, y, hx, hy + 0.028, rx - 0.088, ry - 0.052), [16, 34, 56], 0.5);

  // Eyes with vertical slit pupils.
  const eyeY = 0.548;
  const [lex, ley] = map(0.415, eyeY);
  const [rex, rey] = map(0.585, eyeY);
  paint(buf, S, (x, y) => maskEllipse(x, y, lex, ley, 0.044 * k, 0.058 * k), C.cyan, 1);
  paint(buf, S, (x, y) => maskEllipse(x, y, rex, rey, 0.044 * k, 0.058 * k), C.cyan, 1);
  paint(buf, S, (x, y) => maskEllipse(x, y, lex, ley + 0.004, 0.0095 * k, 0.052 * k), C.ink, 1);
  paint(buf, S, (x, y) => maskEllipse(x, y, rex, rey + 0.004, 0.0095 * k, 0.052 * k), C.ink, 1);

  // Nose.
  const [nx0, ny0] = map(0.5, 0.618);
  const [nx1, ny1] = map(0.476, 0.646);
  const [nx2, ny2] = map(0.524, 0.646);
  paint(buf, S, (x, y) => maskTriangle(x, y, nx0, ny0, nx1, ny1, nx2, ny2), C.pink, 0.95);

  // Whiskers.
  const line = (ax, ay, bx, by, thickness) => (x, y) => {
    const [x0, y0] = map(ax, ay);
    const [x1, y1] = map(bx, by);
    const dx = x1 - x0;
    const dy = y1 - y0;
    const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(x - (x0 + t * dx), y - (y0 + t * dy)) <= thickness * k;
  };
  paint(buf, S, line(0.345, 0.618, 0.198, 0.598, 0.004), C.cyan, 0.42);
  paint(buf, S, line(0.345, 0.64, 0.19, 0.655, 0.004), C.cyan, 0.36);
  paint(buf, S, line(0.655, 0.618, 0.802, 0.598, 0.004), C.cyan, 0.42);
  paint(buf, S, line(0.655, 0.64, 0.81, 0.655, 0.004), C.cyan, 0.36);

  // Collar with a tiny nameplate.
  paint(buf, S, (x, y) => maskRect(x, y, 0.352, 0.742, 0.648, 0.798), C.cyan, 0.88);
  paint(buf, S, (x, y) => maskRect(x, y, 0.368, 0.756, 0.632, 0.786), C.bgDeep, 0.95);
  paint(buf, S, (x, y) => maskRect(x, y, 0.438, 0.748, 0.562, 0.792), C.cyan, 1);
  paint(buf, S, (x, y) => maskRect(x, y, 0.446, 0.763, 0.554, 0.777), C.bgDeep, 1);

  // Downsample 2×2 into the final RGBA buffer.
  const out = makeBuffer(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < 2; sy += 1) {
        for (let sx = 0; sx < 2; sx += 1) {
          const i = ((y * 2 + sy) * S + (x * 2 + sx)) * 4;
          r += buf[i];
          g += buf[i + 1];
          b += buf[i + 2];
          a += buf[i + 3];
        }
      }
      const o = (y * size + x) * 4;
      out[o] = r / 4;
      out[o + 1] = g / 4;
      out[o + 2] = b / 4;
      out[o + 3] = a / 4;
    }
  }
  return out;
}

/* --- Minimal PNG encoder ------------------------------------------------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, "latin1");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePng(rgba, width, height) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    for (let x = 0; x < stride; x += 1) {
      raw[y * (stride + 1) + 1 + x] = rgba[y * stride + x];
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = deflateSync(raw, { level: 9 });
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/* --- Main ---------------------------------------------------------------- */

mkdirSync(OUT_DIR, { recursive: true });

const jobs = [
  { file: "icon-512.png", size: 512, maskable: false },
  { file: "icon-192.png", size: 192, maskable: false },
  { file: "apple-touch-icon.png", size: 180, maskable: false },
  { file: "icon-maskable-512.png", size: 512, maskable: true },
  { file: "favicon-32.png", size: 32, maskable: false },
];

for (const job of jobs) {
  const pixels = renderIcon(job.size, { maskable: job.maskable });
  const png = encodePng(pixels, job.size, job.size);
  const target = join(OUT_DIR, job.file);
  writeFileSync(target, png);
  console.log(`  ✓ ${job.file}  ${job.size}×${job.size}  ${(png.length / 1024).toFixed(1)} KB`);
}

console.log(`\nCatGPT icons written to ${OUT_DIR}\nAccent colour: ${hex(C.cyan)}`);
