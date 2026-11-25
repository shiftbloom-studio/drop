import { describe, expect, it } from "vitest";
import { blockReason, effectiveType, inspectZip, sniff, stripJpegLocation, stripPngLocation } from "../src/safety";

const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const bytes = (...x: (number | string)[]) => Uint8Array.from(x.flatMap((v) => (typeof v === "string" ? [...v].map((c) => c.charCodeAt(0)) : [v])));
const ZIP_SRC = "UEsDBBQAAAAAAMuKeV2DFtyMAQAAAAEAAAAIAAAAc3JjL2EuanN4UEsDBBQAAAAAAMuKeV2DFtyMAQAAAAEAAAAGAAAAcnVuLnNoeFBLAwQUAAAAAADLinldgxbcjAEAAAABAAAACQAAAFJFQURNRS5tZHhQSwECFAMUAAAAAADLinldgxbcjAEAAAABAAAACAAAAAAAAAAAAAAAgAEAAAAAc3JjL2EuanNQSwECFAMUAAAAAADLinldgxbcjAEAAAABAAAABgAAAAAAAAAAAAAAgAEnAAAAcnVuLnNoUEsBAhQDFAAAAAAAy4p5XYMW3IwBAAAAAQAAAAkAAAAAAAAAAAAAAIABTAAAAFJFQURNRS5tZFBLBQYAAAAAAwADAKEAAAB0AAAAAAA=";
const ZIP_EXE = "UEsDBBQAAAAAAMuKeV2DFtyMAQAAAAEAAAARAAAAc2V0dXAvaW5zdGFsbC5leGV4UEsDBBQAAAAAAMuKeV2DFtyMAQAAAAEAAAAFAAAAYS50eHR4UEsBAhQDFAAAAAAAy4p5XYMW3IwBAAAAAQAAABEAAAAAAAAAAAAAAIABAAAAAHNldHVwL2luc3RhbGwuZXhlUEsBAhQDFAAAAAAAy4p5XYMW3IwBAAAAAQAAAAUAAAAAAAAAAAAAAIABMAAAAGEudHh0UEsFBgAAAAACAAIAcgAAAFQAAAAAAA==";
const ZIP_ENC = "UEsDBBQAAAAAAMuKeV2DFtyMAQAAAAEAAAAFAAAAYS50eHR4UEsBAhQDFAABAAAAy4p5XYMW3IwBAAAAAQAAAAUAAAAAAAAAAAAAAIABAAAAAGEudHh0UEsFBgAAAAABAAEAMwAAACQAAAAAAA==";
const JPEG = "/9j/4QBYRXhpZgAASUkqAAgAAAABACWIBAABAAAAGgAAAAAAAAACAAEAAgACAAAATgAAAAIABQADAAAAOAAAAAAAAAA1AAAAAQAAACEAAAABAAAA0gQAAGQAAAD/4QA5aHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wLwA8eDp4bXBtZXRhPkdQUzwveDp4bXBtZXRhPv/aAAIAAf/Z";

describe("sniff", () => {
  it("recognises programs regardless of name", () => {
    expect(sniff(bytes("MZ", 0x90, 0, 3, 0))).toBe("application/x-msdownload");
    expect(sniff(bytes(0x7f, "ELF", 2, 1))).toBe("application/x-elf");
    expect(sniff(bytes("#!/bin/sh\n"))).toBe("text/x-shellscript");
  });
  it("recognises common media and markup", () => {
    expect(sniff(bytes(0x89, "PNG", 13, 10, 26, 10))).toBe("image/png");
    expect(sniff(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniff(bytes(0, 0, 0, 0x18, "ftypisom", 0, 0))).toBe("video/mp4");
    expect(sniff(bytes("%PDF-1.7"))).toBe("application/pdf");
    expect(sniff(bytes('  <svg xmlns="http://www.w3.org/2000/svg">'))).toBe("image/svg+xml");
    expect(sniff(bytes("<!DOCTYPE html><html>"))).toBe("text/html");
  });
});

describe("blockReason", () => {
  it("blocks programs by content even when renamed", () => {
    expect(blockReason("cat.png", "application/x-msdownload")).toBe("program");
  });
  it("blocks by extension, including double extensions and macros", () => {
    expect(blockReason("invoice.pdf.exe", null)).toBe("program");
    expect(blockReason("setup.MSI", null)).toBe("program");
    expect(blockReason("budget.xlsm", null)).toBe("macro");
  });
  it("lets ordinary files through", () => {
    expect(blockReason("cat.png", "image/png")).toBeNull();
    expect(blockReason("notes.txt", null)).toBeNull();
    expect(blockReason("report.docx", "application/zip")).toBeNull();
  });
});

describe("effectiveType", () => {
  it("trusts the bytes over the client", () => {
    expect(effectiveType("image/png", "text/html", bytes("<html>"))).toBe("text/html");
  });
  it("keeps plain text as text and everything unknown as a download", () => {
    expect(effectiveType("text/markdown", null, bytes("# hello\n"))).toBe("text/plain");
    expect(effectiveType("application/x-foo", null, bytes(0, 1, 2, 3))).toBe("application/octet-stream");
  });
});

describe("location data", () => {
  it("zeroes GPS in a JPEG and drops XMP without touching the rest", () => {
    const src = b64(JPEG);
    const { bytes: out, changed } = stripJpegLocation(src);
    expect(changed).toBe(true);
    const text = new TextDecoder("latin1").decode(out);
    expect(text).not.toContain("ns.adobe.com/xap");
    expect(text).toContain("Exif");
    // latitude rationals 53/1 33/1 are gone
    const dv = new DataView(out.buffer);
    let found = false;
    for (let i = 0; i + 8 <= out.length; i++) if (dv.getUint32(i, true) === 53 && dv.getUint32(i + 4, true) === 1) found = true;
    expect(found).toBe(false);
    expect(out[0]).toBe(0xff);
    expect(out.at(-1)).toBe(0xd9);
  });
  it("drops eXIf from a PNG", () => {
    const chunk = (type: string, data: number[]) => bytes(0, 0, 0, data.length, type, ...data, 0, 0, 0, 0);
    const png = new Uint8Array([...bytes(0x89, "PNG", 13, 10, 26, 10), ...chunk("IHDR", [1, 2]), ...chunk("eXIf", [9, 9, 9]), ...chunk("IEND", [])]);
    const { bytes: out, changed } = stripPngLocation(png);
    expect(changed).toBe(true);
    expect(new TextDecoder("latin1").decode(out)).not.toContain("eXIf");
    expect(new TextDecoder("latin1").decode(out)).toContain("IEND");
  });
  it("leaves files without location data alone", () => {
    const plain = bytes(0xff, 0xd8, 0xff, 0xda, 0, 2, 0xff, 0xd9);
    expect(stripJpegLocation(plain).changed).toBe(false);
  });
});

describe("inspectZip", () => {
  it("allows source trees", () => {
    const z = b64(ZIP_SRC);
    expect(inspectZip(z, 0)).toMatchObject({ programs: [], encrypted: false });
  });
  it("finds programs inside", () => {
    expect(inspectZip(b64(ZIP_EXE), 0)?.programs).toEqual(["setup/install.exe"]);
  });
  it("notices encryption", () => {
    expect(inspectZip(b64(ZIP_ENC), 0)?.encrypted).toBe(true);
  });
  it("works from a tail slice", () => {
    const z = b64(ZIP_EXE);
    expect(inspectZip(z.subarray(10), 10)?.programs).toEqual(["setup/install.exe"]);
  });
});
