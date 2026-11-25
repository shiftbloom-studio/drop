import { describe, expect, it } from "vitest";
import { encodePng, gifFrames, gifInfo, imageEnd } from "../src/frames";
import { publicNameMatches, publicTypeAllowed } from "../src/public";

const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const cat = (...p: Uint8Array[]) => { const o = new Uint8Array(p.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of p) { o.set(x, i); i += x.length; } return o; };
const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5, 6, 7, 8]);

const GIF = b64("R0lGODlhKAAeAIEAAP////8AAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQABQAAACwAAAAAKAAeAAAIVgADCBxIsKDBgwgTKlzIsKHDhxAjSpyoEIDFixgpVsTIUWNCjh09HgSZUaRBkhdNnkQJQGVBli1dDoQpcybLmgJp4tzJs6fPn0CDCh1KtKjRo0iTKg0IACH5BAEFAAIALAAABQAPAAoAgf////8AAAAAAAAAAAgyAAMIFCigYEEACBEOJGhQQEKFCxs6fLgwgMSHACpepBixIUaNHjkO3JgQpMGPHU8+DAgAIfkEAQUAAgAsAAAAACgAHgCB////AID/AAAAAAAACGAAAwgcSLCgwYMIEypcyLChw4cQI0qcSFGARYsAMmakqPAiRo0AOCb0KABkSJEHSZpEmdLjSpYFVYKEGdPlTJoDZWrEmdPmTp4BdG4ESrSo0aNIkypdyrSp06dQo0pNGhAAIfkEAQUAAgAsAAAAACgAHgCB////CsgeAAAAAAAACGAAAwgcSLCgwYMIEypcyLChw4cQI0qcSLGggIsXAWjUWDEhxowbAXRE+FFASJEjDZY8mVLlR5YtCa4MGVPmS5o1Bc7cmFPnTZ49d3LsSbSo0aNIkypdyrSp06dQo0olGhAAOw==");
const JPEG = b64("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAIAAgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDwGiiimI//2Q==");
const PJPEG = b64("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wgARCAAIAAgDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAVAQEBAAAAAAAAAAAAAAAAAAAAAf/aAAwDAQACEAMQAAABgAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAn//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/AX//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/AX//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/An//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IX//2gAMAwEAAgADAAAAEA//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EH//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EH//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EH//2Q==");
const WEBP = b64("UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoIAAgAAUAmJaQAA3AA/v0gUAA=");
const BMP = b64("Qk32AAAAAAAAADYAAAAoAAAACAAAAAgAAAABABgAAAAAAMAAAADEDgAAxA4AAAAAAAAAAAAAAwIBAwIBAwIBAwIBAwIBAwIBAwIBAwIBAwIBAwIBAwIBAwIBAwIBAwIBAwIBAwIBAwIBAwIBAwIBAwIBAwIBAwIBAwIBAwIBAwIBAwIBAwIBAwIBAwIBAwIBAwIBAwIBAwIBAwIBAwIBAwIBAwIBAwIBAwIBAwIBAwIBAwIBAwIBAwIBAwIBAwIBAwIBAwIBAwIBAwIBAwIBAwIBAwIBAwIBAwIBAwIBAwIBAwIBAwIBAwIBAwIBAwIBAwIBAwIB");
const PNG = b64("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFElEQVR4nGNkZGJmwAaYsIoOWgkAC6oAFkhUOOcAAAAASUVORK5CYII=");
const AVIF = b64("AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADrbWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAAAAAAAOcGl0bQAAAAAAAQAAAB5pbG9jAAAAAEQAAAEAAQAAAAEAAAETAAAAIwAAAChpaW5mAAAAAAABAAAAGmluZmUCAAAAAAEAAGF2MDFDb2xvcgAAAABqaXBycAAAAEtpcGNvAAAAFGlzcGUAAAAAAAAACAAAAAgAAAAQcGl4aQAAAAADCAgIAAAADGF2MUOBAAwAAAAAE2NvbHJuY2x4AAEADQAGgAAAABdpcG1hAAAAAAAAAAEAAQQBAoMEAAAAK21kYXQSAAoIGAi/aICGg0IyFRTHh4ZlAgggnlAAAABIWtlc1jAVQw==");

const FILES: [string, Uint8Array][] = [
  ["image/gif", GIF], ["image/jpeg", JPEG], ["image/jpeg", PJPEG], ["image/webp", WEBP], ["image/bmp", BMP], ["image/png", PNG], ["image/avif", AVIF],
];

describe("imageEnd", () => {
  it("finds the real end of every public image type", () => {
    for (const [mime, b] of FILES) expect(imageEnd(mime, b), mime).toBe(b.length);
  });
  it("points before anything appended", () => {
    for (const [mime, b] of FILES) expect(imageEnd(mime, cat(b, ZIP)), mime).toBe(b.length);
  });
  it("refuses files that don't parse as their type", () => {
    for (const [mime, b] of FILES) expect(imageEnd(mime, b.subarray(0, Math.floor(b.length / 2))), mime).toBeNull();
    expect(imageEnd("image/png", ZIP)).toBeNull();
  });
});

describe("gif", () => {
  it("counts frames without decoding", () => {
    expect(gifInfo(GIF)).toEqual({ width: 40, height: 30, frames: 4, end: GIF.length });
  });
  it("decodes every frame as shown", () => {
    const frames = [...gifFrames(GIF)];
    expect(frames).toHaveLength(4);
    const px = (i: number, x: number, y: number) => [...frames[i].rgb.subarray((y * 40 + x) * 3, (y * 40 + x) * 3 + 3)];
    expect(px(0, 0, 0)).toEqual([255, 0, 0]);
    expect(px(0, 2, 8)).toEqual([255, 255, 255]);
    expect(px(1, 2, 8)).toEqual([255, 0, 0]);
    expect(px(1, 7, 8)).toEqual([255, 255, 255]);
    expect(px(3, 39, 29)).toEqual([10, 200, 30]);
  });
  it("scales large frames down", () => {
    const [f] = gifFrames(GIF, 20);
    expect([f.width, f.height]).toEqual([20, 15]);
  });
});

describe("encodePng", () => {
  it("writes a PNG that ends where it should", async () => {
    const png = await encodePng(2, 1, new Uint8Array([255, 0, 0, 0, 0, 255]));
    expect([...png.subarray(1, 4)]).toEqual([0x50, 0x4e, 0x47]);
    expect(imageEnd("image/png", png)).toBe(png.length);
  });
});

describe("public types", () => {
  it("takes only what drop can check", () => {
    for (const t of ["image/png", "image/gif", "text/plain; charset=utf-8"]) expect(publicTypeAllowed(t), t).toBe(true);
    for (const t of ["video/mp4", "audio/mpeg", "application/pdf", "image/x-icon", "application/zip", "image/svg+xml"]) expect(publicTypeAllowed(t), t).toBe(false);
  });
  it("wants a name that fits the bytes", () => {
    expect(publicNameMatches("cat.JPG", "image/jpeg")).toBe(true);
    expect(publicNameMatches("cat.png", "image/jpeg")).toBe(false);
    expect(publicNameMatches("cat", "image/png")).toBe(false);
    expect(publicNameMatches("notes", "text/plain")).toBe(true);
    expect(publicNameMatches("notes.md", "text/plain")).toBe(true);
    expect(publicNameMatches("payload.zip", "text/plain")).toBe(false);
  });
});
