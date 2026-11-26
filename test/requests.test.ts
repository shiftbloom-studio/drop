import { describe, expect, it } from "vitest";
import { CLAIM_WINDOW, isClaimCode, newApiToken, newClaimCode, readRequestForm, requestState, verifyTurnstile } from "../src/requests";
import { isNamedToken, robotsTxt, sha256Hex } from "../src/util";
import { requestPage, requestSentPage, requestStatusPage, tokenShownPage } from "../src/html";
import { inlineScripts } from "./inline-scripts";

const form = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };

describe("readRequestForm", () => {
  it("accepts a name and a reason, normalising whitespace", () => {
    expect(readRequestForm(form({ name: "  Ada   Lovelace ", reason: "Screenshots for\n our team chat" }))).toEqual({ name: "Ada Lovelace", reason: "Screenshots for our team chat" });
  });
  it("refuses short, long and honeypot submissions", () => {
    expect(readRequestForm(form({ name: "A", reason: "Screenshots for the team" }))).toHaveProperty("error");
    expect(readRequestForm(form({ name: "Ada", reason: "pls" }))).toHaveProperty("error");
    expect(readRequestForm(form({ name: "Ada", reason: "x".repeat(601) }))).toHaveProperty("error");
    expect(readRequestForm(form({ name: "Ada", reason: "Screenshots for the team", website: "spam" }))).toHaveProperty("error");
  });
});

describe("tokens and claim codes", () => {
  it("issues tokens drop accepts as named tokens", async () => {
    const t = await newApiToken();
    expect(isNamedToken(t.secret)).toBe(true);
    expect(t.secret).toHaveLength(45);
    expect(t.id).toMatch(/^[0-9a-f]{16}$/);
    expect(t.prefix).toBe(t.secret.slice(0, 12));
    expect(t.hash).toBe(await sha256Hex(t.secret));
  });
  it("makes 32-character claim codes and rejects anything else", () => {
    const c = newClaimCode();
    expect(isClaimCode(c)).toBe(true);
    expect(newClaimCode()).not.toBe(c);
    expect(isClaimCode("short")).toBe(false);
    expect(isClaimCode(c + "x")).toBe(false);
    expect(isClaimCode("../" + c.slice(3))).toBe(false);
  });
});

describe("requestState", () => {
  const now = 2_000_000_000;
  it("passes the stored status through", () => {
    expect(requestState({ status: "pending", decided_at: null }, now)).toBe("pending");
    expect(requestState({ status: "rejected", decided_at: now - 10 }, now)).toBe("rejected");
    expect(requestState({ status: "claimed", decided_at: now - 10 }, now)).toBe("claimed");
  });
  it("lets an approval lapse after the claim window", () => {
    expect(requestState({ status: "approved", decided_at: now - 60 }, now)).toBe("approved");
    expect(requestState({ status: "approved", decided_at: now - CLAIM_WINDOW - 1 }, now)).toBe("lapsed");
  });
});

describe("verifyTurnstile", () => {
  const fake = (out: unknown, seen: FormData[] = []) => (async (_u: unknown, init?: RequestInit) => { seen.push(init!.body as FormData); return new Response(JSON.stringify(out)); }) as typeof fetch;
  it("sends secret, response and IP, and trusts only success", async () => {
    const seen: FormData[] = [];
    expect(await verifyTurnstile("s3cret", "tok", "203.0.113.7", fake({ success: true, action: "token-request" }, seen))).toBe(true);
    expect(seen[0].get("secret")).toBe("s3cret");
    expect(seen[0].get("response")).toBe("tok");
    expect(seen[0].get("remoteip")).toBe("203.0.113.7");
    expect(await verifyTurnstile("s", "tok", null, fake({ success: false }))).toBe(false);
    expect(await verifyTurnstile("s", "tok", null, fake({ success: true, action: "login" }))).toBe(false);
    expect(await verifyTurnstile("s", "", null, fake({ success: true }))).toBe(false);
    expect(await verifyTurnstile("s", "tok", null, (async () => { throw new Error("offline"); }) as typeof fetch)).toBe(false);
  });
});

describe("request pages", () => {
  it("render the Turnstile widget and escape what people typed", () => {
    const h = requestPage("0x4AAA-site", { error: "Nope", name: "<b>Ada</b>", reason: "</textarea><script>x</script>" });
    expect(h).toContain('data-sitekey="0x4AAA-site"');
    expect(h).toContain("challenges.cloudflare.com/turnstile/v0/api.js");
    expect(h).toContain("&lt;b&gt;Ada&lt;/b&gt;");
    expect(h).not.toContain("</textarea><script>x");
    expect(h).toContain('name="website"');
  });
  it("show the claim link and the token once, with scripts that parse", () => {
    for (const h of [requestSentPage("https://drop.example/request/abc"), tokenShownPage("drop_secret", 2_000_000_000), tokenShownPage("drop_secret", null)]) {
      for (const code of inlineScripts(h)) expect(() => new Function(code)).not.toThrow();
    }
    expect(requestSentPage("https://drop.example/request/abc")).toContain("https://drop.example/request/abc");
    expect(tokenShownPage("drop_secret", null)).toContain("drop_secret");
    expect(requestStatusPage("approved")).toContain('<form method="post">');
    for (const s of ["pending", "rejected", "claimed", "lapsed"] as const) expect(requestStatusPage(s)).not.toContain("<form");
  });
});

describe("robotsTxt", () => {
  const txt = robotsTxt("https://drop.example");
  it("allows search but not AI training", () => {
    expect(txt).toContain("Content-Signal: search=yes, ai-input=yes, ai-train=no");
    expect(txt).toMatch(/User-agent: GPTBot\n[\s\S]*User-agent: Diffbot\nDisallow: \/\n/);
    expect(txt).toContain("Disallow: /request/");
    expect(txt).toContain("Sitemap: https://drop.example/sitemap.xml");
  });
});
