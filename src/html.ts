import { bloomSvg, faviconSvg } from "./bloom";
import { brandFrom, type Brand } from "./brand";
import type { Item } from "./index";

/* drop - UI following the shiftbloom studio brand book v2.
 * Paper & ink with one loud flower: Bloom Red for actions and seeds, gradients only inside the mark.
 * Voices: Clash Display (statements), General Sans (UI/body), JetBrains Mono (labels, numbers, metadata). */

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const fmtSize = (n: number) => {
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i ? 1 : 0)} ${u[i]}`;
};
const fmtDate = (s: number) => new Date(s * 1000).toISOString().slice(0, 16).replace("T", " ") + " UTC";
/** UTC in the markup, rewritten to the visitor's local time by VIEW_JS. */
const fmtTime = (s: number) => `<time datetime="${new Date(s * 1000).toISOString()}">${fmtDate(s)}</time>`;
const extOfName = (n: string) => (/\.([A-Za-z0-9]{1,8})$/.exec(n)?.[1] || "").toLowerCase();
const VIEW_JS = `document.querySelectorAll('time[datetime]').forEach(function(t){t.textContent=new Date(t.getAttribute('datetime')).toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})});
var c=document.getElementById('cplink');if(c)c.onclick=function(){navigator.clipboard.writeText(c.dataset.u).then(function(){c.textContent='Copied';setTimeout(function(){c.textContent='Copy link'},1600)},function(){})};
var v=document.getElementById('unveil');if(v)v.onclick=function(){document.getElementById('v').classList.remove('veil');v.remove()};`;

// ---------- the Bloom: the exact mark from shiftbloom.studio (see ./bloom.ts) ----------
/** Gradient bloom by default, as in the shiftbloom.studio header; `solid` for favicons. */
export function bloom(opts: { size?: number; solid?: boolean; id?: string; cls?: string } = {}) {
  const { size = 30, solid = false, id = "sb-bloom-ring", cls = "" } = opts;
  return bloomSvg({ size, variant: solid ? "solid" : "gradient", id, cls: `bloom ${cls}`.trim() });
}

export { faviconSvg };

const SPARK = (size: number, color = "#FF2E52") =>
  `<svg width="${size}" height="${size}" viewBox="-12 -12 24 24" aria-hidden="true"><path d="M0-12C1 -3 3 -1 12 0C3 1 1 3 0 12C-1 3-3 1-12 0C-3-1-1-3 0-12Z" fill="${color}"/></svg>`;
const CROSS = (size: number, color = "#1A1216") =>
  `<svg width="${size}" height="${size}" viewBox="0 0 12 12" aria-hidden="true"><path d="M4 0h4v4h4v4H8v4H4V8H0V4h4z" fill="${color}"/></svg>`;

// ---------- shared styles ----------
const css = `
:root{--bloom:#FF2E52;--root:#C81040;--petal:#FF8FAB;--blush:#FFE9EF;--ink:#1A1216;--ink60:rgba(26,18,22,.66);--ink40:rgba(26,18,22,.42);--line:#E4DADB;--paper:#F6F1EE;--warm:#EEE6E2;
--display:"Clash Display",ui-sans-serif,system-ui,sans-serif;--sans:"General Sans",ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;--mono:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
--ease:cubic-bezier(.22,1.1,.36,1);--settle:cubic-bezier(.4,0,.2,1)}
*{box-sizing:border-box}[hidden]{display:none!important}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.65 var(--sans);-webkit-font-smoothing:antialiased}
::selection{background:var(--blush)}
a{color:var(--root);text-decoration:none;background:linear-gradient(var(--root),var(--root)) 0 100%/0 1px no-repeat;transition:background-size .24s var(--ease)}
a:hover{background-size:100% 1px}
.wrap{max-width:1040px;margin:0 auto;padding:0 clamp(20px,5vw,48px)}
.label{font:500 11px/1.4 var(--mono);letter-spacing:.16em;text-transform:uppercase;color:var(--ink60)}
.label.red{color:var(--root)}
.mono{font-family:var(--mono)}
.top{display:flex;align-items:center;justify-content:space-between;padding:22px 0;border-bottom:1px solid var(--line)}
.brand{display:flex;align-items:center;gap:12px;color:var(--ink);background:none}
.brand .word{font:600 20px/1 var(--display);letter-spacing:-.02em}@media(min-width:640px){.brand .word{font-size:22.4px}}
.brand .word i{font-style:normal;color:var(--bloom)}
h1,h2{font-family:var(--display);font-weight:600;letter-spacing:-.025em;line-height:1.02;margin:0}
h1{font-size:clamp(40px,6.4vw,72px)}h1 em{font-style:normal;color:var(--bloom)}
h2{font-size:24px;line-height:1.1}
.btn{appearance:none;border:0;border-radius:999px;background:var(--bloom);color:#fff;font:600 15px/1 var(--sans);padding:13px 20px;cursor:pointer;transition:background .24s var(--settle),transform .24s var(--ease);display:inline-flex;align-items:center;gap:8px;text-decoration:none}
.btn:hover{background:var(--root);background-size:auto}.btn:active{transform:scale(.97)}
.btn.ghost{background:transparent;color:var(--ink);box-shadow:inset 0 0 0 1px var(--ink)}
.btn.ghost:hover{background:var(--ink);color:#fff}
.btn.sm{padding:9px 14px;font-size:13px}
.btn:focus-visible,a:focus-visible,button:focus-visible{outline:2px solid var(--root);outline-offset:2px}
.sb{font:600 15px/1 var(--display);letter-spacing:-.02em;color:var(--ink);background:none;white-space:nowrap}.sb span{font-weight:400;color:var(--ink60);margin-left:.28em}.sb i{font-style:normal;color:var(--bloom)}
.sprinkle{position:absolute;pointer-events:none}
@keyframes breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.02)}}
input,textarea,select{font:15px/1.5 var(--sans);color:var(--ink);background:#FBF8F6;border:1px solid var(--line);border-radius:12px;padding:11px 14px;width:100%;transition:border-color .24s var(--settle),box-shadow .24s var(--settle)}
input:focus,textarea:focus,select:focus{outline:0;border-color:var(--bloom);box-shadow:0 0 0 3px var(--blush)}
textarea{min-height:200px;font:13px/1.6 var(--mono);resize:vertical}
.panel{background:var(--warm);border-radius:20px;padding:clamp(18px,3vw,32px)}
.seedlist{list-style:none;padding:0;margin:0}.seedlist li{position:relative;padding-left:18px}.seedlist li:before{content:"";position:absolute;left:2px;top:.68em;width:7px;height:7px;border-radius:50%;background:var(--bloom)}
.foot{display:flex;justify-content:space-between;gap:12px 24px;flex-wrap:wrap;padding:22px 0 30px;margin-top:72px;border-top:1px solid var(--line)}.foot p{margin:0;font-size:14px;color:var(--ink60)}
.unfold{animation:unfold .6s var(--ease) both}
@keyframes unfold{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){*,*:before,*:after{animation:none!important;transition:none!important}}
`;

const head = (title: string, extra = "", index = false, lang = "en") => `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>${index ? "" : `<meta name="robots" content="noindex">`}<meta name="theme-color" content="#F6F1EE">
<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/assets/fonts.css">${extra}<style>${css}`;

/** Set per request from the Worker's config: which optional links the pages show and who runs the instance. */
let UI: { legal: boolean; abuseEmail: string | null; requests?: boolean; public?: boolean; brand?: Brand } = { legal: false, abuseEmail: null, requests: false, public: false };
let BRAND: Brand = brandFrom();
export function configureUi(c: typeof UI) { UI = c; BRAND = c.brand ?? brandFrom(); }

/** Operator mark: the shiftbloom studio wordmark per brand book ("shiftbloom" semibold, "studio" regular
 * at 60% ink, red seed period) for the upstream preset, otherwise the operator's name as text. */
function operatorMark(cls = "sb") {
  const o = BRAND.operator;
  if (!o) return "";
  const inner = BRAND.studioWordmark ? `shiftbloom<span>studio</span><i>.</i>` : esc(o.name);
  return o.url ? `<a class="${cls}" href="${esc(o.url)}" aria-label="${esc(o.name)}">${inner}</a>` : `<span class="${cls}">${inner}</span>`;
}

const topbar = (right = "") => `<header class="top"><a class="brand" href="/" aria-label="${esc(BRAND.operator ? `drop - ${BRAND.operator.name}` : "drop")}">${bloom({ size: 30, id: "tb" })}<span class="word">drop<i>.</i></span></a>${right}</header>`;

/** AGPL §13: users interacting over a network must be offered the source. Set SOURCE_URL to your fork. */
const sourceUrl = () => BRAND.sourceUrl;

const footer = (lang: "en" | "de" = "en") => `<footer class="foot"><p>${lang === "de" ? "drop ist Open Source unter AGPL-3.0." : "drop is open source under AGPL-3.0."} <a href="${esc(sourceUrl())}">${lang === "de" ? "Zum Code" : "Read the code"}</a>${UI.legal ? (lang === "de" ? ` · <a href="/nutzungsbedingungen">Nutzungsbedingungen</a> · <a href="/inhaltsrichtlinie">Inhaltsrichtlinie</a> · <a href="/datenschutz">Datenschutz</a> · <a href="/impressum">Impressum</a>` : ` · <a href="/terms">Terms</a> · <a href="/content-policy">Content policy</a> · <a href="/privacy">Privacy</a> · <a href="/imprint">Imprint</a>`) : ""}</p>${BRAND.operator ? `<p>${operatorMark()}${BRAND.operator.place ? ` · ${esc(BRAND.operator.place)}` : ""}</p>` : ""}</footer>`;

// ---------- landing ----------

function landingMeta(origin: string) {
  const o = BRAND.operator, SITE_TITLE = BRAND.siteTitle, SITE_DESC = BRAND.description;
  const ld = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "drop",
    url: `${origin}/`,
    description: BRAND.description,
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Web, Windows (ShareX)",
    inLanguage: "en",
    isAccessibleForFree: true,
    license: "https://www.gnu.org/licenses/agpl-3.0.html",
    offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
    ...(o ? { publisher: { "@type": "Organization", ...(o.url ? { "@id": `${o.url.replace(/\/+$/, "")}/#org` } : {}), name: o.name, ...(o.url ? { url: o.url } : {}) } } : {}),
    sameAs: [sourceUrl()],
  };
  return `<meta name="description" content="${esc(SITE_DESC)}"><link rel="canonical" href="${esc(origin)}/">
<meta property="og:type" content="website"><meta property="og:site_name" content="${esc(o?.name ?? "drop")}"><meta property="og:locale" content="en_US">
<meta property="og:title" content="${esc(SITE_TITLE)}"><meta property="og:description" content="${esc(SITE_DESC)}"><meta property="og:url" content="${esc(origin)}/">
<meta property="og:image" content="${esc(origin)}/og.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="drop. Every file gets five characters.">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${esc(origin)}/og.png">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>`;
}

/** `pub` is set when visitors without a token may upload (see public.ts). */
export type Limits = { multiMb: number; maxMb: number; pub?: { siteKey: string; maxMb: number; pasteKb: number } };

export function landingPage(host: string, lim: Limits = { multiMb: 95, maxMb: 500 }, origin = `https://${host}`) {
  // the token check runs before first paint, so visitors never see the tool flash
  const early = `<script>try{if(localStorage.getItem('drop_token'))document.documentElement.classList.add('authed')}catch(e){}</script>`;
  const pub = lim.pub;
  const ts = pub ? `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" async defer></script>` : "";
  return `${head(BRAND.siteTitle, `${early}${ts}${landingMeta(origin)}`, true)}
html.authed .anon,html:not(.authed) .member{display:none!important}
html:not(.want) #tokf{display:none}
.hero{display:grid;grid-template-columns:1.5fr 1fr;align-items:center;gap:32px;padding:clamp(32px,6vw,64px) 0 clamp(24px,4vw,40px)}
.hero h1{font-size:clamp(34px,4.8vw,56px);line-height:1.04;max-width:14em}
.hero p{font-size:17px;color:var(--ink60);max-width:32em;margin:18px 0 0}
.demo{display:inline-block;background:var(--warm);border-radius:14px;padding:14px 20px;margin-top:26px}
.art{position:relative;display:grid;place-items:center;min-height:280px}
.art .bloom{width:min(220px,70%);height:auto;animation:unfold .6s var(--ease) both,breathe 6s var(--settle) .6s infinite}
.demo .u{font:500 clamp(15px,1.75vw,22px)/1.3 var(--mono);white-space:nowrap;color:var(--ink)}
.demo .u b{font-weight:600;color:var(--root)}
.demo .cap{font-size:13px;color:var(--ink60);margin:8px 0 0}
.who{display:flex;align-items:center;gap:8px;font-size:14px;color:var(--ink60)}
html.authed .who:before{content:"";width:7px;height:7px;border-radius:50%;background:#2E9E62}
.gate{display:grid;gap:16px;max-width:40em}
.gate p{margin:0;font-size:17px}
#tokf{display:grid;gap:8px;margin-top:6px}
#tokf .row input{flex:1 1 240px;font:14px/1.5 var(--mono)}
.hint{font-size:14px;color:var(--ink60);margin:0}.hint.err{color:var(--root)}
.tool{display:grid;gap:18px}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.grow{flex:1 1 240px}
.opts{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap}
.tabs{display:inline-flex;gap:4px;background:#FBF8F6;border-radius:999px;padding:4px;box-shadow:inset 0 0 0 1px var(--line)}
.tabs button{appearance:none;border:0;background:transparent;border-radius:999px;padding:9px 18px;font:500 14px/1 var(--sans);color:var(--ink60);cursor:pointer;transition:background .24s var(--settle),color .24s var(--settle)}
.tabs button[aria-selected=true]{background:var(--ink);color:#fff}
.tabs button:focus-visible{outline:2px solid var(--root);outline-offset:2px}
.exp{display:flex;gap:8px;align-items:center;font-size:14px;color:var(--ink60)}
.exp select{width:auto;padding:8px 34px 8px 12px;border-radius:999px;font:500 14px/1 var(--sans)}
#drop{border:1.5px dashed rgba(26,18,22,.28);border-radius:18px;background:#FBF8F6;padding:clamp(32px,5vw,52px) 20px;text-align:center;cursor:pointer;transition:border-color .24s var(--settle),background .24s var(--settle)}
#drop:hover,#drop.over,#drop:focus-visible{border-color:var(--bloom);background:var(--blush);outline:0}
#drop strong{display:block;font:600 24px/1.1 var(--display);letter-spacing:-.02em;margin:0 0 8px}
#drop .sub{font-size:14px;color:var(--ink60)}
.touch{display:none}@media (pointer:coarse){.touch{display:inline}.desk{display:none}}
#out{display:grid;gap:8px}#out:empty{display:none}
.res{position:relative;overflow:hidden;display:flex;align-items:center;gap:12px;background:#FBF8F6;border-radius:14px;padding:10px 10px 10px 16px;min-height:52px;box-shadow:inset 0 0 0 1px var(--line);animation:unfold .24s var(--ease) both}
.res a{font:500 14px/1.3 var(--mono);flex:1;word-break:break-all}
.res .nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px}
.res .pct{font:12px/1 var(--mono);color:var(--ink60);white-space:nowrap}
.res .bar{position:absolute;left:0;bottom:0;height:3px;width:0;background:var(--bloom);transition:width .2s var(--settle)}
.res.err{color:var(--root);font-size:14px}
.sx{display:flex;gap:6px 14px;flex-wrap:wrap;align-items:center;font-size:14px;color:var(--ink60)}
.lnk{appearance:none;border:0;background:none;padding:0;font:inherit;color:var(--root);cursor:pointer}
.lnk:hover{text-decoration:underline;text-underline-offset:3px}
.list{margin-top:56px}
.list .row{justify-content:space-between}
.list select{width:auto;padding:7px 32px 7px 12px;border-radius:999px;font:500 14px/1 var(--sans)}
table{width:100%;border-collapse:collapse;margin-top:14px}
th{text-align:left;font:500 11px/1.4 var(--mono);letter-spacing:.06em;color:var(--ink60);padding:8px;border-bottom:1px solid var(--line)}
td{padding:12px 8px;border-top:1px solid var(--line);vertical-align:middle;font-size:14px}
tr:first-child td{border-top:0}
td.t{width:60px}td.t img,td.t span{width:48px;height:48px;border-radius:10px;object-fit:cover;display:grid;place-items:center;background:var(--warm);font:500 10px var(--mono);color:var(--ink60)}
td.n{overflow-wrap:anywhere}td .alt{color:var(--ink60);font-size:13px;margin-top:2px}
td.m,.mm{font:12px/1.5 var(--mono);color:var(--ink60)}
td.m{white-space:nowrap;text-align:right}.mm{display:none;margin-top:4px}
td.undo{color:var(--ink60);padding:18px 8px}
.tag{display:inline-block;background:var(--blush);color:var(--root);font:500 11px/1 var(--mono);padding:4px 7px;border-radius:6px;margin-left:6px;vertical-align:2px}
.x{appearance:none;border:0;background:none;color:var(--ink60);cursor:pointer;font:500 13px var(--sans);padding:6px}.x:hover{color:var(--root)}
.more{display:flex;justify-content:center;margin-top:18px}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.res a.dl{flex:0 0 auto;font:13px/1.3 var(--sans);color:var(--ink60);white-space:nowrap}
.gate+.tool{margin-top:20px}
#ts:empty{display:none}
@media (max-width:760px){.hero{grid-template-columns:1fr;align-items:start}.art{display:none}td.m,th.m{display:none}.mm{display:block}}
</style></head><body>
<div class="wrap">
${topbar(`<div class="who"><span class="member">token saved</span><span class="member" aria-hidden="true">·</span><button class="lnk member" id="logout" type="button">Forget token</button>${operatorMark("sb anon")}</div>`)}
<section class="hero">
  <div><span class="label member" id="stats"></span>
  <h1 style="margin-top:14px">Every file gets five characters<em>.</em></h1>
  <p>Drop a file here and the link is in your clipboard before you’ve switched windows. Text and long URLs work the same way. If something shouldn’t stick around, give it an expiry date.</p>
  <div class="demo"><div class="u">${esc(host)}/<b>aB3dE</b></div></div></div>
  <div class="art" aria-hidden="true">${bloom({ size: 220, id: "hb" })}<span class="sprinkle" style="top:6%;left:10%">${SPARK(18)}</span><span class="sprinkle" style="top:14%;right:6%">${CROSS(10)}</span><span class="sprinkle" style="bottom:10%;left:18%"><svg width="8" height="8" viewBox="0 0 8 8"><circle cx="4" cy="4" r="4" fill="#FF2E52"/></svg></span><span class="sprinkle" style="bottom:4%;right:16%">${SPARK(12, "#FF8FAB")}</span></div>
</section>

<section class="panel gate anon" aria-labelledby="gate-h">${pub
    ? `
  <h2 id="gate-h">No account, no history.</h2>
  <p>You can drop files up to ${pub.maxMb} MB and text up to ${pub.pasteKb} KB without a token. Images (GIFs too) and plain text work. Videos, audio and PDFs need a token for now. Only people you send the link to can open it, and it’s gone after 12 hours at the latest.</p>
  <div class="row">${UI.requests ? `<a class="btn ghost" href="/request">Ask for a token</a>` : ""}<a class="btn ghost" href="${esc(sourceUrl())}#self-hosting">Set up your own</a><button`
    : `
  <h2 id="gate-h">This one’s private.</h2>${UI.requests
    ? `<p>Uploading here needs a token. You can ask us for one, or set up your own drop on Cloudflare with the open source code.</p>
  <div class="row"><a class="btn" href="/request">Ask for a token</a><a class="btn ghost" href="${esc(sourceUrl())}#self-hosting">Set up your own</a><button`
    : `<p>Uploading here needs a token, and the token is ours. The code is open though, so you can run your own drop on your Cloudflare account.</p>
  <div class="row"><a class="btn" href="${esc(sourceUrl())}#self-hosting">Set up your own</a><button`}`} class="lnk" id="have" type="button" aria-controls="tokf" aria-expanded="false">I have a token</button></div>
  <form id="tokf" autocomplete="on"><label class="label" for="tok">token</label>
  <div class="row"><input id="tok" name="password" type="password" autocomplete="current-password" placeholder="Paste your API token" required><button class="btn" type="submit">Remember</button></div>
  <p class="hint err" id="tokerr" role="alert"></p></form>
</section>

<section class="panel tool${pub ? "" : " member"}" aria-label="Upload">
  <div class="opts"><div class="tabs" role="tablist" aria-label="What are you sharing?"><button role="tab" id="t-up" aria-controls="p-up" aria-selected="true" type="button">File</button><button role="tab" id="t-paste" aria-controls="p-paste" aria-selected="false" tabindex="-1" type="button">Text</button><button role="tab" id="t-link" class="member" aria-controls="p-link" aria-selected="false" tabindex="-1" type="button">Link</button></div>
  ${pub ? `<label class="exp anon">delete after <select id="pexp"><option value="10m">10 minutes</option><option value="1h">1 hour</option><option value="12h" selected>12 hours</option></select></label>` : ""}<label class="exp member">delete after <select id="exp"><option value="never">never</option><option value="10m">10 minutes</option><option value="1h">1 hour</option><option value="12h">12 hours</option><option value="1d">1 day</option><option value="7d">7 days</option><option value="30d">30 days</option><option value="90d">90 days</option><option value="1y">1 year</option></select></label></div>
  <div role="tabpanel" id="p-up" aria-labelledby="t-up"><div id="drop" role="button" tabindex="0" aria-label="Drop files here, or press Enter to pick them${pub ? "" : `, up to ${lim.maxMb} MB`}"><strong>Drop files here</strong><span class="sub"><span class="desk">or press ctrl+v</span><span class="touch">or tap to pick</span> · up to ${pub ? `<span class="anon">${pub.maxMb} mb</span><span class="member">${lim.maxMb} mb</span>` : `${lim.maxMb} mb`}</span><input type="file" id="file" multiple hidden></div></div>
  <form role="tabpanel" id="p-paste" aria-labelledby="t-paste" hidden><label class="sr" for="ptext">Text or code</label><textarea id="ptext" placeholder="Paste text or code" spellcheck="false"></textarea><div class="row" style="margin-top:10px"><label class="sr" for="plang">Language for highlighting</label><input id="plang" placeholder="language, e.g. ts or json" style="width:240px;font-family:var(--mono);font-size:13px"><button class="btn" type="submit">Save as paste</button></div></form>
  <form role="tabpanel" id="p-link" aria-labelledby="t-link" hidden><div class="row"><label class="sr" for="lurl">Long URL</label><input class="grow" id="lurl" placeholder="https://" inputmode="url" style="font-family:var(--mono);font-size:14px"><button class="btn" type="submit">Shorten</button></div></form>
  ${UI.legal ? `<p class="hint">By uploading you accept the <a href="/terms">terms of use</a> and the <a href="/content-policy">content policy</a>. No sexual content, nothing illegal, no malware.</p>` : ""}${pub ? `<div id="ts" class="anon"></div>` : ""}<div id="out" aria-live="polite"></div><p class="sr" id="live" aria-live="assertive"></p>
  <div class="sx member"><span class="label">sharex configs</span><a href="/api/sharex?type=upload" data-sx="upload">uploads</a><a href="/api/sharex?type=paste" data-sx="paste">text</a><a href="/api/sharex?type=shorten" data-sx="shorten">short links</a></div>
</section>

<section class="list member" id="recent" aria-labelledby="recent-h"><div class="row"><h2 id="recent-h">Recent uploads</h2><label class="exp"><span class="sr">Show</span><button class="btn ghost sm" id="reload" type="button">Refresh</button><select id="kind"><option value="">All</option><option value="file">Files</option><option value="paste">Pastes</option><option value="link">Links</option></select></label></div>
<table id="list"><thead><tr><th scope="col"><span class="sr">Preview</span></th><th scope="col">Name</th><th scope="col" class="m" style="text-align:right">Details</th><th scope="col"><span class="sr">Action</span></th></tr></thead><tbody></tbody></table>
<p class="hint" id="empty" hidden style="margin-top:14px"></p>
<div class="more"><button class="btn ghost sm" id="more" type="button" hidden>Load more</button></div></section>
${footer()}
</div>
<script>
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)],R=document.documentElement;
const LIM={multi:${lim.multiMb},max:${lim.maxMb}},MiB=1048576,PAGE=30,PUB=${pub ? JSON.stringify(pub).replace(/</g, "\\u003c") : "null"};
let tok='';try{tok=localStorage.getItem('drop_token')||''}catch(e){}
const A=()=>({authorization:'Bearer '+tok});
const say=t=>{const l=$('#live');l.textContent='';setTimeout(()=>l.textContent=t,40)};
const num=(n,d)=>n.toLocaleString('en-GB',{maximumFractionDigits:d});
const fs=n=>{const u=['B','KB','MB','GB'];let i=0;while(n>=1024&&i<3){n/=1024;i++}return num(n,i?1:0)+' '+u[i]};
const when=s=>new Date(s).toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
const BAD='That token doesn’t work. It may be mistyped, expired or revoked.';
function why(st,b){if(!tok&&PUB&&b&&b.error&&/^(403|413|415|422|429)$/.test(String(st)))return b.error.charAt(0).toUpperCase()+b.error.slice(1)+(/[.!?]$/.test(b.error)?'':'.');if(st===401)return BAD;if(st===422&&b&&b.error)return b.error;if(st===429)return'Too many tries. Wait a minute, then try again.';if(st===413&&/paste/.test((b&&b.error)||''))return'That’s more than 10 MB of text. Upload it as a file instead.';return st?'Something went wrong ('+st+'). Try again in a moment.':'You’re offline. Try again once you’re connected.'}

// token
function setMode(on){R.classList.toggle('authed',on);if(on){R.classList.remove('want');load()}else if(PUB&&$('#t-link').getAttribute('aria-selected')==='true')sel($('#t-up'))}
async function check(t){try{return(await fetch('/api/list?limit=1',{headers:{authorization:'Bearer '+t}})).status}catch(e){return 0}}
$('#have').onclick=()=>{R.classList.add('want');$('#have').setAttribute('aria-expanded','true');$('#tok').focus()};
$('#tokf').onsubmit=async e=>{e.preventDefault();const v=$('#tok').value.trim(),er=$('#tokerr');if(!v)return;er.textContent='';const st=await check(v);
if(st===200){tok=v;try{localStorage.setItem('drop_token',v)}catch(x){}$('#tok').value='';setMode(true);say('token saved');return}
er.textContent=why(st)};
$('#logout').onclick=()=>{try{localStorage.removeItem('drop_token')}catch(e){}tok='';setMode(false);};

// without a token: one Turnstile check per upload, run one at a time
let tsId=null,tsWait=null,tsChain=Promise.resolve('');
async function human(){for(let i=0;i<100&&!window.turnstile;i++)await new Promise(r=>setTimeout(r,100));if(!window.turnstile)return'';
if(tsId===null)tsId=turnstile.render('#ts',{sitekey:PUB.siteKey,action:'public-upload',execution:'execute',appearance:'interaction-only',theme:'light',callback:t=>{if(tsWait)tsWait(t)},'error-callback':()=>{if(tsWait)tsWait('')},'timeout-callback':()=>{if(tsWait)tsWait('')}});
return new Promise(r=>{tsWait=t=>{tsWait=null;r(t)};turnstile.reset(tsId);turnstile.execute(tsId)})}
const check2=()=>(tsChain=tsChain.then(human,human));
const pubMode=()=>!!PUB&&!tok;

// tabs
const tabs=$$('[role=tab]');
function sel(b){tabs.forEach(x=>{const on=x===b;x.setAttribute('aria-selected',on);x.tabIndex=on?0:-1;document.getElementById(x.getAttribute('aria-controls')).hidden=!on})}
// the Link tab is hidden without a token, so arrow keys move between the visible tabs only
tabs.forEach(b=>{b.onclick=()=>sel(b);b.onkeydown=e=>{const v=tabs.filter(x=>x.offsetParent!==null),i=v.indexOf(b);let n=-1;if(e.key==='ArrowRight')n=(i+1)%v.length;else if(e.key==='ArrowLeft')n=(i+v.length-1)%v.length;else if(e.key==='Home')n=0;else if(e.key==='End')n=v.length-1;if(n<0)return;e.preventDefault();sel(v[n]);v[n].focus()}});

// results
function row(c){const d=document.createElement('div');d.className='res '+(c||'');$('#out').prepend(d);return d}
function fail(d,t){d.className='res err';d.replaceChildren(t);say(t)}
async function copy(u,b,auto){try{await navigator.clipboard.writeText(u);b.textContent='Copied';say('Copied');setTimeout(()=>b.textContent='Copy',1600)}catch(e){if(!auto)say('Something went wrong (clipboard). Try again in a moment.')}}
function done(d,r){d.className='res';d.replaceChildren();const a=document.createElement('a');a.href=r.url;a.target='_blank';a.rel='noopener';a.textContent=r.url.replace(/^https?:\\/\\//,'');
const b=document.createElement('button');b.className='btn sm';b.type='button';b.textContent='Copy';b.onclick=()=>copy(r.url,b);d.append(a);
// without a token there is no history, so the deletion link is shown right here, once
if(!tok&&r.delete){const x=document.createElement('a');x.className='dl';x.href=r.delete;x.target='_blank';x.rel='noopener';x.textContent='delete link';d.append(x)}
d.append(b);copy(r.url,b,true);say(a.textContent);load()}

// uploads with progress and cancel
const hdr=(x,t)=>{if(t==null){x.setRequestHeader('authorization','Bearer '+tok);x.setRequestHeader('x-expires',$('#exp').value)}else{x.setRequestHeader('x-turnstile',t);x.setRequestHeader('x-expires',$('#pexp').value)}};
function one(f){const d=row(''),pm=pubMode(),max=pm?PUB.maxMb:LIM.max;if(f.size>max*MiB)return fail(d,f.name+' is '+fs(f.size)+'. The limit'+(pm?' without a token':'')+' is '+max+' MB.');if(!f.size)return fail(d,f.name+' is empty.');
if(pm){d.textContent='Checking you\u2019re a person …';check2().then(t=>send(d,f,t))}else send(d,f,null)}
function send(d,f,t){
const x=new XMLHttpRequest(),bar=document.createElement('i'),nm=document.createElement('span'),pc=document.createElement('span'),c=document.createElement('button');
bar.className='bar';nm.className='nm';nm.textContent='Uploading '+f.name+' …';pc.className='pct';pc.textContent='0 %';c.type='button';c.className='x';c.textContent='Cancel';c.onclick=()=>x.abort();d.append(bar,nm,pc,c);
x.upload.onprogress=e=>{if(!e.lengthComputable)return;const p=e.loaded/e.total;bar.style.width=(p*100)+'%';pc.textContent=Math.floor(p*100)+' % · '+fs(e.loaded)+' of '+fs(e.total)};
x.onload=()=>{let b=null;try{b=JSON.parse(x.responseText)}catch(e){}if(x.status>=200&&x.status<300&&b&&b.url)done(d,b);else fail(d,x.status===413&&t==null?f.name+' is '+fs(f.size)+'. The limit is '+LIM.max+' MB.':why(x.status,b))};
x.onerror=()=>fail(d,why(0));x.onabort=()=>d.remove();
if(t==null&&f.size>LIM.multi*MiB){x.open('PUT','/api/upload?filename='+encodeURIComponent(f.name));hdr(x);x.setRequestHeader('content-type',f.type||'application/octet-stream');x.send(f)}
else{x.open('POST',t==null?'/api/upload':'/api/public/upload');hdr(x,t);const fd=new FormData();fd.append('file',f);x.send(fd)}}
const up=fl=>{for(const f of fl)one(f)};
const dz=$('#drop');dz.onclick=()=>$('#file').click();dz.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('#file').click()}};$('#file').onchange=e=>{up(e.target.files);e.target.value=''};
dz.ondragover=e=>{e.preventDefault();dz.classList.add('over')};dz.ondragleave=()=>dz.classList.remove('over');dz.ondrop=e=>{e.preventDefault();dz.classList.remove('over');up(e.dataTransfer.files)};
addEventListener('paste',e=>{if(!(R.classList.contains('authed')||PUB)||/TEXTAREA|INPUT/.test(e.target.tagName))return;const f=[...e.clipboardData.files];if(f.length)up(f)});

// pastes and links
const URLBAD='That doesn’t look like a link. It needs to start with http:// or https://.';
async function api(path,body){const d=row(''),pm=pubMode();d.textContent=pm?'Checking you\u2019re a person …':'Saving …';try{const h=pm?{'x-turnstile':await check2(),'x-expires':$('#pexp').value}:{...A(),'x-expires':$('#exp').value};if(pm){path=path.replace('/api/','/api/public/');d.textContent='Saving …'}
const r=await fetch(path,{method:'POST',headers:{...h,'content-type':'application/json'},body:JSON.stringify(body)});let b=null;try{b=await r.json()}catch(e){}
if(r.ok&&b&&b.url){done(d,b);return true}fail(d,path==='/api/shorten'&&r.status===400?URLBAD:why(r.status,b))}catch(e){fail(d,why(0))}return false}
$('#p-paste').onsubmit=async e=>{e.preventDefault();const t=$('#ptext').value;if(!t.trim())return fail(row(''),'There’s nothing to save yet.');if(await api('/api/paste',{content:t,lang:$('#plang').value.trim()}))$('#ptext').value=''};
$('#p-link').onsubmit=async e=>{e.preventDefault();let u=$('#lurl').value.trim();if(!u)return fail(row(''),URLBAD);if(!/^[a-z][a-z0-9+.-]*:/i.test(u))u='https://'+u;
if(!/^https?:\\/\\/[^\\s/]+\\.[^\\s]+/i.test(u))return fail(row(''),URLBAD);if(await api('/api/shorten',{url:u}))$('#lurl').value=''};
$$('[data-sx]').forEach(a=>a.onclick=async e=>{e.preventDefault();let r;try{r=await fetch('/api/sharex?type='+a.dataset.sx,{headers:A()})}catch(x){return fail(row(''),why(0))}if(!r.ok)return fail(row(''),r.status===401?'Save your token first. The ShareX configs include it.':why(r.status));const u=URL.createObjectURL(await r.blob());Object.assign(document.createElement('a'),{href:u,download:location.host+'-'+a.dataset.sx+'.sxcu'}).click()});

// recent items
let off=0;
function stats(s){let n=0,b=0,l=0;for(const x of s){if(x.kind==='link')l+=x.n;else{n+=x.n;b+=x.bytes}}$('#stats').textContent=n+' '+(n===1?'file':'files')+' · '+fs(b).toLowerCase()}
const td=(c,t)=>{const e=document.createElement('td');if(c)e.className=c;if(t!=null)e.textContent=t;return e};
async function del(tr,it){if(!confirm('Delete '+(it.name||it.id)+'? Its link stops working right away.'))return;tr.remove();try{await fetch('/api/items/'+it.id,{method:'DELETE',headers:A()})}catch(e){}refresh()}
function item(it){const tr=document.createElement('tr'),c0=td('t');if(it.thumbnail){const i=document.createElement('img');i.src=it.thumbnail;i.loading='lazy';i.alt='';c0.append(i)}else{const s=document.createElement('span');s.textContent=it.kind==='paste'?'txt':it.kind==='link'?'url':(it.name||'').split('.').pop().slice(0,4);c0.append(s)}
const c1=td('n'),a=document.createElement('a');a.href=it.url;a.target='_blank';a.rel='noopener';a.textContent=it.kind==='link'?it.raw:(it.name||it.id);c1.append(a);if(it.nsfw){const g=document.createElement('span');g.className='tag';g.textContent='sensitive';c1.append(g)}if(it.blocked){const g=document.createElement('span');g.className='tag';g.textContent='on hold';g.title=it.blocked;c1.append(g)}
if(it.alt){const p=document.createElement('div');p.className='alt';p.textContent=it.alt;c1.append(p)}
const meta=[it.id,it.kind==='link'?null:fs(it.size),it.views+(it.views===1?' view':' views'),it.expires_at?'expires '+when(it.expires_at):null].filter(Boolean).join(' · ');
const mm=document.createElement('div');mm.className='mm';mm.textContent=meta;c1.append(mm);
const c3=td(''),x=document.createElement('button');x.className='x';x.type='button';x.textContent='Delete';x.setAttribute('aria-label','Delete '+(it.name||it.id));x.onclick=()=>del(tr,it);c3.append(x);tr.append(c0,c1,td('m',meta),c3);return tr}
async function load(more){if(!tok)return;if(!more)off=0;const k=$('#kind').value;let r;try{r=await fetch('/api/list?limit='+PAGE+'&offset='+off+(k?'&kind='+k:''),{headers:A()})}catch(e){return}
if(r.status===401){R.classList.remove('authed');R.classList.add('want');
// with public uploads on, a saved token that stopped working is forgotten, so uploads quietly go on without one
if(PUB){tok='';try{localStorage.removeItem('drop_token')}catch(e){}$('#tokerr').textContent='Your saved token doesn\u2019t work anymore, so it was removed. You can still upload without one.';return}
$('#tokerr').textContent=BAD;return}if(!r.ok)return;const d=await r.json();
stats(d.stats);const tb=$('#list tbody');if(!more)tb.replaceChildren();for(const it of d.items)tb.append(item(it));off+=d.items.length;$('#more').hidden=d.items.length<PAGE;$('#empty').hidden=tb.children.length>0;$('#empty').textContent={file:'No files yet.',paste:'No pastes yet.',link:'No links yet.'}[k]||'Nothing uploaded yet.'}
async function refresh(){try{const r=await fetch('/api/list?limit=1',{headers:A()});if(r.ok)stats((await r.json()).stats)}catch(e){}}
$('#kind').onchange=()=>load();$('#reload').onclick=()=>load();$('#more').onclick=()=>load(true);
if(tok)load();
</script></body></html>`;
}

// ---------- view page ----------
export function viewPage(it: Item, l: { url: string; raw: string | null; thumbnail: string | null }, pasteText: string | null) {
  const mime = it.mime || "";
  const title = it.name || it.id;
  const isImg = mime.startsWith("image/") && !mime.includes("svg");
  const isVid = mime.startsWith("video/");
  const isAud = mime.startsWith("audio/");
  const isPdf = mime === "application/pdf";
  const firstLine = (pasteText || "").split("\n").map((x) => x.trim()).find(Boolean) || "";
  const desc = it.kind === "paste" ? firstLine.slice(0, 200) || "Empty paste" : it.alt || `${fmtSize(it.size)} · ${mime}`;
  let og = `<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(l.url)}"><meta property="og:site_name" content="${esc(BRAND.operator ? `drop · ${BRAND.operator.name}` : "drop")}"><meta name="twitter:title" content="${esc(title)}"><meta name="theme-color" content="#FF2E52">`;
  if (!(isVid && !it.nsfw)) og += `<meta property="og:type" content="website">`;
  if (isImg && !it.nsfw) og += `<meta property="og:image" content="${esc(l.raw)}">${it.width && it.height ? `<meta property="og:image:width" content="${it.width}"><meta property="og:image:height" content="${it.height}">` : ""}<meta property="og:image:type" content="${esc(mime)}"><meta property="og:image:alt" content="${esc(it.alt || title)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${esc(l.raw)}">`;
  if (isVid && !it.nsfw) og += `<meta property="og:type" content="video.other"><meta property="og:video" content="${esc(l.raw)}"><meta property="og:video:type" content="${esc(mime)}"><meta property="og:video:secure_url" content="${esc(l.raw)}">${it.width && it.height ? `<meta property="og:video:width" content="${it.width}"><meta property="og:video:height" content="${it.height}">` : ""}<meta name="twitter:card" content="player">`;

  let body: string;
  let extraHead = "";
  if (it.kind === "paste") {
    extraHead = `<script src="/assets/hljs.js" defer></script>`;
    const lines = (pasteText || "").split("\n").length;
    body = `<div class="code"><div class="codebar"><span class="label" style="color:rgba(244,237,238,.5)">${esc(it.lang || "text")} · ${lines} lines · ${fmtSize(it.size)}</span><button class="btn sm" id="cp" type="button">Copy</button></div><pre><code class="${it.lang ? `language-${esc(it.lang)}` : "nohighlight"}">${esc(pasteText)}</code></pre></div>
<script>document.getElementById('cp').onclick=function(){navigator.clipboard.writeText(document.querySelector('pre code').innerText);var b=this;b.textContent='Copied';setTimeout(function(){b.textContent='Copy'},1600)};addEventListener('DOMContentLoaded',function(){window.hljs&&hljs.highlightAll()})</script>`;
  } else if (isImg) {
    const img = `<img src="${esc(l.raw)}" alt="${esc(it.alt || title)}">`;
    body = it.nsfw
      ? `<div class="stage veil" id="v">${img}<button class="btn" id="unveil" type="button">Might be sensitive. Show it</button></div>`
      : `<div class="stage">${img}</div>`;
  } else if (isVid) body = `<div class="stage"><video src="${esc(l.raw)}" controls playsinline preload="metadata"></video></div>`;
  else if (isAud) body = `<div class="stage pad"><div class="ext">${esc(extOfName(title) || "audio")}</div><audio src="${esc(l.raw)}" controls></audio></div>`;
  else if (isPdf) body = `<div class="stage"><object data="${esc(l.raw)}" type="application/pdf" style="width:100%;height:80vh"></object></div>`;
  else body = `<div class="stage pad"><div class="ext">${esc(extOfName(title) || "file")}</div><div class="fname">${esc(title)}</div><span class="label">${fmtSize(it.size)} · ${esc(mime)}</span></div>`;

  return `${head(`${title} · drop.`, `${og}${extraHead}`)}
main{padding:clamp(28px,5vw,56px) 0 0}
.titlebar{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;flex-wrap:wrap;margin-bottom:22px}
.titlebar h1{font-size:clamp(26px,4vw,40px);word-break:break-all}
.stage{position:relative;background:var(--warm);border-radius:20px;overflow:hidden;display:flex;justify-content:center;align-items:center;min-height:200px;animation:unfold .6s var(--ease) both}
.stage img,.stage video{max-width:100%;max-height:78vh;display:block}
.stage.pad{flex-direction:column;gap:14px;padding:56px 20px}.stage audio{width:min(520px,90%)}
.stage .fname{font:600 22px/1.2 var(--display);letter-spacing:-.02em;word-break:break-all;text-align:center}
.veil img{filter:blur(32px) saturate(.6);transform:scale(1.08)}.veil .btn{position:absolute}
.meta{display:flex;gap:10px 22px;flex-wrap:wrap;align-items:center;margin-top:18px}
.alt{margin-top:14px;color:var(--ink60);max-width:46em}
.ext{font:600 15px/1 var(--mono);color:var(--root);background:var(--blush);border-radius:12px;padding:16px 18px;text-transform:lowercase}
.code{background:var(--ink);border-radius:20px;overflow:hidden;animation:unfold .6s var(--ease) both}
.codebar{display:flex;justify-content:space-between;align-items:center;padding:12px 12px 12px 20px;border-bottom:1px solid rgba(244,237,238,.1)}
pre{margin:0;overflow:auto;max-height:78vh}pre code{display:block;padding:20px;font:13px/1.65 var(--mono);color:#F4EDEE;tab-size:2}
.hljs-keyword,.hljs-selector-tag,.hljs-built_in,.hljs-meta .hljs-keyword{color:#FF8FAB}.hljs-string,.hljs-attr,.hljs-template-tag{color:#FFC2D3}
.hljs-number,.hljs-literal,.hljs-symbol{color:#FF7E9E}.hljs-comment,.hljs-quote{color:rgba(244,237,238,.42);font-style:italic}
.hljs-title,.hljs-section,.hljs-name,.hljs-function .hljs-title{color:#fff;font-weight:500}.hljs-type,.hljs-class .hljs-title,.hljs-variable,.hljs-params{color:#FFDCE7}
.hljs-tag,.hljs-meta,.hljs-punctuation{color:rgba(244,237,238,.6)}.hljs-addition{color:#FFDCE7;background:rgba(255,46,82,.12)}.hljs-deletion{color:#FF8FAB;background:rgba(255,46,82,.22)}
</style></head><body><div class="wrap">
${topbar(`<a class="btn ghost sm" href="/">New upload</a>`)}
<main>
<div class="titlebar"><div><span class="label red">${it.kind === "paste" ? "paste" : isImg ? "image" : isVid ? "video" : isAud ? "audio" : "file"}</span><h1 style="margin-top:8px">${esc(title)}</h1></div>
<div class="row" style="display:flex;gap:10px"><button class="btn" id="cplink" type="button" data-u="${esc(l.url)}">Copy link</button><a class="btn ghost" href="${esc(l.raw)}">${it.kind === "paste" ? "Raw" : "Original"}</a><a class="btn ghost" href="/${esc(it.id)}/dl">Download</a></div></div>
${body}
<div class="meta"><span class="label">${esc(it.id)}</span><span class="label">${it.kind === "paste" ? "paste" : fmtSize(it.size)}</span><span class="label">${fmtTime(it.created_at)}</span>${it.expires_at ? `<span class="label red">expires ${fmtTime(it.expires_at)}</span>` : ""}${UI.abuseEmail ? `<a class="label" style="margin-left:auto" href="mailto:${esc(UI.abuseEmail)}?subject=${encodeURIComponent(`Report: drop item ${it.id}`)}&amp;body=${encodeURIComponent(`${l.url}\n\nWhat is wrong with this file?\n`)}">Report this file</a>` : ""}</div>
${it.alt ? `<p class="alt">${esc(it.alt)}</p>` : ""}
</main>
${footer()}
</div><script>${VIEW_JS}</script></body></html>`;
}

export function notFoundPage() {
  return `${head("Not found · drop.")}
.nf{min-height:66vh;display:grid;place-items:center;text-align:center}
.nf p{color:var(--ink60);margin:14px 0 28px;font-size:17px}
</style></head><body><div class="wrap">${topbar()}
<div class="nf"><div><span class="label">404</span><h1 style="margin-top:12px;font-size:clamp(32px,4.6vw,52px)">This link is gone<em>.</em></h1><p>It may have expired, or there’s a typo in it.</p><a class="btn" href="/">Back to drop</a></div></div>
${footer()}
</div></body></html>`;
}

const simplePage = (title: string, label: string, h1: string, p: string, action: string, extraCss = "") => `${head(title)}${extraCss}
.nf{min-height:66vh;display:grid;place-items:center;text-align:center}
.nf p{color:var(--ink60);margin:14px 0 28px;font-size:17px;max-width:32em}
.nf form{display:inline}
</style></head><body><div class="wrap">${topbar()}
<div class="nf"><div><span class="label">${label}</span><h1 style="margin-top:12px;font-size:clamp(32px,4.6vw,52px);word-break:break-word">${h1}</h1><p>${p}</p>${action}</div></div>
${footer()}
</div></body></html>`;

/** Shown instead of a file that an automatic check put on hold. */
export function heldPage() {
  return simplePage("On hold · drop.", "on hold", "This file is on hold<em>.</em>", "An automatic check flagged it, so it can\u2019t be opened right now.", `<a class="btn" href="/">Back to drop</a>`);
}

/** Shown while a file uploaded without a token is still being checked. */
export function checkingPage() {
  return simplePage("Checking · drop.", "checking", "Still checking this file<em>.</em>", "Files uploaded without a token open once the automatic checks are done. That usually takes a few seconds.", `<a class="btn" href="">Try again</a>`);
}

/** Deletion links ask first, so a link preview or crawler that opens one deletes nothing. */
export function deletePage(name: string, done: boolean) {
  return done
    ? simplePage("Deleted · drop.", "deleted", `Deleted<em>.</em>`, "The link doesn\u2019t work anymore.", `<a class="btn" href="/">Back to drop</a>`)
    : simplePage("Delete? · drop.", "delete", `Delete ${esc(name)}?`, "This can\u2019t be undone.", `<form method="post"><button class="btn" type="submit">Delete</button></form>`);
}

/** 1200×630 card, rendered once into /og.png (Browser Rendering screenshot). */
export function ogCardPage(host = "drop.example.com") {
  return `${head("og card")}
body{width:1200px;height:630px;overflow:hidden}
.card{position:relative;width:1200px;height:630px;padding:64px 88px;display:flex;flex-direction:column;justify-content:space-between}
.card h1{font-size:76px;line-height:1.02;max-width:15em}
.card .u{display:inline-block;background:var(--warm);border-radius:18px;padding:20px 26px;font:500 30px/1 var(--mono)}.card .u b{color:var(--root);font-weight:600}
</style></head><body><div class="card">
<div style="display:flex;align-items:center;gap:12px">${bloom({ size: 34, id: "og-bloom" })}<span style="font:600 28px/1 var(--display);letter-spacing:-.02em">drop<span style="color:var(--bloom)">.</span></span></div>
<h1>Every file gets five characters<em>.</em></h1>
<div><span class="u">${esc(host)}/<b>aB3dE</b></span></div>
</div></body></html>`;
}

export function llmsTxt(origin: string) {
  return `# drop

> drop is a small, self-hostable file host, pastebin and URL shortener${BRAND.operator ? `, run here by ${BRAND.operator.name}` : ""}. It runs on Cloudflare Workers or as a Node.js server. Licensed AGPL-3.0-or-later.

- Purpose: share screenshots, files, text snippets and long URLs as short links; built for ShareX, works with curl.
- Limits: ${UI.public ? "visitors without a token can upload images and plain text through the start page (Turnstile check, per-IP limits, deleted after 12 hours at the latest); everything else needs an API token" : "uploads need the owner's API token (this is not a public anonymous upload service)"}; viewing is open only to whoever has a link, there is no public listing; items can expire (10m to 1y or never); multipart uploads up to 95 MB, raw PUT up to 500 MB.
- Uploaded items are not meant to be indexed and send X-Robots-Tag: noindex.

## API (Authorization: Bearer <token>)

- POST ${origin}/api/upload - multipart field "file" (ShareX image/file uploader); optional "expires"
- PUT ${origin}/api/upload?filename=name.ext - raw body for large files
- POST ${origin}/api/paste - "content", optional "lang", "expires" (ShareX text uploader)
- POST ${origin}/api/shorten - "url" (ShareX URL shortener)
- GET ${origin}/api/sharex?type=upload|paste|shorten - ready-made .sxcu config
- Responses: JSON with url, raw, thumbnail, delete, expires_at

## Links

- Source and self-hosting guide: ${sourceUrl()}
${BRAND.operator?.url ? `- Operator: ${BRAND.operator.url}\n` : ""}`;
}

// ---------- imprint, privacy policy, terms of use and content policy (English and German) ----------
/** Operator details come from the LEGAL config (see README); nothing personal is hardcoded here. */
export type LegalInfo = { name: string; business?: string; street: string; city: string; country: { en: string; de: string }; email: string; phone?: string; vatId?: string; authority: string };
type LegalKind = "privacy" | "datenschutz" | "imprint" | "impressum" | "terms" | "nutzungsbedingungen" | "content-policy" | "inhaltsrichtlinie";
const LEGAL_DE = new Set<LegalKind>(["datenschutz", "impressum", "nutzungsbedingungen", "inhaltsrichtlinie"]);
/** `public`: visitors may upload without a token (12 hour items, Turnstile, per-IP limits). */
type LegalOpts = { malwareLookup: boolean; abuseEmail: string | null; requests?: boolean; public?: boolean; logs?: string };
const LEGAL_UPDATED = { en: "Last updated 26 November 2026", de: "Stand: 26. November 2026" };

// Set POSTHOG_LOGS to "eu" or "us" when the Worker's logs are exported to PostHog (see README).
type LogRegion = { en: string; de: string };
const LOG_REGION: Record<string, LogRegion> = { eu: { en: "the EU (Frankfurt)", de: "in der EU (Frankfurt)" }, us: { en: "the USA", de: "in den USA" } };
const logRegion = (v: unknown): LogRegion | null => LOG_REGION[String(v ?? "").trim().toLowerCase()] ?? null;
const errorLogsEn = (where: LogRegion): string => `<h2>Logs at PostHog</h2>
<p>The request logs described under "Hosting" (IP address, approximate location, the address requested and details your browser sends) and the error messages our Worker writes (such as which step failed and the technical ID of the file, text or link concerned) are also sent to PostHog Inc., 2261 Market St. #4008, San Francisco, CA 94114, USA, which stores them for us on servers in ${where.en}. They contain no file contents. We use them only to fix errors and to prevent abuse, and PostHog deletes them after 14 days. The legal basis is our legitimate interest in running drop securely and reliably (Art. 6(1)(f) GDPR). PostHog processes the data as our processor under a data processing agreement (Art. 28 GDPR) that contains the EU standard contractual clauses. More in <a href="https://posthog.com/privacy" rel="noopener">PostHog's privacy policy</a>.</p>
`;
const errorLogsDe = (where: LogRegion): string => `<h2>Protokolle bei PostHog</h2>
<p>Die unter „Hosting“ beschriebenen Anfrageprotokolle (IP-Adresse, ungefährer Standort, aufgerufene Adresse und Angaben, die dein Browser mitsendet) und die Fehlermeldungen, die unser Worker schreibt (etwa welcher Schritt fehlgeschlagen ist und die technische ID der betroffenen Datei, des Texts oder Links), werden außerdem an PostHog Inc., 2261 Market St. #4008, San Francisco, CA 94114, USA, gesendet, die sie für uns auf Servern ${where.de} speichert. Sie enthalten keine Dateiinhalte. Wir nutzen sie nur, um Fehler zu beheben und Missbrauch zu verhindern, und PostHog löscht sie nach 14 Tagen. Rechtsgrundlage ist unser berechtigtes Interesse an einem sicheren und zuverlässigen Betrieb von drop (Art. 6 Abs. 1 lit. f DSGVO). PostHog verarbeitet die Daten als unser Auftragsverarbeiter auf Grundlage eines Auftragsverarbeitungsvertrags (Art. 28 DSGVO), der die EU-Standardvertragsklauseln enthält. Mehr dazu in der <a href="https://posthog.com/privacy" rel="noopener">Datenschutzerklärung von PostHog</a>.</p>
`;


export function legalPage(kind: LegalKind, l: LegalInfo, o: LegalOpts) {
  const de = LEGAL_DE.has(kind);
  const lang = de ? "de" : "en";
  const isPrivacy = kind === "privacy" || kind === "datenschutz";
  const isImprint = kind === "imprint" || kind === "impressum";
  const title = { privacy: "Privacy policy", datenschutz: "Datenschutzerklärung", imprint: "Imprint", impressum: "Impressum", terms: "Terms of use", nutzungsbedingungen: "Nutzungsbedingungen", "content-policy": "Content policy", inhaltsrichtlinie: "Inhaltsrichtlinie" }[kind];
  const other = { privacy: "/datenschutz", datenschutz: "/privacy", imprint: "/impressum", impressum: "/imprint", terms: "/nutzungsbedingungen", nutzungsbedingungen: "/terms", "content-policy": "/inhaltsrichtlinie", inhaltsrichtlinie: "/content-policy" }[kind];
  const mail = `<a href="mailto:${esc(l.email)}">${esc(l.email)}</a>`;
  const address = `<address>${esc(l.name)}<br>${l.business ? `${esc(l.business)}<br>` : ""}${esc(l.street)}<br>${esc(l.city)}<br>${esc(l.country[lang])}</address>`;
  const report = o.abuseEmail ? `<a href="mailto:${esc(o.abuseEmail)}">${esc(o.abuseEmail)}</a>` : mail;
  const body = isPrivacy ? (de ? privacyDe(address, mail, l, o) : privacyEn(address, mail, l, o))
    : isImprint ? imprint(de, address, mail, l, o)
    : kind === "terms" ? termsEn(report, l, o) : kind === "nutzungsbedingungen" ? termsDe(report, l, o)
    : kind === "content-policy" ? contentEn(report, o) : contentDe(report, o);
  return `${head(`${title} · drop.`, "", false, lang)}
.legal{max-width:44em;padding:clamp(28px,5vw,56px) 0 0}
.legal h1{font-size:clamp(32px,4.6vw,48px)}
.legal h2{font-size:22px;margin:36px 0 10px}
.legal p,.legal address{margin:0 0 14px;font-style:normal}
.legal ul{margin:0 0 14px;padding-left:1.2em}.legal li{margin:0 0 8px}
.legal .meta{display:flex;gap:16px;flex-wrap:wrap;margin:14px 0 28px;font-size:14px;color:var(--ink60)}
</style></head><body><div class="wrap">${topbar()}
<main class="legal"><span class="label">${de ? "drop. Rechtliches" : "drop. legal"}</span><h1 style="margin-top:12px">${title}</h1>
<div class="meta">${isImprint ? "" : `<span>${LEGAL_UPDATED[lang]}</span>`}<a href="${other}" hreflang="${de ? "en" : "de"}">${de ? "English" : "Deutsch"}</a></div>
${body}
</main>
${footer(lang)}
</div></body></html>`;
}

function imprint(de: boolean, address: string, mail: string, l: LegalInfo, o: LegalOpts) {
  const phone = l.phone ? `<br>${de ? "Telefon" : "Phone"}: <a href="tel:${esc(l.phone.replace(/[^\d+]/g, ""))}">${esc(l.phone)}</a>` : "";
  const vat = l.vatId ? `<p>${de ? "Umsatzsteuer-Identifikationsnummer gemäß § 27a UStG" : "VAT ID pursuant to § 27a UStG"}: ${esc(l.vatId)}</p>` : "";
  return de
    ? `<p>Angaben gemäß § 5 DDG:</p>${address}<p>E-Mail: ${mail}${phone}</p>${vat}
<h2>Verbraucherstreitbeilegung</h2><p>Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.</p>
<h2>Inhalte von Nutzern</h2>${o.public
      ? `<p>Auf drop kann jeder ohne Token Bilder und Texte hochladen. Diese Inhalte sind nur über ihren Link erreichbar und werden nach spätestens 12 Stunden gelöscht. Wir machen sie uns nicht zu eigen und prüfen sie vor der Veröffentlichung nur automatisch. Lade nichts hoch, was gegen das Recht oder die Rechte anderer verstößt, keine Schadsoftware und keine sexuellen oder gewaltverherrlichenden Inhalte.</p><p>Wenn dir eine Datei auffällt, die gegen das Recht verstößt, schreib uns an ${o.abuseEmail ? `<a href="mailto:${esc(o.abuseEmail)}">${esc(o.abuseEmail)}</a>` : mail} oder nutze „Report this file“ auf ihrer Seite (Meldung nach Art. 16 DSA). Wir prüfen jeden Hinweis und entfernen rechtswidrige Inhalte umgehend.</p>`
      : `<p>Hochladen kann auf drop nur, wer den Token des Betreibers hat. Wenn dir trotzdem eine Datei auffällt, die gegen das Recht verstößt, schreib uns an ${mail}. Wir prüfen den Hinweis und entfernen rechtswidrige Inhalte umgehend.</p>`}
<p>Was auf drop erlaubt ist und wie wir mit Meldungen umgehen, steht in den <a href="/nutzungsbedingungen">Nutzungsbedingungen</a> und der <a href="/inhaltsrichtlinie">Inhaltsrichtlinie</a>.</p>`
    : `<p>Information pursuant to § 5 DDG:</p>${address}<p>Email: ${mail}${phone}</p>${vat}
<h2>Consumer dispute resolution</h2><p>We are not willing or obliged to take part in dispute resolution proceedings before a consumer arbitration board.</p>
<h2>Content uploaded by users</h2>${o.public
      ? `<p>Anyone can upload images and text to drop without a token. These can only be reached through their link and are deleted after 12 hours at the latest. We don't adopt them as our own content, and before they go online they are checked only automatically. Don't upload anything that breaks the law or someone else's rights, no malware and no sexual or glorifying violent content.</p><p>If you come across a file that breaks the law, email us at ${o.abuseEmail ? `<a href="mailto:${esc(o.abuseEmail)}">${esc(o.abuseEmail)}</a>` : mail} or use "Report this file" on its page (notice under Art. 16 DSA). We look into every report and remove unlawful content without delay.</p>`
      : `<p>Only the holder of the operator's token can upload to drop. If you still come across a file that breaks the law, email us at ${mail}. We look into every report and remove unlawful content without delay.</p>`}
<p>What is allowed on drop and how we handle reports is set out in the <a href="/terms">terms of use</a> and the <a href="/content-policy">content policy</a>.</p>`;
}

function privacyEn(address: string, mail: string, l: LegalInfo, o: LegalOpts) {
  return `<p>drop has no accounts for visitors and sets no cookies. There is no tracking or advertising, no analysis of visitors or their behavior, and no automated decision-making about you. This policy covers the personal data that is processed nonetheless when you open drop or a link to a file on it, above all your IP address, and the files themselves.</p>
<h2>Controller</h2>${address}<p>Email: ${mail}</p>
<h2>Hosting</h2>
<p>Cloudflare, Inc., 101 Townsend St., San Francisco, CA 94107, USA, runs drop on our behalf: the pages, the files and the program behind them (a Cloudflare Worker). To do so, Cloudflare processes your IP address, the address of the page you request, the time, and details your browser sends, such as its user agent and the page you came from. You don't have to provide this data, but without it nothing can be shown to you.</p>
<p>Requests that our Worker handles are also logged, including the IP address, the approximate location Cloudflare derives from it, and the address requested. We use these logs only to fix errors and to prevent abuse, and they are deleted after at most 7 days.</p>
<p>To prevent abuse, the Worker counts failed sign-in attempts and requests for links that don't exist, per IP address over one minute, and refuses requests above a limit. The count is held only in the memory of Cloudflare's rate limiter.</p>
<p>Fonts and the code highlighter are fetched by our Worker and delivered from drop itself, so your browser doesn't contact Fontshare, jsDelivr or cdnjs.</p>
<p>The legal basis is our legitimate interest in running drop securely and reliably (Art. 6(1)(f) GDPR). Cloudflare processes the data as our processor under a data processing agreement (Art. 28 GDPR). Cloudflare, Inc. is certified under the EU-U.S. Data Privacy Framework, for which the European Commission has adopted an adequacy decision (Art. 45 GDPR); the agreement also contains the EU standard contractual clauses. More in <a href="https://www.cloudflare.com/privacypolicy/">Cloudflare's privacy policy</a>.</p>
${logRegion(o.logs) ? errorLogsEn(logRegion(o.logs)!) : ""}<h2>Files, texts and short links</h2>
<p>${o.public ? "Anyone can upload files and texts to drop without a token, as described below. Short links and larger files need a token." : o.requests ? "Only we and people we\u2019ve given a token can upload to drop." : "Only we upload to drop, with a token that isn\u2019t public."} Anyone who has the link to a file, text or short link can open it. There is no public list or search of what was uploaded, and nobody can see someone else's uploads. For each one we store the content in Cloudflare R2 and these details in Cloudflare D1 and Workers KV: file name, type, size, upload time, expiry time, a deletion code, a checksum (SHA-256) and the number of times it was opened. The view count is a plain number; it doesn't record who opened the link.</p>
<p>Before a photo is stored, drop removes location data (GPS) from JPEG and PNG files. For images, Cloudflare Workers AI writes a short description, used as alt text, and checks whether the image might be sensitive; Cloudflare's Images service makes a small preview. Both run at Cloudflare as our processor, and the results are stored with the file. Every upload is also checked automatically for programs and harmful content; files that fail the check are held back and can't be opened.${o.malwareLookup ? ` For this check we send the file's checksum, never the file itself, to MalwareBazaar, a database of known malware run by abuse.ch (Bern University of Applied Sciences, Switzerland, a country with an EU adequacy decision).` : ""}</p>
<p>A file is deleted when its expiry time is reached (checked every hour) or when we delete it, together with its details and preview.${o.public ? " Files and texts uploaded without a token expire after 12 hours at the latest, so they are gone within 13 hours." : ""} If a file shows you or concerns you and you want it removed, email us${o.abuseEmail ? ` or use "Report this file" on its page` : ""}. The legal basis for storing and showing files is our legitimate interest in sharing them by link (Art. 6(1)(f) GDPR).</p>
${o.requests ? `<h2>Token requests</h2>
<p>You can ask for a token with the form at /request. We store the name and the answer you enter there, the time of the request, our decision and, once you have collected it, which token was issued, in Cloudflare D1. We don't ask for your email address. Instead you get a private link; we store only a checksum of it, so we can't recover it either. We use the data only to decide on your request and to issue the token (Art. 6(1)(b) GDPR) and delete it 30 days after the request, or 14 days after approval if that is later. Tokens you collect are stored only as a checksum, with the label and expiry date we set.</p>
<p>The form is protected by Cloudflare Turnstile, which checks whether a person or a program is filling it in. For this, your browser loads a script from challenges.cloudflare.com, and Cloudflare processes technical data about your browser and device. Requests are also counted per IP address over one minute, as described above. The legal basis is our legitimate interest in protecting the form from automated abuse (Art. 6(1)(f) GDPR); data Turnstile stores in your browser is strictly necessary for the check you start (§ 25(2) no. 2 TDDDG). More in <a href="https://www.cloudflare.com/turnstile-privacy-policy/">Cloudflare's Turnstile privacy addendum</a>.</p>
` : ""}${o.public ? `<h2>Uploading without a token</h2>
<p>Each upload without a token is protected by Cloudflare Turnstile, which checks whether a person or a program is sending it. For this, your browser loads a script from challenges.cloudflare.com, and Cloudflare processes technical data about your browser and device. More in <a href="https://www.cloudflare.com/turnstile-privacy-policy/">Cloudflare's Turnstile privacy addendum</a>.</p>
<p>To keep drop from being misused as free storage, uploads are counted per IP address: per minute in the memory of Cloudflare's rate limiter, and per day in Cloudflare D1. An IPv6 address is counted by its first 64 bits (its /64 prefix), because one connection usually gets a whole block of addresses and could otherwise switch between them. For the daily count we store neither your IP address nor anything that identifies you, only a checksum of the address combined with the date and a secret key, so it can't be turned back into the address or linked across days, together with the number and total size of today's uploads. These rows are deleted after two days at the latest. The file itself is stored without your IP address.</p>
<p>A file uploaded without a token opens only after the automatic checks described above. Images that Workers AI flags as possibly sensitive stay on hold, and only we can release them. The legal basis for all of this is our legitimate interest in offering drop to everyone while protecting it from abuse and unlawful content (Art. 6(1)(f) GDPR); data Turnstile stores in your browser is strictly necessary for the check you start (§ 25(2) no. 2 TDDDG).</p>
` : ""}<h2>Reports and authorities</h2>
<p>If you report content to us, we use your name, email address and report only to handle it and to tell you what we decided (Art. 6(1)(c) GDPR together with Art. 16 DSA). We delete them six months after the matter is closed, unless we need them longer to defend against legal claims.</p>
<p>If an upload is unlawful, we may keep it and its details after it expires and pass them to law enforcement or other authorities, as far as the law requires or allows. This can include the request logs with IP addresses described above, for as long as they still exist. The legal basis is our legal obligation (Art. 6(1)(c) GDPR) or our legitimate interest in stopping unlawful content and defending legal claims (Art. 6(1)(f) GDPR). The rules for uploads are in the <a href="/terms">terms of use</a> and the <a href="/content-policy">content policy</a>.</p>
<h2>Your browser</h2>
<p>If you have a token and enter it on the start page, your browser keeps it in its local storage under the name "drop_token", so you don't have to enter it again. It isn't a cookie, is only sent to drop with your own requests, and is removed with "Forget token". Visitors without a token store nothing${o.public ? ", apart from what Turnstile needs for its check" : ""}. Storing it is strictly necessary for the function you asked for (§ 25(2) no. 2 TDDDG).</p>
<h2>Email</h2>
<p>If you email us, we use your address and message only to reply (Art. 6(1)(f) GDPR) and delete them once the matter is settled, unless the law requires us to keep them.</p>
<h2>Your rights</h2>
<p>You have the right of access to your personal data (Art. 15 GDPR), to rectification (Art. 16), to erasure (Art. 17), to restriction of processing (Art. 18) and to data portability (Art. 20). To exercise them, email us. You can also lodge a complaint with a data protection supervisory authority (Art. 77 GDPR), for example the one where you live or the one responsible for us: ${esc(l.authority)}.</p>
<h2>Right to object</h2>
<p><strong>You may object at any time, on grounds relating to your particular situation, to the processing of your personal data based on Art. 6(1)(f) GDPR (Art. 21 GDPR).</strong></p>`;
}

function privacyDe(address: string, mail: string, l: LegalInfo, o: LegalOpts) {
  return `<p>drop hat keine Benutzerkonten für Besucher und setzt keine Cookies. Es verwendet keine Tracking- oder Werbedienste, wertet weder Besucher noch ihr Verhalten aus und trifft keine automatisierten Entscheidungen über dich. Diese Erklärung beschreibt, welche personenbezogenen Daten trotzdem verarbeitet werden, wenn du drop oder einen Link zu einer Datei darauf öffnest, vor allem deine IP-Adresse, und was mit den Dateien selbst geschieht.</p>
<h2>Verantwortlicher</h2>${address}<p>E-Mail: ${mail}</p>
<h2>Hosting</h2>
<p>Cloudflare, Inc., 101 Townsend St., San Francisco, CA 94107, USA, betreibt drop in unserem Auftrag: die Seiten, die Dateien und das Programm dahinter (einen Cloudflare Worker). Dazu verarbeitet Cloudflare deine IP-Adresse, die Adresse der aufgerufenen Seite, den Zeitpunkt und Angaben, die dein Browser mitsendet, etwa den User-Agent und die Seite, von der du kommst. Du musst diese Daten nicht bereitstellen, ohne sie kann dir aber nichts angezeigt werden.</p>
<p>Anfragen, die unser Worker bearbeitet, werden zusätzlich protokolliert, samt IP-Adresse, dem ungefähren Standort, den Cloudflare daraus ableitet, und der aufgerufenen Adresse. Wir nutzen diese Protokolle nur, um Fehler zu beheben und Missbrauch zu verhindern; sie werden nach spätestens 7 Tagen gelöscht.</p>
<p>Um Missbrauch zu verhindern, zählt der Worker fehlgeschlagene Anmeldeversuche und Aufrufe von Links, die es nicht gibt, je IP-Adresse über eine Minute und weist Anfragen oberhalb einer Grenze ab. Die Zählung liegt nur im Arbeitsspeicher von Cloudflares Rate-Limiter.</p>
<p>Schriften und die Code-Hervorhebung lädt unser Worker selbst und liefert sie von drop aus, dein Browser verbindet sich also nicht mit Fontshare, jsDelivr oder cdnjs.</p>
<p>Rechtsgrundlage ist unser berechtigtes Interesse an einem sicheren und zuverlässigen Betrieb von drop (Art. 6 Abs. 1 lit. f DSGVO). Cloudflare verarbeitet die Daten als unser Auftragsverarbeiter auf Grundlage eines Auftragsverarbeitungsvertrags (Art. 28 DSGVO). Cloudflare, Inc. ist nach dem EU-U.S. Data Privacy Framework zertifiziert, für das ein Angemessenheitsbeschluss der Europäischen Kommission besteht (Art. 45 DSGVO); der Vertrag enthält zusätzlich die EU-Standardvertragsklauseln. Mehr dazu in der <a href="https://www.cloudflare.com/de-de/privacypolicy/">Datenschutzerklärung von Cloudflare</a>.</p>
${logRegion(o.logs) ? errorLogsDe(logRegion(o.logs)!) : ""}<h2>Dateien, Texte und Kurzlinks</h2>
<p>${o.public ? "Dateien und Texte kann jeder ohne Token auf drop hochladen, wie unten beschrieben. Für Kurzlinks und größere Dateien braucht es einen Token." : o.requests ? "Hochladen können auf drop nur wir und Personen, denen wir einen Token gegeben haben." : "Hochladen können auf drop nur wir, mit einem Token, der nicht öffentlich ist."} Wer den Link zu einer Datei, einem Text oder einem Kurzlink hat, kann ihn öffnen. Eine öffentliche Liste oder Suche der Uploads gibt es nicht, und niemand sieht die Uploads anderer. Zu jedem Eintrag speichern wir den Inhalt in Cloudflare R2 und diese Angaben in Cloudflare D1 und Workers KV: Dateiname, Typ, Größe, Zeitpunkt des Hochladens, Ablaufzeitpunkt, einen Löschcode, eine Prüfsumme (SHA-256) und wie oft er aufgerufen wurde. Die Aufrufzahl ist eine bloße Zahl; wer den Link geöffnet hat, wird nicht festgehalten.</p>
<p>Bevor ein Foto gespeichert wird, entfernt drop Standortdaten (GPS) aus JPEG- und PNG-Dateien. Für Bilder schreibt Cloudflare Workers AI eine kurze Beschreibung, die als Alternativtext dient, und prüft, ob das Bild heikel sein könnte; Cloudflares Images-Dienst erstellt eine kleine Vorschau. Beides läuft bei Cloudflare als unserem Auftragsverarbeiter, die Ergebnisse werden mit der Datei gespeichert. Außerdem wird jede Datei automatisch auf Programme und schädliche Inhalte geprüft; Dateien, die dabei auffallen, werden zurückgehalten und lassen sich nicht öffnen.${o.malwareLookup ? ` Für diese Prüfung senden wir die Prüfsumme der Datei, nie die Datei selbst, an MalwareBazaar, eine Datenbank bekannter Schadsoftware von abuse.ch (Berner Fachhochschule, Schweiz, ein Land mit Angemessenheitsbeschluss der EU).` : ""}</p>
<p>Eine Datei wird gelöscht, wenn ihr Ablaufzeitpunkt erreicht ist (stündlich geprüft) oder wenn wir sie löschen, zusammen mit ihren Angaben und der Vorschau.${o.public ? " Dateien und Texte, die ohne Token hochgeladen wurden, laufen nach spätestens 12 Stunden ab und sind damit nach spätestens 13 Stunden gelöscht." : ""} Wenn eine Datei dich zeigt oder betrifft und du sie entfernt haben möchtest, schreib uns${o.abuseEmail ? `, etwa über „Report this file“ auf ihrer Seite` : ""}. Rechtsgrundlage für das Speichern und Anzeigen von Dateien ist unser berechtigtes Interesse, sie per Link zu teilen (Art. 6 Abs. 1 lit. f DSGVO).</p>
${o.requests ? `<h2>Token-Anfragen</h2>
<p>Über das Formular unter /request kannst du einen Token anfragen. Wir speichern den Namen und die Antwort, die du dort eingibst, den Zeitpunkt der Anfrage, unsere Entscheidung und, sobald du ihn abgeholt hast, welcher Token ausgegeben wurde, in Cloudflare D1. Nach deiner E-Mail-Adresse fragen wir nicht. Stattdessen bekommst du einen privaten Link; davon speichern wir nur eine Prüfsumme, können ihn also auch selbst nicht wiederherstellen. Wir nutzen die Daten nur, um über deine Anfrage zu entscheiden und den Token auszugeben (Art. 6 Abs. 1 lit. b DSGVO), und löschen sie 30 Tage nach der Anfrage, oder 14 Tage nach der Freigabe, falls das später ist. Abgeholte Tokens werden nur als Prüfsumme gespeichert, mit der Bezeichnung und dem Ablaufdatum, die wir festlegen.</p>
<p>Das Formular ist durch Cloudflare Turnstile geschützt, das prüft, ob ein Mensch oder ein Programm es ausfüllt. Dazu lädt dein Browser ein Skript von challenges.cloudflare.com, und Cloudflare verarbeitet technische Daten über deinen Browser und dein Gerät. Außerdem werden Anfragen je IP-Adresse über eine Minute gezählt, wie oben beschrieben. Rechtsgrundlage ist unser berechtigtes Interesse, das Formular vor automatisiertem Missbrauch zu schützen (Art. 6 Abs. 1 lit. f DSGVO); was Turnstile dafür in deinem Browser speichert, ist für die von dir gestartete Prüfung unbedingt erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG). Mehr dazu im <a href="https://www.cloudflare.com/turnstile-privacy-policy/">Turnstile-Datenschutzhinweis von Cloudflare</a>.</p>
` : ""}${o.public ? `<h2>Hochladen ohne Token</h2>
<p>Jeder Upload ohne Token ist durch Cloudflare Turnstile geschützt, das prüft, ob ein Mensch oder ein Programm ihn sendet. Dazu lädt dein Browser ein Skript von challenges.cloudflare.com, und Cloudflare verarbeitet technische Daten über deinen Browser und dein Gerät. Mehr dazu im <a href="https://www.cloudflare.com/turnstile-privacy-policy/">Turnstile-Datenschutzhinweis von Cloudflare</a>.</p>
<p>Damit drop nicht als kostenloser Speicher missbraucht wird, zählen wir Uploads je IP-Adresse: pro Minute im Arbeitsspeicher von Cloudflares Rate-Limiter und pro Tag in Cloudflare D1. Eine IPv6-Adresse zählt dabei mit ihren ersten 64 Bit (ihrem /64-Präfix), weil ein Anschluss meist einen ganzen Block von Adressen bekommt und sonst zwischen ihnen wechseln könnte. Für die Tageszählung speichern wir weder deine IP-Adresse noch etwas, das dich erkennbar macht, sondern nur eine Prüfsumme aus der Adresse, dem Datum und einem geheimen Schlüssel, die sich nicht in die Adresse zurückrechnen oder über Tage hinweg verknüpfen lässt, dazu Anzahl und Gesamtgröße der heutigen Uploads. Diese Einträge werden nach spätestens zwei Tagen gelöscht. Die Datei selbst wird ohne deine IP-Adresse gespeichert.</p>
<p>Eine ohne Token hochgeladene Datei lässt sich erst nach den oben beschriebenen automatischen Prüfungen öffnen. Bilder, die Workers AI als möglicherweise heikel einstuft, bleiben zurückgehalten, und nur wir können sie freigeben. Rechtsgrundlage ist unser berechtigtes Interesse, drop allen anzubieten und es zugleich vor Missbrauch und rechtswidrigen Inhalten zu schützen (Art. 6 Abs. 1 lit. f DSGVO); was Turnstile dafür in deinem Browser speichert, ist für die von dir gestartete Prüfung unbedingt erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG).</p>
` : ""}<h2>Meldungen und Behörden</h2>
<p>Wenn du uns einen Inhalt meldest, nutzen wir deinen Namen, deine E-Mail-Adresse und deine Meldung nur, um sie zu bearbeiten und dir unsere Entscheidung mitzuteilen (Art. 6 Abs. 1 lit. c DSGVO in Verbindung mit Art. 16 DSA). Wir löschen sie sechs Monate nach Abschluss der Sache, außer wir brauchen sie länger, um uns gegen rechtliche Ansprüche zu verteidigen.</p>
<p>Ist ein Upload rechtswidrig, können wir ihn und seine Angaben über den Ablauf hinaus aufbewahren und an Strafverfolgungs- oder andere Behörden weitergeben, soweit das Gesetz es verlangt oder erlaubt. Dazu können die oben beschriebenen Protokolle mit IP-Adressen gehören, solange sie noch vorhanden sind. Rechtsgrundlage ist unsere rechtliche Verpflichtung (Art. 6 Abs. 1 lit. c DSGVO) oder unser berechtigtes Interesse, rechtswidrige Inhalte zu unterbinden und rechtliche Ansprüche abzuwehren (Art. 6 Abs. 1 lit. f DSGVO). Die Regeln für Uploads stehen in den <a href="/nutzungsbedingungen">Nutzungsbedingungen</a> und der <a href="/inhaltsrichtlinie">Inhaltsrichtlinie</a>.</p>
<h2>Dein Browser</h2>
<p>Wenn du einen Token hast und ihn auf der Startseite eingibst, speichert dein Browser ihn in seinem lokalen Speicher unter dem Namen „drop_token“, damit du ihn nicht erneut eingeben musst. Er ist kein Cookie, wird nur mit deinen eigenen Anfragen an drop gesendet und mit „Forget token“ entfernt. Für Besucher ohne Token wird nichts gespeichert${o.public ? ", außer dem, was Turnstile für seine Prüfung braucht" : ""}. Das Speichern ist für die von dir gewünschte Funktion unbedingt erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG).</p>
<h2>E-Mail</h2>
<p>Wenn du uns schreibst, nutzen wir deine Adresse und Nachricht nur, um dir zu antworten (Art. 6 Abs. 1 lit. f DSGVO), und löschen sie, sobald die Sache erledigt ist, es sei denn, das Gesetz verpflichtet uns zur Aufbewahrung.</p>
<h2>Deine Rechte</h2>
<p>Du hast das Recht auf Auskunft über deine personenbezogenen Daten (Art. 15 DSGVO), auf Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18) und Datenübertragbarkeit (Art. 20). Schreib uns dazu eine E-Mail. Außerdem kannst du dich bei einer Datenschutz-Aufsichtsbehörde beschweren (Art. 77 DSGVO), etwa bei der an deinem Wohnort oder bei der für uns zuständigen: ${esc(l.authority)}.</p>
<h2>Widerspruchsrecht</h2>
<p><strong>Du kannst der Verarbeitung deiner personenbezogenen Daten auf Grundlage von Art. 6 Abs. 1 lit. f DSGVO jederzeit aus Gründen widersprechen, die sich aus deiner besonderen Situation ergeben (Art. 21 DSGVO).</strong></p>`;
}

// Terms of use and content policy. Written for a German operator: hosting service under the Digital
// Services Act (DSA) and the Digitale-Dienste-Gesetz (DDG). Check them against your own setup.
function termsEn(report: string, l: LegalInfo, o: LegalOpts) {
  const who = esc(l.business || l.name);
  return `<p>drop is run by ${who}, as named in the <a href="/imprint">imprint</a> ("we"). These terms apply to everyone who uploads, pastes, shortens or opens something on drop, whether in the browser, with ShareX, with curl or any other client. By uploading you accept them, together with the <a href="/content-policy">content policy</a>, which is part of them. If you don't accept them, don't upload anything.</p>
<h2>What drop is</h2>
<p>drop stores files, texts and short links and gives each one a link. It is free and has no accounts. ${o.public ? "Without a token you can upload images and plain text up to the limits shown on the start page, and everything uploaded that way is deleted after 12 hours at the latest. " : ""}Tokens are personal. We hand them out at our discretion and can revoke them at any time, so don't pass yours on.</p>
<h2>You are responsible for your uploads</h2>
<p>You are responsible for everything you upload and for everyone you share the link with. By uploading you confirm that you are allowed to: the content is legal in Germany and where you are, you own the rights to it or have permission to share it, and the people who can be recognized in it have agreed. What isn't allowed on drop is listed in the <a href="/content-policy">content policy</a>.</p>
<p>You keep all rights to what you upload. You only allow us what we need to run drop: to store it, check it, make previews and deliver it to whoever opens the link, until it expires or is deleted.</p>
<h2>Our role as host</h2>
<p>We store content on behalf of the people who upload it. That makes us a hosting service under Art. 6 of the Digital Services Act (DSA). We don't adopt uploads as our own and we aren't liable for them, as long as we don't know they are unlawful, and as long as we remove or block them quickly once we do.</p>
<p>We have no general obligation to monitor uploads (Art. 8 DSA). We still check every upload automatically on our own initiative, as described in the <a href="/privacy">privacy policy</a> (Art. 7 DSA). These checks miss things. A file that passed them is not one we have looked at or approved.</p>
<h2>What we can do</h2>
<p>We can delete or block any upload, revoke a token or refuse uploads from a connection, at any time and without notice, if we believe it breaks these terms or the law, or puts drop or other people at risk. If content is unlawful, we keep what the law requires and pass it on to the authorities, as the <a href="/content-policy">content policy</a> explains. Where we know how to reach you, for example because you hold a token, we tell you what we removed and why (Art. 17 DSA). If you think we got it wrong, email us at ${report} and we'll look at it again.</p>
<h2>Reporting content</h2>
<p>If you come across something on drop that is illegal or breaks the content policy, email ${report} or use "Report this file" on its page. What a report should contain, and what happens next, is in the <a href="/content-policy#report">content policy</a> (Art. 16 DSA).</p>
<h2>Points of contact</h2>
<p>Our single point of contact under Art. 11 and 12 DSA, for authorities in the EU member states, the European Commission, the European Board for Digital Services and for everyone who uses drop, is ${report}. We answer in English and German.</p>
<h2>No warranty</h2>
<p>drop is free and provided as it is. We don't promise that it is available or fast, or that it keeps your files: a link can stop working and a file can be lost at any time, and we can change or shut down drop without notice. Keep your own copy of anything that matters.</p>
<h2>Liability</h2>
<p>We are liable without limitation for intent and gross negligence, for injury to life, body or health, and wherever mandatory law such as the German Product Liability Act requires it. Beyond that, since drop is free, we are not liable, including for lost files, links that stop working or downtime.</p>
<p>If someone brings a claim against us because of content you uploaded or a link you shared, and you are responsible for it, you indemnify us against that claim, including reasonable legal costs.</p>
<h2>Changes and applicable law</h2>
<p>We can change these terms for future uploads. The version on this page when you upload something applies to that upload. German law applies. If you are a consumer living in another country, the mandatory consumer protection rules of that country still apply to you. If one clause of these terms is invalid, the others remain in force.</p>
<p>This page is a translation. If it differs from the <a href="/nutzungsbedingungen">German version</a>, the German version applies.</p>`;
}

function termsDe(report: string, l: LegalInfo, o: LegalOpts) {
  const who = esc(l.business || l.name);
  return `<p>drop wird von ${who} betrieben, wie im <a href="/impressum">Impressum</a> angegeben („wir“). Diese Bedingungen gelten für alle, die auf drop etwas hochladen, einfügen, kürzen oder öffnen, egal ob im Browser, mit ShareX, mit curl oder einem anderen Programm. Mit dem Hochladen akzeptierst du sie, zusammen mit der <a href="/inhaltsrichtlinie">Inhaltsrichtlinie</a>, die Teil dieser Bedingungen ist. Wenn du sie nicht akzeptierst, lade nichts hoch.</p>
<h2>Was drop ist</h2>
<p>drop speichert Dateien, Texte und Kurzlinks und gibt jedem Eintrag einen Link. Es ist kostenlos und hat keine Benutzerkonten. ${o.public ? "Ohne Token kannst du Bilder und reinen Text bis zu den Grenzen hochladen, die auf der Startseite stehen; alles, was so hochgeladen wird, ist nach spätestens 12 Stunden gelöscht. " : ""}Tokens sind persönlich. Wir vergeben sie nach eigenem Ermessen und können sie jederzeit widerrufen, gib deinen also nicht weiter.</p>
<h2>Du bist für deine Uploads verantwortlich</h2>
<p>Du bist für alles verantwortlich, was du hochlädst, und für alle, mit denen du den Link teilst. Mit dem Hochladen bestätigst du, dass du das darfst: Der Inhalt ist in Deutschland und dort, wo du bist, legal, du hast die Rechte daran oder die Erlaubnis, ihn zu teilen, und die Personen, die darauf erkennbar sind, sind einverstanden. Was auf drop nicht erlaubt ist, steht in der <a href="/inhaltsrichtlinie">Inhaltsrichtlinie</a>.</p>
<p>Alle Rechte an deinen Inhalten bleiben bei dir. Du erlaubst uns nur, was wir für den Betrieb von drop brauchen: sie zu speichern, zu prüfen, Vorschauen zu erstellen und sie an alle auszuliefern, die den Link öffnen, bis sie ablaufen oder gelöscht werden.</p>
<h2>Unsere Rolle als Hoster</h2>
<p>Wir speichern Inhalte im Auftrag derer, die sie hochladen. Damit sind wir ein Hosting-Dienst nach Art. 6 des Gesetzes über digitale Dienste (Digital Services Act, DSA). Wir machen uns Uploads nicht zu eigen und haften nicht für sie, solange wir keine Kenntnis davon haben, dass sie rechtswidrig sind, und solange wir sie zügig entfernen oder sperren, sobald wir davon erfahren.</p>
<p>Eine allgemeine Pflicht, Uploads zu überwachen, haben wir nicht (Art. 8 DSA). Trotzdem prüfen wir jeden Upload aus eigenem Antrieb automatisch, wie in der <a href="/datenschutz">Datenschutzerklärung</a> beschrieben (Art. 7 DSA). Diese Prüfungen übersehen manches. Eine Datei, die sie bestanden hat, haben wir weder angesehen noch freigegeben.</p>
<h2>Was wir tun können</h2>
<p>Wir können jeden Upload löschen oder sperren, einen Token widerrufen oder Uploads von einer Verbindung ablehnen, jederzeit und ohne Ankündigung, wenn wir annehmen, dass er gegen diese Bedingungen oder das Recht verstößt oder drop oder andere gefährdet. Ist ein Inhalt rechtswidrig, bewahren wir auf, was das Gesetz verlangt, und geben es an die Behörden weiter, wie in der <a href="/inhaltsrichtlinie">Inhaltsrichtlinie</a> beschrieben. Wenn wir wissen, wie wir dich erreichen, etwa weil du einen Token hast, sagen wir dir, was wir entfernt haben und warum (Art. 17 DSA). Wenn du meinst, dass wir uns geirrt haben, schreib uns an ${report}, dann sehen wir es uns noch einmal an.</p>
<h2>Inhalte melden</h2>
<p>Wenn dir auf drop etwas auffällt, das rechtswidrig ist oder gegen die Inhaltsrichtlinie verstößt, schreib an ${report} oder nutze „Report this file“ auf seiner Seite. Was eine Meldung enthalten sollte und was danach passiert, steht in der <a href="/inhaltsrichtlinie#melden">Inhaltsrichtlinie</a> (Art. 16 DSA).</p>
<h2>Kontaktstellen</h2>
<p>Unsere zentrale Kontaktstelle nach Art. 11 und 12 DSA, für Behörden der EU-Mitgliedstaaten, die Europäische Kommission, das Europäische Gremium für digitale Dienste und für alle, die drop nutzen, ist ${report}. Wir antworten auf Deutsch und Englisch.</p>
<h2>Keine Gewähr</h2>
<p>drop ist kostenlos und wird so bereitgestellt, wie es ist. Wir versprechen nicht, dass es erreichbar oder schnell ist oder deine Dateien aufbewahrt: Ein Link kann jederzeit aufhören zu funktionieren, eine Datei kann verloren gehen, und wir können drop ohne Ankündigung ändern oder einstellen. Behalte von allem, was dir wichtig ist, eine eigene Kopie.</p>
<h2>Haftung</h2>
<p>Wir haften unbeschränkt bei Vorsatz und grober Fahrlässigkeit, bei Verletzung von Leben, Körper oder Gesundheit und überall dort, wo zwingendes Recht wie das Produkthaftungsgesetz es vorschreibt. Darüber hinaus haften wir nicht, weil drop kostenlos ist, auch nicht für verlorene Dateien, Links, die nicht mehr funktionieren, oder Ausfälle.</p>
<p>Macht jemand wegen eines Inhalts, den du hochgeladen hast, oder eines Links, den du geteilt hast, Ansprüche gegen uns geltend und hast du das zu vertreten, stellst du uns von diesen Ansprüchen frei, einschließlich angemessener Kosten der Rechtsverteidigung.</p>
<h2>Änderungen und anwendbares Recht</h2>
<p>Wir können diese Bedingungen für künftige Uploads ändern. Für einen Upload gilt die Fassung, die beim Hochladen auf dieser Seite steht. Es gilt deutsches Recht. Wenn du Verbraucher bist und in einem anderen Land lebst, gelten für dich zusätzlich die zwingenden Verbraucherschutzvorschriften dieses Landes. Ist eine Bestimmung dieser Bedingungen unwirksam, bleiben die übrigen wirksam.</p>`;
}

function contentEn(report: string, o: LegalOpts) {
  return `<p>This page lists what you can't upload to drop. It applies to files, texts and short links, with or without a token, and is part of the <a href="/terms">terms of use</a>. If you aren't sure whether something is fine, don't upload it.</p>
<h2>Not allowed on drop</h2>
<ul>
<li>Sexual content involving minors, in any form, including drawings and AI-generated images. We report every case to law enforcement.</li>
<li>Pornography and other sexually explicit material, even if it is legal and everyone in it is an adult. drop isn't the place for it.</li>
<li>Intimate images of a person shared without their consent, and sexual deepfakes of real people.</li>
<li>Terrorist content, depictions of real violence, gore and cruelty to animals, and anything that glorifies them.</li>
<li>Incitement to hatred or violence, threats, harassment, and symbols of banned organizations.</li>
<li>Other people's personal data without their permission, such as addresses, ID documents, passwords or leaked databases.</li>
<li>Malware, phishing, scams and spam, and short links that lead to them or hide where they lead.</li>
<li>Material that infringes copyright, trademarks or other people's rights, such as films, music, games, software or paid content you aren't allowed to share.</li>
<li>Anything else that is illegal in Germany or helps someone commit a crime, for example offers of drugs, weapons or forged documents.</li>
</ul>
<p>Don't use drop as storage or a content delivery network for another service, don't upload in bulk with scripts${o.public ? " without a token" : ""}, and don't try to get around our limits or checks, for example by switching addresses or automating Turnstile.</p>
<h2>How we enforce it</h2>
<p>Every upload is checked automatically. Archives that contain programs${o.malwareLookup ? " and files that match known malware" : ""} are held back and can't be opened.${o.public ? " Without a token, drop only accepts images and plain text whose name matches their contents. A file opens only after its checks, every frame of an animated GIF is checked, and images that look sexual or otherwise sensitive stay on hold until we have looked at them." : ""} These checks help, but they are no guarantee, and you remain responsible for what you upload.</p>
<p>If something breaks this policy, we delete or block it without notice and can revoke the token or refuse further uploads from the connection it came from. If we become aware of information that gives rise to a suspicion of a criminal offence involving a threat to someone's life or safety, we inform the police (Art. 18 DSA). Sexual content involving minors is reported to law enforcement in every case. Removal orders from authorities, including for terrorist content under Regulation (EU) 2021/784, are carried out within one hour. Where the law requires it, we keep the file and its details for the authorities instead of deleting them straight away.</p>
<h2 id="report">Report content</h2>
<p>Email ${report} or use "Report this file" on the file's page. This is how you notify us under Art. 16 DSA. To let us act on your report, include:</p>
<ul>
<li>the link or links to the content,</li>
<li>why you think it is illegal or breaks this policy, naming the law if you know it,</li>
<li>your name and email address, unless you are reporting sexual content involving minors, where you may stay anonymous,</li>
<li>a statement that you believe in good faith that your report is accurate and complete.</li>
</ul>
<p>We confirm that we received your report, look into it without delay and tell you what we decided${o.public ? ". Content uploaded without a token is gone after 12 hours anyway, but we act on reports straight away and don't wait for it to expire" : ""}. Reports of sexual content involving minors and of terrorist content come first. For a copyright or trademark report, also tell us which work or mark is affected and that you hold the rights or act for whoever does.</p>
<p>You can also report sexual content involving minors directly to the police or to a hotline such as the <a href="https://www.internet-beschwerdestelle.de/en/">Internet-Beschwerdestelle</a> or <a href="https://www.jugendschutz.net/en/">jugendschutz.net</a>, and illegal content in other EU countries to a hotline of the <a href="https://www.inhope.org/">INHOPE network</a>.</p>
<p>This page is a translation. If it differs from the <a href="/inhaltsrichtlinie">German version</a>, the German version applies.</p>`;
}

function contentDe(report: string, o: LegalOpts) {
  return `<p>Auf dieser Seite steht, was du nicht auf drop hochladen darfst. Sie gilt für Dateien, Texte und Kurzlinks, mit oder ohne Token, und ist Teil der <a href="/nutzungsbedingungen">Nutzungsbedingungen</a>. Wenn du nicht sicher bist, ob etwas in Ordnung ist, lade es nicht hoch.</p>
<h2>Auf drop nicht erlaubt</h2>
<ul>
<li>Sexuelle Darstellungen von Minderjährigen in jeder Form, auch Zeichnungen und KI-generierte Bilder. Jeden Fall zeigen wir bei den Strafverfolgungsbehörden an.</li>
<li>Pornografie und andere sexuell explizite Inhalte, auch wenn sie legal sind und alle darauf erwachsen sind. Dafür ist drop nicht da.</li>
<li>Intime Aufnahmen einer Person, die ohne ihre Einwilligung geteilt werden, und sexuelle Deepfakes realer Personen.</li>
<li>Terroristische Inhalte, Darstellungen echter Gewalt, Gore und Tierquälerei sowie alles, was sie verherrlicht.</li>
<li>Volksverhetzung, Aufrufe zu Gewalt, Drohungen, Belästigung und Kennzeichen verbotener Organisationen.</li>
<li>Personenbezogene Daten anderer ohne deren Erlaubnis, etwa Adressen, Ausweise, Passwörter oder geleakte Datenbanken.</li>
<li>Schadsoftware, Phishing, Betrug und Spam, und Kurzlinks, die dorthin führen oder verschleiern, wohin sie führen.</li>
<li>Inhalte, die Urheberrechte, Marken oder andere Rechte Dritter verletzen, etwa Filme, Musik, Spiele, Software oder bezahlte Inhalte, die du nicht teilen darfst.</li>
<li>Alles andere, was in Deutschland verboten ist oder jemandem hilft, eine Straftat zu begehen, zum Beispiel Angebote von Drogen, Waffen oder gefälschten Dokumenten.</li>
</ul>
<p>Nutze drop nicht als Speicher oder Content-Delivery-Netzwerk für einen anderen Dienst, lade nicht massenhaft per Skript hoch${o.public ? ", wenn du keinen Token hast," : ""} und versuche nicht, unsere Grenzen oder Prüfungen zu umgehen, etwa durch wechselnde Adressen oder automatisiertes Lösen von Turnstile.</p>
<h2>Wie wir das durchsetzen</h2>
<p>Jeder Upload wird automatisch geprüft. Archive mit Programmen${o.malwareLookup ? " und Dateien, die bekannter Schadsoftware entsprechen," : ""} werden zurückgehalten und lassen sich nicht öffnen.${o.public ? " Ohne Token nimmt drop nur Bilder und reinen Text an, deren Dateiname zum Inhalt passt. Eine Datei lässt sich erst nach ihren Prüfungen öffnen, bei animierten GIFs wird jedes Bild geprüft, und Bilder, die sexuell oder anderweitig heikel wirken, bleiben gesperrt, bis wir sie angesehen haben." : ""} Diese Prüfungen helfen, sind aber keine Garantie, und für deine Uploads bleibst du verantwortlich.</p>
<p>Verstößt etwas gegen diese Richtlinie, löschen oder sperren wir es ohne Ankündigung und können den Token widerrufen oder weitere Uploads von der Verbindung ablehnen, von der es kam. Erfahren wir von Informationen, die den Verdacht einer Straftat begründen, die das Leben oder die Sicherheit von Personen bedroht, informieren wir die Polizei (Art. 18 DSA). Sexuelle Darstellungen von Minderjährigen zeigen wir in jedem Fall an. Entfernungsanordnungen von Behörden, auch für terroristische Inhalte nach der Verordnung (EU) 2021/784, setzen wir innerhalb einer Stunde um. Wo das Gesetz es verlangt, bewahren wir die Datei und ihre Angaben für die Behörden auf, statt sie sofort zu löschen.</p>
<h2 id="melden">Inhalte melden</h2>
<p>Schreib an ${report} oder nutze „Report this file“ auf der Seite der Datei. So meldest du uns Inhalte nach Art. 16 DSA. Damit wir handeln können, gib bitte an:</p>
<ul>
<li>den Link oder die Links zu dem Inhalt,</li>
<li>warum du ihn für rechtswidrig hältst oder er gegen diese Richtlinie verstößt, wenn möglich mit der betroffenen Vorschrift,</li>
<li>deinen Namen und deine E-Mail-Adresse, außer du meldest sexuelle Darstellungen von Minderjährigen, dann darfst du anonym bleiben,</li>
<li>eine Erklärung, dass du in gutem Glauben davon überzeugt bist, dass deine Angaben richtig und vollständig sind.</li>
</ul>
<p>Wir bestätigen dir den Eingang, prüfen die Meldung unverzüglich und teilen dir unsere Entscheidung mit${o.public ? ". Inhalte ohne Token sind nach 12 Stunden ohnehin gelöscht, wir handeln aber sofort und warten nicht, bis sie ablaufen" : ""}. Meldungen zu sexuellen Darstellungen von Minderjährigen und zu terroristischen Inhalten bearbeiten wir zuerst. Bei einer Meldung wegen Urheber- oder Markenrechten nenne bitte auch das betroffene Werk oder die Marke und dass du die Rechte daran hast oder für den Rechteinhaber handelst.</p>
<p>Sexuelle Darstellungen von Minderjährigen kannst du auch direkt der Polizei oder einer Beschwerdestelle wie der <a href="https://www.internet-beschwerdestelle.de/">Internet-Beschwerdestelle</a> oder <a href="https://www.jugendschutz.net/">jugendschutz.net</a> melden, rechtswidrige Inhalte in anderen EU-Ländern einer Stelle des <a href="https://www.inhope.org/">INHOPE-Netzwerks</a>.</p>`;
}

// ---------- token requests ----------
const REQ_CSS = `.req{display:grid;grid-template-columns:1.1fr 1fr;gap:clamp(24px,5vw,64px);padding:clamp(32px,6vw,64px) 0 0;align-items:start}
.req h1{font-size:clamp(34px,4.8vw,56px);line-height:1.04}
.req .lead{font-size:17px;color:var(--ink60);margin:18px 0 0;max-width:30em}
.req form{display:grid;gap:16px}
.req label.f{display:grid;gap:6px;font:500 14px/1.3 var(--sans)}
.req textarea{min-height:120px;font:15px/1.55 var(--sans)}
.req .small{font-size:13px;color:var(--ink60);margin:0}
.req .err{color:var(--root);font-size:14px;margin:0}
.hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
.code{display:flex;align-items:center;gap:10px;background:var(--ink);color:#f4eef0;border-radius:14px;padding:12px 12px 12px 18px;margin:22px auto 0;max-width:36em;text-align:left}
.code code{flex:1;font:500 14px/1.5 var(--mono);word-break:break-all}
.code button{appearance:none;border:0;border-radius:999px;background:rgba(255,255,255,.12);color:#f4eef0;font:500 12px/1 var(--mono);padding:8px 12px;cursor:pointer}
.code button:hover{background:var(--bloom)}
@media (max-width:760px){.req{grid-template-columns:1fr}}`;
const COPY_JS = `<script>document.querySelectorAll('[data-copy]').forEach(function(b){b.onclick=function(){navigator.clipboard.writeText(b.dataset.copy).then(function(){b.textContent='Copied';setTimeout(function(){b.textContent='Copy'},1600)},function(){})}})</script>`;
const codeBox = (v: string) => `<div class="code"><code>${esc(v)}</code><button type="button" data-copy="${esc(v)}">Copy</button></div>`;

/** Public form to ask for an API token. Protected by Turnstile (and, at the edge, a managed challenge). */
export function requestPage(siteKey: string, o: { error?: string; name?: string; reason?: string } = {}) {
  return `${head("Ask for a token · drop.", `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>`)}${REQ_CSS}</style></head><body><div class="wrap">${topbar()}
<section class="req">
  <div><span class="label">token request</span><h1 style="margin-top:14px">Ask for a token<em>.</em></h1>
  <p class="lead">Tell us who you are and what you’d like to share. If it’s a yes, you pick up the token through a private link that you get on the next page.</p></div>
  <form class="panel" method="post" action="/request">
    <label class="f">Your name<input name="name" required minlength="2" maxlength="80" autocomplete="name" value="${esc(o.name || "")}"></label>
    <label class="f">What do you want to upload?<textarea name="reason" required minlength="10" maxlength="600" placeholder="Screenshots from ShareX for our team chat">${esc(o.reason || "")}</textarea></label>
    <div class="hp" aria-hidden="true"><label>Leave this empty<input name="website" tabindex="-1" autocomplete="off"></label></div>
    <div class="cf-turnstile" data-sitekey="${esc(siteKey)}" data-action="token-request" data-theme="light" data-size="flexible"></div>
    ${o.error ? `<p class="err" role="alert">${esc(o.error)}</p>` : ""}
    <div class="row"><button class="btn" type="submit">Send request</button></div>
    <p class="small">We keep your name and answer for 30 days, then delete them. More in the <a href="/privacy">privacy policy</a>.</p>
  </form>
</section>
${footer()}
</div></body></html>`;
}

/** After sending: the claim link is shown once. */
export function requestSentPage(claimUrl: string) {
  return simplePage("Request sent · drop.", "request sent", "Request sent<em>.</em>", "Keep this link. It’s the only way to collect your token once it’s approved, and we can’t show it to you again.", `${codeBox(claimUrl)}${COPY_JS}`, REQ_CSS);
}

/** What the claim link shows, depending on where the request stands. */
export function requestStatusPage(state: "pending" | "approved" | "rejected" | "claimed" | "lapsed") {
  const back = `<a class="btn" href="/">Back to drop</a>`;
  switch (state) {
    case "pending": return simplePage("In review · drop.", "in review", "Still in review<em>.</em>", "Nobody has looked at your request yet. This link keeps working, so check back later.", back);
    case "approved": return simplePage("Approved · drop.", "approved", "Approved<em>.</em>", "Your token is ready. It’s shown only once, so have somewhere to paste it.", `<form method="post"><button class="btn" type="submit">Show my token</button></form>`);
    case "rejected": return simplePage("Not approved · drop.", "not approved", "Not approved<em>.</em>", "Sorry, we can’t give you a token for this. You can still run your own drop with the code on GitHub.", back);
    case "claimed": return simplePage("Collected · drop.", "collected", "Already collected<em>.</em>", "This token was shown once and can’t be shown again. If you lost it, ask for a new one.", `<a class="btn" href="/request">Ask again</a>`);
    case "lapsed": return simplePage("Expired · drop.", "expired", "This link has run out<em>.</em>", "Approved tokens have to be collected within 14 days. Ask again and we’ll take another look.", `<a class="btn" href="/request">Ask again</a>`);
  }
}

/** The token, shown exactly once. */
export function tokenShownPage(secret: string, expiresAt: number | null) {
  const until = expiresAt ? `It works until <time datetime="${new Date(expiresAt * 1000).toISOString()}">${new Date(expiresAt * 1000).toISOString().slice(0, 10)}</time>.` : "It doesn’t expire.";
  return simplePage("Your token · drop.", "your token", "Here’s your token<em>.</em>", `Copy it now. It won’t be shown again. ${until} Paste it into drop’s token field to upload and to get your ShareX configs.`, `${codeBox(secret)}<p style="margin:22px 0 0"><a class="btn" href="/">Open drop</a></p>${COPY_JS}`, REQ_CSS);
}
