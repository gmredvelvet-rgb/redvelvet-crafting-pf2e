import {MODULE_ID} from "../scripts/assets.js";
export class Collection extends Map {
  find(fn) {return [...this.values()].find(fn);}
  filter(fn) {return [...this.values()].filter(fn);}
  some(fn) {return [...this.values()].some(fn);}
}
let counter=0;
const copy = value => JSON.parse(JSON.stringify(value));
function patch(object, data) {
  for (const [path,value] of Object.entries(data)) {
    const parts=path.split(".");
    let target=object;
    for(const key of parts.slice(0,-1)) target=target[key] ??= {};
    target[parts.at(-1)]=copy(value);
  }
}
export function item(actor,data) {
  const doc={...copy(data),id:data._id ?? `item${++counter}`,parent:actor,actor};
  doc.uuid=`${actor.uuid}.Item.${doc.id}`;
  doc.toObject=()=>({_id:doc.id,name:doc.name,type:doc.type,img:doc.img ?? "icons/svg/item-bag.svg",system:copy(doc.system),flags:copy(doc.flags ?? {})});
  doc.update=async updates=>{if(actor.failUpdate) {actor.failUpdate=false;throw Error("update failed");} patch(doc,updates); return doc;};
  doc.delete=async()=>actor.items.delete(doc.id);
  return doc;
}
export function actor(data={}) {
  const doc={id:`actor${++counter}`,name:"Aster",isOwner:true,system:{abilities:{int:{mod:3},str:{mod:2},dex:{mod:4}},attributes:{prof:3},skills:{nat:{total:6},sur:{total:5},ath:{total:5},inv:{total:6}},tools:{smith:{total:7,value:1,ability:"str"}}},flags:{},...data};
  doc.uuid=`Actor.${doc.id}`;
  doc.items=new Collection();
  doc.createEmbeddedDocuments=async(type,rows)=>{
    if(doc.failCreate) {doc.failCreate=false;throw Error("create failed");}
    const docs=rows.map(row=>item(doc,row));
    for(const it of docs) doc.items.set(it.id,it);
    return docs;
  };
  doc.deleteEmbeddedDocuments=async(type,ids)=>ids.forEach(id=>doc.items.delete(id));
  doc.getFlag=(scope,key)=>doc.flags[scope]?.[key];
  doc.setFlag=async(scope,key,value)=>{(doc.flags[scope]??={})[key]=copy(value);return doc;};
  doc.unsetFlag=async(scope,key)=>{delete doc.flags[scope]?.[key];return doc;};
  doc.getRollData=()=>doc.system;
  return doc;
}
export function installEnvironment({window,jquery,generation=14}) {
  const hooks=new Map(),settings=new Map(),notices=[],chat=[],sounds=[];
  const a=actor();
  const modules=new Map([[MODULE_ID,{id:MODULE_ID,active:true,title:"RedVelvet Crafting"}]]);
  const env={settingDefaults:new Map(),actor:a,notices,chat,sounds,rollResult:20,rollCount:0,hooks,dialogs:[]};
  const Hooks={once:(event,fn)=>{(hooks.get(event)??hooks.set(event,[]).get(event)).push(fn);},on:(event,fn)=>{(hooks.get(event)??hooks.set(event,[]).get(event)).push(fn);}};
  class Dialog {
    constructor(data,options={}) {this.data=data;this.options={...options};env.dialogs.push(this);}
    render() {
      this.element=window.document.createElement("div");
      this.element.className="app dialog rv-crafting-dialog";
      this.element.innerHTML=`<header class="window-header">${this.data.title}</header><div class="window-content">${this.data.content}</div>`;
      window.document.body.append(this.element);
      this.data.render(jquery(this.element.querySelector(".window-content")));
      return this;
    }
    bringToTop() {this.raised=true;}
    async close() {await this.data.close();this.element.remove();}
  }
  class Roll {
    constructor(formula) {this.formula=formula;}
    async evaluate() {
      env.rollCount++;
      if(env.failRoll) throw Error("roll failed");
      this.total=env.rollResult + Number(this.formula.split("+")[1] ?? 0);
      this.dice=[{faces:20,results:[{result:env.rollResult}]}];return this;
    }
    async toMessage(data) {if(env.failChat) throw Error("chat failed");chat.push(data);}
  }
  env.nativeChecks=[];
  async function nativeCheck(kind,config,dialog,message) {
    env.nativeChecks.push({kind,config,dialog,message});
    if(env.cancelCheck) return null;
    const mod = kind === "skill" ? a.system.skills[config.skill]?.total ?? 0
      : kind === "tool" ? a.system.tools[config.tool]?.total ?? 3
      : a.system.abilities[config.ability]?.mod ?? 0;
    const roll = await new Roll(`1d20 + ${mod}`).evaluate();
    roll.options={};return [roll];
  }
  a.rollSkill=(...args)=>nativeCheck("skill",...args);
  a.rollToolCheck=(...args)=>nativeCheck("tool",...args);
  a.rollAbilityCheck=(...args)=>nativeCheck("ability",...args);
  const game={view:"game",release:{generation},system:{id:"dnd5e",version:generation===14 ? "6.0.5" : "4.4.0"},modules,user:{id:"gm",name:"GM",isGM:true,character:a},users:[{id:"gm",active:true,isGM:true}],i18n:{lang:"es",localize:key=>key,format:(key,data)=>key},settings:{register:(id,key,def)=>{env.settingDefaults.set(`${id}.${key}`,def);settings.set(`${id}.${key}`,key==="craftingMode" ? (Object.hasOwn(env,"craftingMode") ? env.craftingMode ?? def.default : "extended") : def.default);},registerMenu:()=>{},get:(id,key)=>settings.get(`${id}.${key}`),set:async(id,key,value)=>settings.set(`${id}.${key}`,value)}};
  const AudioHelper={play:async data=>sounds.push(data)};
  const globals={window,document:window.document,localStorage:window.localStorage,$:jquery,Hooks,game,canvas:{tokens:{controlled:[{actor:a}]}},ui:{notifications:{warn:msg=>notices.push(msg),error:msg=>notices.push(msg),info:msg=>notices.push(msg)}},Roll,ChatMessage:{getSpeaker:()=>({actor:a.id}),create:async data=>{if(env.failChat)throw Error("chat failed");chat.push(data);}},fromUuid:async uuid=>env.documents?.get(uuid)};
  globals.foundry=generation===14 ? {appv1:{api:{Dialog}},audio:{AudioHelper},applications:{api:{ApplicationV2:class{}}}} : {applications:{api:{ApplicationV2:class{}}},audio:{AudioHelper}};
  if(generation===13) globals.Dialog=Dialog;
  for (const [key,value] of Object.entries(globals)) if (globalThis[key] !== value) globalThis[key]=value;
  env.fire=async event=>{for(const fn of hooks.get(event)??[]) await fn();};
  env.seed=async()=>{
    await a.createEmbeddedDocuments("Item",[{name:"Smith's Tools",type:"tool",system:{quantity:1,type:{baseItem:"smith"}}},...["carpenter","mason","tinker"].map(id=>({name:`${id} tools`,type:"tool",system:{quantity:1,type:{baseItem:id}}})),...[
      "Blacksmith Materials","Alchemy Materials","Jewelry Materials","Leatherwork Materials","Crafting Materials","Food Supplies","Wood","Construction Materials","Planks","Charcoal","Fertilizer","Monster Parts"
    ].map(name=>({name,type:"loot",img:"icons/svg/coins.svg",system:{quantity:2000},flags:{[MODULE_ID]:{material:name}}}))]);
  };
  return env;
}
