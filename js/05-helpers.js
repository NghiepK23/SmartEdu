/* EducMind · js/05-helpers.js
   Hàm tiện ích dùng chung: thoát HTML, kiểm tra URL an toàn, phần trăm, mức nắm vững và biểu trưng. */
/* ===== Hàm tiện ích ===== */
const esc=t=>String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
function safeHttpUrl(raw){
  const s=String(raw||'').trim();
  if(!s)return '';
  try{
    const u=new URL(s);
    return (u.protocol==='http:'||u.protocol==='https:')?u.href:'';
  }catch(_){return ''}
}
function safeImageSrc(raw){
  const s=String(raw||'').trim();
  if(!s)return '';
  if(/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(s))return s;
  return safeHttpUrl(s);
}
const pct=v=>Math.round((v||0)*100);
const mean=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;
/* Mức nắm vững: <40% Cần ôn · 40–69% Đang tiến bộ · ≥70% Vững */
const tier=v=>v<.4?'need':v<.7?'prog':'good';
const TIER={need:{label:'Cần ôn',icon:'alert'},prog:{label:'Đang tiến bộ',icon:'trend'},good:{label:'Vững',icon:'check'}};
const tierPill=v=>{const t=tier(v);return `<span class="pill ${t}">${ic(TIER[t].icon,14)}${TIER[t].label}</span>`};
const bar=(v,cls,label)=>`<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct(v)}" aria-label="${esc(label)}"><span class="${esc(cls||'')}" style="width:${pct(v)}%"></span></div>`;
function brandLogoHtml(){return `<div class='logo' aria-label='EducMind'><span class='logo-mark' aria-hidden='true'><svg viewBox='0 0 48 48' fill='none' xmlns='http://www.w3.org/2000/svg'><path d='M8.5 15.8c5.5-2.1 10.7-1.1 15.5 2.8 4.8-3.9 10-4.9 15.5-2.8v17.1c-5.5-2.1-10.7-1.1-15.5 2.8-4.8-3.9-10-4.9-15.5-2.8V15.8Z' fill='rgba(255,255,255,.16)' stroke='white' stroke-width='2.2' stroke-linejoin='round'/><path d='M24 18.6v17' stroke='white' stroke-width='2' stroke-linecap='round'/><path d='M13.8 22c2.9-.5 5.3.1 7.5 1.5M13.8 27.2c2.9-.5 5.3.1 7.5 1.5M34.2 22c-2.9-.5-5.3.1-7.5 1.5M34.2 27.2c-2.9-.5-5.3.1-7.5 1.5' stroke='white' stroke-width='1.7' stroke-linecap='round'/><path d='M34.6 7.6v5.8M31.7 10.5h5.8M40.5 15.2v3.6m-1.8-1.8h3.6' stroke='white' stroke-width='1.8' stroke-linecap='round'/></svg></span><span class='logo-word'><strong>Educ</strong><i>Mind</i></span></div>`}
const _vendorScriptPromises=new Map();
function loadVendorScript(src){
  if(_vendorScriptPromises.has(src))return _vendorScriptPromises.get(src);
  const p=new Promise((resolve,reject)=>{
    if(typeof document==='undefined'||!document.head||typeof document.createElement!=='function'){
      reject(new Error('Môi trường hiện tại không hỗ trợ nạp thư viện động.'));
      return;
    }
    const existing=document.querySelector(`script[data-vendor-src="${src}"]`);
    if(existing&&existing.dataset&&existing.dataset.loaded==='1'){resolve();return}
    const s=existing||document.createElement('script');
    s.src=src;
    s.async=true;
    if(s.dataset)s.dataset.vendorSrc=src;
    s.onload=()=>{if(s.dataset)s.dataset.loaded='1';resolve()};
    s.onerror=()=>{_vendorScriptPromises.delete(src);reject(new Error('Không tải được thư viện '+src))};
    if(!existing)document.head.appendChild(s);
  });
  _vendorScriptPromises.set(src,p);
  return p;
}
async function ensureXlsx(){
  if(typeof XLSX!=='undefined')return XLSX;
  await loadVendorScript('js/vendor/xlsx.full.min.js');
  if(typeof XLSX==='undefined')throw new Error('Không khởi tạo được thư viện đọc Excel.');
  return XLSX;
}
async function ensureMammoth(){
  if(typeof mammoth!=='undefined')return mammoth;
  await loadVendorScript('js/vendor/mammoth.browser.min.js');
  if(typeof mammoth==='undefined')throw new Error('Không khởi tạo được thư viện đọc Word.');
  return mammoth;
}

