// SPDX-License-Identifier: AGPL-3.0-or-later
/** Structure checks for anonymous image uploads, with no bindings: where an image really ends, how many
 * frames a GIF has, and every frame of a GIF as a small PNG for the sensitive content check.
 * Unit-tested in test/frames.test.ts. */

const u16le = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u32le = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const u32be = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const ascii = (b: Uint8Array, o: number, s: string) => [...s].every((c, i) => b[o + i] === c.charCodeAt(0));

/**
 * Byte length of the image itself, so anything appended after it (a ZIP behind a JPEG, say) can be cut off.
 * Returns null when the file doesn't parse as the given type, which means it is damaged or not what it claims.
 */
export function imageEnd(mime: string, b: Uint8Array): number | null {
  try {
    switch (mime) {
      case "image/png": return pngEnd(b);
      case "image/jpeg": return jpegEnd(b);
      case "image/gif": return gifInfo(b)?.end ?? null;
      case "image/webp": return riffEnd(b);
      case "image/bmp": return bmpEnd(b);
      case "image/avif": return isoEnd(b);
      default: return null;
    }
  } catch {
    return null;
  }
}

function pngEnd(b: Uint8Array): number | null {
  let p = 8;
  while (p + 12 <= b.length) {
    const len = u32be(b, p);
    const end = p + 12 + len;
    if (end > b.length) return null;
    if (ascii(b, p + 4, "IEND")) return end;
    p = end;
  }
  return null;
}

function jpegEnd(b: Uint8Array): number | null {
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  let p = 2;
  while (p + 2 <= b.length) {
    if (b[p] !== 0xff) return null;
    const m = b[p + 1];
    if (m === 0xff) { p++; continue; } // fill byte
    if (m === 0xd9) return p + 2;
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { p += 2; continue; }
    if (p + 4 > b.length) return null;
    const len = (b[p + 2] << 8) | b[p + 3];
    if (len < 2) return null;
    p += 2 + len;
    if (p > b.length) return null;
    if (m === 0xda) {
      // entropy-coded data runs until the next marker that isn't a stuffed 0x00 or a restart marker
      while (p + 1 < b.length && !(b[p] === 0xff && b[p + 1] !== 0x00 && !(b[p + 1] >= 0xd0 && b[p + 1] <= 0xd7))) p++;
      if (p + 1 >= b.length) return null;
    }
  }
  return null;
}

function riffEnd(b: Uint8Array): number | null {
  if (!ascii(b, 0, "RIFF")) return null;
  const end = 8 + u32le(b, 4);
  return end <= b.length ? end + (end % 2) : null;
}

function bmpEnd(b: Uint8Array): number | null {
  const size = u32le(b, 2);
  return size >= 26 && size <= b.length ? size : null;
}

function isoEnd(b: Uint8Array): number | null {
  let p = 0;
  let sawMeta = false;
  while (p + 8 <= b.length) {
    let size = u32be(b, p);
    if (size === 1) {
      if (p + 16 > b.length) return null;
      size = u32be(b, p + 8) * 2 ** 32 + u32be(b, p + 12);
    } else if (size === 0) size = b.length - p;
    const type = String.fromCharCode(...b.subarray(p + 4, p + 8));
    // not a box that fits: whatever follows was appended
    if (size < 8 || p + size > b.length || !/^[a-z0-9 ]{4}$/i.test(type)) break;
    if (type === "meta") sawMeta = true;
    p += size;
  }
  return sawMeta && p > 0 ? p : null;
}

// ---------- GIF ----------

export type GifInfo = { width: number; height: number; frames: number; end: number };

/** Walks a GIF's blocks without decoding pixels: canvas size, frame count and where the trailer ends. */
export function gifInfo(b: Uint8Array): GifInfo | null {
  if (!ascii(b, 0, "GIF8") || b.length < 13) return null;
  const width = u16le(b, 6), height = u16le(b, 8);
  let p = 13;
  if (b[10] & 0x80) p += 3 * (1 << ((b[10] & 7) + 1));
  let frames = 0;
  const skipSub = () => {
    while (p < b.length && b[p] !== 0) p += b[p] + 1;
    if (p >= b.length) throw new Error("truncated");
    p++;
  };
  while (p < b.length) {
    const t = b[p];
    if (t === 0x3b) return { width, height, frames, end: p + 1 };
    if (t === 0x21) { p += 2; skipSub(); continue; }
    if (t !== 0x2c || p + 10 > b.length) return null;
    const packed = b[p + 9];
    p += 10;
    if (packed & 0x80) p += 3 * (1 << ((packed & 7) + 1));
    p++; // LZW minimum code size
    skipSub();
    frames++;
  }
  return null;
}

/** Decodes the LZW data of one GIF frame into palette indices. */
function lzw(min: number, data: Uint8Array, count: number): Uint8Array {
  const out = new Uint8Array(count);
  const clear = 1 << min, eoi = clear + 1;
  const prefix = new Int16Array(4096), suffix = new Uint8Array(4096), stack = new Uint8Array(4097);
  let size = min + 1, mask = (1 << size) - 1, next = eoi + 1, old = -1, first = 0;
  let bits = 0, acc = 0, o = 0, i = 0;
  for (let c = 0; c < clear; c++) suffix[c] = c;
  while (o < count) {
    while (bits < size) {
      if (i >= data.length) return out;
      acc |= data[i++] << bits;
      bits += 8;
    }
    let code = acc & mask;
    acc >>>= size;
    bits -= size;
    if (code === clear) { size = min + 1; mask = (1 << size) - 1; next = eoi + 1; old = -1; continue; }
    if (code === eoi) break;
    if (old === -1) { out[o++] = suffix[code]; old = first = code; continue; }
    const inCode = code;
    let sp = 0;
    if (code >= next) { stack[sp++] = first; code = old; }
    while (code >= clear) { stack[sp++] = suffix[code]; code = prefix[code]; }
    first = suffix[code];
    stack[sp++] = first;
    while (sp > 0 && o < count) out[o++] = stack[--sp];
    if (next < 4096) { prefix[next] = old; suffix[next] = first; next++; if ((next & mask) === 0 && next < 4096) { size++; mask = (1 << size) - 1; } }
    old = inCode;
  }
  return out;
}

/**
 * Every frame of a GIF as it is shown (composited, transparency over white), scaled down to at most
 * `max` pixels on the long side. Frames that look exactly like the one before are skipped.
 */
export function* gifFrames(b: Uint8Array, max = 512): Generator<{ width: number; height: number; rgb: Uint8Array }> {
  const W = u16le(b, 6), H = u16le(b, 8);
  if (!W || !H) return;
  let p = 13;
  let gct: Uint8Array | null = null;
  if (b[10] & 0x80) { const n = 3 * (1 << ((b[10] & 7) + 1)); gct = b.subarray(p, p + n); p += n; }
  const canvas = new Uint8Array(W * H * 4); // RGBA, starts transparent
  let trans = -1, disposal = 0;
  const scale = Math.min(1, max / Math.max(W, H));
  const w = Math.max(1, Math.round(W * scale)), h = Math.max(1, Math.round(H * scale));
  let lastKey = "";
  const sub = () => {
    const parts: Uint8Array[] = [];
    while (p < b.length && b[p] !== 0) { parts.push(b.subarray(p + 1, p + 1 + b[p])); p += b[p] + 1; }
    p++;
    const len = parts.reduce((n, x) => n + x.length, 0);
    const all = new Uint8Array(len);
    let o = 0;
    for (const x of parts) { all.set(x, o); o += x.length; }
    return all;
  };
  while (p < b.length) {
    const t = b[p];
    if (t === 0x3b) return;
    if (t === 0x21) {
      const label = b[p + 1];
      p += 2;
      if (label === 0xf9) {
        const ext = sub();
        disposal = (ext[0] >> 2) & 7;
        trans = ext[0] & 1 ? ext[3] : -1;
      } else sub();
      continue;
    }
    if (t !== 0x2c) return;
    const fx = u16le(b, p + 1), fy = u16le(b, p + 3), fw = u16le(b, p + 5), fh = u16le(b, p + 7), packed = b[p + 9];
    p += 10;
    let ct = gct;
    if (packed & 0x80) { const n = 3 * (1 << ((packed & 7) + 1)); ct = b.subarray(p, p + n); p += n; }
    const min = b[p++];
    const idx = lzw(Math.min(Math.max(min, 2), 11), sub(), fw * fh);
    const before = disposal === 3 ? canvas.slice() : null;
    const rows = rowOrder(fh, !!(packed & 0x40));
    for (let r = 0; r < fh; r++) {
      const y = fy + rows[r];
      if (y >= H) continue;
      for (let x = 0; x < fw; x++) {
        const cx = fx + x;
        if (cx >= W) continue;
        const c = idx[r * fw + x];
        if (c === trans || !ct || c * 3 + 2 >= ct.length) continue;
        const q = (y * W + cx) * 4;
        canvas[q] = ct[c * 3]; canvas[q + 1] = ct[c * 3 + 1]; canvas[q + 2] = ct[c * 3 + 2]; canvas[q + 3] = 255;
      }
    }
    // the frame as shown, flattened on white and scaled (nearest neighbour is enough for the check)
    const rgb = new Uint8Array(w * h * 3);
    for (let y = 0; y < h; y++) {
      const sy = Math.min(H - 1, Math.floor(y / scale));
      for (let x = 0; x < w; x++) {
        const sx = Math.min(W - 1, Math.floor(x / scale));
        const q = (sy * W + sx) * 4, o = (y * w + x) * 3;
        const a = canvas[q + 3] / 255;
        rgb[o] = canvas[q] * a + 255 * (1 - a); rgb[o + 1] = canvas[q + 1] * a + 255 * (1 - a); rgb[o + 2] = canvas[q + 2] * a + 255 * (1 - a);
      }
    }
    const key = quickHash(rgb);
    if (key !== lastKey) { lastKey = key; yield { width: w, height: h, rgb }; }
    if (disposal === 2) {
      for (let y = fy; y < Math.min(H, fy + fh); y++) canvas.fill(0, (y * W + fx) * 4, (y * W + Math.min(W, fx + fw)) * 4);
    } else if (before) canvas.set(before);
    trans = -1; disposal = 0;
  }
}

function rowOrder(h: number, interlaced: boolean): number[] {
  if (!interlaced) return Array.from({ length: h }, (_, i) => i);
  const rows: number[] = [];
  for (const [start, step] of [[0, 8], [4, 8], [2, 4], [1, 2]]) for (let y = start; y < h; y += step) rows.push(y);
  return rows;
}

function quickHash(b: Uint8Array): string {
  let h1 = 0x811c9dc5, h2 = 0x1b873593;
  for (let i = 0; i < b.length; i++) { h1 = Math.imul(h1 ^ b[i], 16777619); h2 = Math.imul(h2 + b[i], 2654435761) ^ (h2 >>> 13); }
  return `${b.length}:${h1 >>> 0}:${h2 >>> 0}`;
}

// ---------- PNG encoding ----------

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(parts: Uint8Array[]) {
  let c = 0xffffffff;
  for (const b of parts) for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
const be32 = (n: number) => new Uint8Array([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
function chunk(type: string, data: Uint8Array): Uint8Array[] {
  const t = new TextEncoder().encode(type);
  return [be32(data.length), t, data, be32(crc32([t, data]))];
}

/** A plain RGB PNG. CompressionStream("deflate") writes the zlib stream PNG expects. */
export async function encodePng(width: number, height: number, rgb: Uint8Array): Promise<Uint8Array> {
  const raw = new Uint8Array(height * (width * 3 + 1));
  for (let y = 0; y < height; y++) raw.set(rgb.subarray(y * width * 3, (y + 1) * width * 3), y * (width * 3 + 1) + 1);
  const z = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer());
  const ihdr = new Uint8Array(13);
  ihdr.set(be32(width), 0); ihdr.set(be32(height), 4); ihdr[8] = 8; ihdr[9] = 2;
  const parts = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ...chunk("IHDR", ihdr), ...chunk("IDAT", z), ...chunk("IEND", new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((n, x) => n + x.length, 0));
  let o = 0;
  for (const x of parts) { out.set(x, o); o += x.length; }
  return out;
}
