import test from "node:test";
import assert from "node:assert/strict";
import {JSDOM} from "jsdom";
import jquery from "jquery";
import {installEnvironment} from "./fixture.mjs";
import {MODULE_ID} from "../scripts/assets.js";
import {halfCost,timingFor,refundFor} from "../scripts/core-crafting.js";
import fs from "node:fs";
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const until=async predicate=>{for(let i=0;i<200;i++){if(predicate())return;await wait(10);}throw Error("Workshop timeout");};
let setupNumber=0;
async function setup(generation) {
  const dom=new JSDOM("<body></body>",{url:"http://localhost/"});const env=installEnvironment({window:dom.window,jquery:jquery(dom.window),generation});
  env.craftingMode="core";game.system.id="pf2e";
  const messages=JSON.parse(fs.readFileSync(new URL("../lang/es.json",import.meta.url),"utf8"));
  game.i18n.format=(key,data={})=>(messages[key]??key).replace(/\{(\w+)\}/g,(_,name)=>String(data[name]??`{${name}}`));
  game.i18n.localize=key=>messages[key]??key;
  foundry.utils={debounce:fn=>fn,escapeHTML:value=>value.replace(/[<>]/g,"")};
  class ApplicationV2 {
    constructor(options){this.options=options;}
    async render(){this.element=document.createElement("div");this.element.className="rvc-app";const content=document.createElement("div");content.className="window-content";this.element.append(content);this._replaceHTML(await this._renderHTML(),content);document.body.append(this.element);this._onRender({},{});return this;}
    bringToFront(){this.raised=true;}
    async close(){this.element?.remove();}
  }
  foundry.applications.api.ApplicationV2=ApplicationV2;
  const a=env.actor;a.system.skills.crafting={rank:2,totalModifier:9};a.skills={crafting:{mod:9}};
  const wallet={copperValue:10000};a.inventory={coins:wallet,removeCoins:async({cp})=>{env.pays=(env.pays??0)+1;if(wallet.copperValue<cp)return false;wallet.copperValue-=cp;return true;},addCoins:async coins=>{wallet.copperValue+=(coins.gp??0)*100+(coins.sp??0)*10+(coins.cp??0);}};
  const sword={uuid:"Compendium.world.gear.Item.sword",name:"Longsword",type:"weapon",img:"icons/svg/sword.svg",system:{quantity:20,level:{value:4},price:{value:{gp:50},per:1},traits:{rarity:"common",value:[]}},toObject(){return {_id:"sword",name:this.name,type:this.type,system:structuredClone(this.system)};}};
  env.documents=new Map([[sword.uuid,sword]]);game.packs=[{documentName:"Item",visible:true,title:"Gear",getIndex:async()=>[sword]}];game.items=[];
  await import(`../scripts/crafting-dialog.js?pf2-visual=${generation}-${++setupNumber}`);await env.fire("init");await env.fire("ready");
  const app=game.modules.get(MODULE_ID).api.open();await until(()=>app.root);
  let clock=0;const frames=new Map();let id=0;
  globalThis.performance={now:()=>clock};globalThis.requestAnimationFrame=fn=>{frames.set(++id,fn);return id;};globalThis.cancelAnimationFrame=key=>frames.delete(key);
  const tick=ms=>{clock+=ms;for(const [key,fn] of [...frames]){frames.delete(key);fn();}};
  const query=selector=>app.element.querySelector(selector);
  const choose=async()=>{query('[data-category="herreria"]').click();await until(()=>query('.rvc-row'));query('.rvc-row').click();await until(()=>app.screen==='bench');};
  async function play(moments){for(let i=0;i<3;i++){await until(()=>query('.rvc-strikes').children.length===i+1);if(moments[i]===null)tick(60000);else {tick(moments[i]);query('.rvc-strikes').children[i].click();}}await until(()=>!app.busy);}
  return {dom,env,a,app,query,choose,wallet,tick,play};
}
test("Core economy and strike windows retain their existing rules",()=>{assert.equal(halfCost(5000),2500);assert.deepEqual([3,2,1,0].map(hits=>refundFor(hits,2500)),[0,1250,833,0]);assert.equal(timingFor(0).start,2000);});
for(const generation of [13,14]) test(`PF2e v${generation}: default workshop preserves level DC, Crafting, coin APIs and one-unit reward`,async()=>{
  const f=await setup(generation);try {
    assert.equal(f.app.root.dataset.screen,"menu");assert.equal(f.env.dialogs.length,0);assert.equal(f.query('.rvc-cats').children.length,6);
    await f.choose();assert.equal(f.query('.rvc-dc').textContent,'CD 19');assert.equal(f.query('.rvc-cost').textContent,'Coste: 25 po');
    f.query('.rvc-craft').click();f.query('.rvc-craft').click();
    await f.play([3000,3000,3000]);
    assert.equal(f.wallet.copperValue,7500);assert.equal(f.env.pays,1);assert.equal(f.env.rollCount,1);assert.equal(f.env.nativeChecks.length,0,'PF2e retains its existing Crafting adapter');
    assert.equal(f.a.items.find(item=>item.name==='Longsword').system.quantity,1);
    assert.deepEqual([...f.query('.rvc-progress').children].map(node=>node.className),['rvc-hit','rvc-hit','rvc-hit']);
    assert.equal(f.query('.rvc-phase').textContent,'Intento completado');
    assert.match(f.env.chat.at(-1).content,/Tirada 29 contra CD 19/);
  }finally{await f.app.close();f.dom.window.close();}
});
test("PF2e search clear, empty state and recipe navigation update without leaking the previous query",async()=>{
  const f=await setup(14);try {
    f.query('[data-category="herreria"]').click();await until(()=>f.query('.rvc-row'));
    const search=f.query('.rvc-search');search.value='does not exist';search.dispatchEvent(new f.dom.window.Event('input'));
    assert.equal(f.query('.rvc-empty').hidden,false);f.query('[data-act="clear"]').click();assert.equal(f.query('.rvc-empty').hidden,true);assert.ok(f.query('.rvc-row'));
    f.query('[data-act="back"]').click();f.query('[data-category="alquimia"]').click();await flush();assert.equal(search.value,'');assert.equal(f.query('.rvc-empty').hidden,false);
  }finally{await f.app.close();f.dom.window.close();}
});
test("PF2e two hits refund half, close counts remaining misses, and failure restores coin",async()=>{
  const f=await setup(14);try {
    await f.choose();f.query('.rvc-craft').click();await f.play([3000,3000,null]);assert.equal(f.wallet.copperValue,8750);assert.equal(f.a.items.size,0);
    const fundsBeforeFailure = f.wallet.copperValue;
    const originalError = console.error;console.error=()=>{};f.env.failRoll=true;
    try {await f.app.craft();assert.equal(f.wallet.copperValue,fundsBeforeFailure);} finally {f.env.failRoll=false;console.error=originalError;}
    const attempt=f.app.craft();await until(()=>f.query('.rvc-strikes').children.length===1);f.tick(3000);f.query('.rvc-strike').click();await f.app.close();await attempt;
    assert.equal(f.wallet.copperValue,8750-2500+833);assert.equal(f.a.items.size,0);
  }finally{await f.app.close();f.dom.window.close();}
});
test("PF2e extended workshop still exposes Crafting proficiency, all activities and its language selector",async()=>{
  const f=await setup(14);try {
    await f.app.close();game.modules.get(MODULE_ID).api.openExtended();const app=f.env.dialogs.at(-1);
    assert.equal(app.element.querySelectorAll('#rv-category-screen [data-category]').length,12);
    assert.equal(app.element.querySelector('[data-category="herreria"]').disabled,false);
    assert.ok(app.element.querySelector('.rv-category-icon'));
    app.element.querySelector('#rv-lang-toggle').click();assert.match(app.element.querySelector('#rv-category-screen').textContent,/Blacksmith/);
    for(const [category,label] of [['edificios','Building'],['cultivos','Farming'],['monstruos','Scavenging']]) assert.equal(app.element.querySelector(`[data-category="${category}"] .cat-label`).textContent,label);
    const controlled=canvas.tokens.controlled,character=game.user.character,opened=f.env.dialogs.length;
    canvas.tokens.controlled=[];game.user.character=null;
    assert.equal(game.modules.get(MODULE_ID).api.openExtended(),undefined);assert.equal(f.env.dialogs.length,opened);
    canvas.tokens.controlled=controlled;game.user.character=character;
    assert.ok(app.options.classes.includes('rv-crafting-dialog'));
    await f.env.seed();
    const food=f.a.items.find(item=>item.name==='Food Supplies');
    const quantity=food.system.quantity;
    app.element.querySelector('[data-category="recoleccion"]').click();
    app.element.querySelector('[data-gather="comida"]').click();
    app.element.querySelector('#rv-btn-gather-start').click();
    for(let i=0;i<3;i++) {
      await until(()=>app.element.querySelectorAll('#rv-gather-icons .rv-forge-icon').length===i+1);
      const strike=app.element.querySelectorAll('#rv-gather-icons .rv-forge-icon')[i];
      assert.equal(strike.tagName,'BUTTON');assert.equal(document.activeElement,strike);
      f.tick(3000);strike.click();assert.equal(strike.disabled,true);assert.ok(strike.classList.contains('hit'));
      strike.click(); // A resolved button cannot score a second hit.
    }
    await until(()=>food.system.quantity===quantity+8);
    assert.match(app.element.querySelector('#rv-gather-result').textContent,/3\/3/);
    assert.ok(f.env.sounds.some(sound=>sound.src.endsWith('-hit.ogg')));
    await app.close();
  }finally{f.dom.window.close();}
});
