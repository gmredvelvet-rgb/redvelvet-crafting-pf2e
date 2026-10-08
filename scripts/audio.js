import { MODULE_ID, AUDIO_ROOT } from "./assets.js";
export const SFX_NAV = {select:`${AUDIO_ROOT}/nav-select.ogg`,back:`${AUDIO_ROOT}/nav-back.ogg`};
const categories = ["herreria","alquimia","joyeria","trabajo-con-piel","equipo-vario","recoleccion","construcciones","cultivos","monstruos"];
export const SFX_HIT = Object.fromEntries(categories.map(key => [key,`${AUDIO_ROOT}/${key}-hit.ogg`]));
export const SFX_MISS = Object.fromEntries(categories.map(key => [key,`${AUDIO_ROOT}/${key}-miss.ogg`]));
export function registerAudioSettings() {
  game.settings.register(MODULE_ID,"soundEnabled",{name:`${MODULE_ID}.Settings.SoundEnabled.Name`,hint:`${MODULE_ID}.Settings.SoundEnabled.Hint`,scope:"client",config:true,type:Boolean,default:true});
  game.settings.register(MODULE_ID,"soundVolume",{name:`${MODULE_ID}.Settings.SoundVolume.Name`,scope:"client",config:true,type:Number,range:{min:0,max:1,step:.05},default:.45});
}
export function playSound(src, volume=1) {
  try {
    if (!src || !game.settings.get(MODULE_ID,"soundEnabled")) return;
    const gain = Math.max(0,Math.min(1,volume * game.settings.get(MODULE_ID,"soundVolume")));
    const helper = globalThis.foundry?.audio?.AudioHelper ?? globalThis.AudioHelper;
    if (!helper?.play || gain === 0) return;
    Promise.resolve().then(() => helper.play({src,volume:gain,loop:false},false)).catch(error => console.debug(`${MODULE_ID} | Audio unavailable`,error));
  } catch (error) {console.debug(`${MODULE_ID} | Audio unavailable`,error);}
}
