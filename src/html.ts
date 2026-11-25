import type { Item } from "./index";

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const fmtSize = (n: number) => {
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i ? 1 : 0)} ${u[i]}`;
};

const css = `
:root{--bg:#0e0f13;--fg:#e8e6e3;--mut:#8b8f98;--card:#171920;--line:#262934;--acc:#ff7aa8;--acc2:#8be9c8}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
a{color:var(--acc2)}main{max-width:960px;margin:0 auto;padding:28px 20px}
header{display:flex;align-items:center;gap:12px;margin-bottom:22px}header h1{margin:0;font-size:22px;letter-spacing:.5px}
header .dot{width:12px;height:12px;border-radius:50%;background:linear-gradient(135deg,var(--acc),var(--acc2))}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px;margin-bottom:16px}
.mut{color:var(--mut);font-size:13px}button,.btn{background:var(--acc);color:#111;border:0;border-radius:9px;padding:8px 14px;font-weight:600;cursor:pointer;text-decoration:none;display:inline-block}
button.sec,.btn.sec{background:transparent;color:var(--fg);border:1px solid var(--line)}
input,textarea,select{background:#0b0c10;color:var(--fg);border:1px solid var(--line);border-radius:9px;padding:8px 10px;font:inherit;width:100%}
textarea{min-height:160px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.row>*{flex:0 0 auto}.grow{flex:1 1 200px!important}
#drop{border:2px dashed var(--line);border-radius:14px;padding:34px;text-align:center;cursor:pointer;transition:.15s}#drop.over{border-color:var(--acc);background:#1d1520}
.tabs{display:flex;gap:6px;margin-bottom:14px}.tabs button{background:transparent;color:var(--mut);border:1px solid transparent}.tabs button.on{color:var(--fg);border-color:var(--line);background:#0b0c10}
.res{font-family:ui-monospace,monospace;font-size:13px;word-break:break-all}
table{width:100%;border-collapse:collapse;font-size:13px}td{padding:6px 4px;border-top:1px solid var(--line);vertical-align:middle}td img{width:44px;height:44px;object-fit:cover;border-radius:6px}
.viewer{display:flex;justify-content:center;background:#08090c;border-radius:12px;overflow:hidden}.viewer img,.viewer video{max-width:100%;max-height:78vh;display:block}
.blur img{filter:blur(28px)}.nsfw{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}
pre{margin:0;overflow:auto;border-radius:12px;font-size:13px}pre code.hljs{padding:16px;border-radius:12px}
.meta{display:flex;gap:16px;flex-wrap:wrap;align-items:center;margin:12px 0}
`;

export function landingPage(host: string) {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(host)}</title><meta name="robots" content="noindex"><style>${css}</style></head><body><main>
<header><span class="dot"></span><h1>drop</h1><span class="mut">files · pastes · short links — ${esc(host)}</span></header>

<div class="card" id="auth"><div class="row"><input class="grow" id="tok" type="password" placeholder="API token" autocomplete="current-password">
<button id="save">Speichern</button><button class="sec" id="logout">Vergessen</button></div>
<div class="mut" style="margin-top:8px">Uploads brauchen den API-Token. Ansehen geht für alle mit dem Link.
ShareX: <a href="#" data-sx="upload">Upload-Config</a> · <a href="#" data-sx="paste">Paste-Config</a> · <a href="#" data-sx="shorten">Shortener-Config</a></div></div>

<div class="card"><div class="tabs"><button class="on" data-t="up">Datei</button><button data-t="paste">Paste</button><button data-t="link">Link kürzen</button></div>
<div class="row" style="margin-bottom:12px"><span class="mut">Ablauf</span><select id="exp" style="width:auto"><option value="never">nie</option><option value="10m">10 Min</option><option value="1h">1 Std</option><option value="1d">1 Tag</option><option value="7d">7 Tage</option><option value="30d">30 Tage</option><option value="1y">1 Jahr</option></select></div>
<section data-p="up"><div id="drop">Datei hierher ziehen, klicken oder mit Strg+V einfügen<input type="file" id="file" multiple hidden></div></section>
<section data-p="paste" hidden><textarea id="ptext" placeholder="Text oder Code…"></textarea><div class="row" style="margin-top:10px"><input id="plang" placeholder="Sprache (z. B. ts, py, json)" style="width:220px"><button id="psend">Paste erstellen</button></div></section>
<section data-p="link" hidden><div class="row"><input class="grow" id="lurl" placeholder="https://…"><button id="lsend">Kürzen</button></div></section>
<div id="out" class="res" style="margin-top:14px"></div></div>

<div class="card"><div class="row" style="justify-content:space-between"><b>Zuletzt</b><button class="sec" id="reload">Aktualisieren</button></div><div id="stats" class="mut"></div><table id="list"></table></div>
</main><script>
const $=s=>document.querySelector(s);const T=()=>localStorage.getItem('drop_token')||'';
$('#tok').value=T();$('#save').onclick=()=>{localStorage.setItem('drop_token',$('#tok').value.trim());load()};$('#logout').onclick=()=>{localStorage.removeItem('drop_token');$('#tok').value='';$('#list').innerHTML=''};
document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tabs button').forEach(x=>x.classList.toggle('on',x===b));document.querySelectorAll('section[data-p]').forEach(s=>s.hidden=s.dataset.p!==b.dataset.t)});
const H=()=>({authorization:'Bearer '+T(),'x-expires':$('#exp').value});
function show(r){const o=$('#out');if(r.error){o.innerHTML='<span style="color:#ff6b6b">'+r.error+'</span>';return}
const d=document.createElement('div');d.innerHTML='<a target=_blank></a> <button class="sec">kopieren</button>';d.querySelector('a').href=r.url;d.querySelector('a').textContent=r.url;d.querySelector('button').onclick=()=>navigator.clipboard.writeText(r.url);o.prepend(d);navigator.clipboard?.writeText(r.url).catch(()=>{});load()}
async function up(files){for(const f of files){const fd=new FormData();fd.append('file',f);$('#out').prepend(Object.assign(document.createElement('div'),{textContent:'lade '+f.name+' hoch…',className:'mut'}));
const big=f.size>90*1024*1024;const r=await fetch(big?'/api/upload?filename='+encodeURIComponent(f.name):'/api/upload',{method:big?'PUT':'POST',headers:big?{...H(),'content-type':f.type||'application/octet-stream'}:H(),body:big?f:fd});show(await r.json())}}
const dz=$('#drop');dz.onclick=()=>$('#file').click();$('#file').onchange=e=>up(e.target.files);
dz.ondragover=e=>{e.preventDefault();dz.classList.add('over')};dz.ondragleave=()=>dz.classList.remove('over');dz.ondrop=e=>{e.preventDefault();dz.classList.remove('over');up(e.dataTransfer.files)};
addEventListener('paste',e=>{if(e.target.tagName==='TEXTAREA'||e.target.tagName==='INPUT')return;const f=[...e.clipboardData.files];if(f.length)up(f)});
$('#psend').onclick=async()=>{const r=await fetch('/api/paste',{method:'POST',headers:{...H(),'content-type':'application/json'},body:JSON.stringify({content:$('#ptext').value,lang:$('#plang').value})});show(await r.json())};
$('#lsend').onclick=async()=>{const r=await fetch('/api/shorten',{method:'POST',headers:{...H(),'content-type':'application/json'},body:JSON.stringify({url:$('#lurl').value})});show(await r.json())};
document.querySelectorAll('[data-sx]').forEach(a=>a.onclick=async e=>{e.preventDefault();const r=await fetch('/api/sharex?type='+a.dataset.sx,{headers:{authorization:'Bearer '+T()}});if(!r.ok)return alert('Token fehlt oder falsch');const b=await r.blob();const u=URL.createObjectURL(b);Object.assign(document.createElement('a'),{href:u,download:location.host+'-'+a.dataset.sx+'.sxcu'}).click()});
const fs=n=>{const u=['B','KB','MB','GB'];let i=0;while(n>=1024&&i<3){n/=1024;i++}return n.toFixed(i?1:0)+' '+u[i]};
async function load(){if(!T())return;const r=await fetch('/api/list?limit=30',{headers:{authorization:'Bearer '+T()}});if(!r.ok){$('#stats').textContent='Token ungültig';return}const j=await r.json();
$('#stats').textContent=j.stats.map(s=>s.n+' '+s.kind+' ('+fs(s.bytes)+')').join(' · ');const t=$('#list');t.innerHTML='';
for(const it of j.items){const tr=document.createElement('tr');tr.innerHTML='<td></td><td><a target=_blank></a><div class=mut></div></td><td class=mut></td><td><button class=sec>löschen</button></td>';
if(it.thumbnail){const i=document.createElement('img');i.src=it.thumbnail;i.loading='lazy';tr.cells[0].append(i)}else tr.cells[0].textContent=it.kind==='paste'?'📝':it.kind==='link'?'🔗':'📄';
tr.querySelector('a').href=it.url;tr.querySelector('a').textContent=it.name||it.raw||it.id;tr.querySelector('div').textContent=(it.alt||'')+(it.nsfw?' · NSFW':'');
tr.cells[2].textContent=(it.kind==='link'?'':fs(it.size)+' · ')+it.views+' Aufrufe'+(it.expires_at?' · bis '+new Date(it.expires_at).toLocaleString():'');
tr.querySelector('button').onclick=async()=>{if(!confirm('Löschen?'))return;await fetch('/api/items/'+it.id,{method:'DELETE',headers:{authorization:'Bearer '+T()}});load()};t.append(tr)}}
$('#reload').onclick=load;load();
</script></body></html>`;
}

export function viewPage(it: Item, l: { url: string; raw: string | null; thumbnail: string | null }, pasteText: string | null) {
  const mime = it.mime || "";
  const title = it.name || it.id;
  const isImg = mime.startsWith("image/") && !mime.includes("svg");
  const isVid = mime.startsWith("video/");
  const isAud = mime.startsWith("audio/");
  const isPdf = mime === "application/pdf";
  const desc = it.alt || (it.kind === "paste" ? (pasteText || "").slice(0, 160) : `${fmtSize(it.size)} · ${mime}`);
  let og = `<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(l.url)}"><meta name="theme-color" content="#ff7aa8">`;
  if (isImg && !it.nsfw) og += `<meta property="og:image" content="${esc(l.raw)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${esc(l.raw)}">`;
  if (isVid && !it.nsfw) og += `<meta property="og:type" content="video.other"><meta property="og:video" content="${esc(l.raw)}"><meta property="og:video:type" content="${esc(mime)}">`;

  let body: string;
  if (it.kind === "paste") {
    const lang = it.lang ? `language-${esc(it.lang)}` : "";
    body = `<pre><code class="${lang}">${esc(pasteText)}</code></pre>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script><script>hljs.highlightAll()</script>`;
  } else if (isImg) {
    const img = `<img src="${esc(l.raw)}" alt="${esc(it.alt || title)}">`;
    body = it.nsfw
      ? `<div class="viewer blur" style="position:relative" id="v">${img}<div class="nsfw"><button onclick="document.getElementById('v').classList.remove('blur');this.parentNode.remove()">Möglicherweise sensibel – anzeigen</button></div></div>`
      : `<div class="viewer">${img}</div>`;
  } else if (isVid) body = `<div class="viewer"><video src="${esc(l.raw)}" controls playsinline preload="metadata"></video></div>`;
  else if (isAud) body = `<div class="card"><audio src="${esc(l.raw)}" controls style="width:100%"></audio></div>`;
  else if (isPdf) body = `<div class="viewer"><object data="${esc(l.raw)}" type="application/pdf" style="width:100%;height:80vh"></object></div>`;
  else body = `<div class="card" style="text-align:center;padding:40px"><div style="font-size:42px">📄</div><div>${esc(title)}</div><div class="mut">${fmtSize(it.size)} · ${esc(mime)}</div></div>`;

  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="robots" content="noindex">${og}<style>${css}</style></head><body><main>
<header><span class="dot"></span><h1>${esc(title)}</h1></header>${body}
<div class="meta mut"><span>${it.kind === "paste" ? "Paste" : fmtSize(it.size)}</span><span>${new Date(it.created_at * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC</span>
${it.expires_at ? `<span>läuft ab ${new Date(it.expires_at * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC</span>` : ""}
<a class="btn" href="${esc(l.raw)}">${it.kind === "paste" ? "Raw" : "Original"}</a><a class="btn sec" href="/${esc(it.id)}/dl">Download</a></div>
${it.alt ? `<p class="mut">${esc(it.alt)}</p>` : ""}</main></body></html>`;
}

export function notFoundPage() {
  return `<!doctype html><html><head><meta charset="utf-8"><title>404</title><style>${css}</style></head><body><main><header><span class="dot"></span><h1>404</h1></header><p class="mut">Nicht gefunden oder abgelaufen.</p></main></body></html>`;
}
