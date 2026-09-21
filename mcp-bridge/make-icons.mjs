import fs from "node:fs";
import zlib from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "package");

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** Writes an RGBA PNG. pixel(x,y) -> [r,g,b,a] */
function png(size, pixel) {
  const raw = [];
  for (let y = 0; y < size; y++) {
    raw.push(Buffer.from([0]));
    const row = Buffer.alloc(size * 4);
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y);
      row[x * 4] = r; row[x * 4 + 1] = g; row[x * 4 + 2] = b; row[x * 4 + 3] = a;
    }
    raw.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(Buffer.concat(raw), { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

// nos e arestas de um mini-grafo de ontologia
const NODES = [
  [0.26, 0.30], [0.50, 0.18], [0.74, 0.30],
  [0.26, 0.70], [0.50, 0.82], [0.74, 0.70],
  [0.50, 0.50]
];
const EDGES = [[6, 0], [6, 1], [6, 2], [6, 3], [6, 4], [6, 5]];

function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1e-9)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function graph(x, y, size, nodeR, edgeW) {
  const u = x / size, v = y / size;
  for (const [i, j] of EDGES) {
    if (distToSeg(u, v, NODES[i][0], NODES[i][1], NODES[j][0], NODES[j][1]) < edgeW) return "edge";
  }
  for (let i = 0; i < NODES.length; i++) {
    const r = i === 6 ? nodeR * 1.45 : nodeR;
    if (Math.hypot(u - NODES[i][0], v - NODES[i][1]) < r) return "node";
  }
  return null;
}

// color.png 192x192 — fundo azul Fabric, grafo branco
const COLOR = 192;
fs.writeFileSync(path.join(dir, "color.png"), png(COLOR, (x, y) => {
  const t = y / COLOR;
  const bg = [Math.round(18 + 16 * t), Math.round(70 + 30 * t), Math.round(120 + 40 * t), 255];
  const hit = graph(x, y, COLOR, 0.055, 0.012);
  if (hit === "node") return [255, 255, 255, 255];
  if (hit === "edge") return [150, 215, 255, 255];
  return bg;
}));

// outline.png 32x32 — branco sobre transparente
const OUT = 32;
fs.writeFileSync(path.join(dir, "outline.png"), png(OUT, (x, y) => {
  const hit = graph(x, y, OUT, 0.085, 0.022);
  return hit ? [255, 255, 255, 255] : [0, 0, 0, 0];
}));

for (const f of ["color.png", "outline.png"]) {
  console.log(f, fs.statSync(path.join(dir, f)).size, "bytes");
}
