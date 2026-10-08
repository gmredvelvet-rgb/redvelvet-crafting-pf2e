export const MODULE_ID = "redvelvet-crafting-pf2e";
const root = `modules/${MODULE_ID}/assets`;
export const ASSETS = {
  bg: Object.fromEntries(Object.entries({
    menu: "workshop-dnd5e.png", workshop: "workshop-dnd5e.png", rules: "rules-original.jpg",
    blacksmith: "blacksmith-original.png", alchemy: "alchemy-original.png", jewelry: "jewelry-original.png",
    wilds: "wilds-original.png", leatherwork: "leatherwork-generated.png", equipment: "equipment-generated.png",
    construction: "construction-original.jpg", farming: "farming-generated.png", scavenging: "monster-scavenging-generated.png"
  }).map(([key, file]) => [key, `${root}/backgrounds/${file}`])),
  icon: Object.fromEntries(["blacksmith-materials", "alchemy-materials", "jewelry-materials", "leatherwork-materials",
    "crafting-materials", "food-supplies", "monster-rations", "construction-materials", "fertilizer", "monster-parts",
    "wood", "planks", "charcoal", "farm-plot", "structure"].map(key => [key, `${root}/icons/${key}.svg`]))
};
export const AUDIO_ROOT = `${root}/audio`;
