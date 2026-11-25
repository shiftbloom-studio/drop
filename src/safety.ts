/** File safety checks that need no bindings: type sniffing, the executable denylist, GPS removal
 * and archive inspection. Unit-tested in test/safety.test.ts. */

/** What the first bytes of a file say it is. `null` when nothing matched. */
export function sniff(b: Uint8Array): string | null {
  const at = (off: number, ...bytes: number[]) => bytes.every((x, i) => b[off + i] === x);
  const ascii = (off: number, s: string) => [...s].every((c, i) => b[off + i] === c.charCodeAt(0));
  if (b.length < 4) return null;
  // programs
  if (at(0, 0x4d, 0x5a)) return "application/x-msdownload"; // MZ: exe, dll, scr, sys
  if (at(0, 0x7f, 0x45, 0x4c, 0x46)) return "application/x-elf";
  if (at(0, 0xfe, 0xed, 0xfa, 0xce) || at(0, 0xfe, 0xed, 0xfa, 0xcf) || at(0, 0xce, 0xfa, 0xed, 0xfe) || at(0, 0xcf, 0xfa, 0xed, 0xfe))
    return "application/x-mach-binary";
  if (at(0, 0xca, 0xfe, 0xba, 0xbe)) return "application/x-mach-binary"; // fat binary (also Java class files)
  if (at(0, 0x00, 0x61, 0x73, 0x6d)) return "application/wasm";
  if (ascii(0, "dex\n")) return "application/x-dex";
  if (at(0, 0x4c, 0x00, 0x00, 0x00, 0x01, 0x14, 0x02, 0x00)) return "application/x-ms-shortcut";
  if (ascii(0, "#!")) return "text/x-shellscript";
  if (at(0, 0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1)) return "application/x-ole-storage"; // msi, doc, xls, ppt
  // images
  if (at(0, 0x89, 0x50, 0x4e, 0x47)) return "image/png";
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (ascii(0, "GIF8")) return "image/gif";
  if (ascii(0, "RIFF") && ascii(8, "WEBP")) return "image/webp";
  if (ascii(0, "BM") && b.length > 14) return "image/bmp";
  if (at(0, 0x49, 0x49, 0x2a, 0x00) || at(0, 0x4d, 0x4d, 0x00, 0x2a)) return "image/tiff";
  if (at(0, 0x00, 0x00, 0x01, 0x00)) return "image/x-icon";
  // ISO base media: avif, heic, mp4, mov, m4a
  if (ascii(4, "ftyp")) {
    const brand = String.fromCharCode(...b.slice(8, 12));
    if (/^avi[fs]$/.test(brand)) return "image/avif";
    if (/^(heic|heix|mif1|msf1|heim|heis)$/.test(brand)) return "image/heic";
    if (brand === "qt  ") return "video/quicktime";
    if (/^M4A /.test(brand)) return "audio/mp4";
    return "video/mp4";
  }
  if (at(0, 0x1a, 0x45, 0xdf, 0xa3)) return "video/webm"; // also mkv
  if (ascii(0, "OggS")) return "audio/ogg";
  if (ascii(0, "RIFF") && ascii(8, "WAVE")) return "audio/wav";
  if (ascii(0, "RIFF") && ascii(8, "AVI ")) return "video/x-msvideo";
  if (ascii(0, "fLaC")) return "audio/flac";
  if (ascii(0, "ID3") || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return "audio/mpeg";
  // documents and archives
  if (ascii(0, "%PDF-")) return "application/pdf";
  if (at(0, 0x50, 0x4b, 0x03, 0x04) || at(0, 0x50, 0x4b, 0x05, 0x06)) return "application/zip";
  if (at(0, 0x1f, 0x8b)) return "application/gzip";
  if (ascii(0, "7z") && at(2, 0xbc, 0xaf, 0x27, 0x1c)) return "application/x-7z-compressed";
  if (ascii(0, "Rar!")) return "application/vnd.rar";
  if (b.length > 262 && ascii(257, "ustar")) return "application/x-tar";
  if (ascii(0, "{\\rtf")) return "application/rtf";
  // markup that a browser would run
  const head = new TextDecoder().decode(b.subarray(0, 512)).trimStart().toLowerCase();
  if (/^(<\?xml|<svg)/.test(head) && head.includes("<svg")) return "image/svg+xml";
  if (/^(<!doctype html|<html|<head|<body|<script|<iframe)/.test(head)) return "text/html";
  if (head.startsWith("<?xml")) return "application/xml";
  return null;
}

/** Extensions drop refuses outright: programs, installers, scripts and documents with macros. */
export const BLOCKED_EXT = new Set([
  "exe", "dll", "scr", "com", "pif", "cpl", "sys", "drv", "ocx", "msi", "msp", "mst", "msix", "msixbundle", "appx", "appxbundle",
  "bat", "cmd", "ps1", "psm1", "psd1", "vbs", "vbe", "js", "jse", "mjs", "wsf", "wsh", "wsc", "hta", "sct", "lnk", "url", "scf", "inf", "reg",
  "jar", "class", "apk", "aab", "xapk", "dex", "ipa", "app", "dmg", "pkg", "mpkg", "deb", "rpm", "run", "bin", "sh", "bash", "zsh", "command",
  "iso", "img", "vhd", "vhdx", "elf", "so", "dylib", "gadget", "application", "xll", "xlam", "ppam", "docm", "dotm", "xlsm", "xltm", "xlsb",
  "pptm", "potm", "ppsm", "sldm", "one", "chm", "ade", "adp", "mde", "accde", "library-ms", "settingcontent-ms", "website",
]);
const BLOCKED_SNIFF = new Set([
  "application/x-msdownload", "application/x-elf", "application/x-mach-binary", "application/wasm", "application/x-dex",
  "application/x-ms-shortcut", "text/x-shellscript",
]);

export const extOfName = (n: string) => (/\.([A-Za-z0-9-]{1,20})$/.exec(n)?.[1] || "").toLowerCase();

/** A reason to refuse the file, or null. OLE files (msi, old Office) are only refused by extension. */
export function blockReason(name: string, sniffed: string | null): string | null {
  const ext = extOfName(name);
  if (sniffed && BLOCKED_SNIFF.has(sniffed)) return "program";
  if (BLOCKED_EXT.has(ext)) return ["docm", "dotm", "xlsm", "xltm", "xlsb", "pptm", "potm", "ppsm", "sldm", "xlam", "ppam", "xll"].includes(ext) ? "macro" : "program";
  // double extensions like invoice.pdf.exe are caught above; also catch "invoice.pdf .exe" padding tricks
  if (/\.(exe|scr|bat|cmd|com|js|vbs|hta|lnk)\s*$/i.test(name.trim())) return "program";
  return null;
}

/** Types a browser may show inline on our origin. Everything else is served as a download. */
export const INLINE_TYPES = new Set([
  "image/png", "image/jpeg", "image/gif", "image/webp", "image/avif", "image/bmp", "image/x-icon",
  "video/mp4", "video/webm", "video/quicktime", "audio/mpeg", "audio/ogg", "audio/wav", "audio/flac", "audio/mp4",
  "application/pdf", "text/plain",
]);

/**
 * The type drop stores and serves. The sniffed type wins over what the client claims. A text file that
 * the client calls text/* becomes text/plain; anything unknown becomes application/octet-stream.
 */
export function effectiveType(declared: string, sniffed: string | null, firstBytes: Uint8Array): string {
  if (sniffed) return sniffed;
  const d = (declared || "").toLowerCase().split(";")[0].trim();
  if (looksLikeText(firstBytes) && (d.startsWith("text/") || d === "application/json" || d === "" || d === "application/octet-stream"))
    return "text/plain";
  return "application/octet-stream";
}

function looksLikeText(b: Uint8Array) {
  if (b.length === 0) return false;
  for (const x of b.subarray(0, 1024)) if (x === 0 || (x < 9) || (x > 13 && x < 32 && x !== 27)) return false;
  return true;
}

// ---------- location data ----------

const TIFF_TYPE_SIZE = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8];

/**
 * Removes location data from a JPEG without re-encoding: the GPS block of the EXIF data is zeroed
 * in place (offsets stay valid, orientation and colour profile survive) and XMP packets, which can
 * repeat the location, are dropped. Returns the input when there is nothing to do or it can't parse.
 */
export function stripJpegLocation(src: Uint8Array): { bytes: Uint8Array; changed: boolean } {
  try {
    if (src[0] !== 0xff || src[1] !== 0xd8) return { bytes: src, changed: false };
    const out = new Uint8Array(src); // copy, edited in place
    const drop: [number, number][] = [];
    let changed = false;
    let p = 2;
    while (p + 4 <= out.length && out[p] === 0xff) {
      const marker = out[p + 1];
      if (marker === 0xda || marker === 0xd9) break; // start of scan / end
      if (marker === 0xff) { p++; continue; }
      const len = (out[p + 2] << 8) | out[p + 3];
      const seg = p + 4, end = p + 2 + len;
      if (end > out.length) break;
      if (marker === 0xe1) {
        const id = new TextDecoder().decode(out.subarray(seg, Math.min(seg + 29, end)));
        if (id.startsWith("Exif\0")) changed = zeroGps(out, seg + 6, end) || changed;
        else if (id.startsWith("http://ns.adobe.com/xap/1.0/")) drop.push([p, end]);
      }
      p = end;
    }
    if (!drop.length) return { bytes: out, changed };
    const parts: Uint8Array[] = [];
    let last = 0;
    for (const [a, z] of drop) { parts.push(out.subarray(last, a)); last = z; }
    parts.push(out.subarray(last));
    const total = parts.reduce((n, x) => n + x.length, 0);
    const res = new Uint8Array(total);
    let o = 0;
    for (const x of parts) { res.set(x, o); o += x.length; }
    return { bytes: res, changed: true };
  } catch {
    return { bytes: src, changed: false };
  }
}

function zeroGps(b: Uint8Array, tiff: number, end: number): boolean {
  const le = b[tiff] === 0x49;
  const u16 = (o: number) => (le ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1]);
  const u32 = (o: number) => (le ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + b[o + 3] * 2 ** 24 : b[o] * 2 ** 24 + ((b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]));
  const inside = (o: number, n: number) => o >= tiff && o + n <= end;
  const ifd0 = tiff + u32(tiff + 4);
  if (!inside(ifd0, 2)) return false;
  const n = u16(ifd0);
  for (let i = 0; i < n; i++) {
    const e = ifd0 + 2 + i * 12;
    if (!inside(e, 12)) return false;
    if (u16(e) !== 0x8825) continue;
    const gps = tiff + u32(e + 8);
    if (!inside(gps, 2)) return false;
    const m = u16(gps);
    if (!inside(gps, 2 + m * 12)) return false;
    for (let j = 0; j < m; j++) {
      const g = gps + 2 + j * 12;
      const size = (TIFF_TYPE_SIZE[u16(g + 2)] || 1) * u32(g + 4);
      if (size > 4) {
        const v = tiff + u32(g + 8);
        if (inside(v, size)) b.fill(0, v, v + size);
      }
    }
    b.fill(0, gps + 2, gps + 2 + m * 12); // entries
    b[gps] = 0; b[gps + 1] = 0; // empty GPS IFD
    return true;
  }
  return false;
}

/** Drops the eXIf chunk and XMP text chunks from a PNG (location can live in either). */
export function stripPngLocation(src: Uint8Array): { bytes: Uint8Array; changed: boolean } {
  try {
    if (src[0] !== 0x89 || src[1] !== 0x50) return { bytes: src, changed: false };
    const keep: Uint8Array[] = [src.subarray(0, 8)];
    let p = 8, changed = false;
    while (p + 12 <= src.length) {
      const len = ((src[p] << 24) >>> 0) + ((src[p + 1] << 16) | (src[p + 2] << 8) | src[p + 3]);
      const type = String.fromCharCode(...src.subarray(p + 4, p + 8));
      const end = p + 12 + len;
      if (end > src.length) return { bytes: src, changed: false };
      const xmp = type === "iTXt" && new TextDecoder().decode(src.subarray(p + 8, p + 8 + Math.min(len, 17))).startsWith("XML:com.adobe.xmp");
      if (type === "eXIf" || xmp) changed = true;
      else keep.push(src.subarray(p, end));
      p = end;
      if (type === "IEND") break;
    }
    if (!changed) return { bytes: src, changed: false };
    const res = new Uint8Array(keep.reduce((n, x) => n + x.length, 0));
    let o = 0;
    for (const x of keep) { res.set(x, o); o += x.length; }
    return { bytes: res, changed: true };
  } catch {
    return { bytes: src, changed: false };
  }
}

// ---------- archives ----------

/** Inside archives only real programs count: source trees full of .js or .sh files are fine. */
const ZIP_BLOCKED_EXT = new Set([
  "exe", "dll", "scr", "com", "pif", "cpl", "msi", "msp", "msix", "appx", "bat", "cmd", "ps1", "vbs", "vbe", "jse", "wsf", "wsh", "hta",
  "lnk", "url", "scf", "reg", "jar", "apk", "iso", "img", "vhd", "vhdx", "docm", "dotm", "xlsm", "xltm", "xlam", "pptm", "ppsm", "one", "chm", "xll",
]);

/**
 * Reads the central directory of a ZIP from its tail and reports what is inside: programs by name,
 * nested archives, and whether any entry is encrypted. `tail` must hold the end of the file;
 * `tailStart` is its offset in the file. Returns null when the directory isn't inside `tail`.
 */
export function inspectZip(tail: Uint8Array, tailStart: number): { names: string[]; programs: string[]; encrypted: boolean } | null {
  const dv = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  let eocd = -1;
  for (let i = tail.length - 22; i >= Math.max(0, tail.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return null;
  const count = dv.getUint16(eocd + 10, true);
  const cdOffset = dv.getUint32(eocd + 16, true);
  if (cdOffset === 0xffffffff) return null; // zip64
  let p = cdOffset - tailStart;
  if (p < 0) return null;
  const names: string[] = [], programs: string[] = [];
  let encrypted = false;
  for (let i = 0; i < count && p + 46 <= tail.length; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const flags = dv.getUint16(p + 8, true);
    const nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), commentLen = dv.getUint16(p + 32, true);
    const name = new TextDecoder().decode(tail.subarray(p + 46, p + 46 + nameLen));
    names.push(name);
    if (flags & 1) encrypted = true;
    const base = (name.split("/").pop() || "").toLowerCase();
    if (ZIP_BLOCKED_EXT.has(extOfName(base)) || base === "vbaproject.bin") programs.push(name);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return { names, programs, encrypted };
}
