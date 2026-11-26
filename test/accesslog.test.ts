import { afterEach, describe, expect, it, vi } from "vitest";
import { accessLog, logPath } from "../src/accesslog";

describe("logPath", () => {
  it("keeps fixed pages", () => {
    for (const p of ["/", "/privacy", "/api/upload", "/api/list", "/assets/app.css", "/favicon.svg", "/request"]) expect(logPath(p)).toBe(p);
  });
  it("masks ids, deletion and claim codes", () => {
    expect(logPath("/aB3xYz")).toBe("/:id");
    expect(logPath("/aB3xYz.png")).toBe("/:id");
    expect(logPath("/aB3xYz/raw")).toBe("/:id/raw");
    expect(logPath("/aB3xYz/thumb.webp")).toBe("/:id/thumb");
    expect(logPath("/d/aB3xYz/s3cr3tDeleteToken")).toBe("/d/:id/:code");
    expect(logPath("/request/claimcode123")).toBe("/request/:code");
    expect(logPath("/api/items/aB3xYz")).toBe("/api/items/:id");
    expect(logPath("/api/whatever/x")).toBe("/api/:other");
  });
});

describe("accessLog", () => {
  afterEach(() => vi.restoreAllMocks());
  it("drops the query string and secret headers", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const req = new Request("https://drop.example/d/abc/secret?filename=private.pdf", {
      headers: { authorization: "Bearer tok", cookie: "a=b", "x-api-key": "k", "mandate-pop": "m", referer: "https://drop.example/abc", "user-agent": "UA", "cf-connecting-ip": "203.0.113.1" },
    });
    accessLog(req, 200, 5);
    const line = JSON.stringify(log.mock.calls[0][0]);
    for (const secret of ["secret", "private.pdf", "tok", "a=b", "\"k\"", "mandate", "referer", "/abc"]) expect(line).not.toContain(secret);
    expect(line).toContain("/d/:id/:code");
    expect(line).toContain("203.0.113.1");
    expect(line).toContain("UA");
  });
});
