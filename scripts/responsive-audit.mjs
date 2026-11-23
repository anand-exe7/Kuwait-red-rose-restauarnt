// Responsive overflow audit for the Red Rose app.
//
//   npx playwright install chromium        # once
//   RR_PW=<admin password> node scripts/responsive-audit.mjs
//
// Starts from a running dev server on :3000, signs into the admin panel, then
// walks every route at every width in W and reports anything whose border box
// escapes the viewport, plus whether the document itself scrolls sideways.
//
// It deliberately does NOT flag an element whose ancestor scrolls or clips on
// the x axis: a table in an `overflow-x-auto` wrapper and the landing marquee
// inside `.ribbon { overflow: hidden }` are intentional, not bugs. Everything
// else is a real overflow and should be fixed at its source rather than hidden
// with `overflow-x: hidden`.
//
// Exits non-zero when anything fails, so it can gate CI.

import { chromium } from 'playwright';
const BASE=process.env.BASE||'http://localhost:3000';
const b=await chromium.launch();
const ctx=await b.newContext();
const lp=await ctx.newPage();
await lp.goto(BASE+'/admin/login',{waitUntil:'networkidle'});
await lp.fill('input[type="password"]',process.env.RR_PW);
await lp.click('button[type="submit"]'); await lp.waitForTimeout(2000); await lp.close();

// Refined: also treat an ancestor that CLIPS (overflow hidden/clip) as
// intentional containment — a marquee is legitimate off-screen content.
const DIAG=()=>{
  const de=document.documentElement,vw=de.clientWidth,bad=[],ctrl=[];
  const lbl=e=>{const c=typeof e.className==='string'?e.className:'';
    return e.tagName.toLowerCase()+(c?'.'+c.trim().split(/\s+/).slice(0,4).join('.'):'')+
      (e.innerText?' «'+e.innerText.trim().slice(0,22).replace(/\s+/g,' ')+'»':'');};
  const inert=e=>{let n=e;while(n&&n.nodeType===1){const s=getComputedStyle(n);
    if(s.display==='none'||s.visibility==='hidden'||parseFloat(s.opacity)===0)return true;n=n.parentElement;}return false;};
  const contained=e=>{let n=e.parentElement;while(n&&n!==document.body){const s=getComputedStyle(n);
    if(['auto','scroll','hidden','clip'].includes(s.overflowX))return true;n=n.parentElement;}return false;};
  for(const e of document.querySelectorAll('body *')){const r=e.getBoundingClientRect();
    if(r.width<1||r.height<1||inert(e)||contained(e))continue;
    if(r.left<-1||r.right>vw+1)bad.push({el:lbl(e),over:+(r.right-vw).toFixed(1)});}
  for(const e of document.querySelectorAll('button,a[href],input,select,textarea')){const r=e.getBoundingClientRect();
    if(r.width<1||r.height<1||inert(e)||contained(e))continue;
    if(r.left<-1||r.right>vw+1)ctrl.push({el:lbl(e),over:+(r.right-vw).toFixed(1)});}
  return {hs:de.scrollWidth-de.clientWidth,bad,ctrl};
};
// dense sweep around the md boundary + the full list
const W=[300,319,320,340,360,375,390,414,430,480,540,600,640,700,720,740,760,767,768,769,780,800,820,900,1024,1100,1280,1366,1440,1600,1920,2560,3440];
let tot=0,fail=0; const off=new Map();
for(const route of ['/','/menu','/login','/admin/login','/chef-station-abc-123','/waiter-dashboard-def-456','/admin','/admin/orders','/admin/kitchen','/admin/inventory','/admin/analytics','/admin/billing','/admin/stock','/admin/expenses','/admin/coupons','/admin/delivery','/admin/media','/admin/online']){
  const line=[];
  for(const w of W){
    const p=await ctx.newPage(); await p.setViewportSize({width:w,height:900});
    let r; try{await p.goto(BASE+route,{waitUntil:'networkidle',timeout:45000});await p.waitForTimeout(350);r=await p.evaluate(DIAG);}catch(e){r={err:1};}
    tot++;
    if(r.err){line.push(`${w}:ERR`);fail++;}
    else if(r.hs>1||r.bad.length||r.ctrl.length){fail++;line.push(`${w}[hs+${r.hs} el${r.bad.length} ctl${r.ctrl.length}]`);
      [...r.bad,...r.ctrl].forEach(x=>off.set(x.el.slice(0,58),Math.max(off.get(x.el.slice(0,58))||0,x.over)));}
    await p.close();
  }
  console.log(`${route.padEnd(28)} ${line.length?'❌ '+line.join(' '):'✅ clean at all '+W.length+' widths'}`);
}
console.log(`\n${tot-fail}/${tot} clean`);
if(off.size){console.log('remaining:');[...off].sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>console.log(`  +${v}px ${k}`));}
await b.close();
if(fail)process.exit(1);
