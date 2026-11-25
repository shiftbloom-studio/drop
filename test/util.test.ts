import { describe, expect, it } from "vitest";
import { extOf, isAuthed, parseExpiry, randomString, sanitizeName, timingSafeEqual, ID_ALPHABET } from "../src/util";

const now = () => Math.floor(Date.now() / 1000);

describe("parseExpiry", () => {
  it("treats empty and never as no expiry", () => {
    expect(parseExpiry(undefined)).toBeNull();
    expect(parseExpiry("never")).toBeNull();
    expect(parseExpiry("0")).toBeNull();
  });
  it("understands presets and custom durations", () => {
    expect(parseExpiry("1h")! - now()).toBeGreaterThanOrEqual(3599);
    expect(parseExpiry("7d")! - now()).toBeGreaterThanOrEqual(7 * 86400 - 1);
    expect(parseExpiry("12h")! - now()).toBeGreaterThanOrEqual(12 * 3600 - 1);
    expect(parseExpiry("2w")! - now()).toBeGreaterThanOrEqual(14 * 86400 - 1);
  });
  it("rejects garbage", () => {
    expect(parseExpiry("soon")).toBeUndefined();
    expect(parseExpiry("-1h")).toBeUndefined();
  });
});

describe("names", () => {
  it("extracts lowercase extensions", () => {
    expect(extOf("Shot.PNG")).toBe("png");
    expect(extOf("archive.tar.gz")).toBe("gz");
    expect(extOf("README")).toBe("");
    expect(extOf(null)).toBe("");
  });
  it("sanitizes path separators, quotes and control chars", () => {
    expect(sanitizeName('../../etc/"passwd"\n')).toBe('.._.._etc__passwd__');
    expect(sanitizeName("")).toBe("file");
    expect(sanitizeName("a".repeat(300))).toHaveLength(200);
  });
});

describe("ids and auth", () => {
  it("generates ids from the unambiguous alphabet", () => {
    const id = randomString(32);
    expect(id).toHaveLength(32);
    for (const c of id) expect(ID_ALPHABET).toContain(c);
  });
  it("compares tokens in constant time", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
  });
  it("accepts bearer, x-api-key and query tokens", () => {
    const mk = (h: Record<string, string> = {}, q = "") => new Request(`https://drop.test/api/list${q}`, { headers: h });
    expect(isAuthed(mk({ authorization: "Bearer s3cret" }), "s3cret")).toBe(true);
    expect(isAuthed(mk({ "x-api-key": "s3cret" }), "s3cret")).toBe(true);
    expect(isAuthed(mk({}, "?token=s3cret"), "s3cret")).toBe(true);
    expect(isAuthed(mk({ authorization: "Bearer nope" }), "s3cret")).toBe(false);
    expect(isAuthed(mk(), "s3cret")).toBe(false);
    expect(isAuthed(mk({ authorization: "Bearer " }), undefined)).toBe(false);
  });
});
