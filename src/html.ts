import type { Item } from "./index";

/* drop — UI following the shiftbloom studio brand book v2.
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
const fmtDate = (s: number) => new Date(s * 1000).toISOString().slice(0, 16).replace("T", " ") + " utc";

// ---------- the Bloom, drawn from the construction spec ----------
// rings: [radius, petals, rotation offset, width factor, gradient stem -> tip]
const RINGS: [number, number, number, number, string, string][] = [
  [100, 10, 0, 0.3, "#D8163F", "#FF2E52"],
  [74, 10, 18, 0.32, "#FF2E52", "#FF7E9E"],
  [50, 8, 22.5, 0.36, "#FF7E9E", "#FFC2D3"],
  [27, 6, 0, 0.44, "#FFB4CA", "#FFDCE7"],
];
const petal = (r: number, wf: number) => {
  const w = r * wf;
  const f = (n: number) => +n.toFixed(2);
  return `M0 0C${f(w)} ${f(-0.32 * r)} ${f(0.62 * w)} ${f(-0.74 * r)} 0 ${-r}C${f(-0.62 * w)} ${f(-0.74 * r)} ${f(-w)} ${f(-0.32 * r)} 0 0Z`;
};

/** Full-gradient bloom (≥32px) or solid bloom (<32px, favicon). `anim` adds ring classes for motion. */
export function bloom(opts: { size?: number; solid?: boolean; id?: string; anim?: boolean; cls?: string } = {}) {
  const { size = 64, solid = false, id = "b", anim = false, cls = "" } = opts;
  let defs = "", rings = "";
  RINGS.forEach(([r, n, off, wf, c0, c1], i) => {
    const gid = `${id}g${i}`;
    if (!solid) defs += `<linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${-r}"><stop offset="0" stop-color="${c0}"/><stop offset="1" stop-color="${c1}"/></linearGradient>`;
    const d = petal(r, wf);
    let ps = "";
    for (let k = 0; k < n; k++) ps += `<path d="${d}" transform="rotate(${+(off + (360 / n) * k).toFixed(2)})"/>`;
    const fill = solid ? (i === 0 || i === 1 ? "#FF2E52" : "none") : `url(#${gid})`;
    if (fill !== "none") rings += `<g fill="${fill}"${anim ? ` class="ring r${i}"` : ""}>${ps}</g>`;
  });
  const seed = `<circle r="7" fill="${solid ? "#C81040" : "#FF2E52"}"/>`;
  return `<svg class="bloom ${cls}" width="${size}" height="${size}" viewBox="-104 -104 208 208" role="img" aria-label="shiftbloom bloom">${defs ? `<defs>${defs}</defs>` : ""}${rings}${seed}</svg>`;
}

export function faviconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg"${bloom({ size: 32, solid: true }).slice(4)}`;
}

const SPARK = (size: number, color = "#FF2E52") =>
  `<svg width="${size}" height="${size}" viewBox="-12 -12 24 24" aria-hidden="true"><path d="M0-12C1 -3 3 -1 12 0C3 1 1 3 0 12C-1 3-3 1-12 0C-3-1-1-3 0-12Z" fill="${color}"/></svg>`;
const CROSS = (size: number, color = "#1A1216") =>
  `<svg width="${size}" height="${size}" viewBox="0 0 12 12" aria-hidden="true"><path d="M4 0h4v4h4v4H8v4H4V8H0V4h4z" fill="${color}"/></svg>`;

// ---------- shared styles ----------
const css = `
:root{--bloom:#FF2E52;--root:#C81040;--petal:#FF8FAB;--blush:#FFE9EF;--ink:#1A1216;--ink60:rgba(26,18,22,.6);--ink40:rgba(26,18,22,.42);--line:rgba(26,18,22,.12);--paper:#fff;--warm:#FAF6F4;
--display:"Clash Display",ui-sans-serif,system-ui,sans-serif;--sans:"General Sans",ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;--mono:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
--ease:cubic-bezier(.22,1.1,.36,1);--settle:cubic-bezier(.4,0,.2,1)}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.65 var(--sans);-webkit-font-smoothing:antialiased}
::selection{background:var(--blush)}
a{color:var(--root);text-decoration:none;background:linear-gradient(var(--root),var(--root)) 0 100%/0 1px no-repeat;transition:background-size .24s var(--ease)}
a:hover{background-size:100% 1px}
.wrap{max-width:1040px;margin:0 auto;padding:0 clamp(20px,5vw,48px)}
.label{font:500 11px/1.4 var(--mono);letter-spacing:.16em;text-transform:uppercase;color:var(--ink40)}
.label.red{color:var(--root)}
.mono{font-family:var(--mono)}
.top{display:flex;align-items:center;justify-content:space-between;padding:22px 0;border-bottom:1px solid var(--line)}
.brand{display:flex;align-items:center;gap:10px;color:var(--ink);background:none}
.brand .word{font:600 22px/1 var(--display);letter-spacing:-.02em}
.brand .word i{font-style:normal;color:var(--bloom)}
.brand .by{font:400 15px/1 var(--display);color:var(--ink60);letter-spacing:-.01em}
.brand .by i{font-style:normal;color:var(--bloom)}
h1,h2{font-family:var(--display);font-weight:600;letter-spacing:-.025em;line-height:1.02;margin:0}
h1{font-size:clamp(40px,6.4vw,72px)}h1 em{font-style:normal;color:var(--bloom)}
h2{font-size:24px;line-height:1.1}
.btn{appearance:none;border:0;border-radius:999px;background:var(--bloom);color:#fff;font:500 12px/1 var(--mono);letter-spacing:.14em;text-transform:uppercase;padding:14px 22px;cursor:pointer;transition:background .24s var(--settle),transform .24s var(--ease);display:inline-flex;align-items:center;gap:8px;text-decoration:none}
.btn:hover{background:var(--root);background-size:auto}.btn:active{transform:scale(.97)}
.btn.ghost{background:transparent;color:var(--ink);box-shadow:inset 0 0 0 1px var(--ink)}
.btn.ghost:hover{background:var(--ink);color:#fff}
.btn.sm{padding:9px 14px;font-size:11px}
input,textarea,select{font:15px/1.5 var(--sans);color:var(--ink);background:#fff;border:1px solid var(--line);border-radius:12px;padding:11px 14px;width:100%;transition:border-color .24s var(--settle),box-shadow .24s var(--settle)}
input:focus,textarea:focus,select:focus{outline:0;border-color:var(--bloom);box-shadow:0 0 0 3px var(--blush)}
textarea{min-height:200px;font:13px/1.6 var(--mono);resize:vertical}
.panel{background:var(--warm);border-radius:20px;padding:clamp(18px,3vw,32px)}
.seedlist{list-style:none;padding:0;margin:0}.seedlist li{position:relative;padding-left:18px}.seedlist li:before{content:"";position:absolute;left:2px;top:.68em;width:7px;height:7px;border-radius:50%;background:var(--bloom)}
.foot{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;padding:22px 0 30px;margin-top:72px;border-top:1px solid var(--line)}
.unfold{animation:unfold .6s var(--ease) both}
@keyframes unfold{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){*,*:before,*:after{animation:none!important;transition:none!important}}
`;

const head = (title: string, extra = "") => `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="robots" content="noindex"><meta name="theme-color" content="#ffffff">
<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/assets/fonts.css">${extra}<style>${css}`;

const topbar = (right = "") => `<header class="top"><a class="brand" href="/" aria-label="drop — shiftbloom studio">${bloom({ size: 28, solid: true })}<span class="word">drop<i>.</i></span></a>${right}</header>`;

const footer = (host: string) => `<footer class="foot"><span class="label">${esc(host)} · files · pastes · links</span><a class="label" href="https://shiftbloom.studio" style="background:none">shiftbloom studio<span style="color:var(--bloom)">.</span> · hamburg</a></footer>`;

// ---------- landing ----------
export function landingPage(host: string) {
  return `${head(host)}
.hero{display:grid;grid-template-columns:1.25fr 1fr;align-items:center;gap:24px;padding:clamp(40px,8vw,96px) 0 clamp(32px,6vw,72px);position:relative}
.hero p{font-size:18px;color:var(--ink60);max-width:30em;margin:22px 0 0}
.flower{display:flex;justify-content:center}
.flower .bloom{width:min(340px,70vw);height:auto;animation:unfold .6s var(--ease) both,breathe 6s ease-in-out .6s infinite}
.flower .ring{transform-origin:0 0}.flower .r0{animation:spin 240s linear infinite}.flower .r2{animation:spin 180s linear infinite reverse}
@keyframes breathe{50%{transform:scale(1.02)}}@keyframes spin{to{transform:rotate(360deg)}}
.sprinkle{position:absolute;pointer-events:none}
.tool{display:grid;gap:18px}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.grow{flex:1 1 240px}
.tabs{display:inline-flex;gap:4px;background:#fff;border-radius:999px;padding:4px;box-shadow:inset 0 0 0 1px var(--line)}
.tabs button{appearance:none;border:0;background:transparent;border-radius:999px;padding:9px 16px;font:500 11px/1 var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--ink60);cursor:pointer;transition:all .24s var(--settle)}
.tabs button.on{background:var(--ink);color:#fff}
#drop{position:relative;border:1.5px dashed rgba(26,18,22,.25);border-radius:18px;background:#fff;padding:clamp(36px,6vw,64px) 20px;text-align:center;cursor:pointer;transition:all .24s var(--settle)}
#drop:hover,#drop.over{border-color:var(--bloom);background:var(--blush)}
#drop strong{display:block;font:600 24px/1.1 var(--display);letter-spacing:-.02em;margin:14px 0 6px}
#drop .bloom{transition:transform .6s var(--ease)}#drop.over .bloom{transform:scale(1.15) rotate(18deg)}
.opts{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap}
.opts select{width:auto;padding:8px 34px 8px 12px;border-radius:999px;font:500 12px/1 var(--mono)}
#out{display:grid;gap:8px}
.res{display:flex;align-items:center;gap:12px;background:#fff;border-radius:14px;padding:10px 10px 10px 16px;box-shadow:inset 0 0 0 1px var(--line);animation:unfold .24s var(--ease) both}
.res a{font:500 14px/1.3 var(--mono);flex:1;word-break:break-all}.res.err{color:var(--root);font:13px var(--mono)}.res.wait{color:var(--ink40);font:13px var(--mono)}
.auth{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.auth input{flex:1 1 220px;font-family:var(--mono);font-size:13px}
.sx{display:flex;gap:16px;flex-wrap:wrap}
.list{margin-top:56px}.list h2{margin-bottom:6px}
table{width:100%;border-collapse:collapse;margin-top:18px}
td{padding:12px 8px;border-top:1px solid var(--line);vertical-align:middle;font-size:14px}
td.t{width:60px}td.t img,td.t span{width:48px;height:48px;border-radius:10px;object-fit:cover;display:grid;place-items:center;background:var(--warm);font:500 10px var(--mono);color:var(--ink40);letter-spacing:.1em;text-transform:uppercase}
td .alt{color:var(--ink60);font-size:13px;margin-top:2px}
td.m{font:12px/1.5 var(--mono);color:var(--ink40);white-space:nowrap;text-align:right}
.tag{display:inline-block;background:var(--blush);color:var(--root);font:500 10px/1 var(--mono);letter-spacing:.12em;text-transform:uppercase;padding:4px 7px;border-radius:6px;margin-left:6px;vertical-align:2px}
.x{appearance:none;border:0;background:none;color:var(--ink40);cursor:pointer;font:500 11px var(--mono);letter-spacing:.12em;text-transform:uppercase;padding:6px}.x:hover{color:var(--root)}
.pop{position:fixed;pointer-events:none;z-index:9;animation:pop .6s var(--ease) forwards}
@keyframes pop{0%{opacity:0;transform:translate(0,0) scale(.4)}40%{opacity:1}100%{opacity:0;transform:translate(var(--dx),var(--dy)) scale(1)}}
@media (max-width:760px){.sprinkle{display:none}.hero{grid-template-columns:1fr}.flower{order:-1}.flower .bloom{width:200px}td.m{display:none}}
</style></head><body>
<div class="wrap">
${topbar(`<span class="label">by shiftbloom studio<span style="color:var(--bloom)">.</span></span>`)}
<section class="hero">
  <div><span class="label red">files · pastes · short links</span><h1 style="margin-top:14px">Datei rein,<br><em>Link</em> raus.</h1>
  <p>Screenshots, Videos, Code-Schnipsel und lange URLs, auf kurze Links unter ${esc(host)} gebracht. ShareX-ready, mit Ablaufdatum, wenn du willst.</p></div>
  <div class="flower">${bloom({ size: 340, id: "hero", anim: true })}</div>
  <span class="sprinkle" style="right:2%;top:14%">${SPARK(18)}</span><span class="sprinkle" style="left:46%;top:10%">${CROSS(11)}</span><span class="sprinkle" style="right:44%;bottom:12%"><svg width="8" height="8"><circle cx="4" cy="4" r="4" fill="#FF2E52"/></svg></span>
</section>

<section class="panel tool">
  <div class="auth" id="auth"><span class="label" style="flex:0 0 auto">token</span><input id="tok" type="password" placeholder="API-Token einfügen" autocomplete="current-password"><button class="btn ghost sm" id="save">speichern</button></div>
  <div class="opts"><div class="tabs" role="tablist"><button class="on" data-t="up">datei</button><button data-t="paste">paste</button><button data-t="link">link</button></div>
  <label class="row" style="gap:8px"><span class="label">läuft ab</span><select id="exp"><option value="never">nie</option><option value="10m">10 min</option><option value="1h">1 h</option><option value="1d">1 tag</option><option value="7d">7 tage</option><option value="30d">30 tage</option><option value="1y">1 jahr</option></select></label></div>
  <section data-p="up"><div id="drop" tabindex="0">${bloom({ size: 48, id: "dz" })}<strong>Hier fallen lassen.</strong><span class="label">klicken · ziehen · strg+v</span><input type="file" id="file" multiple hidden></div></section>
  <section data-p="paste" hidden><textarea id="ptext" placeholder="Text oder Code …" spellcheck="false"></textarea><div class="row" style="margin-top:10px"><input id="plang" placeholder="sprache, z. b. ts, py, json" style="width:240px;font-family:var(--mono);font-size:13px"><button class="btn" id="psend">paste erstellen</button></div></section>
  <section data-p="link" hidden><div class="row"><input class="grow" id="lurl" placeholder="https://…" style="font-family:var(--mono);font-size:14px"><button class="btn" id="lsend">kürzen</button></div></section>
  <div id="out"></div>
  <div class="sx"><span class="label">sharex</span><a href="#" class="label red" data-sx="upload">upload-config</a><a href="#" class="label red" data-sx="paste">paste-config</a><a href="#" class="label red" data-sx="shorten">shortener-config</a></div>
</section>

<section class="list" id="recent" hidden><div class="row" style="justify-content:space-between"><h2>Zuletzt gewachsen.</h2><button class="btn ghost sm" id="reload">aktualisieren</button></div><div id="stats" class="label" style="margin-top:8px"></div><table id="list"></table></section>
${footer(host)}
</div>
<script>
const $=s=>document.querySelector(s);const T=()=>localStorage.getItem('drop_token')||'';
const auth=()=>{$('#tok').value=T()?'••••••••••••':'';};auth();
$('#save').onclick=()=>{const v=$('#tok').value.trim();if(v&&!v.startsWith('•'))localStorage.setItem('drop_token',v);else if(!v)localStorage.removeItem('drop_token');auth();load()};
document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tabs button').forEach(x=>x.classList.toggle('on',x===b));document.querySelectorAll('section[data-p]').forEach(s=>s.hidden=s.dataset.p!==b.dataset.t)});
const H=()=>({authorization:'Bearer '+T(),'x-expires':$('#exp').value});
const SP='${SPARK(14).replace(/'/g, "\\'")}';
function scatter(el){const r=el.getBoundingClientRect();for(let i=0;i<5;i++){const s=document.createElement('span');s.className='pop';s.innerHTML=SP;const a=(i/5)*Math.PI*2+Math.random()*.6;s.style.left=(r.left+r.width/2)+'px';s.style.top=(r.top+r.height/2)+'px';s.style.setProperty('--dx',Math.cos(a)*90+'px');s.style.setProperty('--dy',Math.sin(a)*60+'px');s.style.animationDelay=(i*40)+'ms';document.body.append(s);setTimeout(()=>s.remove(),900)}}
function note(t,c){const d=document.createElement('div');d.className='res '+c;d.textContent=t;$('#out').prepend(d);return d}
function show(r,w){w&&w.remove();if(!r||r.error){note(r&&r.error==='unauthorized: send Authorization: Bearer <token>'?'Token fehlt oder ist falsch.':(r&&r.error)||'Fehler','err');return}
const d=document.createElement('div');d.className='res';d.innerHTML='<a target=_blank rel=noopener></a><button class="btn sm">kopieren</button>';const a=d.querySelector('a');a.href=r.url;a.textContent=r.url.replace(/^https?:\\/\\//,'');
const b=d.querySelector('button');b.onclick=()=>{navigator.clipboard.writeText(r.url);b.textContent='kopiert';setTimeout(()=>b.textContent='kopieren',1400)};$('#out').prepend(d);navigator.clipboard?.writeText(r.url).catch(()=>{});scatter(d);load()}
async function j(r){try{return await r.json()}catch{return{error:'HTTP '+r.status}}}
async function up(files){for(const f of files){const w=note('lädt '+f.name+' …','wait');const big=f.size>90*1024*1024;
const r=await fetch(big?'/api/upload?filename='+encodeURIComponent(f.name):'/api/upload',{method:big?'PUT':'POST',headers:big?{...H(),'content-type':f.type||'application/octet-stream'}:H(),body:big?f:(()=>{const fd=new FormData();fd.append('file',f);return fd})()});show(await j(r),w)}}
const dz=$('#drop');dz.onclick=()=>$('#file').click();dz.onkeydown=e=>{if(e.key==='Enter'||e.key===' ')$('#file').click()};$('#file').onchange=e=>up(e.target.files);
dz.ondragover=e=>{e.preventDefault();dz.classList.add('over')};dz.ondragleave=()=>dz.classList.remove('over');dz.ondrop=e=>{e.preventDefault();dz.classList.remove('over');up(e.dataTransfer.files)};
addEventListener('paste',e=>{if(/TEXTAREA|INPUT/.test(e.target.tagName))return;const f=[...e.clipboardData.files];if(f.length)up(f)});
$('#psend').onclick=async()=>{const r=await fetch('/api/paste',{method:'POST',headers:{...H(),'content-type':'application/json'},body:JSON.stringify({content:$('#ptext').value,lang:$('#plang').value})});show(await j(r))};
$('#lsend').onclick=async()=>{const r=await fetch('/api/shorten',{method:'POST',headers:{...H(),'content-type':'application/json'},body:JSON.stringify({url:$('#lurl').value})});show(await j(r))};
document.querySelectorAll('[data-sx]').forEach(a=>a.onclick=async e=>{e.preventDefault();const r=await fetch('/api/sharex?type='+a.dataset.sx,{headers:{authorization:'Bearer '+T()}});if(!r.ok)return note('Token fehlt oder ist falsch.','err');const u=URL.createObjectURL(await r.blob());Object.assign(document.createElement('a'),{href:u,download:location.host+'-'+a.dataset.sx+'.sxcu'}).click()});
const fs=n=>{const u=['B','KB','MB','GB'];let i=0;while(n>=1024&&i<3){n/=1024;i++}return n.toFixed(i?1:0)+' '+u[i]};
const td=(c,t)=>{const e=document.createElement('td');if(c)e.className=c;if(t!=null)e.textContent=t;return e};
async function load(){if(!T()){$('#recent').hidden=true;return}const r=await fetch('/api/list?limit=30',{headers:{authorization:'Bearer '+T()}});if(!r.ok){$('#recent').hidden=true;return}const d=await r.json();$('#recent').hidden=false;
const k={file:'dateien',paste:'pastes',link:'links'};$('#stats').textContent=d.stats.map(s=>s.n+' '+(k[s.kind]||s.kind)+(s.kind==='link'?'':' · '+fs(s.bytes))).join('  ·  ');const t=$('#list');t.replaceChildren();
for(const it of d.items){const tr=document.createElement('tr');const c0=td('t');if(it.thumbnail){const i=document.createElement('img');i.src=it.thumbnail;i.loading='lazy';i.alt=it.alt||'';c0.append(i)}else{const s=document.createElement('span');s.textContent=it.kind==='paste'?'txt':it.kind==='link'?'url':(it.name||'').split('.').pop().slice(0,4);c0.append(s)}
const c1=td();const a=document.createElement('a');a.href=it.url;a.target='_blank';a.textContent=it.kind==='link'?it.raw:(it.name||it.id);c1.append(a);if(it.nsfw){const g=document.createElement('span');g.className='tag';g.textContent='nsfw';c1.append(g)}if(it.alt){const p=document.createElement('div');p.className='alt';p.textContent=it.alt;c1.append(p)}
const c2=td('m',[it.id,it.kind==='link'?null:fs(it.size),it.views+' aufrufe',it.expires_at?'bis '+it.expires_at.slice(0,10):null].filter(Boolean).join(' · '));
const c3=td('');const x=document.createElement('button');x.className='x';x.textContent='löschen';x.onclick=async()=>{if(!confirm('Wirklich löschen?'))return;await fetch('/api/items/'+it.id,{method:'DELETE',headers:{authorization:'Bearer '+T()}});load()};c3.append(x);tr.append(c0,c1,c2,c3);t.append(tr)}}
$('#reload').onclick=load;load();
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
  const desc = it.alt || (it.kind === "paste" ? (pasteText || "").slice(0, 160) : `${fmtSize(it.size)} · ${mime}`);
  let og = `<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(l.url)}"><meta property="og:site_name" content="drop · shiftbloom studio"><meta name="theme-color" content="#FF2E52">`;
  if (isImg && !it.nsfw) og += `<meta property="og:image" content="${esc(l.raw)}"><meta property="og:image:alt" content="${esc(it.alt || title)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${esc(l.raw)}">`;
  if (isVid && !it.nsfw) og += `<meta property="og:type" content="video.other"><meta property="og:video" content="${esc(l.raw)}"><meta property="og:video:type" content="${esc(mime)}">`;

  let body: string;
  let extraHead = "";
  if (it.kind === "paste") {
    extraHead = `<script src="/assets/hljs.js" defer></script>`;
    const lines = (pasteText || "").split("\n").length;
    body = `<div class="code"><div class="codebar"><span class="label" style="color:rgba(244,237,238,.5)">${esc(it.lang || "text")} · ${lines} zeilen · ${fmtSize(it.size)}</span><button class="btn sm" id="cp">kopieren</button></div><pre><code class="${it.lang ? `language-${esc(it.lang)}` : "nohighlight"}">${esc(pasteText)}</code></pre></div>
<script>document.getElementById('cp').onclick=function(){navigator.clipboard.writeText(document.querySelector('pre code').innerText);this.textContent='kopiert'};addEventListener('DOMContentLoaded',function(){window.hljs&&hljs.highlightAll()})</script>`;
  } else if (isImg) {
    const img = `<img src="${esc(l.raw)}" alt="${esc(it.alt || title)}">`;
    body = it.nsfw
      ? `<div class="stage veil" id="v">${img}<button class="btn" onclick="document.getElementById('v').classList.remove('veil');this.remove()">sensibel? trotzdem zeigen</button></div>`
      : `<div class="stage">${img}</div>`;
  } else if (isVid) body = `<div class="stage"><video src="${esc(l.raw)}" controls playsinline preload="metadata"></video></div>`;
  else if (isAud) body = `<div class="stage pad">${bloom({ size: 96, id: "au" })}<audio src="${esc(l.raw)}" controls></audio></div>`;
  else if (isPdf) body = `<div class="stage"><object data="${esc(l.raw)}" type="application/pdf" style="width:100%;height:80vh"></object></div>`;
  else body = `<div class="stage pad">${bloom({ size: 96, id: "fi" })}<div class="fname">${esc(title)}</div><span class="label">${fmtSize(it.size)} · ${esc(mime)}</span></div>`;

  return `${head(title, `${og}${extraHead}`)}
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
.alt:before{content:"";display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--bloom);margin-right:10px;vertical-align:1px}
.code{background:var(--ink);border-radius:20px;overflow:hidden;animation:unfold .6s var(--ease) both}
.codebar{display:flex;justify-content:space-between;align-items:center;padding:12px 12px 12px 20px;border-bottom:1px solid rgba(244,237,238,.1)}
pre{margin:0;overflow:auto;max-height:78vh}pre code{display:block;padding:20px;font:13px/1.65 var(--mono);color:#F4EDEE;tab-size:2}
.hljs-keyword,.hljs-selector-tag,.hljs-built_in,.hljs-meta .hljs-keyword{color:#FF8FAB}.hljs-string,.hljs-attr,.hljs-template-tag{color:#FFC2D3}
.hljs-number,.hljs-literal,.hljs-symbol{color:#FF7E9E}.hljs-comment,.hljs-quote{color:rgba(244,237,238,.42);font-style:italic}
.hljs-title,.hljs-section,.hljs-name,.hljs-function .hljs-title{color:#fff;font-weight:500}.hljs-type,.hljs-class .hljs-title,.hljs-variable,.hljs-params{color:#FFDCE7}
.hljs-tag,.hljs-meta,.hljs-punctuation{color:rgba(244,237,238,.6)}.hljs-addition{color:#FFDCE7;background:rgba(255,46,82,.12)}.hljs-deletion{color:#FF8FAB;background:rgba(255,46,82,.22)}
</style></head><body><div class="wrap">
${topbar(`<a class="btn ghost sm" href="/">neuer drop</a>`)}
<main>
<div class="titlebar"><div><span class="label red">${it.kind === "paste" ? "paste" : esc(mime.split("/")[0] || "datei")}</span><h1 style="margin-top:8px">${esc(title)}</h1></div>
<div class="row" style="display:flex;gap:10px"><a class="btn" href="${esc(l.raw)}">${it.kind === "paste" ? "raw" : "original"}</a><a class="btn ghost" href="/${esc(it.id)}/dl">download</a></div></div>
${body}
<div class="meta"><span class="label">${esc(it.id)}</span><span class="label">${it.kind === "paste" ? "paste" : fmtSize(it.size)}</span><span class="label">${fmtDate(it.created_at)}</span>${it.expires_at ? `<span class="label red">läuft ab ${fmtDate(it.expires_at)}</span>` : ""}</div>
${it.alt ? `<p class="alt">${esc(it.alt)}</p>` : ""}
</main>
${footer(new URL(l.url).host)}
</div></body></html>`;
}

export function notFoundPage() {
  return `${head("404 · drop")}
.nf{min-height:70vh;display:grid;place-items:center;text-align:center}
.nf .seed{width:14px;height:14px;border-radius:50%;background:var(--bloom);margin:0 auto 28px;animation:unfold .24s var(--ease) both}
.nf p{color:var(--ink60);margin:14px 0 28px}
</style></head><body><div class="wrap">${topbar()}
<div class="nf"><div><div class="seed"></div><span class="label red">404</span><h1 style="margin-top:12px">Hier ist nichts<br>gewachsen<em>.</em></h1><p>Der Link ist abgelaufen, gelöscht oder hat nie existiert.</p><a class="btn" href="/">zur startseite</a></div></div>
</div></body></html>`;
}
