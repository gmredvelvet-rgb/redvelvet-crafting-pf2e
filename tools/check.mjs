import fs from "node:fs";
import {parse} from "acorn";
import {ASSETS,MODULE_ID} from "../scripts/assets.js";
import {SFX_NAV,SFX_HIT,SFX_MISS} from "../scripts/audio.js";
const manifest=JSON.parse(fs.readFileSync("module.json","utf8"));
let files=0;
function check(file) {if(!fs.existsSync(file))throw Error(`Missing ${file}`);if(!fs.statSync(file).size)throw Error(`Empty ${file}`);files++;}
for(const entry of [...manifest.esmodules,...manifest.styles,...manifest.languages.map(lang=>lang.path)]) check(entry);
for(const value of [...Object.values(ASSETS.bg),...Object.values(ASSETS.icon),...Object.values(SFX_NAV),...Object.values(SFX_HIT),...Object.values(SFX_MISS)]) check(value.replace(`modules/${MODULE_ID}/`,""));
for(const lang of manifest.languages) JSON.parse(fs.readFileSync(lang.path,"utf8"));
function walk(path) {for(const file of fs.readdirSync(path,{withFileTypes:true})) {const name=`${path}/${file.name}`;if(file.isDirectory())walk(name);else if(name.endsWith(".js"))parse(fs.readFileSync(name,"utf8"),{ecmaVersion:"latest",sourceType:"module"});}}
walk("scripts");
const source=fs.readFileSync("scripts/crafting-dialog.js","utf8");
if(/https:\/\/(files.catbox.moe|i.pinimg.com)|assets\/sfx random|SFXBG3/.test(source))throw Error("External legacy assets or fallback dice remain");
if(manifest.compatibility.minimum!=="12" || manifest.compatibility.verified!=="14")throw Error("Incorrect Foundry compatibility");
console.log(`Checked ${files} runtime references, JSON and JavaScript syntax. No remote art or third-party audio dependencies.`);
