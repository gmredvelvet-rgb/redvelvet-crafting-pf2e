import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const counterpart=path.join(path.dirname(root),path.basename(root).endsWith('pf2e')?'redvelvet-crafting-dnd5e':'redvelvet-crafting-pf2e');
const digest=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
test("distributed editions use identical workshop code, finishing styles, icons and audio",{skip:!fs.existsSync(counterpart)},()=>{
  const files=['scripts/core-crafting.js','scripts/presentation.js','scripts/audio.js','styles/core-crafting.css','styles/crafting.css','assets/backgrounds/workshop-dnd5e.png'];
  for(const folder of ['assets/icons','assets/audio'])for(const file of fs.readdirSync(path.join(root,folder)))files.push(`${folder}/${file}`);
  for(const file of files) assert.equal(digest(path.join(root,file)),digest(path.join(counterpart,file)),file);
});
test("all shared interface strings are localized in both Spanish and English",()=>{
  const module=JSON.parse(fs.readFileSync(path.join(root,'module.json'),'utf8')).id;
  const source=fs.readFileSync(path.join(root,'scripts/core-crafting.js'),'utf8');
  const keys=[...source.matchAll(/(?:this\.)?t\("([A-Za-z.]+)"/g)].map(match=>match[1]);
  for(const language of ['es','en']) {
    const messages=JSON.parse(fs.readFileSync(path.join(root,`lang/${language}.json`),'utf8'));
    for(const key of keys)assert.equal(typeof messages[`${module}.Core.${key}`],'string',`${language}: ${key}`);
  }
});
