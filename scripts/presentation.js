import {ASSETS} from "./assets.js";

/** The same decorative icon layout in both extended workshops. No game data changes. */
export function applyWorkshopIcons(html) {
  const groups = [
    [".rv-cat-btn", "category", {herreria:"blacksmith-materials",alquimia:"alchemy-materials",joyeria:"jewelry-materials","trabajo-con-piel":"leatherwork-materials","equipo-vario":"crafting-materials",recoleccion:"food-supplies",construcciones:"construction-materials",edificios:"structure",reciclaje:"charcoal",cultivos:"farm-plot",monstruos:"monster-parts"}],
    [".rv-gather-btn", "gather", {comida:"food-supplies",construccion:"construction-materials","alquimia-rec":"alchemy-materials","herreria-rec":"blacksmith-materials","joyeria-rec":"jewelry-materials","piel-rec":"leatherwork-materials","vario-rec":"crafting-materials","abono-rec":"fertilizer","madera-rec":"wood"}],
    [".rv-build-btn", "build", {tablas:"planks",carbon:"charcoal",piso:"construction-materials",pared:"construction-materials",techo:"construction-materials",puerta:"structure",ventana:"alchemy-materials","mesa-trabajo":"crafting-materials",muebles:"planks",escaleras:"planks"}]
  ];
  for (const [selector,key,icons] of groups) html.find(selector).each((_,button) => {
    const icon = icons[button.dataset[key]];
    if (!icon) return;
    const image = document.createElement("img");
    image.className = key === "category" ? "cat-icon rv-category-icon" : "cat-icon rv-activity-icon";
    image.src = ASSETS.icon[icon]; image.alt = ""; image.draggable = false;
    const slot = button.querySelector(".cat-icon, .rv-img-icon, .rv-activity-icon");
    if (slot) slot.replaceWith(image); else button.prepend(image);
  });
  html.find(".rv-struct-btn").each((_,button) => {
    if (button.querySelector(".rv-activity-icon")) return;
    button.querySelector(".rv-img-icon")?.remove();
    const image=document.createElement("img");image.className="rv-activity-icon";image.src=ASSETS.icon.structure;image.alt="";image.draggable=false;button.prepend(image);
  });
  html.find(".cat-label").each((_,label) => {label.textContent = label.textContent.replace(/^[^\p{L}\p{N}]+/u,"").trim();});
}
