import { describe, expect, it } from "vitest";
import { bloom, deletePage, faviconSvg, landingPage, legalPage, notFoundPage, viewPage } from "../src/html";
import type { Item } from "../src/index";

const item = (over: Partial<Item> = {}): Item => ({
  id: "aB3dE", kind: "file", r2_key: "f/aB3dE/x.png", name: "x.png", mime: "image/png", size: 2048, target: null, lang: null,
  created_at: 1_790_000_000, expires_at: null, delete_token: "t", thumb_key: null, alt: null, nsfw: null, views: 0, ...over,
});
const links = { url: "https://drop.test/aB3dE", raw: "https://drop.test/aB3dE/raw.png", thumbnail: null };

describe("bloom mark", () => {
  it("draws the shiftbloom.studio bloom: 34 petals and a seed", () => {
    const svg = bloom({ size: 64, id: "t" });
    expect(svg.match(/<path /g)).toHaveLength(10 + 10 + 8 + 6);
    expect(svg).toContain('viewBox="0 0 200 200"');
    expect(svg).toContain('<circle cx="100" cy="100" r="7" fill="#FF2E52"/>');
    expect(svg.match(/<linearGradient/g)).toHaveLength(4);
  });
  it("uses the solid variant for the favicon", () => {
    const fav = faviconSvg();
    expect(fav.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(fav).not.toContain("linearGradient");
  });
});

describe("pages", () => {
  it("escapes user-controlled names", () => {
    const html = viewPage(item({ name: '<img src=x onerror=alert(1)>.png' }), links, null);
    expect(html).not.toContain("<img src=x onerror");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;.png");
  });
  it("escapes paste content", () => {
    const html = viewPage(item({ kind: "paste", mime: "text/plain", lang: "html" }), links, "</script><script>alert(1)</script>");
    expect(html).not.toContain("</script><script>alert(1)");
  });
  it("hides og:image for flagged images", () => {
    expect(viewPage(item(), links, null)).toContain("og:image");
    expect(viewPage(item({ nsfw: 1 }), links, null)).not.toContain("og:image");
  });
  it("renders landing and 404", () => {
    expect(landingPage("drop.test")).toContain("drop.test");
    expect(notFoundPage()).toContain("404");
  });
  it("shows the upload limit and keeps the tool behind the token gate", () => {
    const html = landingPage("drop.test", { multiMb: 95, maxMb: 500 });
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("up to 500 mb");
    expect(html).toContain("html:not(.authed) .member{display:none");
    expect(html).not.toContain('name="robots"');
  });
  it("ships inline scripts that parse", () => {
    const pages = [landingPage("drop.test"), viewPage(item(), links, null), viewPage(item({ kind: "paste", mime: "text/plain" }), links, "x")];
    for (const html of pages)
      for (const [, code] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) expect(() => new Function(code)).not.toThrow();
  });
  it("renders view dates as <time> for local conversion and stays noindex", () => {
    const html = viewPage(item({ expires_at: 1_790_003_600 }), links, null);
    expect(html).toContain('<time datetime="');
    expect(html).toContain('name="robots" content="noindex"');
  });
  it("renders legal pages in both languages from config only", () => {
    const l = { name: "Ada <Admin>", street: "Street 1", city: "12345 Town", country: { en: "Germany", de: "Deutschland" }, email: "a@example.com", authority: "Some Authority" };
    const de = legalPage("datenschutz", l, { malwareLookup: true, abuseEmail: null });
    expect(de).toContain('<html lang="de">');
    expect(de).toContain("Ada &lt;Admin&gt;");
    expect(de).toContain("MalwareBazaar");
    expect(legalPage("privacy", l, { malwareLookup: false, abuseEmail: null })).not.toContain("MalwareBazaar");
    expect(legalPage("imprint", l, { malwareLookup: false, abuseEmail: null })).toContain("§ 5 DDG");
  });
  it("asks before deleting", () => {
    expect(deletePage("x.png", false)).toContain('<form method="post">');
    expect(deletePage("<b>", false)).toContain("&lt;b&gt;");
    expect(deletePage("x", true)).toContain("The link doesn\u2019t work anymore.");
  });
});
