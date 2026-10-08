import { applyWorkshopIcons } from "./presentation.js";
/**
 * RedVelvet Crafting System — PF2e Edition
 * Adaptado de D&D5e a Pathfinder 2e por GM RedVelvet
 *
 * Cambios clave respecto a la versión D&D:
 *  - Usa la habilidad "Crafting" (INT) nativa de PF2e
 *  - DC por nivel de objeto (tabla oficial PF2e Core)
 *  - 4 grados de éxito: Critical Success / Success / Failure / Critical Failure
 *  - Coste en materiales propios de cada categoría (Blacksmith/Alchemy/Jewelry/Leatherwork/Crafting Materials)
 *  - Recolección (Gathering): Comida (Survival), Construcción (Athletics), Alquimia (Nature)
 *  - Requiere proficiencia Trained+ en Crafting para intentarlo
 *  - Detección de categorías adaptada a los tipos de item de PF2e
 *    (weapon, armor, equipment, consumable, treasure, shield…)
 *  - Mensajes al chat con formato PF2e nativo
 */

import { SFX_NAV, SFX_HIT, SFX_MISS, playSound, registerAudioSettings } from "./audio.js";
import { MODES, craftingMode, registerCoreMode, openCore, coinsFor } from "./core-crafting.js";

(() => {
  const MODULE_ID = "redvelvet-crafting-pf2e";
  const RV_ASSET_ROOT = `modules/${MODULE_ID}/assets`;
  const RV_ASSETS = {
    bg: {
      workshop: `${RV_ASSET_ROOT}/backgrounds/workshop-dnd5e.png`,
      menu: `${RV_ASSET_ROOT}/backgrounds/workshop-dnd5e.png`,
      rules: `${RV_ASSET_ROOT}/backgrounds/rules-original.jpg`,
      blacksmith: `${RV_ASSET_ROOT}/backgrounds/blacksmith-original.png`,
      alchemy: `${RV_ASSET_ROOT}/backgrounds/alchemy-original.png`,
      jewelry: `${RV_ASSET_ROOT}/backgrounds/jewelry-original.png`,
      wilds: `${RV_ASSET_ROOT}/backgrounds/wilds-original.png`,
      leatherwork: `${RV_ASSET_ROOT}/backgrounds/leatherwork-generated.png`,
      equipment: `${RV_ASSET_ROOT}/backgrounds/equipment-generated.png`,
      construction: `${RV_ASSET_ROOT}/backgrounds/construction-original.jpg`,
      farming: `${RV_ASSET_ROOT}/backgrounds/farming-generated.png`,
      monsterScavenging: `${RV_ASSET_ROOT}/backgrounds/monster-scavenging-generated.png`,
    },
    icon: {
      blacksmith: `${RV_ASSET_ROOT}/icons/blacksmith-materials.svg`,
      alchemy: `${RV_ASSET_ROOT}/icons/alchemy-materials.svg`,
      jewelry: `${RV_ASSET_ROOT}/icons/jewelry-materials.svg`,
      leatherwork: `${RV_ASSET_ROOT}/icons/leatherwork-materials.svg`,
      crafting: `${RV_ASSET_ROOT}/icons/crafting-materials.svg`,
      food: `${RV_ASSET_ROOT}/icons/food-supplies.svg`,
      rations: `${RV_ASSET_ROOT}/icons/monster-rations.svg`,
      construction: `${RV_ASSET_ROOT}/icons/construction-materials.svg`,
      fertilizer: `${RV_ASSET_ROOT}/icons/fertilizer.svg`,
      monsterParts: `${RV_ASSET_ROOT}/icons/monster-parts.svg`,
      wood: `${RV_ASSET_ROOT}/icons/wood.svg`,
      planks: `${RV_ASSET_ROOT}/icons/planks.svg`,
      charcoal: `${RV_ASSET_ROOT}/icons/charcoal.svg`,
      farm: `${RV_ASSET_ROOT}/icons/farm-plot.svg`,
      structure: `${RV_ASSET_ROOT}/icons/structure.svg`,
    },
  };

  const rvIcon = (src, label = "") =>
    `<img class="rv-img-icon" src="${src}" alt="${label}" draggable="false" />`;

  // ─────────────────────────────────────────────────────────────────────────────
  // TABLA DE DC POR NIVEL (PF2e Core Rulebook, Tabla 4-2 "DCs by Level")
  // ─────────────────────────────────────────────────────────────────────────────
  const DC_BY_LEVEL = {
    0: 14, 1: 15, 2: 16, 3: 18, 4: 19, 5: 20, 6: 22, 7: 23, 8: 24,
    9: 26, 10: 27, 11: 28, 12: 30, 13: 31, 14: 32, 15: 34, 16: 35,
    17: 36, 18: 38, 19: 39, 20: 40,
  };

  function getDCforLevel(level) {
    const lvl = Math.max(0, Math.min(20, parseInt(level) || 0));
    return DC_BY_LEVEL[lvl] ?? 14;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // COSTE EN "BATCHES OF MATERIALS" según rareza PF2e
  // En PF2e se gasta la mitad del precio del objeto en materiales.
  // Un "Batch of Materials" equivale a 1 gp de cara al módulo.
  // ─────────────────────────────────────────────────────────────────────────────
  function getBatchCost(item) {
    const rarity = (item.system?.traits?.rarity ?? item.system?.rarity ?? "common").toLowerCase();
    const priceObj = item.system?.price?.value;

    // PF2e almacena el precio como { gp: N, sp: N, cp: N }
    let priceGP = 0;
    if (priceObj && typeof priceObj === "object") {
      priceGP += (priceObj.gp ?? 0);
      priceGP += (priceObj.sp ?? 0) / 10;
      priceGP += (priceObj.cp ?? 0) / 100;
      priceGP += (priceObj.pp ?? 0) * 10;
    } else if (typeof priceObj === "number") {
      priceGP = priceObj;
    }

    // Coste = mitad del precio (redondeado hacia arriba)
    let cost = Math.max(1, Math.ceil(priceGP * 0.5));

    // Rareza aumenta el coste (homebrew razonable)
    const rarityMultiplier = { common: 1, uncommon: 1.5, rare: 2, unique: 3 };
    cost = Math.ceil(cost * (rarityMultiplier[rarity] ?? 1));

    return cost;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // NORMALIZACIÓN DE TEXTO
  // ─────────────────────────────────────────────────────────────────────────────
  const norm = (s) =>
    (s ?? "").toString().toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9 ]/g, "");

  const hasKw = (str, kws) => kws.some((k) => norm(str).includes(k));

  // ─────────────────────────────────────────────────────────────────────────────
  // MATERIALES POR CATEGORÍA
  // Cada oficio consume su propio material (ya no hay uno genérico para todo).
  // ─────────────────────────────────────────────────────────────────────────────
  const CATEGORY_MATERIALS = {
    "herreria":         "Blacksmith Materials",
    "alquimia":         "Alchemy Materials",
    "joyeria":          "Jewelry Materials",
    "trabajo-con-piel": "Leatherwork Materials",
    "equipo-vario":     "Crafting Materials",
  };

  // Emoji e imagen por defecto de cada material (el ítem se crea con ambos)
  const MATERIAL_DEFS = {
    "Blacksmith Materials": {
      emoji: "⚒️",
      img: RV_ASSETS.icon.blacksmith,
    },
    "Alchemy Materials": {
      emoji: "🧪",
      img: RV_ASSETS.icon.alchemy,
    },
    "Jewelry Materials": {
      emoji: "💎",
      img: RV_ASSETS.icon.jewelry,
    },
    "Leatherwork Materials": {
      emoji: "🧵",
      img: RV_ASSETS.icon.leatherwork,
    },
    "Crafting Materials": {
      emoji: "🧰",
      img: RV_ASSETS.icon.crafting,
    },
    "Food Supplies": {
      emoji: "🍖",
      img: RV_ASSETS.icon.food,
    },
    // Compatible con el módulo "Domatori" (findRations busca type "consumable"
    // + slug "monster-ration" o nombre que contenga "monster ration").
    "Monster Rations": {
      emoji: "🐾",
      img: RV_ASSETS.icon.rations,
      itemType: "consumable",
      slug: "monster-ration",
    },
    "Construction Materials": {
      emoji: "🪨",
      img: RV_ASSETS.icon.construction,
    },
    "Fertilizer": {
      emoji: "💩",
      img: RV_ASSETS.icon.fertilizer,
    },
    "Monster Parts": {
      emoji: "🦴",
      img: RV_ASSETS.icon.monsterParts,
    },
    "Wood": {
      emoji: "🪵",
      img: RV_ASSETS.icon.wood,
    },
    "Planks": {
      emoji: "🪚",
      img: RV_ASSETS.icon.planks,
    },
    "Charcoal": {
      emoji: "⚫",
      img: RV_ASSETS.icon.charcoal,
    },
    "Farm Plot": {
      emoji: "🌾",
      img: RV_ASSETS.icon.farm,
    },
    // ── Piezas de construcción (productos del sistema de Construcciones) ──
    "Floor Tile 10x10": {
      emoji: "🟫",
      img: RV_ASSETS.icon.construction,
    },
    "Wall Section 10x10": {
      emoji: "🧱",
      img: RV_ASSETS.icon.construction,
    },
    "Roof Section 10x10": {
      emoji: "🛖",
      img: RV_ASSETS.icon.construction,
    },
    "Reinforced Door": {
      emoji: "🚪",
      img: RV_ASSETS.icon.structure,
    },
    "Glass Window": {
      emoji: "🪟",
      img: RV_ASSETS.icon.alchemy,
    },
    "Workbench": {
      emoji: "🛠️",
      img: RV_ASSETS.icon.crafting,
    },
    "Furniture Set": {
      emoji: "🪑",
      img: RV_ASSETS.icon.planks,
    },
    "Stairs 10x10": {
      emoji: "🪜",
      img: RV_ASSETS.icon.planks,
    },
  };

  // Definición (emoji/img) para cualquier nombre: materiales, piezas o
  // estructuras con nivel ("Warehouse Lvl 2" → def de la estructura Warehouse).
  function anyMaterialDef(name) {
    if (MATERIAL_DEFS[name]) return MATERIAL_DEFS[name];
    const m = /^(.+) Lvl \d+$/.exec(name);
    if (m) {
      const s = Object.values(STRUCTURES).find((st) => st.item === m[1]);
      if (s) return { emoji: s.emoji, img: STRUCT_IMG };
    }
    return {};
  }

  // Nombre mostrado/creado en inventario: "⚒️ Blacksmith Materials"
  const materialLabel = (name) => {
    const def = anyMaterialDef(name);
    return def.emoji ? `${def.emoji} ${name}` : name;
  };

  // Compara ignorando emojis/no-ASCII para reconocer ítems con o sin emoji
  const stripEmoji = (s) =>
    (s ?? "").toString().replace(/[^\x00-\x7F]/g, "").replace(/\s+/g, " ").trim();

  const isMaterialItem = (item, name) =>
    stripEmoji(item.name).toLowerCase() === name.toLowerCase();

  // Busca (o crea) el ítem de material en el inventario del actor.
  async function getOrCreateMaterial(actor, name) {
    let item = actor.items.find((i) => isMaterialItem(i, name)) ?? null;

    if (item) {
      // Si existía con icono por defecto, le asignamos la imagen personalizada
      const def = anyMaterialDef(name);
      const defaultImgs = [
        "icons/svg/item-bag.svg",
        "icons/svg/mystery-man.svg",
        "systems/pf2e/icons/default-icons/equipment.svg",
      ];
      if (def?.img && def.img !== "icons/svg/item-bag.svg" && defaultImgs.includes(item.img)) {
        try { await item.update({ img: def.img }); } catch { /* no crítico */ }
      }
      return item;
    }

    const def = anyMaterialDef(name);
    try {
      const [created] = await actor.createEmbeddedDocuments("Item", [{
        name: materialLabel(name),
        type: def.itemType ?? "equipment",
        img: def.img ?? RV_ASSETS.icon.crafting,
        system: {
          quantity: 0,
          bulk: { value: "L" },
          ...(def.slug ? { slug: def.slug } : {}),
          description: { value: "Material del RedVelvet Crafting System PF2e" },
        },
      }]);
      item = created ?? null;
    } catch (err) {
      console.error("RedVelvet | No se pudo crear el material:", err);
    }

    if (item) ui.notifications.info(STRINGS[currentLang].notifyMatCreated(materialLabel(name)));
    else ui.notifications.error(`RedVelvet Crafting: no se pudo crear "${name}".`);
    return item;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RECOLECCIÓN (GATHERING)
  // No es crafteo: produce recursos usando otras habilidades.
  //   Comida → Survival | Construcción → Athletics | Alquimia → Nature
  // ─────────────────────────────────────────────────────────────────────────────
  const GATHERING_DC = 15;

  const GATHERING_TYPES = {
    "comida": {
      material: "Food Supplies",
      skillSlug: "survival",
      skillAbbr: "sur",
      sfxCat: "equipo-vario",
      bg: RV_ASSETS.bg.wilds,
      icon: RV_ASSETS.icon.food,
    },
    "construccion": {
      material: "Construction Materials",
      skillSlug: "athletics",
      skillAbbr: "ath",
      sfxCat: "herreria",
      bg: RV_ASSETS.bg.construction,
      icon: RV_ASSETS.icon.construction,
    },
    "alquimia-rec": {
      material: "Alchemy Materials",
      skillSlug: "nature",
      skillAbbr: "nat",
      sfxCat: "alquimia",
      bg: RV_ASSETS.bg.alchemy,
      icon: RV_ASSETS.icon.alchemy,
    },
    "herreria-rec": {
      material: "Blacksmith Materials",
      skillSlug: "athletics",
      skillAbbr: "ath",
      sfxCat: "herreria",
      bg: RV_ASSETS.bg.blacksmith,
      icon: RV_ASSETS.icon.blacksmith,
    },
    "joyeria-rec": {
      material: "Jewelry Materials",
      skillSlug: "athletics",
      skillAbbr: "ath",
      sfxCat: "joyeria",
      bg: RV_ASSETS.bg.jewelry,
      icon: RV_ASSETS.icon.jewelry,
    },
    "piel-rec": {
      material: "Leatherwork Materials",
      skillSlug: "survival",
      skillAbbr: "sur",
      sfxCat: "trabajo-con-piel",
      bg: RV_ASSETS.bg.leatherwork,
      icon: RV_ASSETS.icon.leatherwork,
      // Curtir cuero utilizable requiere pieles/partes del despiece de monstruos
      input: { "Monster Parts": 4 },
    },
    "vario-rec": {
      material: "Crafting Materials",
      skillSlug: "society",
      skillAbbr: "soc",
      sfxCat: "equipo-vario",
      bg: RV_ASSETS.bg.equipment,
      icon: RV_ASSETS.icon.crafting,
    },
    "abono-rec": {
      material: "Fertilizer",
      skillSlug: "nature",
      skillAbbr: "nat",
      sfxCat: "trabajo-con-piel",
      bg: RV_ASSETS.bg.farming,
      icon: RV_ASSETS.icon.fertilizer,
      // El abono se hace con harina de huesos del despiece de monstruos
      input: { "Monster Parts": 2 },
    },
    "madera-rec": {
      material: "Wood",
      skillSlug: "athletics",
      skillAbbr: "ath",
      sfxCat: "herreria",
      bg: RV_ASSETS.bg.wilds,
      icon: RV_ASSETS.icon.wood,
    },
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // CULTIVOS (FARMING)
  // Las parcelas se crean con recursos ya producidos y se trabajan con Naturaleza:
  // ciclo de 5 tiradas diarias (DC 15). Producción base 50 🍖; cada fallo −5,
  // cada crítico +5 (fallo crítico −10). El abono (💩) suma +5 por unidad al inicio.
  // El estado del ciclo se guarda en flags del actor (persiste entre sesiones).
  // ─────────────────────────────────────────────────────────────────────────────
  const FARM = {
    plotItem: "Farm Plot",
    plotCost: { "Wall Section 10x10": 2, "Construction Materials": 4, "Food Supplies": 2 },
    dc: 15,
    days: 5,
    baseProduction: 50,
    produce: "Food Supplies",
    fertItem: "Fertilizer",
    fertBonus: 5,
    fertMax: 4,
    delta: { critical_success: 5, success: 0, failure: -5, critical_failure: -10 },
  };

  const FARM_FLAG_SCOPE = "redvelvet-crafting-pf2e";
  const FARM_FLAG_KEY = "farmCycle";

  // ─────────────────────────────────────────────────────────────────────────────
  // DESPIECE DE MONSTRUOS (Monster Scavenging)
  // Mini-juego con Supervivencia (DC 15). Cada monstruo rinde según los aciertos:
  //   3 aciertos → 20 🦴 | 2 aciertos → 10 🦴 | 0-1 aciertos → 0
  // Con el feat "Monster Scavenger" (se verifica en la ficha) el rendimiento
  // mejora siempre: 0 → 4, 10 → 15, 20 → 30.
  // ─────────────────────────────────────────────────────────────────────────────
  const SCAV = {
    material: "Monster Parts",
    dc: 15,
    tierByHits: { 3: 20, 2: 10, 1: 0, 0: 0 },
    featMap: { 0: 4, 10: 15, 20: 30 },
    sfxCat: "trabajo-con-piel",
    bg: RV_ASSETS.bg.monsterScavenging,
    icon: RV_ASSETS.icon.monsterParts,
  };

  function hasMonsterScavengerFeat(actor) {
    return actor.items.some((i) =>
      ["feat", "action", "feature"].includes((i.type ?? "").toLowerCase()) &&
      /monster\s*scaveng/i.test(norm(i.name))
    );
  }

  const getFarmState = (actor) => actor.getFlag(FARM_FLAG_SCOPE, FARM_FLAG_KEY) ?? null;
  const setFarmState = (actor, state) => actor.setFlag(FARM_FLAG_SCOPE, FARM_FLAG_KEY, state);
  const clearFarmState = (actor) => actor.unsetFlag(FARM_FLAG_SCOPE, FARM_FLAG_KEY);

  // Modificador de habilidad PF2e (moderno: actor.skills; legacy: system.skills)
  function getSkillMod(actor, slug, abbr) {
    const pf = actor.skills?.[slug];
    if (pf) return Number(pf.mod ?? pf.check?.mod ?? 0);
    const sys = actor.system?.skills ?? {};
    const s = sys[slug] ?? sys[abbr];
    if (s) return Number(s.totalModifier ?? s.total ?? s.mod ?? s.value ?? 0);
    return 0;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CONSTRUCCIONES (BUILDING)
  // Piezas por set de tiles 2x2 (10ft × 10ft). Cada pieza consume materiales
  // (principalmente Construction Materials de la Recolección) y produce un ítem
  // contable en el inventario. Tirada de Crafting + mini-juego, con grados PF2e.
  // ─────────────────────────────────────────────────────────────────────────────
  // Cadena de la madera: 🪵 Wood (talar) → 🪚 Planks / ⚫ Charcoal.
  // Las piezas con madera piden Tablas; el carbón alimenta Herrería y Cocina.
  const BUILD_PIECES = {
    "tablas": {
      item: "Planks",
      dc: 13,
      cost: { "Wood": 3, "Construction Materials": 1 },
    },
    "carbon": {
      item: "Charcoal",
      dc: 13,
      cost: { "Wood": 4 },
    },
    "piso": {
      item: "Floor Tile 10x10",
      dc: 14,
      cost: { "Construction Materials": 3, "Planks": 1 },
    },
    "pared": {
      item: "Wall Section 10x10",
      dc: 15,
      cost: { "Construction Materials": 6 },
    },
    "techo": {
      item: "Roof Section 10x10",
      dc: 16,
      cost: { "Construction Materials": 4, "Leatherwork Materials": 2, "Planks": 1 },
    },
    "puerta": {
      item: "Reinforced Door",
      dc: 15,
      cost: { "Construction Materials": 2, "Blacksmith Materials": 1, "Planks": 1 },
    },
    "ventana": {
      item: "Glass Window",
      dc: 15,
      cost: { "Construction Materials": 2, "Alchemy Materials": 2 },
    },
    "mesa-trabajo": {
      item: "Workbench",
      dc: 16,
      cost: { "Construction Materials": 3, "Blacksmith Materials": 2, "Planks": 1 },
    },
    "muebles": {
      item: "Furniture Set",
      dc: 14,
      cost: { "Construction Materials": 1, "Leatherwork Materials": 1, "Planks": 2 },
    },
    "escaleras": {
      item: "Stairs 10x10",
      dc: 15,
      cost: { "Construction Materials": 2, "Planks": 2 },
    },
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // BUILDING — ESTRUCTURAS COMPLETAS
  // Se construyen con los Building Assets (piezas) + materiales crudos.
  // Cada estructura tiene Nivel 1/2/3: el coste base se multiplica ×2 por nivel
  // (lvl1 ×1, lvl2 ×2, lvl3 ×4) y mejorar consume la estructura del nivel previo.
  // ─────────────────────────────────────────────────────────────────────────────
  const STRUCT_IMG = RV_ASSETS.icon.structure;
  const STRUCT_MAX_LVL = 3;

  const STRUCTURES = {
    // 🏠 Infraestructura
    "almacen":       { group: "infraestructura", emoji: "📦", item: "Warehouse",         baseDC: 15, base: { "Floor Tile 10x10": 2, "Wall Section 10x10": 4, "Roof Section 10x10": 2, "Reinforced Door": 1 } },
    "herreria-e":    { group: "infraestructura", emoji: "🔥", item: "Smithy",            baseDC: 16, base: { "Floor Tile 10x10": 2, "Wall Section 10x10": 4, "Roof Section 10x10": 2, "Reinforced Door": 1, "Workbench": 1, "Blacksmith Materials": 2, "Charcoal": 2 } },
    "laboratorio":   { group: "infraestructura", emoji: "⚗️", item: "Alchemy Lab",       baseDC: 16, base: { "Floor Tile 10x10": 2, "Wall Section 10x10": 4, "Roof Section 10x10": 2, "Reinforced Door": 1, "Workbench": 1, "Alchemy Materials": 2 } },
    "enfermeria":    { group: "infraestructura", emoji: "🏥", item: "Infirmary",         baseDC: 15, base: { "Floor Tile 10x10": 2, "Wall Section 10x10": 4, "Roof Section 10x10": 2, "Reinforced Door": 1, "Furniture Set": 1, "Leatherwork Materials": 1 } },
    "cocina":        { group: "infraestructura", emoji: "🍳", item: "Kitchen",           baseDC: 15, base: { "Floor Tile 10x10": 2, "Wall Section 10x10": 4, "Roof Section 10x10": 2, "Reinforced Door": 1, "Workbench": 1, "Furniture Set": 1, "Charcoal": 1 } },
    "torre":         { group: "infraestructura", emoji: "🗼", item: "Watchtower",        baseDC: 16, base: { "Floor Tile 10x10": 1, "Wall Section 10x10": 4, "Roof Section 10x10": 1, "Stairs 10x10": 1, "Glass Window": 1 } },
    "corral":        { group: "infraestructura", emoji: "🐎", item: "Mount Pen",         baseDC: 14, base: { "Floor Tile 10x10": 2, "Wall Section 10x10": 4, "Reinforced Door": 1, "Leatherwork Materials": 1 } },
    "investigacion": { group: "infraestructura", emoji: "🔬", item: "Research Room",     baseDC: 16, base: { "Floor Tile 10x10": 2, "Wall Section 10x10": 4, "Roof Section 10x10": 2, "Reinforced Door": 1, "Workbench": 1, "Glass Window": 1 } },
    "trofeos":       { group: "infraestructura", emoji: "🏆", item: "Trophy Hall",       baseDC: 15, base: { "Floor Tile 10x10": 2, "Wall Section 10x10": 4, "Roof Section 10x10": 2, "Reinforced Door": 1, "Furniture Set": 2 } },
    // ⚔️ Defensa
    "scorpion":      { group: "defensa", emoji: "🏹", item: "Scorpion Ballista",  baseDC: 17, base: { "Floor Tile 10x10": 1, "Blacksmith Materials": 4, "Leatherwork Materials": 2 } },
    "catapulta":     { group: "defensa", emoji: "💥", item: "Catapult",           baseDC: 17, base: { "Floor Tile 10x10": 2, "Blacksmith Materials": 3, "Construction Materials": 4 } },
    "arpon":         { group: "defensa", emoji: "🎯", item: "Wyvern Harpoon",     baseDC: 18, base: { "Floor Tile 10x10": 1, "Blacksmith Materials": 5, "Leatherwork Materials": 3 } },
    "empalizada":    { group: "defensa", emoji: "🪵", item: "Palisade",           baseDC: 14, base: { "Wall Section 10x10": 4 } },
    "barricada":     { group: "defensa", emoji: "🛡️", item: "Mobile Barricade",   baseDC: 14, base: { "Wall Section 10x10": 2, "Blacksmith Materials": 1 } },
    "jaula":         { group: "defensa", emoji: "🪤", item: "Capture Cage",       baseDC: 16, base: { "Wall Section 10x10": 2, "Reinforced Door": 1, "Blacksmith Materials": 3 } },
    // 🚚 Transporte
    "carreta":       { group: "transporte", emoji: "🛒", item: "Cart",            baseDC: 15, base: { "Floor Tile 10x10": 1, "Wall Section 10x10": 2, "Blacksmith Materials": 2, "Leatherwork Materials": 1 } },
    // 🧗 Exploración
    "puente":        { group: "exploracion", emoji: "🌉", item: "Portable Bridge", baseDC: 15, base: { "Floor Tile 10x10": 2, "Leatherwork Materials": 2 } },
    "escalera":      { group: "exploracion", emoji: "🪜", item: "Folding Ladder",  baseDC: 13, base: { "Stairs 10x10": 1, "Blacksmith Materials": 1 } },
    "grua":          { group: "exploracion", emoji: "🏗️", item: "Pulley Crane",    baseDC: 16, base: { "Floor Tile 10x10": 1, "Blacksmith Materials": 2, "Leatherwork Materials": 3 } },
    "ascensor":      { group: "exploracion", emoji: "🪢", item: "Rope Elevator",   baseDC: 16, base: { "Floor Tile 10x10": 1, "Blacksmith Materials": 1, "Leatherwork Materials": 4 } },
    "puesto":        { group: "exploracion", emoji: "🏕️", item: "Outpost Camp",    baseDC: 14, base: { "Floor Tile 10x10": 1, "Wall Section 10x10": 2, "Roof Section 10x10": 1, "Leatherwork Materials": 1 } },
    // 🦅 Movilidad
    "ala-delta":     { group: "movilidad", emoji: "🦅", item: "Hang Glider",      baseDC: 17, base: { "Leatherwork Materials": 4, "Blacksmith Materials": 1 } },
    "paracaidas":    { group: "movilidad", emoji: "🪂", item: "Wyvern Parachute", baseDC: 16, base: { "Leatherwork Materials": 5, "Crafting Materials": 1 } },
    "arnes":         { group: "movilidad", emoji: "🐉", item: "Flight Harness",   baseDC: 18, base: { "Leatherwork Materials": 3, "Blacksmith Materials": 2, "Jewelry Materials": 1 } },
  };

  // Coste de una estructura a un nivel dado: base × 2^(lvl-1)
  function structureCost(key, lvl) {
    const s = STRUCTURES[key];
    const mult = 2 ** (lvl - 1);
    const cost = {};
    for (const [mat, n] of Object.entries(s.base)) cost[mat] = n * mult;
    return cost;
  }

  // Nombre del ítem de inventario de una estructura a un nivel: "Warehouse Lvl 2"
  const structureItemName = (key, lvl) => `${STRUCTURES[key].item} Lvl ${lvl}`;

  // DC de una estructura a un nivel: base +2 por nivel extra
  const structureDC = (key, lvl) => STRUCTURES[key].baseDC + 2 * (lvl - 1);

  // ─────────────────────────────────────────────────────────────────────────────
  // DETECCIÓN DE CATEGORÍA (adaptada a tipos de item PF2e)
  // ─────────────────────────────────────────────────────────────────────────────
  function detectCategory(item) {
    const type = (item.type ?? "").toLowerCase();
    const name = norm(item.name ?? "");
    const traits = (item.system?.traits?.value ?? []).map((t) => norm(t)).join(" ");

    // HERRERÍA: armas, armaduras metálicas, escudos metálicos
    if (type === "weapon") return "herreria";
    if (type === "armor" || type === "shield") {
      if (hasKw(name + " " + traits, ["plate", "chain", "steel", "iron", "metal", "acero", "hierro", "cadena", "placas"]))
        return "herreria";
      return "trabajo-con-piel"; // armaduras de cuero → piel
    }

    // ALQUIMIA: consumables con rasgo "alchemical", bombas, elixires, pociones
    if (type === "consumable") {
      if (hasKw(name + " " + traits, ["alchemical", "elixir", "bomb", "poison", "mutagen", "snare", "potion", "oil", "tincture", "alquim", "elixir", "bomba", "veneno", "pocion", "aceite"]))
        return "alquimia";
      // Pociones mágicas también van aquí
      if (traits.includes("potion") || traits.includes("elixir")) return "alquimia";
    }

    // JOYERÍA: tesoros, joyas, objetos mágicos de adorno
    if (type === "treasure") return "joyeria";
    if (type === "equipment" || type === "worn") {
      if (hasKw(name + " " + traits, ["ring", "amulet", "necklace", "gem", "jewel", "crown", "brooch", "medallion", "bracelet", "anillo", "amuleto", "collar", "gema", "joya", "corona", "broche", "medallion", "pulsera"]))
        return "joyeria";
    }

    // TRABAJO CON PIEL Y TELA: armaduras ligeras, ropa, capas
    if (type === "armor" || type === "equipment" || type === "worn") {
      if (hasKw(name + " " + traits, ["leather", "hide", "cloth", "robe", "cloak", "boots", "gloves", "hat", "belt", "backpack", "cuero", "tela", "ropa", "capa", "botas", "guantes", "sombrero", "cinturon", "mochila"]))
        return "trabajo-con-piel";
    }

    // EQUIPO VARIO: kits, herramientas, objetos de aventura
    if (type === "equipment") {
      if (hasKw(name + " " + traits, ["kit", "tool", "artisan", "herramienta", "kit", "artesano"]))
        return "equipo-vario";
    }

    return "equipo-vario"; // fallback
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PROFICIENCIA CRAFTING EN PF2E
  // ─────────────────────────────────────────────────────────────────────────────
  function getCraftingData(actor) {
    // PF2e guarda las habilidades en actor.system.skills
    const skill = actor.system?.skills?.crafting ?? actor.system?.skills?.cra;
    if (!skill) return { mod: 0, rank: 0, label: "Untrained" };

    const rankNames = ["Untrained", "Trained", "Expert", "Master", "Legendary"];
    const rank = skill.rank ?? 0;
    return {
      mod: skill.totalModifier ?? skill.value ?? 0,
      rank,
      label: rankNames[rank] ?? "Untrained",
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // GRADOS DE ÉXITO PF2E
  // Critical Success: supera DC+10 o nat 20 → éxito total + bonus
  // Success: supera DC → éxito normal
  // Failure: no supera DC → fallo, recupera 50%
  // Critical Failure: falla DC-10 o nat 1 → fallo total, sin recuperación
  // ─────────────────────────────────────────────────────────────────────────────
  function getDegreeOfSuccess(roll, dc, naturalRoll) {
    let degree;
    if (roll >= dc + 10 || naturalRoll === 20) degree = "critical_success";
    else if (roll >= dc) degree = "success";
    else if (roll <= dc - 10 || naturalRoll === 1) degree = "critical_failure";
    else degree = "failure";

    // Ajuste por nat 20/1 (sube/baja un grado)
    if (naturalRoll === 20 && degree === "success") degree = "critical_success";
    if (naturalRoll === 20 && degree === "failure") degree = "success";
    if (naturalRoll === 1 && degree === "success") degree = "failure";
    if (naturalRoll === 1 && degree === "critical_success") degree = "success";

    return degree;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RAREZA EN PF2E
  // ─────────────────────────────────────────────────────────────────────────────
  function getRarityInfo(item) {
    const rarity = (item.system?.traits?.rarity ?? item.system?.rarity ?? "common").toLowerCase();
    const icons = { common: "⚪", uncommon: "🟢", rare: "🔵", unique: "🟣" };
    const labels = STRINGS[currentLang].rarity;
    return {
      rarity,
      icon: icons[rarity] ?? "⚫",
      label: labels[rarity] ?? labels.common,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // FEATS DE ESPECIALIZACIÓN DE CRAFTEO
  // PF2e tiene feats específicos como "Specialty Crafting (Leatherworking)",
  // "Alchemical Crafting", etc. Sin el feat relevante → penalización -2.
  //
  // Feats buscados por categoría:
  //   herreria:           Specialty Crafting (Blacksmithing / Weaponsmithing / Armorer)
  //   alquimia:           Alchemical Crafting  ← feat explícito requerido en PF2e
  //   joyeria:            Specialty Crafting (Jewelry / Goldsmithing)
  //   trabajo-con-piel:   Specialty Crafting (Leatherworking / Tailoring / Weaving)
  //   equipo-vario:       Cualquier Specialty Crafting (es la categoría genérica)
  // ─────────────────────────────────────────────────────────────────────────────
  const SPECIALTY_KEYWORDS = {
    herreria:           ["blacksmith", "weaponsmith", "armorer", "metalwork", "herrero", "herreria", "forjador", "smith"],
    alquimia:           ["alchemical", "alquimia"],
    joyeria:            ["jewel", "jewelry", "goldsmith", "gemcut", "joyero", "joyeria"],
    "trabajo-con-piel": ["leather", "leatherwork", "tailor", "weav", "clothwork", "cuero", "piel", "tela", "costura"],
    "equipo-vario":     ["woodwork", "carpent", "stonemason", "tinker", "madera", "carpintero", "piedra", "artisan"],
  };

  function getCraftingFeatInfo(actor, category) {
    const keywords = SPECIALTY_KEYWORDS[category] ?? [];
    const feats = actor.items.filter((i) =>
      ["feat", "action", "feature"].includes(i.type)
    );

    for (const feat of feats) {
      const featNorm = norm(feat.name ?? "");
      const descNorm = norm(feat.system?.description?.value ?? "").slice(0, 500);
      const combined  = featNorm + " " + descNorm;

      // Alchemical Crafting: feat específico requerido en PF2e para alquimia
      if (category === "alquimia") {
        if (featNorm.includes("alchemical") && featNorm.includes("craft")) {
          return { hasFeat: true, modifier: 0, foundFeat: feat.name };
        }
      }

      // Specialty Crafting + keyword de esta categoría en nombre o descripción
      if (featNorm.includes("specialty") && featNorm.includes("craft")) {
        // equipo-vario: cualquier Specialty Crafting sirve (categoría genérica)
        if (category === "equipo-vario") return { hasFeat: true, modifier: 0, foundFeat: feat.name };
        if (keywords.some((k) => combined.includes(k))) return { hasFeat: true, modifier: 0, foundFeat: feat.name };
      }

      // Feat cuyo nombre contiene keyword de la categoría + término de crafteo
      const hasCraftTerm = ["craft", "artisan", "work", "artesano"].some((t) => featNorm.includes(t));
      if (hasCraftTerm && keywords.some((k) => featNorm.includes(k))) {
        return { hasFeat: true, modifier: 0, foundFeat: feat.name };
      }
    }

    return { hasFeat: false, modifier: -2, foundFeat: null };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // FUNCIÓN PRINCIPAL
  // ─────────────────────────────────────────────────────────────────────────────
  // REPRODUCCIÓN DE SONIDO — usa la API de Foundry para evitar bloqueos
  // del navegador y problemas de CSP con URLs externas.
  // ─────────────────────────────────────────────────────────────────────────────
  // Audio local compartido: configuración individual en audio.js.
  // ─────────────────────────────────────────────────────────────────────────────
  // INTERNACIONALIZACIÓN — ES / EN
  // ─────────────────────────────────────────────────────────────────────────────
  let currentLang = (() => {
    try { return localStorage.getItem("rv-crafting-lang") ?? "es"; }
    catch { return "es"; }
  })();

  const STRINGS = {
    es: {
      dlgTitle: "RedVelvet — Crafteo PF2e",
      catTitle: "⚒️ RedVelvet Crafting",
      catSubtitle: "Selecciona tu categoría de oficio",
      langToggle: "🌐 EN",
      cats: {
        herreria: "Herrería", alquimia: "Alquimia", joyeria: "Joyería",
        "trabajo-con-piel": "Piel & Tela", "equipo-vario": "Equipo Vario",
        recoleccion: "Recolección", construcciones: "Building Assets",
        edificios: "Construcciones", reciclaje: "Reciclaje",
        cultivos: "Cultivos", monstruos: "Despiece", reglas: "Reglas de Crafteo",
      },
      backMenu: "⬅️ Menú", backRules: "⬅️ Volver al menú",
      rulesH1: "🎯 Cómo funciona el Crafteo (PF2e)",
      rules: [
        "1. Cada categoría usa su <strong>propio material</strong> en tu inventario (ver lista abajo).",
        "2. Debes tener al menos <strong>Trained</strong> en la habilidad <strong>Crafting</strong>.",
        "3. Elige una categoría y arrastra un objeto desde un compendio al área de drop.",
        "4. El DC depende del <strong>nivel del objeto</strong> (tabla oficial PF2e).",
        "5. Pulsa <strong>Iniciar Creación</strong>: se tirará tu Crafting skill.",
        "6. Luego aparece el <strong>mini-juego</strong>: haz clic en los iconos cuando brillen en oro.",
        "7. Los aciertos modifican el grado de éxito final (ver abajo).",
      ],
      matsH1: "🧱 Materiales por categoría",
      mats: [
        "🔨 Herrería → <strong>⚒️ Blacksmith Materials</strong>",
        "🧪 Alquimia → <strong>🧪 Alchemy Materials</strong>",
        "🪙 Joyería → <strong>💎 Jewelry Materials</strong>",
        "🧺 Piel & Tela → <strong>🧵 Leatherwork Materials</strong>",
        "🧰 Equipo Vario → <strong>🧰 Crafting Materials</strong>",
      ],
      gatherH1: "🌿 Recolección (Gathering)",
      gatherRules: [
        "La Recolección <strong>no es crafteo</strong>: sirve para conseguir recursos y no requiere Crafting.",
        "🍖 Comida → <strong>Supervivencia</strong> (produce 🍖 Food Supplies)",
        "🪨 Construcción → <strong>Atletismo</strong> (produce 🪨 Construction Materials)",
        "🌿 Alquimia → <strong>Naturaleza</strong> (produce 🧪 Alchemy Materials)",
        "⛏️ Minerales → <strong>Atletismo</strong> (produce ⚒️ Blacksmith Materials)",
        "💎 Gemas → <strong>Atletismo</strong> (produce 💎 Jewelry Materials)",
        "🧵 Pieles → <strong>Supervivencia</strong> (produce 🧵 Leatherwork Materials; <strong>requiere 4 🦴 Monster Parts</strong> para curtir cuero utilizable)",
        "🧰 Varios → <strong>Sociedad</strong> (produce 🧰 Crafting Materials)",
        "💩 Abono → <strong>Naturaleza</strong> (produce 💩 Fertilizer; <strong>requiere 2 🦴 Monster Parts</strong> — harina de huesos)",
        "🪵 Talar → <strong>Atletismo</strong> (produce 🪵 Wood — madera para Tablas y Carbón)",
        "🐾 En Comida puedes <strong>convertir 🍖 Food Supplies en 🐾 Monster Rations (1:1)</strong>, sin tirada ni mini-juego — compatible con el módulo Domatori para alimentar mascotas.",
        "Se tira <strong>1d20 + habilidad</strong> contra <strong>DC 15</strong>: cuanto mejor la tirada, más fácil el mini-juego.",
        "Cada acierto del mini-juego otorga <strong>2 unidades</strong> del recurso.",
        "Si superas la DC por 5 o más, ganas <strong>+2 unidades extra</strong> (con al menos 1 acierto).",
        "Con 0 aciertos no consigues nada. ¡La destreza importa!",
      ],
      buildH1: "🏗️ Building Assets",
      buildRules: [
        "Craftea piezas por <strong>set de tiles 2×2 (10ft × 10ft)</strong>: pisos, paredes, techos, puertas, ventanas, mesas de trabajo, muebles y escaleras.",
        "Cada pieza consume materiales (sobre todo 🪨 Construction Materials) y algunas piden acero, tela o alquimia.",
        "🪚 <strong>Tablas</strong> (3 🪵 + 1 🪨): las piezas con madera (pisos, techos, puertas, mesas, muebles, escaleras) las requieren.",
        "⚫ <strong>Carbón</strong> (4 🪵): combustible para la 🔥 Herrería y la 🍳 Cocina en Construcciones.",
        "Se tira <strong>Crafting</strong> contra el DC de la pieza y se juega el mini-juego (grados de éxito PF2e).",
        "⭐ Éxito Crítico → pieza construida y recuperas el 25% de los materiales.",
        "✅ Éxito → pieza construida (se añade a tu inventario para contabilizarla).",
        "⚠️ Fallo → sin pieza; recuperas el 50% de los materiales.",
        "❌ Fallo Crítico → la estructura colapsa; pierdes todo.",
      ],
      structH1: "🏰 Construcciones (Building)",
      structRules: [
        "Construye <strong>estructuras completas</strong> usando tus Building Assets y materiales: infraestructura (almacén, herrería, laboratorio…), defensa (scorpion, catapulta…), transporte, exploración y movilidad.",
        "Cada estructura tiene <strong>Nivel 1, 2 y 3</strong>: el coste se duplica por nivel (×1, ×2, ×4). Ejemplo: Almacén lvl 1 = 2 pisos + 4 paredes; lvl 2 = 4 y 8; lvl 3 = 8 y 16.",
        "Mejorar a un nivel superior <strong>consume la estructura del nivel anterior</strong> (es una mejora, no un modelo nuevo). Si la construcción falla, la estructura previa NO se pierde.",
        "El DC sube +2 por nivel. Se tira <strong>Crafting</strong> + mini-juego, con los mismos grados de éxito que Building Assets.",
        "La estructura terminada se añade a tu inventario (ej. \"📦 Warehouse Lvl 2\") para contabilizarla.",
      ],
      salvageH1: "♻️ Reciclaje",
      salvageRules: [
        "Arrastra un objeto <strong>de tu inventario</strong> para destruirlo y recuperar materiales, sin mini-juego.",
        "El tipo de material depende de la categoría del objeto (armas → ⚒️, pociones → 🧪, joyas → 💎, etc.).",
        "Recuperas el <strong>25% del precio</strong> del objeto en materiales (mínimo 1).",
        "No puedes reciclar materiales ni piezas de construcción.",
      ],
      scavH1: "🦴 Despiece de Monstruos",
      scavRules: [
        "Tras derrotar un monstruo puedes <strong>despiezarlo</strong> (1 uso por monstruo, a criterio del GM).",
        "Se tira <strong>Supervivencia</strong> contra DC 15 y se juega el mini-juego de 3 iconos.",
        "Rendimiento: <strong>3 aciertos = 20 🦴 Monster Parts</strong> · 2 aciertos = 10 · 0-1 aciertos = 0.",
        "Con el feat <strong>Monster Scavenger</strong> (se verifica en tu ficha) siempre aprovechas más: 0 → 4, 10 → 15, 20 → 30.",
        "Los 🦴 Monster Parts se usan en Recolección: curtir 🧵 Pieles (4 por intento) y fabricar 💩 Abono (2 por intento).",
      ],
      farmH1: "🌾 Cultivos",
      farmRules: [
        "Crea una <strong>🌾 Farm Plot</strong> pagando recursos ya producidos: 2 🧱 paredes (vallado), 4 🪨 y 2 🍖 (semillas).",
        "Con al menos una parcela puedes <strong>iniciar un cultivo</strong>: dura <strong>5 tiradas diarias de Naturaleza</strong> (DC 15), una por día de juego.",
        "La producción empieza en <strong>50 🍖 Food Supplies</strong>: cada fallo <strong>−5</strong>, cada éxito crítico <strong>+5</strong>, fallo crítico <strong>−10</strong>.",
        "Antes de sembrar puedes aplicar <strong>💩 Abono</strong> (hasta 4): cada uno suma <strong>+5</strong> a la producción base. El abono se recolecta con Naturaleza.",
        "Una barra de progreso muestra el día (1-5) y la producción proyectada; al completar el día 5 se cosecha automáticamente.",
        "El progreso se guarda en tu personaje: puedes cerrar y seguir otro día.",
      ],
      degreesH1: "🎖️ Grados de Éxito PF2e",
      degrees: [
        "<strong style='color:#e8c96a;'>⭐ Éxito Crítico</strong> — Creas el objeto y recibes un bonus narrativo (calidad masterwork).",
        "<strong style='color:#4ade80;'>✅ Éxito</strong> — Creas el objeto normalmente.",
        "<strong style='color:#fbbf24;'>⚠️ Fallo</strong> — No creas el objeto; recuperas el 50% de los materiales.",
        "<strong style='color:#f87171;'>❌ Fallo Crítico</strong> — No creas el objeto; los materiales se pierden (o los dañas).",
      ],
      minigameH1: "🎮 El Mini-juego",
      minigame: [
        "• Aparecen 3 iconos en secuencia.",
        "• Cuando el icono <strong>brilla en oro</strong>, haz clic para acertar.",
        "• <strong>3 aciertos</strong> → sube un grado de éxito.",
        "• <strong>2 aciertos</strong> → mantiene el grado de la tirada.",
        "• <strong>0-1 aciertos</strong> → baja un grado de éxito.",
        "• El tiempo de ventana depende de qué tanto superaste el DC.",
      ],
      batchesH1: "📦 Coste de Materiales",
      batches: [
        "El coste es la <strong>mitad del precio en GP</strong> del objeto, pagado con el material de su categoría.",
        "Los objetos raros/únicos cuestan más materiales.",
        "Si no tienes suficientes, el módulo te avisa antes de gastar.",
      ],
      dropzone: "🧱 Arrastra aquí un objeto desde un compendio",
      forgeBtn: "✨ Iniciar Creación",
      profLabel: "Proficiencia:",
      notifyNoToken:      "RedVelvet Crafting: Selecciona un token primero.",
      notifyNoSystem:     "RedVelvet Crafting PF2e: Este módulo requiere el sistema Pathfinder 2e.",
      notifyDropInvalid:  "Drop inválido.",
      notifyItemOnly:     "Solo se pueden arrastrar objetos (Items).",
      notifyItemLoad:     "No se pudo cargar el item.",
      notifyNoTraining:   "Necesitas al menos Trained en Crafting",
      notifyMatCreated:   (m) => `Se añadió '${m}' a tu inventario con cantidad 0.`,
      notifyNeedBatches:  (c, h, m) => `Necesitas ${c} ${m} (tienes ${h}).`,
      catMismatch:  (name, det, sel) => `❌ <strong style="color:#f87171;">${name}</strong> no es un objeto de <em>${sel}</em>.<br><small>Categoría detectada: ${det}</small>`,
      dropReady:    (name) => `✅ <strong>${name}</strong> listo para craftear`,
      itemMeta:     (lvl, rar, cat) => `Nivel ${lvl} · ${rar} · Categoría: ${cat}`,
      dcPill:       (dc) => `🎯 DC ${dc}`,
      batPill:      (c, h, m) => `${m}: ${c} (tienes ${h})`,
      craftPill:    (mod, lbl, extra) => `🛠️ Crafting ${mod >= 0 ? "+" : ""}${mod}${extra} (${lbl})`,
      featOk:       (name) => `✅ ${name}`,
      featWarn:     "⚠️ Sin especialización (-2)",
      featFallback: "Especialización",
      rollVs:       "vs DC",
      degreeShort: {
        critical_success: "⭐ Éxito Crítico",
        success:          "✅ Éxito",
        failure:          "⚠️ Fallo",
        critical_failure: "❌ Fallo Crítico",
      },
      results: {
        critical_success: { label: "⭐ ¡Éxito Crítico!", desc: (n)    => `Creaste <strong>${n}</strong> con maestría. El objeto tiene calidad superior.` },
        success:          { label: "✅ ¡Éxito!",         desc: (n)    => `Creaste <strong>${n}</strong> con éxito.` },
        failure:          { label: "⚠️ Fallo",           desc: (n, r, m) => `No lograste crear <strong>${n}</strong>. Recuperas ${r} ${m}.` },
        critical_failure: { label: "❌ Fallo Crítico",   desc: (n)    => `¡Desastre! Los materiales para <strong>${n}</strong> se pierden por completo.` },
      },
      takeBtn:  "📥 Añadir al inventario",
      takeDone: "✅ Añadido",
      chatTitle:    "🛠️ Intento de Crafteo PF2e",
      chatCrafter:  "Artesano:",
      chatItem:     "Objeto:",
      chatResult:   "Resultado:",
      chatRoll:     "Tirada:",
      chatHits:     "Aciertos mini-juego:",
      chatPenalty:  "Penalización:",
      chatPenaltyReason: (cat) => `sin especialización — ${cat}`,
      chatRefund:   "Reembolso:",
      rarity: { common: "Común", uncommon: "Poco Común", rare: "Raro", unique: "Único" },
      gather: {
        title: "🌿 Recolección",
        subtitle: "Elige qué quieres recolectar",
        types: {
          "comida": "🍖 Comida",
          "construccion": "🪨 Construcción",
          "alquimia-rec": "🌿 Alquimia",
          "herreria-rec": "⛏️ Minerales",
          "joyeria-rec": "💎 Gemas",
          "piel-rec": "🧵 Pieles",
          "vario-rec": "🧰 Varios",
          "abono-rec": "💩 Abono",
          "madera-rec": "🪵 Talar",
        },
        skills: {
          "comida": "Supervivencia",
          "construccion": "Atletismo",
          "alquimia-rec": "Naturaleza",
          "herreria-rec": "Atletismo",
          "joyeria-rec": "Atletismo",
          "piel-rec": "Supervivencia",
          "vario-rec": "Sociedad",
          "abono-rec": "Naturaleza",
          "madera-rec": "Atletismo",
        },
        typeSub: {
          "comida": "Supervivencia",
          "construccion": "Atletismo",
          "alquimia-rec": "Naturaleza",
          "herreria-rec": "Atletismo",
          "joyeria-rec": "Atletismo",
          "piel-rec": "Supervivencia",
          "vario-rec": "Sociedad",
          "abono-rec": "Naturaleza",
          "madera-rec": "Atletismo",
        },
        dcPill:    (dc) => `🎯 DC ${dc}`,
        skillPill: (s, mod) => `🎲 ${s} ${mod >= 0 ? "+" : ""}${mod}`,
        prodPill:  (m) => `📦 Produce: ${m}`,
        inputPill: (emoji, need, have) => `${emoji} Requiere: ${need} (tienes ${have})`,
        needInput: (list) => `Te faltan insumos: ${list}`,
        startBtn:  "✨ Iniciar Recolección",
        rollLine:  (r, s, dc) => `Tiraste <strong>${r}</strong> (${s}) vs DC ${dc}`,
        hitsLine:  (h) => `Aciertos: ${h}/3`,
        resultOkLabel:   "✅ ¡Recolección exitosa!",
        resultOk:  (n, m, bonus) => `Obtienes <strong>${n} ${m}</strong>${bonus ? " (incluye +2 por tu gran tirada)" : ""}.`,
        resultFailLabel: "❌ Sin suerte",
        resultFail: "0 aciertos. No consigues nada esta vez.",
        chatTitle:    "🌿 Intento de Recolección",
        chatGatherer: "Recolector:",
        chatType:     "Tipo:",
        chatSkill:    "Habilidad:",
        chatGot:      "Obtenido:",
        chatNothing:  "Nada (0 aciertos)",
        convertTitle: "🐾 Convertir en Monster Rations (Domatori)",
        convertSel:   (n) => `🍖 → 🐾 : ${n}`,
        convertBtn:   "🐾 Convertir",
        convertNone:  "Elige al menos 1 para convertir.",
        convertNoStock: "No tienes suficientes 🍖 Food Supplies.",
        convertDone:  (n) => `✅ Convertiste ${n} 🍖 Food Supplies en ${n} 🐾 Monster Rations.`,
        convertChatTitle: "🐾 Conversión de Raciones",
        convertChatWho:   "Cocinero:",
        convertChatLine:  (n) => `${n} 🍖 Food Supplies → ${n} 🐾 Monster Rations`,
      },
      build: {
        title: "🏗️ Building Assets",
        subtitle: "Piezas por set de tiles 2×2 (10ft × 10ft)",
        pieces: {
          "tablas":       "🪚 Tablas",
          "carbon":       "⚫ Carbón",
          "piso":         "🟫 Piso 10×10",
          "pared":        "🧱 Pared 10×10",
          "techo":        "🛖 Techo 10×10",
          "puerta":       "🚪 Puerta Reforzada",
          "ventana":      "🪟 Ventana de Cristal",
          "mesa-trabajo": "🛠️ Mesa de Trabajo",
          "muebles":      "🪑 Set de Muebles",
          "escaleras":    "🪜 Escaleras 10×10",
        },
        dcPill:    (dc) => `🎯 DC ${dc}`,
        costPill:  (emoji, need, have) => `${emoji} ${need} (tienes ${have})`,
        costTitle: "📦 Materiales necesarios:",
        startBtn:  "🔨 Construir",
        rollLine:  (r, dc) => `Tiraste <strong>${r}</strong> (Crafting) vs DC ${dc}`,
        hitsLine:  (h) => `Aciertos: ${h}/3`,
        resultCritLabel: "⭐ ¡Obra maestra!",
        resultCrit: (piece, refundTxt) => `Construiste <strong>${piece}</strong> con maestría${refundTxt ? ` y recuperas ${refundTxt} por eficiencia` : ""}. Se añadió a tu inventario.`,
        resultOkLabel: "✅ ¡Construcción exitosa!",
        resultOk:  (piece) => `Construiste <strong>${piece}</strong>. Se añadió a tu inventario.`,
        resultFailLabel: "⚠️ Construcción fallida",
        resultFail: (refundTxt) => `La pieza no quedó estable y se desmontó.${refundTxt ? ` Recuperas ${refundTxt}.` : ""}`,
        resultCritFailLabel: "❌ ¡Desastre!",
        resultCritFail: "La estructura colapsó. Todos los materiales se pierden.",
        needMats:  (list) => `Te faltan materiales: ${list}`,
        chatTitle:   "🏗️ Intento de Construcción",
        chatBuilder: "Constructor:",
        chatPiece:   "Pieza:",
        chatSpent:   "Materiales gastados:",
        chatRefund:  "Recuperado:",
        chatResult:  "Resultado:",
      },
      salvage: {
        title: "♻️ Reciclaje",
        subtitle: "Destruye objetos de tu inventario para recuperar materiales",
        dropzone: "🗑️ Arrastra aquí un objeto desde tu inventario",
        salvageBtn: "♻️ Destruir y reciclar",
        meta: (cat, m) => `Categoría: ${cat} → recupera ${m}`,
        yieldPill: (n, m) => `♻️ Recuperas: ${n} ${m}`,
        qtyPill: (q) => `📦 Cantidad en inventario: ${q} (se recicla 1)`,
        notOwned: "Solo puedes reciclar objetos de tu propio inventario.",
        isMaterial: "No puedes reciclar materiales o piezas de construcción.",
        resultLabel: "♻️ ¡Objeto reciclado!",
        resultText: (item, n, m) => `Destruiste <strong>${item}</strong> y recuperaste <strong>${n} ${m}</strong>.`,
        chatTitle: "♻️ Reciclaje",
        chatWho: "Recicló:",
        chatItem: "Objeto:",
        chatGot: "Recuperado:",
      },
      struct: {
        title: "🏰 Construcciones",
        subtitle: "Estructuras completas hechas con tus Building Assets",
        groups: {
          infraestructura: "🏠 Infraestructura",
          defensa: "⚔️ Defensa",
          transporte: "🚚 Transporte",
          exploracion: "🧗 Exploración",
          movilidad: "🦅 Movilidad",
        },
        items: {
          "almacen": "📦 Almacén",
          "herreria-e": "🔥 Herrería",
          "laboratorio": "⚗️ Lab. de Alquimia",
          "enfermeria": "🏥 Enfermería",
          "cocina": "🍳 Cocina",
          "torre": "🗼 Torre de Vigilancia",
          "corral": "🐎 Corral de Monturas",
          "investigacion": "🔬 Sala de Investigación",
          "trofeos": "🏆 Sala de Trofeos",
          "scorpion": "🏹 Scorpion (Ballesta)",
          "catapulta": "💥 Catapulta",
          "arpon": "🎯 Arpón para Wyverns",
          "empalizada": "🪵 Empalizada",
          "barricada": "🛡️ Barricada Móvil",
          "jaula": "🪤 Jaula de Captura",
          "carreta": "🛒 Carreta",
          "puente": "🌉 Puente Portátil",
          "escalera": "🪜 Escalera Plegable",
          "grua": "🏗️ Grúa de Poleas",
          "ascensor": "🪢 Ascensor de Cuerda",
          "puesto": "🏕️ Puesto Avanzado",
          "ala-delta": "🦅 Ala Delta",
          "paracaidas": "🪂 Paracaídas de Wyvern",
          "arnes": "🐉 Arnés de Vuelo",
        },
        lvlBtn: (n) => `Nivel ${n}`,
        prodPill: (m) => `📦 → ${m}`,
        reqPrevPill: (m) => `⬆️ Mejora: consume 1 ${m}`,
        needPrev: (m) => `Para mejorar necesitas 1 ${m} en tu inventario.`,
        startBtn: "🔨 Construir",
      },
      farm: {
        title: "🌾 Cultivos",
        subtitle: "Crea parcelas y trabájalas con Naturaleza durante 5 días",
        plotsPill: (n) => `🌾 Parcelas: ${n}`,
        fertHavePill: (n) => `💩 Abono disponible: ${n}`,
        createBtn: "🛠️ Crear Parcela",
        createCostTitle: "Coste de la parcela:",
        plotCreated: "🌾 ¡Parcela creada! Se añadió a tu inventario.",
        needPlot: "Necesitas al menos una 🌾 Farm Plot para cultivar.",
        cycleActive: "Ya tienes un cultivo en curso.",
        fertSel: (n, bonus) => `💩 Abono a usar: ${n} (+${bonus} producción)`,
        fertBtnMinus: "−",
        fertBtnPlus: "+",
        startBtn: "🌱 Iniciar cultivo",
        dayLabel: (d, max) => `📅 Día ${d}/${max}`,
        prodLabel: (p, m) => `Producción proyectada: <strong>${p}</strong> ${m}`,
        dailyBtn: "🎲 Tirada diaria (Naturaleza)",
        dayLine: (d, r, dc, deltaTxt) => `Día ${d}: tiraste <strong>${r}</strong> vs DC ${dc} → ${deltaTxt}`,
        deltas: {
          critical_success: "⭐ ¡Crítico! +5 producción",
          success: "✅ Bien cuidado (sin cambios)",
          failure: "⚠️ Mal día: −5 producción",
          critical_failure: "❌ ¡Desastre! −10 producción",
        },
        harvestLabel: "🌾 ¡Cosecha!",
        harvestText: (n, m) => `El cultivo terminó: obtienes <strong>${n} ${m}</strong>.`,
        harvestNone: "El cultivo se echó a perder por completo. No obtienes nada.",
        chatTitle: "🌾 Cultivo",
        chatFarmer: "Agricultor:",
        chatDays: "Tiradas:",
        chatFert: "Abono usado:",
        chatGot: "Cosecha:",
      },
      scav: {
        title: "🦴 Despiece de Monstruos",
        subtitle: "Aprovecha cada parte del monstruo derrotado (1 uso por monstruo)",
        dcPill: (dc) => `🎯 DC ${dc}`,
        skillPill: (mod) => `🎲 Supervivencia ${mod >= 0 ? "+" : ""}${mod}`,
        featOn: "✅ Monster Scavenger",
        featOff: "✖ Sin Monster Scavenger",
        prodPill: (m) => `📦 Produce: ${m}`,
        tierPill: "3 aciertos = 20 · 2 = 10 · 0-1 = 0",
        startBtn: "🔪 Iniciar Despiece",
        rollLine: (r, dc) => `Tiraste <strong>${r}</strong> (Supervivencia) vs DC ${dc}`,
        hitsLine: (h) => `Aciertos: ${h}/3`,
        resultOkLabel: "🦴 ¡Despiece exitoso!",
        resultOk: (n, m) => `Obtienes <strong>${n} ${m}</strong>.`,
        featNote: (base, final) => `Base: ${base} → con Monster Scavenger: <strong>${final}</strong>`,
        resultFailLabel: "❌ Despiece fallido",
        resultFail: "Destrozaste los restos. No obtienes nada.",
        chatTitle: "🦴 Despiece de Monstruo",
        chatWho: "Cazador:",
        chatFeat: "Monster Scavenger:",
        chatGot: "Obtenido:",
      },
    },
    en: {
      dlgTitle: "RedVelvet — PF2e Crafting",
      catTitle: "⚒️ RedVelvet Crafting",
      catSubtitle: "Select your craft category",
      langToggle: "🌐 ES",
      cats: {
        herreria: "Blacksmithing", alquimia: "Alchemy", joyeria: "Jewelry",
        "trabajo-con-piel": "Leather & Cloth", "equipo-vario": "General Gear",
        recoleccion: "Gathering", construcciones: "Building Assets",
        edificios: "Building", reciclaje: "Salvage",
        cultivos: "Farming", monstruos: "Scavenging", reglas: "Crafting Rules",
      },
      backMenu: "⬅️ Menu", backRules: "⬅️ Back to menu",
      rulesH1: "🎯 How Crafting Works (PF2e)",
      rules: [
        "1. Each category uses its <strong>own material</strong> in your inventory (see list below).",
        "2. You need at least <strong>Trained</strong> in the <strong>Crafting</strong> skill.",
        "3. Choose a category and drag an item from a compendium into the drop area.",
        "4. The DC depends on the <strong>item's level</strong> (official PF2e table).",
        "5. Click <strong>Start Crafting</strong>: your Crafting skill will be rolled.",
        "6. The <strong>minigame</strong> appears: click the icons when they glow gold.",
        "7. Hits modify the final degree of success (see below).",
      ],
      matsH1: "🧱 Materials per Category",
      mats: [
        "🔨 Blacksmithing → <strong>⚒️ Blacksmith Materials</strong>",
        "🧪 Alchemy → <strong>🧪 Alchemy Materials</strong>",
        "🪙 Jewelry → <strong>💎 Jewelry Materials</strong>",
        "🧺 Leather & Cloth → <strong>🧵 Leatherwork Materials</strong>",
        "🧰 General Gear → <strong>🧰 Crafting Materials</strong>",
      ],
      gatherH1: "🌿 Gathering",
      gatherRules: [
        "Gathering is <strong>not crafting</strong>: it produces resources and doesn't require Crafting.",
        "🍖 Food → <strong>Survival</strong> (produces 🍖 Food Supplies)",
        "🪨 Construction → <strong>Athletics</strong> (produces 🪨 Construction Materials)",
        "🌿 Alchemy → <strong>Nature</strong> (produces 🧪 Alchemy Materials)",
        "⛏️ Ore → <strong>Athletics</strong> (produces ⚒️ Blacksmith Materials)",
        "💎 Gems → <strong>Athletics</strong> (produces 💎 Jewelry Materials)",
        "🧵 Hides → <strong>Survival</strong> (produces 🧵 Leatherwork Materials; <strong>requires 4 🦴 Monster Parts</strong> to tan usable leather)",
        "🧰 Scrap → <strong>Society</strong> (produces 🧰 Crafting Materials)",
        "💩 Fertilizer → <strong>Nature</strong> (produces 💩 Fertilizer; <strong>requires 2 🦴 Monster Parts</strong> — bone meal)",
        "🪵 Logging → <strong>Athletics</strong> (produces 🪵 Wood — timber for Planks and Charcoal)",
        "🐾 Under Food you can <strong>convert 🍖 Food Supplies into 🐾 Monster Rations (1:1)</strong>, no roll or minigame — compatible with the Domatori module for feeding pets.",
        "You roll <strong>1d20 + skill</strong> against <strong>DC 15</strong>: the better the roll, the easier the minigame.",
        "Each minigame hit grants <strong>2 units</strong> of the resource.",
        "If you beat the DC by 5 or more, you gain <strong>+2 extra units</strong> (with at least 1 hit).",
        "With 0 hits you get nothing. Dexterity matters!",
      ],
      buildH1: "🏗️ Building Assets",
      buildRules: [
        "Craft pieces per <strong>2×2 tile set (10ft × 10ft)</strong>: floors, walls, roofs, doors, windows, workbenches, furniture and stairs.",
        "Each piece consumes materials (mostly 🪨 Construction Materials); some need steel, cloth or alchemy.",
        "🪚 <strong>Planks</strong> (3 🪵 + 1 🪨): wooden pieces (floors, roofs, doors, workbenches, furniture, stairs) require them.",
        "⚫ <strong>Charcoal</strong> (4 🪵): fuel for the 🔥 Smithy and 🍳 Kitchen in Building.",
        "You roll <strong>Crafting</strong> against the piece's DC and play the minigame (PF2e degrees of success).",
        "⭐ Critical Success → piece built and you recover 25% of the materials.",
        "✅ Success → piece built (added to your inventory for tracking).",
        "⚠️ Failure → no piece; you recover 50% of the materials.",
        "❌ Critical Failure → the structure collapses; everything is lost.",
      ],
      structH1: "🏰 Building",
      structRules: [
        "Build <strong>complete structures</strong> from your Building Assets and materials: infrastructure (warehouse, smithy, lab…), defense (scorpion, catapult…), transport, exploration and mobility.",
        "Each structure has <strong>Level 1, 2 and 3</strong>: the cost doubles per level (×1, ×2, ×4). Example: Warehouse lvl 1 = 2 floors + 4 walls; lvl 2 = 4 and 8; lvl 3 = 8 and 16.",
        "Upgrading to a higher level <strong>consumes the previous-level structure</strong> (it's an upgrade, not a new model). If the build fails, the previous structure is NOT lost.",
        "DC increases +2 per level. You roll <strong>Crafting</strong> + minigame, with the same degrees of success as Building Assets.",
        "The finished structure is added to your inventory (e.g. \"📦 Warehouse Lvl 2\") for tracking.",
      ],
      salvageH1: "♻️ Salvage",
      salvageRules: [
        "Drag an item <strong>from your inventory</strong> to destroy it and recover materials — no minigame.",
        "The material type depends on the item's category (weapons → ⚒️, potions → 🧪, jewelry → 💎, etc.).",
        "You recover <strong>25% of the item's price</strong> in materials (minimum 1).",
        "You cannot salvage materials or construction pieces.",
      ],
      scavH1: "🦴 Monster Scavenging",
      scavRules: [
        "After defeating a monster you can <strong>scavenge it</strong> (1 use per monster, at GM's discretion).",
        "You roll <strong>Survival</strong> against DC 15 and play the 3-icon minigame.",
        "Yield: <strong>3 hits = 20 🦴 Monster Parts</strong> · 2 hits = 10 · 0-1 hits = 0.",
        "With the <strong>Monster Scavenger</strong> feat (verified on your sheet) you always get more: 0 → 4, 10 → 15, 20 → 30.",
        "🦴 Monster Parts are used in Gathering: tanning 🧵 Hides (4 per attempt) and making 💩 Fertilizer (2 per attempt).",
      ],
      farmH1: "🌾 Farming",
      farmRules: [
        "Create a <strong>🌾 Farm Plot</strong> by paying resources you already produce: 2 🧱 walls (fencing), 4 🪨 and 2 🍖 (seeds).",
        "With at least one plot you can <strong>start a crop</strong>: it lasts <strong>5 daily Nature rolls</strong> (DC 15), one per game day.",
        "Production starts at <strong>50 🍖 Food Supplies</strong>: each failure <strong>−5</strong>, each critical success <strong>+5</strong>, critical failure <strong>−10</strong>.",
        "Before sowing you can apply <strong>💩 Fertilizer</strong> (up to 4): each adds <strong>+5</strong> to base production. Fertilizer is gathered with Nature.",
        "A progress bar shows the day (1-5) and projected production; completing day 5 harvests automatically.",
        "Progress is saved on your character: you can close and continue another day.",
      ],
      degreesH1: "🎖️ Degrees of Success (PF2e)",
      degrees: [
        "<strong style='color:#e8c96a;'>⭐ Critical Success</strong> — You craft the item with mastery. Superior quality.",
        "<strong style='color:#4ade80;'>✅ Success</strong> — You craft the item normally.",
        "<strong style='color:#fbbf24;'>⚠️ Failure</strong> — You fail; recover 50% of materials.",
        "<strong style='color:#f87171;'>❌ Critical Failure</strong> — You fail; all materials are completely lost.",
      ],
      minigameH1: "🎮 The Minigame",
      minigame: [
        "• 3 icons appear in sequence.",
        "• When an icon <strong>glows gold</strong>, click it to score a hit.",
        "• <strong>3 hits</strong> → raise the degree of success by one.",
        "• <strong>2 hits</strong> → keep the roll's degree.",
        "• <strong>0-1 hits</strong> → lower the degree of success by one.",
        "• The timing window depends on how much you beat the DC.",
      ],
      batchesH1: "📦 Material Cost",
      batches: [
        "The cost is <strong>half the item's GP price</strong>, paid with the category's own material.",
        "Rare/unique items cost more materials.",
        "If you don't have enough, the module warns you before spending.",
      ],
      dropzone: "🧱 Drag an item here from a compendium",
      forgeBtn: "✨ Start Crafting",
      profLabel: "Proficiency:",
      notifyNoToken:      "RedVelvet Crafting: Select a token first.",
      notifyNoSystem:     "RedVelvet Crafting PF2e: This module requires the Pathfinder 2e system.",
      notifyDropInvalid:  "Invalid drop.",
      notifyItemOnly:     "Only items can be dropped here.",
      notifyItemLoad:     "Could not load the item.",
      notifyNoTraining:   "You need at least Trained in Crafting",
      notifyMatCreated:   (m) => `'${m}' added to your inventory with quantity 0.`,
      notifyNeedBatches:  (c, h, m) => `You need ${c} ${m} (you have ${h}).`,
      catMismatch:  (name, det, sel) => `❌ <strong style="color:#f87171;">${name}</strong> is not a <em>${sel}</em> item.<br><small>Detected category: ${det}</small>`,
      dropReady:    (name) => `✅ <strong>${name}</strong> ready to craft`,
      itemMeta:     (lvl, rar, cat) => `Level ${lvl} · ${rar} · Category: ${cat}`,
      dcPill:       (dc) => `🎯 DC ${dc}`,
      batPill:      (c, h, m) => `${m}: ${c} (you have ${h})`,
      craftPill:    (mod, lbl, extra) => `🛠️ Crafting ${mod >= 0 ? "+" : ""}${mod}${extra} (${lbl})`,
      featOk:       (name) => `✅ ${name}`,
      featWarn:     "⚠️ No specialization (-2)",
      featFallback: "Specialization",
      rollVs:       "vs DC",
      degreeShort: {
        critical_success: "⭐ Critical Success",
        success:          "✅ Success",
        failure:          "⚠️ Failure",
        critical_failure: "❌ Critical Failure",
      },
      results: {
        critical_success: { label: "⭐ Critical Success!", desc: (n)    => `You crafted <strong>${n}</strong> with mastery. Superior quality item.` },
        success:          { label: "✅ Success!",           desc: (n)    => `You crafted <strong>${n}</strong> successfully.` },
        failure:          { label: "⚠️ Failure",           desc: (n, r, m) => `You failed to craft <strong>${n}</strong>. You recover ${r} ${m}.` },
        critical_failure: { label: "❌ Critical Failure",  desc: (n)    => `Disaster! The materials for <strong>${n}</strong> are completely lost.` },
      },
      takeBtn:  "📥 Add to inventory",
      takeDone: "✅ Added",
      chatTitle:    "🛠️ PF2e Crafting Attempt",
      chatCrafter:  "Crafter:",
      chatItem:     "Item:",
      chatResult:   "Result:",
      chatRoll:     "Roll:",
      chatHits:     "Minigame hits:",
      chatPenalty:  "Penalty:",
      chatPenaltyReason: (cat) => `no specialization — ${cat}`,
      chatRefund:   "Refund:",
      rarity: { common: "Common", uncommon: "Uncommon", rare: "Rare", unique: "Unique" },
      gather: {
        title: "🌿 Gathering",
        subtitle: "Choose what to gather",
        types: {
          "comida": "🍖 Food",
          "construccion": "🪨 Construction",
          "alquimia-rec": "🌿 Alchemy",
          "herreria-rec": "⛏️ Ore",
          "joyeria-rec": "💎 Gems",
          "piel-rec": "🧵 Hides",
          "vario-rec": "🧰 Scrap",
          "abono-rec": "💩 Fertilizer",
          "madera-rec": "🪵 Logging",
        },
        skills: {
          "comida": "Survival",
          "construccion": "Athletics",
          "alquimia-rec": "Nature",
          "herreria-rec": "Athletics",
          "joyeria-rec": "Athletics",
          "piel-rec": "Survival",
          "vario-rec": "Society",
          "abono-rec": "Nature",
          "madera-rec": "Athletics",
        },
        typeSub: {
          "comida": "Survival",
          "construccion": "Athletics",
          "alquimia-rec": "Nature",
          "herreria-rec": "Athletics",
          "joyeria-rec": "Athletics",
          "piel-rec": "Survival",
          "vario-rec": "Society",
          "abono-rec": "Nature",
          "madera-rec": "Athletics",
        },
        dcPill:    (dc) => `🎯 DC ${dc}`,
        skillPill: (s, mod) => `🎲 ${s} ${mod >= 0 ? "+" : ""}${mod}`,
        prodPill:  (m) => `📦 Produces: ${m}`,
        inputPill: (emoji, need, have) => `${emoji} Requires: ${need} (you have ${have})`,
        needInput: (list) => `You lack inputs: ${list}`,
        startBtn:  "✨ Start Gathering",
        rollLine:  (r, s, dc) => `You rolled <strong>${r}</strong> (${s}) vs DC ${dc}`,
        hitsLine:  (h) => `Hits: ${h}/3`,
        resultOkLabel:   "✅ Gathering successful!",
        resultOk:  (n, m, bonus) => `You obtain <strong>${n} ${m}</strong>${bonus ? " (includes +2 for your great roll)" : ""}.`,
        resultFailLabel: "❌ No luck",
        resultFail: "0 hits. You get nothing this time.",
        chatTitle:    "🌿 Gathering Attempt",
        chatGatherer: "Gatherer:",
        chatType:     "Type:",
        chatSkill:    "Skill:",
        chatGot:      "Obtained:",
        chatNothing:  "Nothing (0 hits)",
        convertTitle: "🐾 Convert to Monster Rations (Domatori)",
        convertSel:   (n) => `🍖 → 🐾 : ${n}`,
        convertBtn:   "🐾 Convert",
        convertNone:  "Choose at least 1 to convert.",
        convertNoStock: "You don't have enough 🍖 Food Supplies.",
        convertDone:  (n) => `✅ Converted ${n} 🍖 Food Supplies into ${n} 🐾 Monster Rations.`,
        convertChatTitle: "🐾 Ration Conversion",
        convertChatWho:   "Cook:",
        convertChatLine:  (n) => `${n} 🍖 Food Supplies → ${n} 🐾 Monster Rations`,
      },
      build: {
        title: "🏗️ Building Assets",
        subtitle: "Pieces per 2×2 tile set (10ft × 10ft)",
        pieces: {
          "tablas":       "🪚 Planks",
          "carbon":       "⚫ Charcoal",
          "piso":         "🟫 Floor 10×10",
          "pared":        "🧱 Wall 10×10",
          "techo":        "🛖 Roof 10×10",
          "puerta":       "🚪 Reinforced Door",
          "ventana":      "🪟 Glass Window",
          "mesa-trabajo": "🛠️ Workbench",
          "muebles":      "🪑 Furniture Set",
          "escaleras":    "🪜 Stairs 10×10",
        },
        dcPill:    (dc) => `🎯 DC ${dc}`,
        costPill:  (emoji, need, have) => `${emoji} ${need} (you have ${have})`,
        costTitle: "📦 Required materials:",
        startBtn:  "🔨 Build",
        rollLine:  (r, dc) => `You rolled <strong>${r}</strong> (Crafting) vs DC ${dc}`,
        hitsLine:  (h) => `Hits: ${h}/3`,
        resultCritLabel: "⭐ Masterwork!",
        resultCrit: (piece, refundTxt) => `You built <strong>${piece}</strong> with mastery${refundTxt ? ` and recover ${refundTxt} through efficiency` : ""}. Added to your inventory.`,
        resultOkLabel: "✅ Construction successful!",
        resultOk:  (piece) => `You built <strong>${piece}</strong>. Added to your inventory.`,
        resultFailLabel: "⚠️ Construction failed",
        resultFail: (refundTxt) => `The piece wasn't stable and fell apart.${refundTxt ? ` You recover ${refundTxt}.` : ""}`,
        resultCritFailLabel: "❌ Disaster!",
        resultCritFail: "The structure collapsed. All materials are lost.",
        needMats:  (list) => `You lack materials: ${list}`,
        chatTitle:   "🏗️ Building Attempt",
        chatBuilder: "Builder:",
        chatPiece:   "Piece:",
        chatSpent:   "Materials spent:",
        chatRefund:  "Recovered:",
        chatResult:  "Result:",
      },
      salvage: {
        title: "♻️ Salvage",
        subtitle: "Destroy items from your inventory to recover materials",
        dropzone: "🗑️ Drag an item here from your inventory",
        salvageBtn: "♻️ Destroy & salvage",
        meta: (cat, m) => `Category: ${cat} → recovers ${m}`,
        yieldPill: (n, m) => `♻️ You recover: ${n} ${m}`,
        qtyPill: (q) => `📦 Quantity in inventory: ${q} (1 will be salvaged)`,
        notOwned: "You can only salvage items from your own inventory.",
        isMaterial: "You cannot salvage materials or construction pieces.",
        resultLabel: "♻️ Item salvaged!",
        resultText: (item, n, m) => `You destroyed <strong>${item}</strong> and recovered <strong>${n} ${m}</strong>.`,
        chatTitle: "♻️ Salvage",
        chatWho: "Salvaged by:",
        chatItem: "Item:",
        chatGot: "Recovered:",
      },
      struct: {
        title: "🏰 Building",
        subtitle: "Complete structures made from your Building Assets",
        groups: {
          infraestructura: "🏠 Infrastructure",
          defensa: "⚔️ Defense",
          transporte: "🚚 Transport",
          exploracion: "🧗 Exploration",
          movilidad: "🦅 Mobility",
        },
        items: {
          "almacen": "📦 Warehouse",
          "herreria-e": "🔥 Smithy",
          "laboratorio": "⚗️ Alchemy Lab",
          "enfermeria": "🏥 Infirmary",
          "cocina": "🍳 Kitchen",
          "torre": "🗼 Watchtower",
          "corral": "🐎 Mount Pen",
          "investigacion": "🔬 Research Room",
          "trofeos": "🏆 Trophy Hall",
          "scorpion": "🏹 Scorpion Ballista",
          "catapulta": "💥 Catapult",
          "arpon": "🎯 Wyvern Harpoon",
          "empalizada": "🪵 Palisade",
          "barricada": "🛡️ Mobile Barricade",
          "jaula": "🪤 Capture Cage",
          "carreta": "🛒 Cart",
          "puente": "🌉 Portable Bridge",
          "escalera": "🪜 Folding Ladder",
          "grua": "🏗️ Pulley Crane",
          "ascensor": "🪢 Rope Elevator",
          "puesto": "🏕️ Outpost Camp",
          "ala-delta": "🦅 Hang Glider",
          "paracaidas": "🪂 Wyvern Parachute",
          "arnes": "🐉 Flight Harness",
        },
        lvlBtn: (n) => `Level ${n}`,
        prodPill: (m) => `📦 → ${m}`,
        reqPrevPill: (m) => `⬆️ Upgrade: consumes 1 ${m}`,
        needPrev: (m) => `To upgrade you need 1 ${m} in your inventory.`,
        startBtn: "🔨 Build",
      },
      farm: {
        title: "🌾 Farming",
        subtitle: "Create plots and work them with Nature for 5 days",
        plotsPill: (n) => `🌾 Plots: ${n}`,
        fertHavePill: (n) => `💩 Fertilizer available: ${n}`,
        createBtn: "🛠️ Create Plot",
        createCostTitle: "Plot cost:",
        plotCreated: "🌾 Plot created! Added to your inventory.",
        needPlot: "You need at least one 🌾 Farm Plot to farm.",
        cycleActive: "You already have a crop in progress.",
        fertSel: (n, bonus) => `💩 Fertilizer to use: ${n} (+${bonus} production)`,
        fertBtnMinus: "−",
        fertBtnPlus: "+",
        startBtn: "🌱 Start crop",
        dayLabel: (d, max) => `📅 Day ${d}/${max}`,
        prodLabel: (p, m) => `Projected production: <strong>${p}</strong> ${m}`,
        dailyBtn: "🎲 Daily roll (Nature)",
        dayLine: (d, r, dc, deltaTxt) => `Day ${d}: you rolled <strong>${r}</strong> vs DC ${dc} → ${deltaTxt}`,
        deltas: {
          critical_success: "⭐ Critical! +5 production",
          success: "✅ Well tended (no change)",
          failure: "⚠️ Bad day: −5 production",
          critical_failure: "❌ Disaster! −10 production",
        },
        harvestLabel: "🌾 Harvest!",
        harvestText: (n, m) => `The crop is done: you obtain <strong>${n} ${m}</strong>.`,
        harvestNone: "The crop was completely ruined. You get nothing.",
        chatTitle: "🌾 Farming",
        chatFarmer: "Farmer:",
        chatDays: "Rolls:",
        chatFert: "Fertilizer used:",
        chatGot: "Harvest:",
      },
      scav: {
        title: "🦴 Monster Scavenging",
        subtitle: "Use every part of the defeated monster (1 use per monster)",
        dcPill: (dc) => `🎯 DC ${dc}`,
        skillPill: (mod) => `🎲 Survival ${mod >= 0 ? "+" : ""}${mod}`,
        featOn: "✅ Monster Scavenger",
        featOff: "✖ No Monster Scavenger",
        prodPill: (m) => `📦 Produces: ${m}`,
        tierPill: "3 hits = 20 · 2 = 10 · 0-1 = 0",
        startBtn: "🔪 Start Scavenging",
        rollLine: (r, dc) => `You rolled <strong>${r}</strong> (Survival) vs DC ${dc}`,
        hitsLine: (h) => `Hits: ${h}/3`,
        resultOkLabel: "🦴 Scavenging successful!",
        resultOk: (n, m) => `You obtain <strong>${n} ${m}</strong>.`,
        featNote: (base, final) => `Base: ${base} → with Monster Scavenger: <strong>${final}</strong>`,
        resultFailLabel: "❌ Scavenging failed",
        resultFail: "You ruined the remains. You get nothing.",
        chatTitle: "🦴 Monster Scavenging",
        chatWho: "Hunter:",
        chatFeat: "Monster Scavenger:",
        chatGot: "Obtained:",
      },
    },
  };

  function applyLang(html) {
    const S = STRINGS[currentLang];
    html.find("#rv-category-screen h2").text(S.catTitle);
    html.find("#rv-category-screen .subtitle").text(S.catSubtitle);
    html.find("#rv-lang-toggle").text(S.langToggle);
    ["herreria", "alquimia", "joyeria", "trabajo-con-piel", "equipo-vario", "recoleccion", "construcciones", "reciclaje", "reglas"].forEach((cat) => {
      html.find(`.rv-cat-btn[data-category="${cat}"] .cat-label`).text(S.cats[cat]);
    });
    html.find("#rv-btn-back-forge").text(S.backMenu);
    html.find("#rv-rules-screen").html(`
      <h3 class="rv-rules-title">${S.rulesH1}</h3>
      ${S.rules.map((r) => `<p>${r}</p>`).join("")}
      <h3 class="rv-rules-title">${S.matsH1}</h3>
      ${S.mats.map((m) => `<p>${m}</p>`).join("")}
      <h3 class="rv-rules-title">${S.degreesH1}</h3>
      ${S.degrees.map((d) => `<p>${d}</p>`).join("")}
      <h3 class="rv-rules-title">${S.minigameH1}</h3>
      ${S.minigame.map((m) => `<p>${m}</p>`).join("")}
      <h3 class="rv-rules-title">${S.batchesH1}</h3>
      ${S.batches.map((b) => `<p>${b}</p>`).join("")}
      <h3 class="rv-rules-title">${S.gatherH1}</h3>
      ${S.gatherRules.map((g) => `<p>${g}</p>`).join("")}
      <h3 class="rv-rules-title">${S.buildH1}</h3>
      ${S.buildRules.map((b) => `<p>${b}</p>`).join("")}
      <h3 class="rv-rules-title">${S.structH1}</h3>
      ${S.structRules.map((t) => `<p>${t}</p>`).join("")}
      <h3 class="rv-rules-title">${S.salvageH1}</h3>
      ${S.salvageRules.map((v) => `<p>${v}</p>`).join("")}
      <h3 class="rv-rules-title">${S.scavH1}</h3>
      ${S.scavRules.map((c) => `<p>${c}</p>`).join("")}
      <h3 class="rv-rules-title">${S.farmH1}</h3>
      ${S.farmRules.map((f) => `<p>${f}</p>`).join("")}
      <button class="rv-back-btn" id="rv-btn-back-rules"
        style="position:relative;bottom:auto;left:auto;margin-top:20px;">${S.backRules}</button>
    `);

    // Pantalla de recolección
    const G = S.gather;
    html.find("#rv-gather-screen h2").text(G.title);
    html.find("#rv-gather-screen .subtitle").text(G.subtitle);
    Object.keys(G.types).forEach((t) => {
      html.find(`.rv-gather-btn[data-gather="${t}"] .cat-label`).text(G.types[t]);
      html.find(`.rv-gather-btn[data-gather="${t}"] .cat-sub`).text(G.typeSub[t]);
    });
    html.find("#rv-btn-gather-start").text(G.startBtn);
    html.find("#rv-btn-back-gather").text(S.backMenu);
    html.find(".rv-convert-title").text(G.convertTitle);
    html.find("#rv-btn-convert-do").text(G.convertBtn);

    // Pantalla de construcciones
    const B = S.build;
    html.find("#rv-build-screen h2").text(B.title);
    html.find("#rv-build-screen .subtitle").text(B.subtitle);
    Object.keys(B.pieces).forEach((p) => {
      html.find(`.rv-build-btn[data-build="${p}"] .cat-label`).text(B.pieces[p]);
    });
    html.find("#rv-btn-build-start").text(B.startBtn);
    html.find("#rv-btn-back-build").text(S.backMenu);

    // Pantalla de reciclaje
    const V = S.salvage;
    html.find("#rv-salvage-screen h2").text(V.title);
    html.find("#rv-salvage-screen .subtitle").text(V.subtitle);
    html.find("#rv-salvage-dropzone").text(V.dropzone);
    html.find("#rv-btn-salvage").text(V.salvageBtn);
    html.find("#rv-btn-back-salvage").text(S.backMenu);

    // Pantalla Building (estructuras)
    const T = S.struct;
    html.find("#rv-struct-screen h2").text(T.title);
    html.find("#rv-struct-screen .subtitle").text(T.subtitle);
    Object.keys(T.groups).forEach((g) => {
      html.find(`.rv-struct-group-title[data-group="${g}"]`).text(T.groups[g]);
    });
    Object.keys(T.items).forEach((k) => {
      html.find(`.rv-struct-btn[data-struct="${k}"] .cat-label`).text(T.items[k]);
    });
    html.find(".rv-lvl-btn").each(function () {
      $(this).text(T.lvlBtn($(this).data("lvl")));
    });
    html.find("#rv-btn-struct-start").text(T.startBtn);
    html.find("#rv-btn-back-struct").text(S.backMenu);

    // Pantalla de cultivos
    const F = S.farm;
    html.find("#rv-farm-screen h2").text(F.title);
    html.find("#rv-farm-screen .subtitle").text(F.subtitle);
    html.find("#rv-btn-farm-create").text(F.createBtn);
    html.find("#rv-btn-farm-start").text(F.startBtn);
    html.find("#rv-btn-farm-daily").text(F.dailyBtn);
    html.find("#rv-btn-back-farm").text(S.backMenu);

    // Pantalla de despiece
    const SC = S.scav;
    html.find("#rv-scav-screen h2").text(SC.title);
    html.find("#rv-scav-screen .subtitle").text(SC.subtitle);
    html.find("#rv-btn-scav-start").text(SC.startBtn);
    html.find("#rv-btn-back-scav").text(S.backMenu);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  function openCraftingDialog() {
    // v13+ keeps the V1 dialog under foundry.appv1; the bare global is deprecated.
    const LegacyDialog = globalThis.foundry?.appv1?.api?.Dialog ?? globalThis.Dialog;
    let craftingDialog = new LegacyDialog({
      title: "RedVelvet — Crafteo PF2e",
      content: `
        <style>
          /* ── Base ── */
          #rv-crafting-root {
            font-family: "Signika", sans-serif;
            position: relative;
            width: 400px;
            min-height: 680px;
            background: #0d0d0d;
            border-radius: 10px;
            overflow: hidden;
            color: #f0e6d3;
          }

          /* ── Pantalla selección categorías ── */
          #rv-category-screen {
            width: 100%;
            min-height: 680px;
            background-image: url('${RV_ASSETS.bg.menu}');
            background-size: cover;
            background-position: center;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 24px 16px;
            box-sizing: border-box;
          }
          #rv-category-screen::before {
            content: '';
            position: absolute;
            inset: 0;
            background: rgba(0,0,0,0.55);
            pointer-events: none;
          }
          #rv-category-screen > * { position: relative; z-index: 1; }

          #rv-category-screen h2 {
            font-size: 22px;
            color: #e8c96a;
            text-shadow: 0 0 12px rgba(232,201,106,0.6);
            margin-bottom: 6px;
            letter-spacing: 1px;
          }
          #rv-category-screen .subtitle {
            font-size: 13px;
            color: #bbb;
            margin-bottom: 24px;
          }

          .rv-category-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
            width: 100%;
            max-width: 340px;
          }
          .rv-cat-btn {
            padding: 14px 10px;
            border-radius: 10px;
            border: 1px solid rgba(232,201,106,0.3);
            background: rgba(20,14,6,0.75);
            color: #f0e6d3;
            font-size: 14px;
            cursor: pointer;
            transition: all 0.25s ease;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 6px;
            backdrop-filter: blur(4px);
          }
          .rv-cat-btn .cat-icon { font-size: 26px; }
          .rv-cat-btn .cat-label { font-size: 12px; font-weight: 600; text-align: center; }
          .rv-cat-btn:hover:not(:disabled) {
            background: rgba(232,201,106,0.18);
            border-color: #e8c96a;
            transform: translateY(-2px);
            box-shadow: 0 4px 16px rgba(232,201,106,0.25);
            color: #e8c96a;
          }
          .rv-cat-btn:disabled {
            opacity: 0.35;
            cursor: not-allowed;
          }
          .rv-cat-btn.rules-btn {
            grid-column: span 2;
            flex-direction: row;
            justify-content: center;
            gap: 10px;
            padding: 10px;
          }

          /* ── Pantalla reglas ── */
          #rv-rules-screen {
            display: none;
            position: absolute;
            inset: 0;
            /* El tinte oscuro va en el propio background: un ::before absoluto solo
               cubre la primera pantalla y al hacer scroll el texto quedaba ilegible */
            background-image: linear-gradient(rgba(0,0,0,0.78), rgba(0,0,0,0.78)), url('${RV_ASSETS.bg.rules}');
            background-size: cover;
            background-position: center;
            overflow-y: auto;
            padding: 20px;
            box-sizing: border-box;
          }
          #rv-rules-screen > * { position: relative; z-index: 1; }
          .rv-rules-title {
            color: #e8c96a;
            font-size: 16px;
            font-weight: bold;
            margin: 16px 0 8px;
          }
          #rv-rules-screen p {
            font-size: 13px;
            color: #ddd;
            margin: 5px 0;
            line-height: 1.5;
          }
          #rv-rules-screen strong { color: #e8c96a; }

          /* ── Pantalla forja ── */
          #rv-forge-screen {
            display: none;
            position: absolute;
            inset: 0;
            flex-direction: column;
            align-items: center;
            text-align: center;
          }
          #rv-forge-bg {
            position: absolute;
            inset: 0;
            background-size: cover;
            background-position: center;
            filter: brightness(0.35);
          }
          #rv-forge-overlay {
            position: relative;
            z-index: 2;
            width: 100%;
            min-height: 680px;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 14px 16px 14px;
            box-sizing: border-box;
            gap: 10px;
          }

          /* Drop zone */
          #rv-dropzone {
            width: 90%;
            min-height: 60px;
            border: 2px dashed rgba(232,201,106,0.45);
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 13px;
            color: #aaa;
            padding: 10px;
            transition: border-color 0.2s, background 0.2s;
            cursor: pointer;
          }
          #rv-dropzone.dragover {
            border-color: #e8c96a;
            background: rgba(232,201,106,0.08);
          }

          /* Info del item */
          #rv-item-info {
            display: none;
            width: 90%;
            background: rgba(10,8,4,0.75);
            border: 1px solid rgba(232,201,106,0.25);
            border-radius: 10px;
            padding: 12px;
            text-align: left;
          }
          .rv-item-header {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 8px;
          }
          .rv-item-header img {
            width: 56px;
            height: 56px;
            border-radius: 8px;
            border: 1px solid #555;
            flex-shrink: 0;
          }
          .rv-item-header .rv-item-texts h4 {
            margin: 0 0 2px;
            font-size: 14px;
            color: #f0e6d3;
          }
          .rv-item-header .rv-item-texts .rv-item-meta {
            font-size: 11px;
            color: #aaa;
          }
          .rv-stat-row {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
            margin-top: 6px;
          }
          .rv-stat-pill {
            background: rgba(232,201,106,0.12);
            border: 1px solid rgba(232,201,106,0.3);
            border-radius: 20px;
            padding: 3px 10px;
            font-size: 12px;
            color: #e8c96a;
          }
          .rv-stat-pill.danger { background: rgba(200,60,60,0.18); border-color: rgba(200,60,60,0.5); color: #f88; }
          .rv-stat-pill.ok { background: rgba(60,180,80,0.18); border-color: rgba(60,180,80,0.5); color: #8f8; }
          .rv-stat-pill.warn { background: rgba(251,191,36,0.18); border-color: rgba(251,191,36,0.5); color: #fbbf24; }

          /* Competencia indicator */
          .rv-proficiency-bar {
            display: flex;
            gap: 4px;
            margin-top: 8px;
            align-items: center;
            font-size: 11px;
            color: #aaa;
          }
          .rv-prof-dot {
            width: 10px; height: 10px;
            border-radius: 50%;
            background: rgba(255,255,255,0.15);
            border: 1px solid #555;
          }
          .rv-prof-dot.filled { background: #e8c96a; border-color: #e8c96a; }
          .rv-prof-dot.master { background: #c084fc; border-color: #c084fc; }
          .rv-prof-dot.legendary { background: #f87171; border-color: #f87171; }

          /* Botón forjar */
          #rv-btn-forge {
            padding: 10px 28px;
            background: linear-gradient(135deg, #c8870a, #e8c96a);
            border: none;
            border-radius: 8px;
            color: #1a0e00;
            font-size: 15px;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.2s;
            box-shadow: 0 0 18px rgba(232,201,106,0.3);
          }
          #rv-btn-forge:hover { transform: scale(1.04); box-shadow: 0 0 28px rgba(232,201,106,0.5); }
          #rv-btn-forge:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

          /* Mini-juego icons */
          #rv-forge-icons {
            display: flex;
            justify-content: center;
            gap: 16px;
            flex-wrap: wrap;
            margin-top: 4px;
          }
          .rv-forge-icon {
            width: 74px;
            height: 74px;
            border-radius: 12px;
            cursor: pointer;
            position: relative;
            overflow: hidden;
            border: 2px solid rgba(255,255,255,0.1);
            transition: box-shadow 0.08s;
          }
          .rv-forge-icon img {
            width: 100%; height: 100%;
            object-fit: cover;
            border-radius: 10px;
          }
          .rv-forge-icon .rv-bar {
            position: absolute;
            bottom: 0; left: 0;
            height: 5px;
            width: 0%;
            background: linear-gradient(90deg, #c8870a, #e8c96a);
            transition: width 0.05s linear;
          }
          .rv-forge-icon .rv-countdown {
            position: absolute;
            top: 50%; left: 50%;
            transform: translate(-50%, -50%);
            font-size: 18px;
            font-weight: bold;
            color: white;
            text-shadow: 0 0 6px #000;
            pointer-events: none;
          }
          .rv-forge-icon.hit { border-color: #4ade80; box-shadow: 0 0 18px rgba(74,222,128,0.6); }
          .rv-forge-icon.miss { border-color: #f87171; box-shadow: 0 0 18px rgba(248,113,113,0.5); }

          /* Resultado */
          #rv-result-box {
            width: 90%;
            border-radius: 10px;
            padding: 12px;
            font-size: 13px;
            display: none;
            text-align: left;
          }
          #rv-result-box.critical_success { background: rgba(232,201,106,0.15); border: 1px solid #e8c96a; }
          #rv-result-box.success          { background: rgba(74,222,128,0.12); border: 1px solid #4ade80; }
          #rv-result-box.failure          { background: rgba(248,113,113,0.1); border: 1px solid #f87171; }
          #rv-result-box.critical_failure { background: rgba(100,30,30,0.3); border: 1px solid #991b1b; }

          .rv-degree-label {
            font-size: 15px;
            font-weight: bold;
            margin-bottom: 6px;
          }
          .critical_success .rv-degree-label { color: #e8c96a; }
          .success .rv-degree-label          { color: #4ade80; }
          .failure .rv-degree-label          { color: #fbbf24; }
          .critical_failure .rv-degree-label { color: #f87171; }

          .rv-take-btn {
            margin-top: 10px;
            padding: 6px 16px;
            background: #e8c96a;
            border: none;
            border-radius: 6px;
            color: #1a0e00;
            font-weight: bold;
            cursor: pointer;
            font-size: 13px;
            transition: opacity 0.2s;
          }
          .rv-take-btn:disabled { opacity: 0.5; cursor: default; }

          /* Botón volver */
          .rv-back-btn {
            position: absolute;
            bottom: 12px;
            left: 12px;
            z-index: 10;
            background: rgba(30,20,10,0.8);
            border: 1px solid #555;
            color: #ccc;
            padding: 4px 10px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 12px;
            transition: all 0.2s;
          }
          .rv-back-btn:hover { color: #e8c96a; border-color: #e8c96a; }

          /* En pantallas con scroll el botón absoluto quedaba encimado sobre el
             contenido: en ellas va en el flujo, pegado (sticky) al borde inferior */
          #rv-gather-screen .rv-back-btn,
          #rv-build-screen .rv-back-btn,
          #rv-struct-screen .rv-back-btn,
          #rv-salvage-screen .rv-back-btn {
            position: sticky;
            bottom: 10px;
            left: auto;
            align-self: flex-start;
            margin: 10px 0 12px 12px;
            z-index: 5;
            background: rgba(20,14,6,0.95);
            border: 1px solid rgba(232,201,106,0.4);
          }

          /* Botón selector de idioma */
          #rv-lang-toggle {
            position: absolute;
            top: 10px;
            right: 10px;
            z-index: 10;
            background: rgba(20,14,6,0.85);
            border: 1px solid rgba(232,201,106,0.4);
            color: #e8c96a;
            padding: 3px 9px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 11px;
            transition: all 0.2s;
          }
          #rv-lang-toggle:hover { border-color: #e8c96a; background: rgba(232,201,106,0.15); }

          /* ── Pantalla recolección ── */
          #rv-gather-screen {
            display: none;
            position: absolute;
            inset: 0;
            flex-direction: column;
            align-items: center;
            text-align: center;
            overflow-y: auto;
          }
          #rv-gather-bg {
            position: absolute;
            inset: 0;
            background-image: url('${RV_ASSETS.bg.equipment}');
            background-size: cover;
            background-position: center;
            filter: brightness(0.35);
          }
          #rv-gather-overlay {
            position: relative;
            z-index: 2;
            width: 100%;
            min-height: 680px;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 24px 16px;
            box-sizing: border-box;
            gap: 10px;
          }
          #rv-gather-overlay h2 {
            font-size: 20px;
            color: #e8c96a;
            text-shadow: 0 0 12px rgba(232,201,106,0.6);
            margin: 0;
          }
          #rv-gather-overlay .subtitle {
            font-size: 13px;
            color: #bbb;
            margin-bottom: 8px;
          }
          .rv-gather-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 10px;
            width: 100%;
            max-width: 360px;
          }
          .rv-gather-btn {
            padding: 10px 6px;
          }
          .rv-gather-btn .cat-icon { font-size: 22px; }
          .rv-gather-btn .cat-label { font-size: 11px; }
          .rv-gather-btn .cat-sub {
            font-size: 10px;
            color: #aaa;
          }
          .rv-gather-btn.active {
            background: rgba(232,201,106,0.18);
            border-color: #e8c96a;
            color: #e8c96a;
          }
          #rv-gather-info {
            width: 90%;
            display: flex;
            flex-direction: column;
            align-items: center;
          }
          #rv-btn-gather-start {
            padding: 10px 28px;
            background: linear-gradient(135deg, #3a7a2a, #7ac96a);
            border: none;
            border-radius: 8px;
            color: #06210a;
            font-size: 15px;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.2s;
            box-shadow: 0 0 18px rgba(122,201,106,0.3);
          }
          #rv-btn-gather-start:hover { transform: scale(1.04); box-shadow: 0 0 28px rgba(122,201,106,0.5); }
          #rv-btn-gather-start:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
          #rv-gather-icons {
            display: flex;
            justify-content: center;
            gap: 16px;
            flex-wrap: wrap;
            margin-top: 10px;
          }
          #rv-gather-result {
            width: 100%;
            border-radius: 10px;
            padding: 12px;
            font-size: 13px;
            display: none;
            text-align: left;
            margin-top: 10px;
          }
          #rv-gather-result.ok   { background: rgba(74,222,128,0.12); border: 1px solid #4ade80; }
          #rv-gather-result.fail { background: rgba(248,113,113,0.1); border: 1px solid #f87171; }

          /* Conversión Food Supplies → Monster Rations */
          #rv-food-convert {
            width: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 6px;
            margin-top: 10px;
            padding: 10px;
            background: rgba(10,8,4,0.6);
            border: 1px solid rgba(232,201,106,0.25);
            border-radius: 10px;
          }
          .rv-convert-title {
            font-size: 12px;
            color: #e8c96a;
            font-weight: bold;
          }
          #rv-btn-convert-do {
            margin-top: 4px;
            padding: 7px 20px;
            background: linear-gradient(135deg, #8a5a2a, #d9a05a);
            border: none;
            border-radius: 8px;
            color: #1f1000;
            font-size: 13px;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.2s;
          }
          #rv-btn-convert-do:hover { transform: scale(1.04); }
          #rv-btn-convert-do:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

          /* ── Pantalla construcciones ── */
          #rv-build-screen {
            display: none;
            position: absolute;
            inset: 0;
            flex-direction: column;
            align-items: center;
            text-align: center;
            overflow-y: auto;
          }
          #rv-build-bg {
            position: absolute;
            inset: 0;
            background-image: url('${RV_ASSETS.bg.construction}');
            background-size: cover;
            background-position: center;
            filter: brightness(0.3);
          }
          #rv-build-overlay {
            position: relative;
            z-index: 2;
            width: 100%;
            min-height: 680px;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 24px 16px;
            box-sizing: border-box;
            gap: 10px;
          }
          #rv-build-overlay h2 {
            font-size: 20px;
            color: #e8c96a;
            text-shadow: 0 0 12px rgba(232,201,106,0.6);
            margin: 0;
          }
          #rv-build-overlay .subtitle {
            font-size: 13px;
            color: #bbb;
            margin-bottom: 8px;
          }
          .rv-build-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
            width: 100%;
            max-width: 360px;
          }
          .rv-build-btn { padding: 9px 6px; }
          .rv-build-btn .cat-label { font-size: 11px; }
          .rv-build-btn.active {
            background: rgba(232,201,106,0.18);
            border-color: #e8c96a;
            color: #e8c96a;
          }
          #rv-build-info {
            width: 90%;
            display: flex;
            flex-direction: column;
            align-items: center;
          }
          #rv-btn-build-start {
            padding: 10px 28px;
            background: linear-gradient(135deg, #8a5a2a, #d9a05a);
            border: none;
            border-radius: 8px;
            color: #1f1000;
            font-size: 15px;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.2s;
            box-shadow: 0 0 18px rgba(217,160,90,0.3);
          }
          #rv-btn-build-start:hover { transform: scale(1.04); box-shadow: 0 0 28px rgba(217,160,90,0.5); }
          #rv-btn-build-start:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
          #rv-build-icons {
            display: flex;
            justify-content: center;
            gap: 16px;
            flex-wrap: wrap;
            margin-top: 10px;
          }
          #rv-build-result {
            width: 100%;
            border-radius: 10px;
            padding: 12px;
            font-size: 13px;
            display: none;
            text-align: left;
            margin-top: 10px;
          }
          #rv-build-result.critical_success { background: rgba(232,201,106,0.15); border: 1px solid #e8c96a; }
          #rv-build-result.success          { background: rgba(74,222,128,0.12); border: 1px solid #4ade80; }
          #rv-build-result.failure          { background: rgba(248,113,113,0.1); border: 1px solid #f87171; }
          #rv-build-result.critical_failure { background: rgba(100,30,30,0.3); border: 1px solid #991b1b; }

          /* ── Pantalla reciclaje ── */
          #rv-salvage-screen {
            display: none;
            position: absolute;
            inset: 0;
            flex-direction: column;
            align-items: center;
            text-align: center;
            overflow-y: auto;
          }
          #rv-salvage-bg {
            position: absolute;
            inset: 0;
            background-image: url('${RV_ASSETS.bg.equipment}');
            background-size: cover;
            background-position: center;
            filter: brightness(0.3);
          }
          #rv-salvage-overlay {
            position: relative;
            z-index: 2;
            width: 100%;
            min-height: 680px;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 24px 16px;
            box-sizing: border-box;
            gap: 10px;
          }
          #rv-salvage-overlay h2 {
            font-size: 20px;
            color: #e8c96a;
            text-shadow: 0 0 12px rgba(232,201,106,0.6);
            margin: 0;
          }
          #rv-salvage-overlay .subtitle {
            font-size: 13px;
            color: #bbb;
            margin-bottom: 8px;
          }
          #rv-salvage-dropzone {
            width: 90%;
            min-height: 70px;
            border: 2px dashed rgba(232,201,106,0.45);
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 13px;
            color: #aaa;
            padding: 10px;
            transition: border-color 0.2s, background 0.2s;
          }
          #rv-salvage-dropzone.dragover {
            border-color: #e8c96a;
            background: rgba(232,201,106,0.08);
          }
          #rv-salvage-info {
            display: none;
            width: 90%;
            background: rgba(10,8,4,0.75);
            border: 1px solid rgba(232,201,106,0.25);
            border-radius: 10px;
            padding: 12px;
            text-align: left;
          }
          #rv-btn-salvage {
            margin-top: 10px;
            padding: 8px 20px;
            background: linear-gradient(135deg, #7a2a2a, #c96a6a);
            border: none;
            border-radius: 8px;
            color: #210606;
            font-size: 14px;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.2s;
            box-shadow: 0 0 18px rgba(201,106,106,0.3);
          }
          #rv-btn-salvage:hover { transform: scale(1.04); box-shadow: 0 0 28px rgba(201,106,106,0.5); }
          #rv-btn-salvage:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
          #rv-salvage-result {
            width: 90%;
            border-radius: 10px;
            padding: 12px;
            font-size: 13px;
            display: none;
            text-align: left;
            margin-top: 10px;
          }
          #rv-salvage-result.ok   { background: rgba(74,222,128,0.12); border: 1px solid #4ade80; }
          #rv-salvage-result.fail { background: rgba(248,113,113,0.1); border: 1px solid #f87171; }

          /* ── Pantalla Building (estructuras) ── */
          #rv-struct-screen {
            display: none;
            position: absolute;
            inset: 0;
            flex-direction: column;
            align-items: center;
            text-align: center;
            overflow-y: auto;
          }
          #rv-struct-bg {
            position: absolute;
            inset: 0;
            background-image: url('${RV_ASSETS.bg.construction}');
            background-size: cover;
            background-position: center;
            filter: brightness(0.25);
          }
          #rv-struct-overlay {
            position: relative;
            z-index: 2;
            width: 100%;
            min-height: 680px;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 24px 16px;
            box-sizing: border-box;
            gap: 8px;
          }
          #rv-struct-overlay h2 {
            font-size: 20px;
            color: #e8c96a;
            text-shadow: 0 0 12px rgba(232,201,106,0.6);
            margin: 0;
          }
          #rv-struct-overlay .subtitle {
            font-size: 12px;
            color: #bbb;
            margin-bottom: 4px;
          }
          #rv-struct-catalog {
            width: 100%;
            max-width: 370px;
          }
          .rv-struct-group-title {
            font-size: 13px;
            font-weight: bold;
            color: #e8c96a;
            text-align: left;
            margin: 10px 0 6px;
            text-shadow: 0 0 8px rgba(0,0,0,0.8);
          }
          .rv-struct-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 6px;
            width: 100%;
          }
          .rv-struct-btn { padding: 8px 5px; }
          .rv-struct-btn .cat-label { font-size: 10.5px; }
          .rv-struct-btn.active {
            background: rgba(232,201,106,0.18);
            border-color: #e8c96a;
            color: #e8c96a;
          }
          .rv-lvl-btn {
            min-width: 0;
            padding: 6px 14px;
            font-size: 12px;
          }
          .rv-lvl-btn.active {
            background: rgba(232,201,106,0.18);
            border-color: #e8c96a;
            color: #e8c96a;
          }
          #rv-struct-info {
            width: 90%;
            display: flex;
            flex-direction: column;
            align-items: center;
          }
          #rv-btn-struct-start {
            padding: 10px 28px;
            background: linear-gradient(135deg, #5a4a8a, #9a8ad9);
            border: none;
            border-radius: 8px;
            color: #100a1f;
            font-size: 15px;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.2s;
            box-shadow: 0 0 18px rgba(154,138,217,0.3);
          }
          #rv-btn-struct-start:hover { transform: scale(1.04); box-shadow: 0 0 28px rgba(154,138,217,0.5); }
          #rv-btn-struct-start:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
          #rv-struct-icons {
            display: flex;
            justify-content: center;
            gap: 16px;
            flex-wrap: wrap;
            margin-top: 10px;
          }
          #rv-struct-result {
            width: 100%;
            border-radius: 10px;
            padding: 12px;
            font-size: 13px;
            display: none;
            text-align: left;
            margin-top: 10px;
          }
          #rv-struct-result.critical_success { background: rgba(232,201,106,0.15); border: 1px solid #e8c96a; }
          #rv-struct-result.success          { background: rgba(74,222,128,0.12); border: 1px solid #4ade80; }
          #rv-struct-result.failure          { background: rgba(248,113,113,0.1); border: 1px solid #f87171; }
          #rv-struct-result.critical_failure { background: rgba(100,30,30,0.3); border: 1px solid #991b1b; }

          /* ── Pantalla cultivos ── */
          #rv-farm-screen {
            display: none;
            position: absolute;
            inset: 0;
            flex-direction: column;
            align-items: center;
            text-align: center;
            overflow-y: auto;
          }
          #rv-farm-bg {
            position: absolute;
            inset: 0;
            background-image: url('${RV_ASSETS.bg.farming}');
            background-size: cover;
            background-position: center;
            filter: brightness(0.3);
          }
          #rv-farm-overlay {
            position: relative;
            z-index: 2;
            width: 100%;
            min-height: 680px;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 24px 16px;
            box-sizing: border-box;
            gap: 10px;
          }
          #rv-farm-overlay h2 {
            font-size: 20px;
            color: #e8c96a;
            text-shadow: 0 0 12px rgba(232,201,106,0.6);
            margin: 0;
          }
          #rv-farm-overlay .subtitle {
            font-size: 12px;
            color: #bbb;
            margin-bottom: 4px;
          }
          #rv-farm-create, #rv-farm-setup, #rv-farm-active {
            width: 90%;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 6px;
            background: rgba(10,8,4,0.6);
            border: 1px solid rgba(232,201,106,0.25);
            border-radius: 10px;
            padding: 12px;
          }
          #rv-btn-farm-create, #rv-btn-farm-start, #rv-btn-farm-daily {
            padding: 9px 24px;
            background: linear-gradient(135deg, #3a7a2a, #7ac96a);
            border: none;
            border-radius: 8px;
            color: #06210a;
            font-size: 14px;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.2s;
            box-shadow: 0 0 18px rgba(122,201,106,0.3);
          }
          #rv-btn-farm-create:hover, #rv-btn-farm-start:hover, #rv-btn-farm-daily:hover {
            transform: scale(1.04);
            box-shadow: 0 0 28px rgba(122,201,106,0.5);
          }
          #rv-btn-farm-create:disabled, #rv-btn-farm-start:disabled, #rv-btn-farm-daily:disabled {
            opacity: 0.5; cursor: not-allowed; transform: none;
          }
          .rv-farm-progress {
            width: 100%;
            height: 14px;
            background: rgba(255,255,255,0.08);
            border: 1px solid rgba(232,201,106,0.3);
            border-radius: 8px;
            overflow: hidden;
            margin: 4px 0;
          }
          .rv-farm-progress-fill {
            height: 100%;
            width: 0%;
            background: linear-gradient(90deg, #3a7a2a, #7ac96a);
            transition: width 0.4s ease;
          }
          #rv-farm-log {
            width: 90%;
            font-size: 12px;
            color: #ccc;
            text-align: left;
          }
          #rv-farm-log p { margin: 3px 0; }
          #rv-farm-result {
            width: 90%;
            border-radius: 10px;
            padding: 12px;
            font-size: 13px;
            display: none;
            text-align: left;
            margin-top: 6px;
          }
          #rv-farm-result.ok   { background: rgba(74,222,128,0.12); border: 1px solid #4ade80; }
          #rv-farm-result.fail { background: rgba(248,113,113,0.1); border: 1px solid #f87171; }

          /* ── Pantalla despiece de monstruos ── */
          #rv-scav-screen {
            display: none;
            position: absolute;
            inset: 0;
            flex-direction: column;
            align-items: center;
            text-align: center;
            overflow-y: auto;
          }
          #rv-scav-bg {
            position: absolute;
            inset: 0;
            background-image: url('${RV_ASSETS.bg.monsterScavenging}');
            background-size: cover;
            background-position: center;
            filter: brightness(0.3);
          }
          #rv-scav-overlay {
            position: relative;
            z-index: 2;
            width: 100%;
            min-height: 680px;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 24px 16px;
            box-sizing: border-box;
            gap: 10px;
          }
          #rv-scav-overlay h2 {
            font-size: 20px;
            color: #e8c96a;
            text-shadow: 0 0 12px rgba(232,201,106,0.6);
            margin: 0;
          }
          #rv-scav-overlay .subtitle {
            font-size: 12px;
            color: #bbb;
            margin-bottom: 4px;
          }
          #rv-btn-scav-start {
            padding: 10px 28px;
            background: linear-gradient(135deg, #7a4a2a, #c99a6a);
            border: none;
            border-radius: 8px;
            color: #1f0f00;
            font-size: 15px;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.2s;
            box-shadow: 0 0 18px rgba(201,154,106,0.3);
          }
          #rv-btn-scav-start:hover { transform: scale(1.04); box-shadow: 0 0 28px rgba(201,154,106,0.5); }
          #rv-btn-scav-start:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
          #rv-scav-icons {
            display: flex;
            justify-content: center;
            gap: 16px;
            flex-wrap: wrap;
            margin-top: 10px;
          }
          #rv-scav-result {
            width: 90%;
            border-radius: 10px;
            padding: 12px;
            font-size: 13px;
            display: none;
            text-align: left;
            margin-top: 10px;
          }
          #rv-scav-result.ok   { background: rgba(74,222,128,0.12); border: 1px solid #4ade80; }
          #rv-scav-result.fail { background: rgba(248,113,113,0.1); border: 1px solid #f87171; }

          /* Scroll custom */
          #rv-crafting-root ::-webkit-scrollbar { width: 5px; }
          #rv-crafting-root ::-webkit-scrollbar-track { background: transparent; }
          #rv-crafting-root ::-webkit-scrollbar-thumb { background: #554; border-radius: 3px; }

          .rv-img-icon {
            width: 42px;
            height: 42px;
            object-fit: contain;
            border-radius: 9px;
            filter: drop-shadow(0 5px 5px rgba(0,0,0,0.55));
            flex: 0 0 auto;
          }
          .rv-cat-btn .rv-img-icon {
            width: 46px;
            height: 46px;
            padding: 2px;
            background: linear-gradient(180deg, rgba(245,211,126,0.14), rgba(0,0,0,0.12));
            border: 1px solid rgba(232,201,106,0.24);
          }

          .rv-fert-btn {
            min-height: 32px;
            flex-direction: row;
          }</style>

        <div id="rv-crafting-root">

          <!-- ═══ PANTALLA 1: Selección de Categoría ═══ -->
          <div id="rv-category-screen">
            <button id="rv-lang-toggle">🌐 EN</button>
            <h2>⚒️ RedVelvet Crafting</h2>
            <div class="subtitle">Selecciona tu categoría de oficio</div>
            <div class="rv-category-grid">
              <button class="rv-cat-btn" data-category="herreria">
                <span class="cat-icon">🔨</span>
                <span class="cat-label">Herrería</span>
              </button>
              <button class="rv-cat-btn" data-category="alquimia">
                <span class="cat-icon">🧪</span>
                <span class="cat-label">Alquimia</span>
              </button>
              <button class="rv-cat-btn" data-category="joyeria">
                <span class="cat-icon">🪙</span>
                <span class="cat-label">Joyería</span>
              </button>
              <button class="rv-cat-btn" data-category="trabajo-con-piel">
                <span class="cat-icon">🧺</span>
                <span class="cat-label">Piel & Tela</span>
              </button>
              <button class="rv-cat-btn" data-category="equipo-vario">
                <span class="cat-icon">🧰</span>
                <span class="cat-label">Equipo Vario</span>
              </button>
              <button class="rv-cat-btn" data-category="recoleccion">
                <span class="cat-icon">🌿</span>
                <span class="cat-label">Recolección</span>
              </button>
              <button class="rv-cat-btn" data-category="construcciones">
                <span class="cat-icon">🏗️</span>
                <span class="cat-label">Building Assets</span>
              </button>
              <button class="rv-cat-btn" data-category="edificios">
                <span class="cat-icon">🏰</span>
                <span class="cat-label">Construcciones</span>
              </button>
              <button class="rv-cat-btn" data-category="reciclaje">
                <span class="cat-icon">♻️</span>
                <span class="cat-label">Reciclaje</span>
              </button>
              <button class="rv-cat-btn" data-category="cultivos">
                <span class="cat-icon">🌾</span>
                <span class="cat-label">Cultivos</span>
              </button>
              <button class="rv-cat-btn" data-category="monstruos">
                <span class="cat-icon">🦴</span>
                <span class="cat-label">Despiece</span>
              </button>
              <button class="rv-cat-btn rules-btn" data-category="reglas">
                <span>📜</span>
                <span class="cat-label">Reglas de Crafteo</span>
              </button>
            </div>
          </div>

          <!-- ═══ PANTALLA 2: Reglas ═══ -->
          <div id="rv-rules-screen">
            <h3 class="rv-rules-title">🎯 Cómo funciona el Crafteo (PF2e)</h3>
            <p>1. Cada categoría usa su <strong>propio material</strong> en tu inventario (ver lista abajo).</p>
            <p>2. Debes tener al menos <strong>Trained</strong> en la habilidad <strong>Crafting</strong>.</p>
            <p>3. Elige una categoría y arrastra un objeto desde un compendio al área de drop.</p>
            <p>4. El DC depende del <strong>nivel del objeto</strong> (tabla oficial PF2e).</p>
            <p>5. Pulsa <strong>Iniciar Creación</strong>: se tirará tu Crafting skill.</p>
            <p>6. Luego aparece el <strong>mini-juego</strong>: haz clic en los iconos cuando brillen en oro.</p>
            <p>7. Los aciertos modifican el grado de éxito final (ver abajo).</p>

            <h3 class="rv-rules-title">🎖️ Grados de Éxito PF2e</h3>
            <p><strong style="color:#e8c96a;">⭐ Éxito Crítico</strong> — Creas el objeto y recibes un bonus narrativo (calidad masterwork).</p>
            <p><strong style="color:#4ade80;">✅ Éxito</strong> — Creas el objeto normalmente.</p>
            <p><strong style="color:#fbbf24;">⚠️ Fallo</strong> — No creas el objeto; recuperas el 50% de los materiales.</p>
            <p><strong style="color:#f87171;">❌ Fallo Crítico</strong> — No creas el objeto; los materiales se pierden (o los dañas).</p>

            <h3 class="rv-rules-title">🎮 El Mini-juego</h3>
            <p>• Aparecen 3 iconos en secuencia.</p>
            <p>• Cuando el icono <strong>brilla en oro</strong>, haz clic para acertar.</p>
            <p>• <strong>3 aciertos</strong> → sube un grado de éxito.</p>
            <p>• <strong>2 aciertos</strong> → mantiene el grado de la tirada.</p>
            <p>• <strong>0-1 aciertos</strong> → baja un grado de éxito.</p>
            <p>• El tiempo de ventana depende de qué tanto superaste el DC.</p>

            <h3 class="rv-rules-title">🧱 Materiales por categoría</h3>
            <p>🔨 Herrería → <strong>⚒️ Blacksmith Materials</strong></p>
            <p>🧪 Alquimia → <strong>🧪 Alchemy Materials</strong></p>
            <p>🪙 Joyería → <strong>💎 Jewelry Materials</strong></p>
            <p>🧺 Piel & Tela → <strong>🧵 Leatherwork Materials</strong></p>
            <p>🧰 Equipo Vario → <strong>🧰 Crafting Materials</strong></p>

            <h3 class="rv-rules-title">📦 Coste de Materiales</h3>
            <p>El coste es la <strong>mitad del precio en GP</strong> del objeto, pagado con el material de su categoría.</p>
            <p>Los objetos raros/únicos cuestan más materiales.</p>
            <p>Si no tienes suficientes, el módulo te avisa antes de gastar.</p>

            <h3 class="rv-rules-title">🌿 Recolección (Gathering)</h3>
            <p>La Recolección <strong>no es crafteo</strong>: sirve para conseguir recursos y no requiere Crafting.</p>
            <p>🍖 Comida → <strong>Supervivencia</strong> (produce 🍖 Food Supplies)</p>
            <p>🪨 Construcción → <strong>Atletismo</strong> (produce 🪨 Construction Materials)</p>
            <p>🌿 Alquimia → <strong>Naturaleza</strong> (produce 🧪 Alchemy Materials)</p>
            <p>⛏️ Minerales → <strong>Atletismo</strong> (produce ⚒️ Blacksmith Materials)</p>
            <p>💎 Gemas → <strong>Atletismo</strong> (produce 💎 Jewelry Materials)</p>
            <p>🧵 Pieles → <strong>Supervivencia</strong> (produce 🧵 Leatherwork Materials; requiere 4 🦴 Monster Parts)</p>
            <p>🧰 Varios → <strong>Sociedad</strong> (produce 🧰 Crafting Materials)</p>
            <p>💩 Abono → <strong>Naturaleza</strong> (produce 💩 Fertilizer; requiere 2 🦴 Monster Parts)</p>
            <p>🪵 Talar → <strong>Atletismo</strong> (produce 🪵 Wood — para 🪚 Tablas y ⚫ Carbón en Building Assets)</p>
            <p>🐾 En Comida: convierte 🍖 Food Supplies en 🐾 Monster Rations (1:1, directo, compatible con Domatori)</p>
            <p>Se tira <strong>1d20 + habilidad</strong> contra <strong>DC 15</strong>; cada acierto del mini-juego da <strong>2 unidades</strong>, y +2 extra si superas la DC por 5+.</p>

            <h3 class="rv-rules-title">🏗️ Building Assets</h3>
            <p>Craftea piezas por <strong>set de tiles 2×2 (10ft × 10ft)</strong>: pisos, paredes, techos, puertas, ventanas, mesas de trabajo, muebles y escaleras.</p>
            <p>Cada pieza consume materiales (sobre todo 🪨 Construction Materials) y algunas piden acero, tela o alquimia.</p>
            <p>🪚 <strong>Tablas</strong> (3 🪵 + 1 🪨) — las piezas de madera las requieren. ⚫ <strong>Carbón</strong> (4 🪵) — combustible de Herrería y Cocina.</p>
            <p>Se tira <strong>Crafting</strong> contra el DC de la pieza y se juega el mini-juego (grados de éxito PF2e).</p>
            <p>⭐ Crítico → pieza + 25% de materiales de vuelta · ✅ Éxito → pieza · ⚠️ Fallo → 50% de vuelta · ❌ Crítico → pierdes todo.</p>

            <h3 class="rv-rules-title">🏰 Construcciones (Building)</h3>
            <p>Construye <strong>estructuras completas</strong> con tus Building Assets: infraestructura, defensa, transporte, exploración y movilidad.</p>
            <p>Cada estructura tiene <strong>Nivel 1, 2 y 3</strong>: el coste se duplica por nivel (×1, ×2, ×4) y el DC sube +2 por nivel.</p>
            <p>Mejorar consume la estructura del nivel anterior (si fallas la tirada, NO la pierdes).</p>

            <h3 class="rv-rules-title">♻️ Reciclaje</h3>
            <p>Arrastra un objeto <strong>de tu inventario</strong> para destruirlo y recuperar materiales, sin mini-juego.</p>
            <p>El material depende de la categoría del objeto; recuperas el <strong>25% del precio</strong> (mínimo 1).</p>

            <h3 class="rv-rules-title">🦴 Despiece de Monstruos</h3>
            <p>Tras derrotar un monstruo, tira <strong>Supervivencia</strong> (DC 15) y juega el mini-juego: 3 aciertos = <strong>20 🦴 Monster Parts</strong>, 2 = 10, 0-1 = 0.</p>
            <p>Con el feat <strong>Monster Scavenger</strong> siempre obtienes más: 0 → 4, 10 → 15, 20 → 30.</p>

            <h3 class="rv-rules-title">🌾 Cultivos</h3>
            <p>Crea una <strong>🌾 Farm Plot</strong> (2 🧱 paredes + 4 🪨 + 2 🍖) y trabájala con <strong>Naturaleza</strong>: 5 tiradas diarias contra DC 15.</p>
            <p>Producción base <strong>50 🍖</strong>: fallo −5, crítico +5, fallo crítico −10. El 💩 Abono (recolectable con Naturaleza) da +5 por unidad (máx. 4).</p>
            <p>La barra de progreso muestra el avance; al día 5 se cosecha automáticamente. El progreso se guarda en tu personaje.</p>

            <button class="rv-back-btn" id="rv-btn-back-rules" style="position:relative;bottom:auto;left:auto;margin-top:20px;">⬅️ Volver al menú</button>
          </div>

          <!-- ═══ PANTALLA 3: Forja ═══ -->
          <div id="rv-forge-screen">
            <div id="rv-forge-bg"></div>
            <div id="rv-forge-overlay">

              <!-- Dropzone -->
              <div id="rv-dropzone">🧱 Arrastra aquí un objeto desde un compendio</div>

              <!-- Info del item (oculta hasta drop) -->
              <div id="rv-item-info">
                <div class="rv-item-header">
                  <img id="rv-item-img" src="" alt="item" />
                  <div class="rv-item-texts">
                    <h4 id="rv-item-name"></h4>
                    <div class="rv-item-meta" id="rv-item-meta"></div>
                  </div>
                </div>
                <div class="rv-stat-row" id="rv-stat-row"></div>
                <div class="rv-proficiency-bar" id="rv-prof-bar"></div>
              </div>

              <!-- Botón forjar -->
              <button id="rv-btn-forge" style="display:none;">✨ Iniciar Creación</button>

              <!-- Mini-juego icons -->
              <div id="rv-forge-icons"></div>

              <!-- Resultado -->
              <div id="rv-result-box" role="status" aria-live="polite"></div>

            </div>

            <button class="rv-back-btn" id="rv-btn-back-forge">⬅️ Menú</button>
          </div>

          <!-- ═══ PANTALLA 4: Recolección (Gathering) ═══ -->
          <div id="rv-gather-screen">
            <div id="rv-gather-bg"></div>
            <div id="rv-gather-overlay">
              <h2>🌿 Recolección</h2>
              <div class="subtitle">Elige qué quieres recolectar</div>

              <div class="rv-gather-grid">
                <button class="rv-cat-btn rv-gather-btn" data-gather="comida">
                  <span class="cat-icon">🍖</span>
                  <span class="cat-label">Comida</span>
                  <span class="cat-sub">Supervivencia</span>
                </button>
                <button class="rv-cat-btn rv-gather-btn" data-gather="construccion">
                  <span class="cat-icon">🪨</span>
                  <span class="cat-label">Construcción</span>
                  <span class="cat-sub">Atletismo</span>
                </button>
                <button class="rv-cat-btn rv-gather-btn" data-gather="alquimia-rec">
                  <span class="cat-icon">🌿</span>
                  <span class="cat-label">Alquimia</span>
                  <span class="cat-sub">Naturaleza</span>
                </button>
                <button class="rv-cat-btn rv-gather-btn" data-gather="herreria-rec">
                  <span class="cat-icon">⛏️</span>
                  <span class="cat-label">Minerales</span>
                  <span class="cat-sub">Atletismo</span>
                </button>
                <button class="rv-cat-btn rv-gather-btn" data-gather="joyeria-rec">
                  <span class="cat-icon">💎</span>
                  <span class="cat-label">Gemas</span>
                  <span class="cat-sub">Atletismo</span>
                </button>
                <button class="rv-cat-btn rv-gather-btn" data-gather="piel-rec">
                  <span class="cat-icon">🧵</span>
                  <span class="cat-label">Pieles</span>
                  <span class="cat-sub">Supervivencia</span>
                </button>
                <button class="rv-cat-btn rv-gather-btn" data-gather="vario-rec">
                  <span class="cat-icon">🧰</span>
                  <span class="cat-label">Varios</span>
                  <span class="cat-sub">Sociedad</span>
                </button>
                <button class="rv-cat-btn rv-gather-btn" data-gather="abono-rec">
                  <span class="cat-icon">💩</span>
                  <span class="cat-label">Abono</span>
                  <span class="cat-sub">Naturaleza</span>
                </button>
                <button class="rv-cat-btn rv-gather-btn" data-gather="madera-rec">
                  <span class="cat-icon">🪵</span>
                  <span class="cat-label">Talar</span>
                  <span class="cat-sub">Atletismo</span>
                </button>
              </div>

              <!-- Info del tipo elegido -->
              <div id="rv-gather-info" style="display:none;">
                <div class="rv-stat-row" id="rv-gather-stats" style="justify-content:center;"></div>
                <button id="rv-btn-gather-start" style="margin-top:12px;">✨ Iniciar Recolección</button>

                <!-- Conversión directa: solo visible para Comida (Food Supplies → Monster Rations 1:1) -->
                <div id="rv-food-convert" style="display:none;">
                  <div class="rv-convert-title">🐾 Convertir en Monster Rations (Domatori)</div>
                  <div class="rv-stat-row" style="justify-content:center;align-items:center;">
                    <button class="rv-cat-btn rv-fert-btn" id="rv-btn-convert-minus" style="min-width:0;padding:4px 12px;">−</button>
                    <span class="rv-stat-pill" id="rv-convert-sel"></span>
                    <button class="rv-cat-btn rv-fert-btn" id="rv-btn-convert-plus" style="min-width:0;padding:4px 12px;">+</button>
                  </div>
                  <button id="rv-btn-convert-do">🐾 Convertir</button>
                </div>

                <div id="rv-gather-icons"></div>
                <div id="rv-gather-result" role="status" aria-live="polite"></div>
              </div>
            </div>

            <button class="rv-back-btn" id="rv-btn-back-gather">⬅️ Menú</button>
          </div>

          <!-- ═══ PANTALLA 5: Construcciones (Building) ═══ -->
          <div id="rv-build-screen">
            <div id="rv-build-bg"></div>
            <div id="rv-build-overlay">
              <h2>🏗️ Construcciones</h2>
              <div class="subtitle">Piezas por set de tiles 2×2 (10ft × 10ft)</div>

              <div class="rv-build-grid">
                <button class="rv-cat-btn rv-build-btn" data-build="tablas"><span class="cat-label">🪚 Tablas</span></button>
                <button class="rv-cat-btn rv-build-btn" data-build="carbon"><span class="cat-label">⚫ Carbón</span></button>
                <button class="rv-cat-btn rv-build-btn" data-build="piso"><span class="cat-label">🟫 Piso 10×10</span></button>
                <button class="rv-cat-btn rv-build-btn" data-build="pared"><span class="cat-label">🧱 Pared 10×10</span></button>
                <button class="rv-cat-btn rv-build-btn" data-build="techo"><span class="cat-label">🛖 Techo 10×10</span></button>
                <button class="rv-cat-btn rv-build-btn" data-build="puerta"><span class="cat-label">🚪 Puerta Reforzada</span></button>
                <button class="rv-cat-btn rv-build-btn" data-build="ventana"><span class="cat-label">🪟 Ventana de Cristal</span></button>
                <button class="rv-cat-btn rv-build-btn" data-build="mesa-trabajo"><span class="cat-label">🛠️ Mesa de Trabajo</span></button>
                <button class="rv-cat-btn rv-build-btn" data-build="muebles"><span class="cat-label">🪑 Set de Muebles</span></button>
                <button class="rv-cat-btn rv-build-btn" data-build="escaleras"><span class="cat-label">🪜 Escaleras 10×10</span></button>
              </div>

              <!-- Info de la pieza elegida -->
              <div id="rv-build-info" style="display:none;">
                <div class="rv-stat-row" id="rv-build-stats" style="justify-content:center;"></div>
                <div class="rv-stat-row" id="rv-build-costs" style="justify-content:center;"></div>
                <button id="rv-btn-build-start" style="margin-top:12px;">🔨 Construir</button>
                <div id="rv-build-icons"></div>
                <div id="rv-build-result" role="status" aria-live="polite"></div>
              </div>
            </div>

            <button class="rv-back-btn" id="rv-btn-back-build">⬅️ Menú</button>
          </div>

          <!-- ═══ PANTALLA 6: Reciclaje (Salvage) ═══ -->
          <div id="rv-salvage-screen">
            <div id="rv-salvage-bg"></div>
            <div id="rv-salvage-overlay">
              <h2>♻️ Reciclaje</h2>
              <div class="subtitle">Destruye objetos de tu inventario para recuperar materiales</div>

              <div id="rv-salvage-dropzone">🗑️ Arrastra aquí un objeto desde tu inventario</div>

              <div id="rv-salvage-info">
                <div class="rv-item-header">
                  <img id="rv-salvage-img" src="" alt="item" />
                  <div class="rv-item-texts">
                    <h4 id="rv-salvage-name"></h4>
                    <div class="rv-item-meta" id="rv-salvage-meta"></div>
                  </div>
                </div>
                <div class="rv-stat-row" id="rv-salvage-stats"></div>
                <div style="text-align:center;">
                  <button id="rv-btn-salvage">♻️ Destruir y reciclar</button>
                </div>
              </div>

              <div id="rv-salvage-result"></div>
            </div>

            <button class="rv-back-btn" id="rv-btn-back-salvage">⬅️ Menú</button>
          </div>

          <!-- ═══ PANTALLA 7: Building (estructuras completas) ═══ -->
          <div id="rv-struct-screen">
            <div id="rv-struct-bg"></div>
            <div id="rv-struct-overlay">
              <h2>🏰 Construcciones</h2>
              <div class="subtitle">Estructuras completas hechas con tus Building Assets</div>

              <div id="rv-struct-catalog">
                <div class="rv-struct-group-title" data-group="infraestructura">🏠 Infraestructura</div>
                <div class="rv-struct-grid">
                  <button class="rv-cat-btn rv-struct-btn" data-struct="almacen"><span class="cat-label">📦 Almacén</span></button>
                  <button class="rv-cat-btn rv-struct-btn" data-struct="herreria-e"><span class="cat-label">🔥 Herrería</span></button>
                  <button class="rv-cat-btn rv-struct-btn" data-struct="laboratorio"><span class="cat-label">⚗️ Lab. de Alquimia</span></button>
                  <button class="rv-cat-btn rv-struct-btn" data-struct="enfermeria"><span class="cat-label">🏥 Enfermería</span></button>
                  <button class="rv-cat-btn rv-struct-btn" data-struct="cocina"><span class="cat-label">🍳 Cocina</span></button>
                  <button class="rv-cat-btn rv-struct-btn" data-struct="torre"><span class="cat-label">🗼 Torre de Vigilancia</span></button>
                  <button class="rv-cat-btn rv-struct-btn" data-struct="corral"><span class="cat-label">🐎 Corral de Monturas</span></button>
                  <button class="rv-cat-btn rv-struct-btn" data-struct="investigacion"><span class="cat-label">🔬 Sala de Investigación</span></button>
                  <button class="rv-cat-btn rv-struct-btn" data-struct="trofeos"><span class="cat-label">🏆 Sala de Trofeos</span></button>
                </div>
                <div class="rv-struct-group-title" data-group="defensa">⚔️ Defensa</div>
                <div class="rv-struct-grid">
                  <button class="rv-cat-btn rv-struct-btn" data-struct="scorpion"><span class="cat-label">🏹 Scorpion (Ballesta)</span></button>
                  <button class="rv-cat-btn rv-struct-btn" data-struct="catapulta"><span class="cat-label">💥 Catapulta</span></button>
                  <button class="rv-cat-btn rv-struct-btn" data-struct="arpon"><span class="cat-label">🎯 Arpón para Wyverns</span></button>
                  <button class="rv-cat-btn rv-struct-btn" data-struct="empalizada"><span class="cat-label">🪵 Empalizada</span></button>
                  <button class="rv-cat-btn rv-struct-btn" data-struct="barricada"><span class="cat-label">🛡️ Barricada Móvil</span></button>
                  <button class="rv-cat-btn rv-struct-btn" data-struct="jaula"><span class="cat-label">🪤 Jaula de Captura</span></button>
                </div>
                <div class="rv-struct-group-title" data-group="transporte">🚚 Transporte</div>
                <div class="rv-struct-grid">
                  <button class="rv-cat-btn rv-struct-btn" data-struct="carreta"><span class="cat-label">🛒 Carreta</span></button>
                </div>
                <div class="rv-struct-group-title" data-group="exploracion">🧗 Exploración</div>
                <div class="rv-struct-grid">
                  <button class="rv-cat-btn rv-struct-btn" data-struct="puente"><span class="cat-label">🌉 Puente Portátil</span></button>
                  <button class="rv-cat-btn rv-struct-btn" data-struct="escalera"><span class="cat-label">🪜 Escalera Plegable</span></button>
                  <button class="rv-cat-btn rv-struct-btn" data-struct="grua"><span class="cat-label">🏗️ Grúa de Poleas</span></button>
                  <button class="rv-cat-btn rv-struct-btn" data-struct="ascensor"><span class="cat-label">🪢 Ascensor de Cuerda</span></button>
                  <button class="rv-cat-btn rv-struct-btn" data-struct="puesto"><span class="cat-label">🏕️ Puesto Avanzado</span></button>
                </div>
                <div class="rv-struct-group-title" data-group="movilidad">🦅 Movilidad</div>
                <div class="rv-struct-grid">
                  <button class="rv-cat-btn rv-struct-btn" data-struct="ala-delta"><span class="cat-label">🦅 Ala Delta</span></button>
                  <button class="rv-cat-btn rv-struct-btn" data-struct="paracaidas"><span class="cat-label">🪂 Paracaídas de Wyvern</span></button>
                  <button class="rv-cat-btn rv-struct-btn" data-struct="arnes"><span class="cat-label">🐉 Arnés de Vuelo</span></button>
                </div>
              </div>

              <!-- Info de la estructura elegida -->
              <div id="rv-struct-info" style="display:none;">
                <div class="rv-stat-row" id="rv-struct-levels" style="justify-content:center;">
                  <button class="rv-cat-btn rv-lvl-btn active" data-lvl="1">Nivel 1</button>
                  <button class="rv-cat-btn rv-lvl-btn" data-lvl="2">Nivel 2</button>
                  <button class="rv-cat-btn rv-lvl-btn" data-lvl="3">Nivel 3</button>
                </div>
                <div class="rv-stat-row" id="rv-struct-stats" style="justify-content:center;"></div>
                <div class="rv-stat-row" id="rv-struct-costs" style="justify-content:center;"></div>
                <button id="rv-btn-struct-start" style="margin-top:12px;">🔨 Construir</button>
                <div id="rv-struct-icons"></div>
                <div id="rv-struct-result" role="status" aria-live="polite"></div>
              </div>
            </div>

            <button class="rv-back-btn" id="rv-btn-back-struct">⬅️ Menú</button>
          </div>

          <!-- ═══ PANTALLA 8: Cultivos (Farming) ═══ -->
          <div id="rv-farm-screen">
            <div id="rv-farm-bg"></div>
            <div id="rv-farm-overlay">
              <h2>🌾 Cultivos</h2>
              <div class="subtitle">Crea parcelas y trabájalas con Naturaleza durante 5 días</div>

              <div class="rv-stat-row" id="rv-farm-pills" style="justify-content:center;"></div>

              <!-- Crear parcela -->
              <div id="rv-farm-create">
                <div class="rv-stat-row" id="rv-farm-create-costs" style="justify-content:center;"></div>
                <button id="rv-btn-farm-create">🛠️ Crear Parcela</button>
              </div>

              <!-- Iniciar ciclo (sin cultivo activo) -->
              <div id="rv-farm-setup" style="display:none;">
                <div class="rv-stat-row" style="justify-content:center;align-items:center;">
                  <button class="rv-cat-btn rv-fert-btn" id="rv-btn-fert-minus" style="min-width:0;padding:4px 12px;">−</button>
                  <span class="rv-stat-pill" id="rv-farm-fert-sel"></span>
                  <button class="rv-cat-btn rv-fert-btn" id="rv-btn-fert-plus" style="min-width:0;padding:4px 12px;">+</button>
                </div>
                <button id="rv-btn-farm-start" style="margin-top:10px;">🌱 Iniciar cultivo</button>
              </div>

              <!-- Ciclo activo -->
              <div id="rv-farm-active" style="display:none;">
                <div id="rv-farm-day" style="font-size:13px;color:#e8c96a;font-weight:bold;"></div>
                <div class="rv-farm-progress"><div class="rv-farm-progress-fill" id="rv-farm-progress-fill"></div></div>
                <div id="rv-farm-prod" style="font-size:13px;color:#ddd;"></div>
                <button id="rv-btn-farm-daily" style="margin-top:10px;">🎲 Tirada diaria (Naturaleza)</button>
              </div>

              <div id="rv-farm-log"></div>
              <div id="rv-farm-result" role="status" aria-live="polite"></div>
            </div>

            <button class="rv-back-btn" id="rv-btn-back-farm">⬅️ Menú</button>
          </div>

          <!-- ═══ PANTALLA 9: Despiece de Monstruos (Scavenging) ═══ -->
          <div id="rv-scav-screen">
            <div id="rv-scav-bg"></div>
            <div id="rv-scav-overlay">
              <h2>🦴 Despiece de Monstruos</h2>
              <div class="subtitle">Aprovecha cada parte del monstruo derrotado (1 uso por monstruo)</div>

              <div class="rv-stat-row" id="rv-scav-stats" style="justify-content:center;"></div>
              <div class="rv-stat-row" id="rv-scav-tiers" style="justify-content:center;"></div>

              <button id="rv-btn-scav-start">🔪 Iniciar Despiece</button>
              <div id="rv-scav-icons"></div>
              <div id="rv-scav-result" role="status" aria-live="polite"></div>
            </div>

            <button class="rv-back-btn" id="rv-btn-back-scav">⬅️ Menú</button>
          </div>

        </div>
      `,

      render: function (html) {
        // Ajustar tamaño del diálogo
        html.closest(".app").css({
          width: "430px",
          height: "720px",
          maxWidth: "calc(100vw - 24px)",
          maxHeight: "calc(100vh - 48px)",
        });

        // ── Verificar actor seleccionado ──
        const actor = canvas.tokens?.controlled[0]?.actor;
        if (!actor) {
          ui.notifications.warn(STRINGS[currentLang].notifyNoToken);
          return;
        }

        // ── Verificar que sea PF2e ──
        if (game.system.id !== "pf2e") {
          ui.notifications.warn(STRINGS[currentLang].notifyNoSystem);
          return;
        }

        // ── Aplicar idioma inicial ──
        applyLang(html); applyWorkshopIcons(html);


        // ── Selector de idioma ──
        html.find("#rv-lang-toggle").on("click", () => {
          currentLang = currentLang === "es" ? "en" : "es";
          try { localStorage.setItem("rv-crafting-lang", currentLang); } catch { /* */ }
          applyLang(html); applyWorkshopIcons(html);

        });

        // ── Datos de Crafting del actor ──
        const craftingSkill = getCraftingData(actor);

        if (craftingSkill.rank < 1) {
          // Recolección y Reciclaje no requieren Crafting: quedan habilitados aunque seas Untrained
          html.find("#rv-category-screen .rv-cat-btn:not([data-category='reglas']):not([data-category='recoleccion']):not([data-category='reciclaje'])")
            .prop("disabled", true)
            .attr("title", STRINGS[currentLang].notifyNoTraining);
        }

        // ── Variables de estado ──
        let selectedCategory = null;
        let draggedItem = null;
        let batchCost = 0;
        let finalDC = 14;
        let itemLevel = 0;
        let featInfo = null;
        let selectedGatherType = null;
        let gatherPlaying = false;
        let convertAmount = 0;
        let selectedBuildPiece = null;
        let buildPlaying = false;
        let salvageItem = null;
        let salvageAmount = 0;
        let salvageMaterial = null;
        let selectedStruct = null;
        let selectedStructLvl = 1;
        let structPlaying = false;

        // ── NAVEGACIÓN: Selección de categoría ──
        html.find("#rv-category-screen .rv-cat-btn").on("click", function () {
          const cat = $(this).data("category"); html[0].scrollTop = 0;
          if (cat === "reglas") {
            html.find("#rv-category-screen").hide();
            html.find("#rv-rules-screen").show();
            return;
          }
          if (cat === "recoleccion") {
            html.find("#rv-category-screen").hide();
            html.find("#rv-gather-screen").css("display", "flex");
            // Reset gather screen
            html.find("#rv-gather-info").hide();
            html.find("#rv-gather-icons").empty();
            html.find("#rv-gather-status-roll").remove();
            html.find("#rv-gather-result").hide().removeClass("ok fail");
            html.find(".rv-gather-grid").show();
            html.find(".rv-gather-btn").removeClass("active");
            selectedGatherType = null;
            convertAmount = 0;
            playSound(SFX_NAV.select);
            return;
          }
          if (cat === "construcciones") {
            html.find("#rv-category-screen").hide();
            html.find("#rv-build-screen").css("display", "flex");
            // Reset build screen
            html.find("#rv-build-info").hide();
            html.find("#rv-build-icons").empty();
            html.find("#rv-build-status-roll").remove();
            html.find("#rv-build-result").hide().removeClass("critical_success success failure critical_failure");
            html.find(".rv-build-grid").show();
            html.find(".rv-build-btn").removeClass("active");
            selectedBuildPiece = null;
            playSound(SFX_NAV.select);
            return;
          }
          if (cat === "reciclaje") {
            html.find("#rv-category-screen").hide();
            html.find("#rv-salvage-screen").css("display", "flex");
            // Reset salvage screen
            html.find("#rv-salvage-info").hide();
            html.find("#rv-salvage-result").hide().removeClass("ok fail");
            html.find("#rv-salvage-dropzone").text(STRINGS[currentLang].salvage.dropzone);
            salvageItem = null;
            playSound(SFX_NAV.select);
            return;
          }
          if (cat === "cultivos") {
            html.find("#rv-category-screen").hide();
            html.find("#rv-farm-screen").css("display", "flex");
            html.find("#rv-farm-log").empty();
            html.find("#rv-farm-result").hide().removeClass("ok fail");
            renderFarm();
            playSound(SFX_NAV.select);
            return;
          }
          if (cat === "monstruos") {
            html.find("#rv-category-screen").hide();
            html.find("#rv-scav-screen").css("display", "flex");
            html.find("#rv-scav-icons").empty();
            html.find("#rv-scav-status-roll").remove();
            html.find("#rv-scav-result").hide().removeClass("ok fail");
            html.find("#rv-btn-scav-start").prop("disabled", false).show();
            renderScavInfo();
            playSound(SFX_NAV.select);
            return;
          }
          if (cat === "edificios") {
            html.find("#rv-category-screen").hide();
            html.find("#rv-struct-screen").css("display", "flex");
            // Reset struct screen
            html.find("#rv-struct-info").hide();
            html.find("#rv-struct-icons").empty();
            html.find("#rv-struct-status-roll").remove();
            html.find("#rv-struct-result").hide().removeClass("critical_success success failure critical_failure");
            html.find("#rv-struct-catalog").show();
            html.find(".rv-struct-btn").removeClass("active");
            selectedStruct = null;
            selectedStructLvl = 1;
            html.find(".rv-lvl-btn").removeClass("active").first().addClass("active");
            playSound(SFX_NAV.select);
            return;
          }
          selectedCategory = cat;
          const bgs = {
            herreria: RV_ASSETS.bg.blacksmith,
            alquimia: RV_ASSETS.bg.alchemy,
            joyeria: RV_ASSETS.bg.jewelry,
            "trabajo-con-piel": RV_ASSETS.bg.leatherwork,
            "equipo-vario": RV_ASSETS.bg.equipment,
          };
          html.find("#rv-forge-bg").css("background-image", `url('${bgs[cat]}')`);
          html.find("#rv-category-screen").hide();
          html.find("#rv-forge-screen").css("display", "flex");
          // Reset forge screen
          html.find("#rv-item-info").hide();
          html.find("#rv-btn-forge").hide();
          html.find("#rv-forge-icons").empty();
          html.find("#rv-result-box").hide().removeClass("critical_success success failure critical_failure");
          html.find("#rv-dropzone").text(STRINGS[currentLang].dropzone);
          html.find("#rv-btn-forge").text(STRINGS[currentLang].forgeBtn);
          playSound(SFX_NAV.select);
        });

        // Volver desde reglas — delegado porque applyLang reconstruye el contenido
        html.find("#rv-rules-screen").on("click", "#rv-btn-back-rules", () => {
          html.find("#rv-rules-screen").hide();
          html.find("#rv-category-screen").show(); html[0].scrollTop = 0;
          playSound(SFX_NAV.back);
        });

        // Volver desde forja
        html.find("#rv-btn-back-forge").on("click", () => {
          html.find("#rv-forge-screen").hide();
          html.find("#rv-category-screen").show(); html[0].scrollTop = 0;
          draggedItem = null;
          playSound(SFX_NAV.back);
        });

        // ═══════════════════════════════════════════════════════════════════
        // RECOLECCIÓN (Gathering)
        // ═══════════════════════════════════════════════════════════════════

        // Volver desde recolección
        html.find("#rv-btn-back-gather").on("click", () => {
          if (gatherPlaying) return;
          html.find("#rv-gather-screen").hide();
          html.find("#rv-category-screen").show(); html[0].scrollTop = 0;
          selectedGatherType = null;
          playSound(SFX_NAV.back);
        });

        // Píldoras del tipo de recolección elegido (incluye insumos requeridos)
        function renderGatherStats() {
          const cfg = GATHERING_TYPES[selectedGatherType];
          if (!cfg) return;
          const G = STRINGS[currentLang].gather;
          const mod = getSkillMod(actor, cfg.skillSlug, cfg.skillAbbr);
          const pills = [
            `<span class="rv-stat-pill">${G.dcPill(GATHERING_DC)}</span>`,
            `<span class="rv-stat-pill">${G.skillPill(G.skills[selectedGatherType], mod)}</span>`,
            `<span class="rv-stat-pill ok">${G.prodPill(materialLabel(cfg.material))}</span>`,
          ];
          if (cfg.input) {
            for (const [mat, need] of Object.entries(cfg.input)) {
              const invItem = actor.items.find((i) => isMaterialItem(i, mat));
              const have = Number(invItem?.system?.quantity ?? 0);
              const emoji = anyMaterialDef(mat).emoji ?? "📦";
              pills.push(`<span class="rv-stat-pill ${have >= need ? "ok" : "danger"}" title="${mat}">${G.inputPill(emoji, need, have)}</span>`);
            }
          }
          html.find("#rv-gather-stats").html(pills.join(""));

          // Widget de conversión: solo para Comida (Food Supplies → Monster Rations 1:1)
          if (selectedGatherType === "comida") {
            const foodItem = actor.items.find((i) => isMaterialItem(i, "Food Supplies"));
            const foodQty = Number(foodItem?.system?.quantity ?? 0);
            convertAmount = Math.max(0, Math.min(convertAmount, foodQty));
            html.find("#rv-convert-sel").html(G.convertSel(convertAmount));
            html.find("#rv-food-convert").show();
          } else {
            html.find("#rv-food-convert").hide();
            convertAmount = 0;
          }
        }

        // Elegir tipo de recolección
        html.find(".rv-gather-btn").on("click", function () {
          if (gatherPlaying) return;
          selectedGatherType = $(this).data("gather");
          const cfg = GATHERING_TYPES[selectedGatherType];
          if (!cfg) return;

          html.find(".rv-gather-btn").removeClass("active");
          $(this).addClass("active");

          html.find("#rv-gather-bg").css("background-image", `url('${cfg.bg}')`);

          convertAmount = 0;
          renderGatherStats();
          html.find("#rv-gather-info").show();
          html.find("#rv-gather-icons").empty();
          html.find("#rv-gather-status-roll").remove();
          html.find("#rv-gather-result").hide().removeClass("ok fail");
          html.find("#rv-btn-gather-start").prop("disabled", false).show();
          playSound(SFX_NAV.select);
        });

        // ── Conversión directa: Food Supplies → Monster Rations (1:1, sin mini-juego) ──
        html.find("#rv-btn-convert-minus").on("click", () => {
          if (gatherPlaying) return;
          convertAmount = Math.max(0, convertAmount - 1);
          renderGatherStats();
        });
        html.find("#rv-btn-convert-plus").on("click", () => {
          if (gatherPlaying) return;
          convertAmount = convertAmount + 1; // renderGatherStats lo limita al stock disponible
          renderGatherStats();
        });
        html.find("#rv-btn-convert-do").on("click", async () => {
          if (gatherPlaying) return;
          const G = STRINGS[currentLang].gather;
          if (convertAmount <= 0) return ui.notifications.warn(G.convertNone);

          html.find("#rv-btn-convert-do").prop("disabled", true);
          try {
            const foodItem = actor.items.find((i) => isMaterialItem(i, "Food Supplies"));
            const foodQty = Number(foodItem?.system?.quantity ?? 0);
            if (!foodItem || foodQty < convertAmount) {
              renderGatherStats();
              return ui.notifications.warn(G.convertNoStock);
            }

            const n = convertAmount;
            await foodItem.update({ "system.quantity": foodQty - n });

            const rationsItem = await getOrCreateMaterial(actor, "Monster Rations");
            if (rationsItem) {
              const have = Number(rationsItem.system?.quantity ?? 0);
              await rationsItem.update({ "system.quantity": have + n });
            }

            ui.notifications.info(G.convertDone(n));
            const gm = game.users.find((u) => u.isGM && u.active);
            await ChatMessage.create({
              user: game.user.id,
              whisper: gm ? [gm.id] : [],
              content: `<div style="border:1px solid #554;border-radius:8px;padding:10px;background:rgba(0,0,0,0.7);">
                <p><strong>${G.convertChatTitle}</strong></p>
                <p><strong>${G.convertChatWho}</strong> ${actor.name}</p>
                <p>${G.convertChatLine(n)}</p>
              </div>`,
            });

            convertAmount = 0;
            renderGatherStats();
          } finally {
            html.find("#rv-btn-convert-do").prop("disabled", false);
          }
        });

        // Iniciar recolección
        html.find("#rv-btn-gather-start").on("click", async () => {
          if (gatherPlaying) return;
          const cfg = GATHERING_TYPES[selectedGatherType];
          if (!cfg) return;

          const G = STRINGS[currentLang].gather;

          // ── Verificar y consumir insumos (p. ej. 🦴 para pieles/abono) ──
          if (cfg.input) {
            const inputItems = {};
            const missing = [];
            for (const [mat, need] of Object.entries(cfg.input)) {
              const invItem = await getOrCreateMaterial(actor, mat);
              const have = Number(invItem?.system?.quantity ?? 0);
              if (!invItem || have < need) missing.push(`${materialLabel(mat)} (${have}/${need})`);
              inputItems[mat] = invItem;
            }
            if (missing.length) {
              renderGatherStats();
              return ui.notifications.warn(G.needInput(missing.join(", ")));
            }
            for (const [mat, need] of Object.entries(cfg.input)) {
              const invItem = inputItems[mat];
              const have = Number(invItem.system?.quantity ?? 0);
              await invItem.update({ "system.quantity": have - need });
            }
            renderGatherStats();
          }

          gatherPlaying = true;
          html.find("#rv-btn-gather-start").prop("disabled", true).hide();
          // Ocultar selección de tipo para dejar sitio al mini-juego
          html.find(".rv-gather-grid").hide();
          html.find("#rv-gather-result").hide().removeClass("ok fail");
          const $gIcons = html.find("#rv-gather-icons").empty();
          html.find("#rv-gather-status-roll").remove();

          // ── Tirada de habilidad ──
          const mod = getSkillMod(actor, cfg.skillSlug, cfg.skillAbbr);
          let rollTotal = 0;
          try {
            const roll = await new Roll(`1d20 + ${mod}`).evaluate();
            rollTotal = roll.total;
            await roll.toMessage({
              speaker: ChatMessage.getSpeaker({ actor }),
              flavor: `<strong>${G.chatTitle}</strong> (DC ${GATHERING_DC}) — ${G.types[selectedGatherType]} (${G.skills[selectedGatherType]})`,
            });
          } catch (err) {
            console.error("RedVelvet | Error en tirada de recolección:", err);
            rollTotal = Math.floor(Math.random() * 20) + 1 + mod;
          }
          const margin = rollTotal - GATHERING_DC;

          const rollInfo = $(`<p id="rv-gather-status-roll" style="font-size:12px;color:#ccc;">
            ${G.rollLine(rollTotal, G.skills[selectedGatherType], GATHERING_DC)}
          </p>`);
          $gIcons.before(rollInfo);

          // Misma escala de dificultad del mini-juego que la forja
          let TIME_LIMIT, HIT_START, HIT_END;
          if (margin >= 10) {
            TIME_LIMIT = 4500; HIT_START = 2800; HIT_END = 3900;
          } else if (margin >= 0) {
            TIME_LIMIT = 3200; HIT_START = 2000; HIT_END = 2700;
          } else if (margin >= -9) {
            TIME_LIMIT = 2200; HIT_START = 1200; HIT_END = 1600;
          } else {
            TIME_LIMIT = 1500; HIT_START = 700; HIT_END = 950;
          }

          let iconsDone = 0, hits = 0;

          function spawnGatherIcon() {
            const $icon = $(`<button type="button" class="rv-forge-icon">
              <img src="${cfg.icon}" />
              <div class="rv-bar"></div>
              <span class="rv-countdown"></span>
            </button>`);
            $gIcons.append($icon);
            $icon[0]?.focus({preventScroll:true});

            const $bar = $icon.find(".rv-bar");
            const $cd = $icon.find(".rv-countdown");
            let progress = 0; const began = performance.now();
            let resolved = false;

            const interval = setInterval(() => {
              progress = performance.now() - began;
              $bar.css("width", `${(progress / TIME_LIMIT) * 100}%`);
              $cd.text(Math.ceil((TIME_LIMIT - progress) / 1000));

              const inWindow = progress >= HIT_START && progress <= HIT_END;
              $icon.css("box-shadow", inWindow ? "0 0 20px 6px rgba(232,201,106,0.8)" : "none");

              if (progress >= TIME_LIMIT && !resolved) {
                resolved = true; $icon.prop("disabled",true);
                clearInterval(interval);
                $icon.addClass("miss");
                playSound(SFX_MISS[cfg.sfxCat]);
                if (++iconsDone < 3) setTimeout(spawnGatherIcon, 400);
                else finalizeGather(hits);
              }
            }, 20);

            $icon.on("click", () => {
              if (resolved) return;
              resolved = true; $icon.prop("disabled",true);
              clearInterval(interval);
              progress = performance.now() - began;
              const inWindow = progress >= HIT_START && progress <= HIT_END;
              if (inWindow) {
                hits++;
                $icon.addClass("hit");
                playSound(SFX_HIT[cfg.sfxCat]);
              } else {
                $icon.addClass("miss");
                playSound(SFX_MISS[cfg.sfxCat]);
              }
              if (++iconsDone < 3) setTimeout(spawnGatherIcon, 400);
              else finalizeGather(hits);
            });
          }

          spawnGatherIcon();
          try { $gIcons[0]?.scrollIntoView({ behavior: "smooth", block: "center" }); } catch { /* */ }

          // ── FINALIZACIÓN ──
          async function finalizeGather(hits) {
            gatherPlaying = false;
            html.find(".rv-gather-grid").show();
            html.find("#rv-btn-gather-start").prop("disabled", false).show();
            renderGatherStats();

            const GL = STRINGS[currentLang].gather;
            const bonus = hits > 0 && margin >= 5;
            let amount = hits * 2;
            if (bonus) amount += 2;

            const matLabel = materialLabel(cfg.material);
            const $result = html.find("#rv-gather-result");

            if (amount > 0) {
              const materialItem = await getOrCreateMaterial(actor, cfg.material);
              if (materialItem) {
                const qtyNow = Number(materialItem.system?.quantity ?? 0);
                await materialItem.update({ "system.quantity": qtyNow + amount });
              }
              $result.addClass("ok").html(`
                <div class="rv-degree-label" style="color:#4ade80;">${GL.resultOkLabel}</div>
                <p style="margin:0;font-size:13px;">${GL.hitsLine(hits)}<br>${GL.resultOk(amount, matLabel, bonus)}</p>
              `).show();
            } else {
              $result.addClass("fail").html(`
                <div class="rv-degree-label" style="color:#f87171;">${GL.resultFailLabel}</div>
                <p style="margin:0;font-size:13px;">${GL.hitsLine(hits)}<br>${GL.resultFail}</p>
              `).show();
            }

            // Mensaje al chat (solo al GM)
            const gm = game.users.find((u) => u.isGM && u.active);
            const playerName = actor.name ?? game.user.name;
            await ChatMessage.create({
              user: game.user.id,
              whisper: gm ? [gm.id] : [],
              content: `
                <div style="border:1px solid #554;border-radius:8px;padding:10px;background:rgba(0,0,0,0.7);">
                  <p><strong>${GL.chatTitle}</strong></p>
                  <p><strong>${GL.chatGatherer}</strong> ${playerName}</p>
                  <p><strong>${GL.chatType}</strong> ${GL.types[selectedGatherType]}</p>
                  <p><strong>${GL.chatSkill}</strong> ${GL.skills[selectedGatherType]} — ${rollTotal} vs DC ${GATHERING_DC} | ${GL.hitsLine(hits)}</p>
                  <p><strong>${GL.chatGot}</strong> ${amount > 0 ? `${amount} ${matLabel}` : GL.chatNothing}</p>
                </div>
              `,
            });
          } // end finalizeGather
        }); // end gather start

        // ═══════════════════════════════════════════════════════════════════
        // CONSTRUCCIONES (Building)
        // ═══════════════════════════════════════════════════════════════════

        // Volver desde construcciones
        html.find("#rv-btn-back-build").on("click", () => {
          if (buildPlaying) return;
          html.find("#rv-build-screen").hide();
          html.find("#rv-category-screen").show(); html[0].scrollTop = 0;
          selectedBuildPiece = null;
          playSound(SFX_NAV.back);
        });

        // Pinta las píldoras de coste de una pieza (verde si alcanza, rojo si no)
        function renderBuildCosts(piece) {
          const B = STRINGS[currentLang].build;
          let allOk = true;
          const pills = Object.entries(piece.cost).map(([mat, need]) => {
            const invItem = actor.items.find((i) => isMaterialItem(i, mat));
            const have = Number(invItem?.system?.quantity ?? 0);
            const ok = have >= need;
            if (!ok) allOk = false;
            const emoji = MATERIAL_DEFS[mat]?.emoji ?? "📦";
            return `<span class="rv-stat-pill ${ok ? "ok" : "danger"}" title="${mat}">${B.costPill(emoji, need, have)}</span>`;
          }).join("");
          html.find("#rv-build-costs").html(pills);
          return allOk;
        }

        // Elegir pieza
        html.find(".rv-build-btn").on("click", function () {
          if (buildPlaying) return;
          selectedBuildPiece = $(this).data("build");
          const piece = BUILD_PIECES[selectedBuildPiece];
          if (!piece) return;

          html.find(".rv-build-btn").removeClass("active");
          $(this).addClass("active");

          const B = STRINGS[currentLang].build;
          html.find("#rv-build-stats").html(`
            <span class="rv-stat-pill">${B.dcPill(piece.dc)}</span>
            <span class="rv-stat-pill">${STRINGS[currentLang].craftPill(craftingSkill.mod, craftingSkill.label, "")}</span>
            <span class="rv-stat-pill ok">📦 → ${materialLabel(piece.item)}</span>
          `);
          renderBuildCosts(piece);
          html.find("#rv-build-info").show();
          html.find("#rv-build-icons").empty();
          html.find("#rv-build-status-roll").remove();
          html.find("#rv-build-result").hide().removeClass("critical_success success failure critical_failure");
          html.find("#rv-btn-build-start").prop("disabled", false).show();
          playSound(SFX_NAV.select);
        });

        // Iniciar construcción
        html.find("#rv-btn-build-start").on("click", async () => {
          if (buildPlaying) return;
          const piece = BUILD_PIECES[selectedBuildPiece];
          if (!piece) return;

          const B = STRINGS[currentLang].build;

          // ── Verificar y reunir materiales ──
          const matItems = {};
          const missing = [];
          for (const [mat, need] of Object.entries(piece.cost)) {
            const invItem = await getOrCreateMaterial(actor, mat);
            const have = Number(invItem?.system?.quantity ?? 0);
            if (!invItem || have < need) {
              missing.push(`${materialLabel(mat)} (${have}/${need})`);
            }
            matItems[mat] = invItem;
          }
          if (missing.length) {
            renderBuildCosts(piece);
            return ui.notifications.warn(B.needMats(missing.join(", ")));
          }

          // ── Gastar materiales ──
          for (const [mat, need] of Object.entries(piece.cost)) {
            const invItem = matItems[mat];
            const have = Number(invItem.system?.quantity ?? 0);
            await invItem.update({ "system.quantity": have - need });
          }
          renderBuildCosts(piece);

          buildPlaying = true;
          html.find("#rv-btn-build-start").prop("disabled", true).hide();
          html.find(".rv-build-grid").hide();
          html.find("#rv-build-result").hide().removeClass("critical_success success failure critical_failure");
          const $bIcons = html.find("#rv-build-icons").empty();
          html.find("#rv-build-status-roll").remove();

          // ── Tirada de Crafting ──
          let rollTotal = 0;
          let naturalRoll = 0;
          try {
            const roll = await new Roll(`1d20 + ${craftingSkill.mod}`).evaluate();
            rollTotal = roll.total;
            naturalRoll = roll.dice[0]?.results[0]?.result ?? 10;
            await roll.toMessage({
              speaker: ChatMessage.getSpeaker({ actor }),
              flavor: `<strong>${B.chatTitle}</strong> (DC ${piece.dc}) — ${B.pieces[selectedBuildPiece]}`,
            });
          } catch (err) {
            console.error("RedVelvet | Error en tirada de construcción:", err);
            rollTotal = Math.floor(Math.random() * 20) + 1 + craftingSkill.mod;
            naturalRoll = rollTotal - craftingSkill.mod;
          }

          const skillDegree = getDegreeOfSuccess(rollTotal, piece.dc, naturalRoll);
          const margin = rollTotal - piece.dc;

          const rollInfo = $(`<p id="rv-build-status-roll" style="font-size:12px;color:#ccc;">
            ${B.rollLine(rollTotal, piece.dc)} →
            <span>${STRINGS[currentLang].degreeShort[skillDegree]}</span>
          </p>`);
          $bIcons.before(rollInfo);

          // Misma escala de dificultad que la forja
          let TIME_LIMIT, HIT_START, HIT_END;
          if (margin >= 10) {
            TIME_LIMIT = 4500; HIT_START = 2800; HIT_END = 3900;
          } else if (margin >= 0) {
            TIME_LIMIT = 3200; HIT_START = 2000; HIT_END = 2700;
          } else if (margin >= -9) {
            TIME_LIMIT = 2200; HIT_START = 1200; HIT_END = 1600;
          } else {
            TIME_LIMIT = 1500; HIT_START = 700; HIT_END = 950;
          }

          let iconsDone = 0, hits = 0;

          function spawnBuildIcon() {
            const $icon = $(`<button type="button" class="rv-forge-icon">
              <img src="${RV_ASSETS.icon.construction}" />
              <div class="rv-bar"></div>
              <span class="rv-countdown"></span>
            </button>`);
            $bIcons.append($icon);
            $icon[0]?.focus({preventScroll:true});

            const $bar = $icon.find(".rv-bar");
            const $cd = $icon.find(".rv-countdown");
            let progress = 0; const began = performance.now();
            let resolved = false;

            const interval = setInterval(() => {
              progress = performance.now() - began;
              $bar.css("width", `${(progress / TIME_LIMIT) * 100}%`);
              $cd.text(Math.ceil((TIME_LIMIT - progress) / 1000));

              const inWindow = progress >= HIT_START && progress <= HIT_END;
              $icon.css("box-shadow", inWindow ? "0 0 20px 6px rgba(232,201,106,0.8)" : "none");

              if (progress >= TIME_LIMIT && !resolved) {
                resolved = true; $icon.prop("disabled",true);
                clearInterval(interval);
                $icon.addClass("miss");
                playSound(SFX_MISS["herreria"]);
                if (++iconsDone < 3) setTimeout(spawnBuildIcon, 400);
                else finalizeBuild(hits);
              }
            }, 20);

            $icon.on("click", () => {
              if (resolved) return;
              resolved = true; $icon.prop("disabled",true);
              clearInterval(interval);
              progress = performance.now() - began;
              const inWindow = progress >= HIT_START && progress <= HIT_END;
              if (inWindow) {
                hits++;
                $icon.addClass("hit");
                playSound(SFX_HIT["herreria"]);
              } else {
                $icon.addClass("miss");
                playSound(SFX_MISS["herreria"]);
              }
              if (++iconsDone < 3) setTimeout(spawnBuildIcon, 400);
              else finalizeBuild(hits);
            });
          }

          spawnBuildIcon();
          try { $bIcons[0]?.scrollIntoView({ behavior: "smooth", block: "center" }); } catch { /* */ }

          // ── FINALIZACIÓN con grados PF2e ──
          async function finalizeBuild(hits) {
            buildPlaying = false;
            html.find(".rv-build-grid").show();
            html.find("#rv-btn-build-start").prop("disabled", false).show();

            const BL = STRINGS[currentLang].build;
            const degreeOrder = ["critical_failure", "failure", "success", "critical_success"];
            let degreeIndex = degreeOrder.indexOf(skillDegree);
            if (hits === 3) degreeIndex = Math.min(3, degreeIndex + 1);
            else if (hits <= 1) degreeIndex = Math.max(0, degreeIndex - 1);
            const finalDegree = degreeOrder[degreeIndex];

            // Reembolso por material según grado:
            //   crit success: 25% (eficiencia) | failure: 50% | crit failure: 0
            const refundRate = { critical_success: 0.25, success: 0, failure: 0.5, critical_failure: 0 }[finalDegree];
            const refunds = [];
            if (refundRate > 0) {
              for (const [mat, need] of Object.entries(piece.cost)) {
                const back = Math.floor(need * refundRate);
                if (back <= 0) continue;
                const invItem = actor.items.get(matItems[mat]?.id)
                  ?? actor.items.find((i) => isMaterialItem(i, mat));
                if (invItem) {
                  const qtyNow = Number(invItem.system?.quantity ?? 0);
                  await invItem.update({ "system.quantity": qtyNow + back });
                  refunds.push(`${back} ${materialLabel(mat)}`);
                }
              }
            }
            const refundTxt = refunds.join(", ");

            // Crear la pieza si hubo éxito
            const built = finalDegree === "critical_success" || finalDegree === "success";
            if (built) {
              const pieceItem = await getOrCreateMaterial(actor, piece.item);
              if (pieceItem) {
                const qtyNow = Number(pieceItem.system?.quantity ?? 0);
                await pieceItem.update({ "system.quantity": qtyNow + 1 });
              }
            }
            renderBuildCosts(piece);

            const pieceLabel = materialLabel(piece.item);
            const resultMap = {
              critical_success: { label: BL.resultCritLabel,     text: BL.resultCrit(pieceLabel, refundTxt) },
              success:          { label: BL.resultOkLabel,       text: BL.resultOk(pieceLabel) },
              failure:          { label: BL.resultFailLabel,     text: BL.resultFail(refundTxt) },
              critical_failure: { label: BL.resultCritFailLabel, text: BL.resultCritFail },
            };
            const rInfo = resultMap[finalDegree];
            html.find("#rv-build-result")
              .removeClass("critical_success success failure critical_failure")
              .addClass(finalDegree)
              .html(`
                <div class="rv-degree-label">${rInfo.label}</div>
                <p style="margin:0;font-size:13px;">${BL.hitsLine(hits)}<br>${rInfo.text}</p>
              `)
              .show();

            // Mensaje al chat (solo al GM)
            const gm = game.users.find((u) => u.isGM && u.active);
            const playerName = actor.name ?? game.user.name;
            const spentTxt = Object.entries(piece.cost)
              .map(([mat, need]) => `${need} ${materialLabel(mat)}`)
              .join(", ");
            await ChatMessage.create({
              user: game.user.id,
              whisper: gm ? [gm.id] : [],
              content: `
                <div style="border:1px solid #554;border-radius:8px;padding:10px;background:rgba(0,0,0,0.7);">
                  <p><strong>${BL.chatTitle}</strong></p>
                  <p><strong>${BL.chatBuilder}</strong> ${playerName}</p>
                  <p><strong>${BL.chatPiece}</strong> ${BL.pieces[selectedBuildPiece]} (DC ${piece.dc})</p>
                  <p><strong>${BL.chatResult}</strong> ${STRINGS[currentLang].degreeShort[finalDegree]} — ${rollTotal} vs DC ${piece.dc} | ${BL.hitsLine(hits)}</p>
                  <p><strong>${BL.chatSpent}</strong> ${spentTxt}</p>
                  ${refundTxt ? `<p><strong>${BL.chatRefund}</strong> ${refundTxt}</p>` : ""}
                </div>
              `,
            });
          } // end finalizeBuild
        }); // end build start

        // ═══════════════════════════════════════════════════════════════════
        // BUILDING (Estructuras completas con niveles)
        // ═══════════════════════════════════════════════════════════════════

        // Volver desde estructuras
        html.find("#rv-btn-back-struct").on("click", () => {
          if (structPlaying) return;
          html.find("#rv-struct-screen").hide();
          html.find("#rv-category-screen").show(); html[0].scrollTop = 0;
          selectedStruct = null;
          playSound(SFX_NAV.back);
        });

        // Píldoras de coste de una estructura a un nivel (verde/rojo según stock)
        function renderStructCosts() {
          const B = STRINGS[currentLang].build;
          const T = STRINGS[currentLang].struct;
          const cost = structureCost(selectedStruct, selectedStructLvl);
          let allOk = true;
          const pills = Object.entries(cost).map(([mat, need]) => {
            const invItem = actor.items.find((i) => isMaterialItem(i, mat));
            const have = Number(invItem?.system?.quantity ?? 0);
            const ok = have >= need;
            if (!ok) allOk = false;
            const emoji = anyMaterialDef(mat).emoji ?? "📦";
            return `<span class="rv-stat-pill ${ok ? "ok" : "danger"}" title="${mat}">${B.costPill(emoji, need, have)}</span>`;
          });

          // Mejora: requiere (y consume) la estructura del nivel anterior
          if (selectedStructLvl > 1) {
            const prevName = structureItemName(selectedStruct, selectedStructLvl - 1);
            const prevItem = actor.items.find((i) => isMaterialItem(i, prevName));
            const prevHave = Number(prevItem?.system?.quantity ?? 0);
            const ok = prevHave >= 1;
            if (!ok) allOk = false;
            pills.push(`<span class="rv-stat-pill ${ok ? "ok" : "danger"}" title="${prevName}">${T.reqPrevPill(materialLabel(prevName))}</span>`);
          }

          html.find("#rv-struct-costs").html(pills.join(""));
          return allOk;
        }

        function renderStructInfo() {
          const T = STRINGS[currentLang].struct;
          const dc = structureDC(selectedStruct, selectedStructLvl);
          html.find("#rv-struct-stats").html(`
            <span class="rv-stat-pill">${STRINGS[currentLang].build.dcPill(dc)}</span>
            <span class="rv-stat-pill">${STRINGS[currentLang].craftPill(craftingSkill.mod, craftingSkill.label, "")}</span>
            <span class="rv-stat-pill ok">${T.prodPill(materialLabel(structureItemName(selectedStruct, selectedStructLvl)))}</span>
          `);
          renderStructCosts();
        }

        // Elegir estructura
        html.find(".rv-struct-btn").on("click", function () {
          if (structPlaying) return;
          selectedStruct = $(this).data("struct");
          if (!STRUCTURES[selectedStruct]) return;

          html.find(".rv-struct-btn").removeClass("active");
          $(this).addClass("active");

          selectedStructLvl = 1;
          html.find(".rv-lvl-btn").removeClass("active");
          html.find(".rv-lvl-btn[data-lvl='1']").addClass("active");

          renderStructInfo();
          html.find("#rv-struct-info").show();
          html.find("#rv-struct-icons").empty();
          html.find("#rv-struct-status-roll").remove();
          html.find("#rv-struct-result").hide().removeClass("critical_success success failure critical_failure");
          html.find("#rv-btn-struct-start").prop("disabled", false).show();
          playSound(SFX_NAV.select);
          try { html.find("#rv-struct-info")[0]?.scrollIntoView({ behavior: "smooth", block: "center" }); } catch { /* */ }
        });

        // Elegir nivel
        html.find(".rv-lvl-btn").on("click", function () {
          if (structPlaying || !selectedStruct) return;
          selectedStructLvl = Math.max(1, Math.min(STRUCT_MAX_LVL, Number($(this).data("lvl")) || 1));
          html.find(".rv-lvl-btn").removeClass("active");
          $(this).addClass("active");
          renderStructInfo();
          html.find("#rv-struct-result").hide().removeClass("critical_success success failure critical_failure");
          playSound(SFX_NAV.select);
        });

        // Iniciar construcción de estructura
        html.find("#rv-btn-struct-start").on("click", async () => {
          if (structPlaying || !selectedStruct) return;
          const structKey = selectedStruct;
          const lvl = selectedStructLvl;
          const B = STRINGS[currentLang].build;
          const T = STRINGS[currentLang].struct;
          const cost = structureCost(structKey, lvl);
          const dc = structureDC(structKey, lvl);

          // ── Verificar materiales/piezas ──
          const matItems = {};
          const missing = [];
          for (const [mat, need] of Object.entries(cost)) {
            const invItem = await getOrCreateMaterial(actor, mat);
            const have = Number(invItem?.system?.quantity ?? 0);
            if (!invItem || have < need) missing.push(`${materialLabel(mat)} (${have}/${need})`);
            matItems[mat] = invItem;
          }

          // ── Verificar estructura del nivel anterior (no se consume aún) ──
          let prevItem = null;
          const prevName = lvl > 1 ? structureItemName(structKey, lvl - 1) : null;
          if (prevName) {
            prevItem = actor.items.find((i) => isMaterialItem(i, prevName)) ?? null;
            const prevHave = Number(prevItem?.system?.quantity ?? 0);
            if (prevHave < 1) {
              renderStructCosts();
              return ui.notifications.warn(T.needPrev(materialLabel(prevName)));
            }
          }
          if (missing.length) {
            renderStructCosts();
            return ui.notifications.warn(B.needMats(missing.join(", ")));
          }

          // ── Gastar materiales (la estructura previa solo se consume si hay éxito) ──
          for (const [mat, need] of Object.entries(cost)) {
            const invItem = matItems[mat];
            const have = Number(invItem.system?.quantity ?? 0);
            await invItem.update({ "system.quantity": have - need });
          }
          renderStructCosts();

          structPlaying = true;
          html.find("#rv-btn-struct-start").prop("disabled", true).hide();
          html.find("#rv-struct-catalog").hide();
          html.find("#rv-struct-result").hide().removeClass("critical_success success failure critical_failure");
          const $sIcons = html.find("#rv-struct-icons").empty();
          html.find("#rv-struct-status-roll").remove();

          const structLabel = `${T.items[structKey]} — ${T.lvlBtn(lvl)}`;

          // ── Tirada de Crafting ──
          let rollTotal = 0;
          let naturalRoll = 0;
          try {
            const roll = await new Roll(`1d20 + ${craftingSkill.mod}`).evaluate();
            rollTotal = roll.total;
            naturalRoll = roll.dice[0]?.results[0]?.result ?? 10;
            await roll.toMessage({
              speaker: ChatMessage.getSpeaker({ actor }),
              flavor: `<strong>${B.chatTitle}</strong> (DC ${dc}) — ${structLabel}`,
            });
          } catch (err) {
            console.error("RedVelvet | Error en tirada de construcción:", err);
            rollTotal = Math.floor(Math.random() * 20) + 1 + craftingSkill.mod;
            naturalRoll = rollTotal - craftingSkill.mod;
          }

          const skillDegree = getDegreeOfSuccess(rollTotal, dc, naturalRoll);
          const margin = rollTotal - dc;

          const rollInfo = $(`<p id="rv-struct-status-roll" style="font-size:12px;color:#ccc;">
            ${B.rollLine(rollTotal, dc)} →
            <span>${STRINGS[currentLang].degreeShort[skillDegree]}</span>
          </p>`);
          $sIcons.before(rollInfo);

          // Misma escala de dificultad que la forja
          let TIME_LIMIT, HIT_START, HIT_END;
          if (margin >= 10) {
            TIME_LIMIT = 4500; HIT_START = 2800; HIT_END = 3900;
          } else if (margin >= 0) {
            TIME_LIMIT = 3200; HIT_START = 2000; HIT_END = 2700;
          } else if (margin >= -9) {
            TIME_LIMIT = 2200; HIT_START = 1200; HIT_END = 1600;
          } else {
            TIME_LIMIT = 1500; HIT_START = 700; HIT_END = 950;
          }

          let iconsDone = 0, hits = 0;

          function spawnStructIcon() {
            const $icon = $(`<button type="button" class="rv-forge-icon">
              <img src="${RV_ASSETS.icon.structure}" />
              <div class="rv-bar"></div>
              <span class="rv-countdown"></span>
            </button>`);
            $sIcons.append($icon);
            $icon[0]?.focus({preventScroll:true});

            const $bar = $icon.find(".rv-bar");
            const $cd = $icon.find(".rv-countdown");
            let progress = 0; const began = performance.now();
            let resolved = false;

            const interval = setInterval(() => {
              progress = performance.now() - began;
              $bar.css("width", `${(progress / TIME_LIMIT) * 100}%`);
              $cd.text(Math.ceil((TIME_LIMIT - progress) / 1000));

              const inWindow = progress >= HIT_START && progress <= HIT_END;
              $icon.css("box-shadow", inWindow ? "0 0 20px 6px rgba(232,201,106,0.8)" : "none");

              if (progress >= TIME_LIMIT && !resolved) {
                resolved = true; $icon.prop("disabled",true);
                clearInterval(interval);
                $icon.addClass("miss");
                playSound(SFX_MISS["herreria"]);
                if (++iconsDone < 3) setTimeout(spawnStructIcon, 400);
                else finalizeStruct(hits);
              }
            }, 20);

            $icon.on("click", () => {
              if (resolved) return;
              resolved = true; $icon.prop("disabled",true);
              clearInterval(interval);
              progress = performance.now() - began;
              const inWindow = progress >= HIT_START && progress <= HIT_END;
              if (inWindow) {
                hits++;
                $icon.addClass("hit");
                playSound(SFX_HIT["herreria"]);
              } else {
                $icon.addClass("miss");
                playSound(SFX_MISS["herreria"]);
              }
              if (++iconsDone < 3) setTimeout(spawnStructIcon, 400);
              else finalizeStruct(hits);
            });
          }

          spawnStructIcon();
          try { $sIcons[0]?.scrollIntoView({ behavior: "smooth", block: "center" }); } catch { /* */ }

          // ── FINALIZACIÓN con grados PF2e ──
          async function finalizeStruct(hits) {
            structPlaying = false;
            html.find("#rv-struct-catalog").show();
            html.find("#rv-btn-struct-start").prop("disabled", false).show();

            const degreeOrder = ["critical_failure", "failure", "success", "critical_success"];
            let degreeIndex = degreeOrder.indexOf(skillDegree);
            if (hits === 3) degreeIndex = Math.min(3, degreeIndex + 1);
            else if (hits <= 1) degreeIndex = Math.max(0, degreeIndex - 1);
            const finalDegree = degreeOrder[degreeIndex];

            // Reembolso: crit 25%, fallo 50%, crit fallo 0 (solo materiales/piezas)
            const refundRate = { critical_success: 0.25, success: 0, failure: 0.5, critical_failure: 0 }[finalDegree];
            const refunds = [];
            if (refundRate > 0) {
              for (const [mat, need] of Object.entries(cost)) {
                const back = Math.floor(need * refundRate);
                if (back <= 0) continue;
                const invItem = actor.items.get(matItems[mat]?.id)
                  ?? actor.items.find((i) => isMaterialItem(i, mat));
                if (invItem) {
                  const qtyNow = Number(invItem.system?.quantity ?? 0);
                  await invItem.update({ "system.quantity": qtyNow + back });
                  refunds.push(`${back} ${materialLabel(mat)}`);
                }
              }
            }
            const refundTxt = refunds.join(", ");

            const built = finalDegree === "critical_success" || finalDegree === "success";
            if (built) {
              // Consumir la estructura del nivel anterior (la mejora la reemplaza)
              if (prevName) {
                const prevNow = actor.items.get(prevItem?.id)
                  ?? actor.items.find((i) => isMaterialItem(i, prevName));
                const prevQty = Number(prevNow?.system?.quantity ?? 0);
                if (prevNow && prevQty > 1) await prevNow.update({ "system.quantity": prevQty - 1 });
                else if (prevNow) await prevNow.delete();
              }
              // Crear la estructura del nivel nuevo
              const newName = structureItemName(structKey, lvl);
              const structItem = await getOrCreateMaterial(actor, newName);
              if (structItem) {
                const qtyNow = Number(structItem.system?.quantity ?? 0);
                await structItem.update({ "system.quantity": qtyNow + 1 });
              }
            }
            renderStructCosts();

            const builtLabel = materialLabel(structureItemName(structKey, lvl));
            const BL = STRINGS[currentLang].build;
            const resultMap = {
              critical_success: { label: BL.resultCritLabel,     text: BL.resultCrit(builtLabel, refundTxt) },
              success:          { label: BL.resultOkLabel,       text: BL.resultOk(builtLabel) },
              failure:          { label: BL.resultFailLabel,     text: BL.resultFail(refundTxt) },
              critical_failure: { label: BL.resultCritFailLabel, text: BL.resultCritFail },
            };
            const rInfo = resultMap[finalDegree];
            html.find("#rv-struct-result")
              .removeClass("critical_success success failure critical_failure")
              .addClass(finalDegree)
              .html(`
                <div class="rv-degree-label">${rInfo.label}</div>
                <p style="margin:0;font-size:13px;">${BL.hitsLine(hits)}<br>${rInfo.text}</p>
              `)
              .show();

            // Mensaje al chat (solo al GM)
            const gm = game.users.find((u) => u.isGM && u.active);
            const playerName = actor.name ?? game.user.name;
            const spentTxt = Object.entries(cost)
              .map(([mat, need]) => `${need} ${materialLabel(mat)}`)
              .join(", ");
            await ChatMessage.create({
              user: game.user.id,
              whisper: gm ? [gm.id] : [],
              content: `
                <div style="border:1px solid #554;border-radius:8px;padding:10px;background:rgba(0,0,0,0.7);">
                  <p><strong>${BL.chatTitle}</strong></p>
                  <p><strong>${BL.chatBuilder}</strong> ${playerName}</p>
                  <p><strong>${BL.chatPiece}</strong> ${structLabel} (DC ${dc})</p>
                  <p><strong>${BL.chatResult}</strong> ${STRINGS[currentLang].degreeShort[finalDegree]} — ${rollTotal} vs DC ${dc} | ${BL.hitsLine(hits)}</p>
                  <p><strong>${BL.chatSpent}</strong> ${spentTxt}${built && prevName ? ` + 1 ${materialLabel(prevName)}` : ""}</p>
                  ${refundTxt ? `<p><strong>${BL.chatRefund}</strong> ${refundTxt}</p>` : ""}
                </div>
              `,
            });
          } // end finalizeStruct
        }); // end struct start

        // ═══════════════════════════════════════════════════════════════════
        // RECICLAJE (Salvage) — sin mini-juego: destruye el ítem y recupera
        // materiales de la categoría detectada (25% del precio, mín. 1).
        // ═══════════════════════════════════════════════════════════════════

        // Volver desde reciclaje
        html.find("#rv-btn-back-salvage").on("click", () => {
          html.find("#rv-salvage-screen").hide();
          html.find("#rv-category-screen").show(); html[0].scrollTop = 0;
          salvageItem = null;
          playSound(SFX_NAV.back);
        });

        const salvageZone = html.find("#rv-salvage-dropzone")[0];
        salvageZone.addEventListener("dragover", (e) => {
          e.preventDefault();
          salvageZone.classList.add("dragover");
        });
        salvageZone.addEventListener("dragleave", () => salvageZone.classList.remove("dragover"));

        salvageZone.addEventListener("drop", async (e) => {
          e.preventDefault();
          salvageZone.classList.remove("dragover");

          const SV = STRINGS[currentLang].salvage;
          let data;
          try { data = JSON.parse(e.dataTransfer.getData("text/plain")); }
          catch { return ui.notifications.warn(STRINGS[currentLang].notifyDropInvalid); }
          if (data.type !== "Item") return ui.notifications.warn(STRINGS[currentLang].notifyItemOnly);

          const item = await fromUuid(data.uuid);
          if (!item) return ui.notifications.warn(STRINGS[currentLang].notifyItemLoad);

          // Debe ser un ítem del inventario del actor seleccionado
          if (item.actor?.id !== actor.id) {
            html.find("#rv-salvage-info").hide();
            return ui.notifications.warn(SV.notOwned);
          }

          // No se pueden reciclar los propios materiales ni piezas de construcción
          if (Object.keys(MATERIAL_DEFS).some((m) => isMaterialItem(item, m))) {
            html.find("#rv-salvage-info").hide();
            return ui.notifications.warn(SV.isMaterial);
          }

          salvageItem = item;

          // Categoría del ítem → material que devuelve (misma detección que el crafteo)
          const cat = detectCategory(item);
          salvageMaterial = CATEGORY_MATERIALS[cat] ?? "Crafting Materials";

          // Recupera el 25% del precio en GP (la mitad del coste de crafteo), mín. 1
          salvageAmount = Math.max(1, Math.floor(getBatchCost(item) * 0.5));

          const qty = Number(item.system?.quantity ?? 1);
          html.find("#rv-salvage-img").attr("src", item.img ?? RV_ASSETS.icon.crafting);
          html.find("#rv-salvage-name").text(item.name);
          html.find("#rv-salvage-meta").text(SV.meta(STRINGS[currentLang].cats[cat] ?? cat, materialLabel(salvageMaterial)));
          html.find("#rv-salvage-stats").html(`
            <span class="rv-stat-pill ok">${SV.yieldPill(salvageAmount, materialLabel(salvageMaterial))}</span>
            <span class="rv-stat-pill">${SV.qtyPill(qty)}</span>
          `);
          html.find("#rv-salvage-result").hide().removeClass("ok fail");
          html.find("#rv-btn-salvage").prop("disabled", false);
          html.find("#rv-salvage-info").show();
        });

        // Botón destruir y reciclar
        html.find("#rv-btn-salvage").on("click", async () => {
          const SV = STRINGS[currentLang].salvage;
          if (!salvageItem) return;

          // Re-fetch: el ítem debe seguir en el inventario
          const invItem = actor.items.get(salvageItem.id);
          if (!invItem) {
            html.find("#rv-salvage-info").hide();
            salvageItem = null;
            return ui.notifications.warn(STRINGS[currentLang].notifyItemLoad);
          }

          html.find("#rv-btn-salvage").prop("disabled", true);

          const itemName = invItem.name;
          const qty = Number(invItem.system?.quantity ?? 1);

          // Destruir 1 unidad (o borrar el ítem si era la última)
          if (qty > 1) {
            await invItem.update({ "system.quantity": qty - 1 });
          } else {
            await invItem.delete();
          }

          // Entregar materiales
          const matItem = await getOrCreateMaterial(actor, salvageMaterial);
          if (matItem) {
            const qtyNow = Number(matItem.system?.quantity ?? 0);
            await matItem.update({ "system.quantity": qtyNow + salvageAmount });
          }

          playSound(SFX_HIT["equipo-vario"]);

          const matLabelTxt = materialLabel(salvageMaterial);
          html.find("#rv-salvage-info").hide();
          html.find("#rv-salvage-dropzone").text(SV.dropzone);
          html.find("#rv-salvage-result")
            .removeClass("fail").addClass("ok")
            .html(`
              <div class="rv-degree-label" style="color:#4ade80;">${SV.resultLabel}</div>
              <p style="margin:0;font-size:13px;">${SV.resultText(itemName, salvageAmount, matLabelTxt)}</p>
            `)
            .show();

          // Mensaje al chat (solo al GM)
          const gm = game.users.find((u) => u.isGM && u.active);
          const playerName = actor.name ?? game.user.name;
          await ChatMessage.create({
            user: game.user.id,
            whisper: gm ? [gm.id] : [],
            content: `
              <div style="border:1px solid #554;border-radius:8px;padding:10px;background:rgba(0,0,0,0.7);">
                <p><strong>${SV.chatTitle}</strong></p>
                <p><strong>${SV.chatWho}</strong> ${playerName}</p>
                <p><strong>${SV.chatItem}</strong> ${itemName}</p>
                <p><strong>${SV.chatGot}</strong> ${salvageAmount} ${matLabelTxt}</p>
              </div>
            `,
          });

          salvageItem = null;
        });

        // ═══════════════════════════════════════════════════════════════════
        // CULTIVOS (Farming)
        // ═══════════════════════════════════════════════════════════════════
        let fertToUse = 0;
        let farmBusy = false;

        // Volver desde cultivos
        html.find("#rv-btn-back-farm").on("click", () => {
          if (farmBusy) return;
          html.find("#rv-farm-screen").hide();
          html.find("#rv-category-screen").show(); html[0].scrollTop = 0;
          playSound(SFX_NAV.back);
        });

        // Pinta toda la pantalla de cultivo según el estado guardado en el actor
        function renderFarm() {
          const F = STRINGS[currentLang].farm;
          const B = STRINGS[currentLang].build;
          const state = getFarmState(actor);

          const plotItem = actor.items.find((i) => isMaterialItem(i, FARM.plotItem));
          const plots = Number(plotItem?.system?.quantity ?? 0);
          const fertItem = actor.items.find((i) => isMaterialItem(i, FARM.fertItem));
          const ferts = Number(fertItem?.system?.quantity ?? 0);
          const natMod = getSkillMod(actor, "nature", "nat");

          html.find("#rv-farm-pills").html(`
            <span class="rv-stat-pill ${plots > 0 ? "ok" : "danger"}">${F.plotsPill(plots)}</span>
            <span class="rv-stat-pill">${F.fertHavePill(ferts)}</span>
            <span class="rv-stat-pill">🎯 DC ${FARM.dc} · 🎲 ${natMod >= 0 ? "+" : ""}${natMod}</span>
          `);

          // Coste de crear parcela (verde/rojo según stock)
          const costPills = Object.entries(FARM.plotCost).map(([mat, need]) => {
            const invItem = actor.items.find((i) => isMaterialItem(i, mat));
            const have = Number(invItem?.system?.quantity ?? 0);
            const emoji = anyMaterialDef(mat).emoji ?? "📦";
            return `<span class="rv-stat-pill ${have >= need ? "ok" : "danger"}" title="${mat}">${B.costPill(emoji, need, have)}</span>`;
          }).join("");
          html.find("#rv-farm-create-costs").html(costPills);

          if (state) {
            html.find("#rv-farm-setup").hide();
            html.find("#rv-farm-active").css("display", "flex");
            html.find("#rv-farm-day").text(F.dayLabel(state.day, FARM.days));
            html.find("#rv-farm-progress-fill").css("width", `${(state.day / FARM.days) * 100}%`);
            html.find("#rv-farm-prod").html(F.prodLabel(state.production, materialLabel(FARM.produce)));
            html.find("#rv-farm-log").html((state.log ?? []).map((l) => `<p>${l}</p>`).join(""));
          } else {
            html.find("#rv-farm-active").hide();
            html.find("#rv-farm-setup").css("display", "flex");
            fertToUse = Math.max(0, Math.min(fertToUse, ferts, FARM.fertMax));
            html.find("#rv-farm-fert-sel").html(F.fertSel(fertToUse, fertToUse * FARM.fertBonus));
          }
        }

        // Selector de abono
        html.find("#rv-btn-fert-minus").on("click", () => {
          if (farmBusy || getFarmState(actor)) return;
          fertToUse = Math.max(0, fertToUse - 1);
          renderFarm();
        });
        html.find("#rv-btn-fert-plus").on("click", () => {
          if (farmBusy || getFarmState(actor)) return;
          fertToUse = fertToUse + 1; // renderFarm lo limita al stock y al máximo
          renderFarm();
        });

        // Crear parcela (coste directo, sin mini-juego)
        html.find("#rv-btn-farm-create").on("click", async () => {
          if (farmBusy) return;
          farmBusy = true;
          try {
            const F = STRINGS[currentLang].farm;
            const B = STRINGS[currentLang].build;

            // Verificar y reunir costes
            const matItems = {};
            const missing = [];
            for (const [mat, need] of Object.entries(FARM.plotCost)) {
              const invItem = await getOrCreateMaterial(actor, mat);
              const have = Number(invItem?.system?.quantity ?? 0);
              if (!invItem || have < need) missing.push(`${materialLabel(mat)} (${have}/${need})`);
              matItems[mat] = invItem;
            }
            if (missing.length) {
              renderFarm();
              return ui.notifications.warn(B.needMats(missing.join(", ")));
            }

            for (const [mat, need] of Object.entries(FARM.plotCost)) {
              const invItem = matItems[mat];
              const have = Number(invItem.system?.quantity ?? 0);
              await invItem.update({ "system.quantity": have - need });
            }

            const plotInv = await getOrCreateMaterial(actor, FARM.plotItem);
            if (plotInv) {
              const qtyNow = Number(plotInv.system?.quantity ?? 0);
              await plotInv.update({ "system.quantity": qtyNow + 1 });
            }

            playSound(SFX_HIT["equipo-vario"]);
            ui.notifications.info(F.plotCreated);

            const gm = game.users.find((u) => u.isGM && u.active);
            await ChatMessage.create({
              user: game.user.id,
              whisper: gm ? [gm.id] : [],
              content: `<div style="border:1px solid #554;border-radius:8px;padding:10px;background:rgba(0,0,0,0.7);">
                <p><strong>${F.chatTitle}</strong></p>
                <p><strong>${F.chatFarmer}</strong> ${actor.name}</p>
                <p>🛠️ +1 ${materialLabel(FARM.plotItem)}</p>
              </div>`,
            });

            renderFarm();
          } finally {
            farmBusy = false;
          }
        });

        // Iniciar ciclo de cultivo
        html.find("#rv-btn-farm-start").on("click", async () => {
          if (farmBusy) return;
          farmBusy = true;
          try {
            const F = STRINGS[currentLang].farm;
            if (getFarmState(actor)) return ui.notifications.warn(F.cycleActive);

            const plotItem = actor.items.find((i) => isMaterialItem(i, FARM.plotItem));
            const plots = Number(plotItem?.system?.quantity ?? 0);
            if (plots < 1) return ui.notifications.warn(F.needPlot);

            // Consumir abono elegido
            const fertItem = actor.items.find((i) => isMaterialItem(i, FARM.fertItem));
            const ferts = Number(fertItem?.system?.quantity ?? 0);
            const useFert = Math.max(0, Math.min(fertToUse, ferts, FARM.fertMax));
            if (useFert > 0 && fertItem) {
              await fertItem.update({ "system.quantity": ferts - useFert });
            }

            await setFarmState(actor, {
              day: 0,
              production: FARM.baseProduction + useFert * FARM.fertBonus,
              fert: useFert,
              log: [],
            });
            fertToUse = 0;
            html.find("#rv-farm-result").hide().removeClass("ok fail");
            playSound(SFX_NAV.select);
            renderFarm();
          } finally {
            farmBusy = false;
          }
        });

        // Tirada diaria de Naturaleza
        html.find("#rv-btn-farm-daily").on("click", async () => {
          if (farmBusy) return;
          farmBusy = true;
          html.find("#rv-btn-farm-daily").prop("disabled", true);
          try {
            const F = STRINGS[currentLang].farm;
            const state = getFarmState(actor);
            if (!state) return renderFarm();

            const natMod = getSkillMod(actor, "nature", "nat");
            let rollTotal = 0;
            let naturalRoll = 0;
            try {
              const roll = await new Roll(`1d20 + ${natMod}`).evaluate();
              rollTotal = roll.total;
              naturalRoll = roll.dice[0]?.results[0]?.result ?? 10;
              await roll.toMessage({
                speaker: ChatMessage.getSpeaker({ actor }),
                flavor: `<strong>${F.chatTitle}</strong> (DC ${FARM.dc}) — ${F.dayLabel(state.day + 1, FARM.days)}`,
              });
            } catch (err) {
              console.error("RedVelvet | Error en tirada de cultivo:", err);
              rollTotal = Math.floor(Math.random() * 20) + 1 + natMod;
              naturalRoll = rollTotal - natMod;
            }

            const degree = getDegreeOfSuccess(rollTotal, FARM.dc, naturalRoll);
            const delta = FARM.delta[degree] ?? 0;
            const newProduction = Math.max(0, Number(state.production) + delta);
            const newDay = Number(state.day) + 1;
            const log = [...(state.log ?? []), F.dayLine(newDay, rollTotal, FARM.dc, F.deltas[degree])];

            if (newDay >= FARM.days) {
              // ── Cosecha ──
              const amount = newProduction;
              if (amount > 0) {
                const prodItem = await getOrCreateMaterial(actor, FARM.produce);
                if (prodItem) {
                  const qtyNow = Number(prodItem.system?.quantity ?? 0);
                  await prodItem.update({ "system.quantity": qtyNow + amount });
                }
              }
              await clearFarmState(actor);

              html.find("#rv-farm-log").html(log.map((l) => `<p>${l}</p>`).join(""));
              html.find("#rv-farm-result")
                .removeClass("ok fail")
                .addClass(amount > 0 ? "ok" : "fail")
                .html(`
                  <div class="rv-degree-label" style="color:${amount > 0 ? "#4ade80" : "#f87171"};">${F.harvestLabel}</div>
                  <p style="margin:0;font-size:13px;">${amount > 0 ? F.harvestText(amount, materialLabel(FARM.produce)) : F.harvestNone}</p>
                `)
                .show();
              playSound(amount > 0 ? SFX_HIT["equipo-vario"] : SFX_MISS["equipo-vario"]);

              const gm = game.users.find((u) => u.isGM && u.active);
              await ChatMessage.create({
                user: game.user.id,
                whisper: gm ? [gm.id] : [],
                content: `<div style="border:1px solid #554;border-radius:8px;padding:10px;background:rgba(0,0,0,0.7);">
                  <p><strong>${F.chatTitle}</strong></p>
                  <p><strong>${F.chatFarmer}</strong> ${actor.name}</p>
                  <p><strong>${F.chatDays}</strong> ${FARM.days} | <strong>${F.chatFert}</strong> ${state.fert ?? 0}</p>
                  <p><strong>${F.chatGot}</strong> ${amount > 0 ? `${amount} ${materialLabel(FARM.produce)}` : "—"}</p>
                </div>`,
              });

              renderFarm();
              // El log de la cosecha se mantiene visible tras limpiar el estado
              html.find("#rv-farm-log").html(log.map((l) => `<p>${l}</p>`).join(""));
            } else {
              await setFarmState(actor, { ...state, day: newDay, production: newProduction, log });
              playSound(delta >= 0 ? SFX_HIT["trabajo-con-piel"] : SFX_MISS["trabajo-con-piel"]);
              renderFarm();
            }
          } finally {
            farmBusy = false;
            html.find("#rv-btn-farm-daily").prop("disabled", false);
          }
        });

        // ═══════════════════════════════════════════════════════════════════
        // DESPIECE DE MONSTRUOS (Scavenging)
        // ═══════════════════════════════════════════════════════════════════
        let scavPlaying = false;

        // Volver desde despiece
        html.find("#rv-btn-back-scav").on("click", () => {
          if (scavPlaying) return;
          html.find("#rv-scav-screen").hide();
          html.find("#rv-category-screen").show(); html[0].scrollTop = 0;
          playSound(SFX_NAV.back);
        });

        function renderScavInfo() {
          const SC = STRINGS[currentLang].scav;
          const mod = getSkillMod(actor, "survival", "sur");
          const hasFeat = hasMonsterScavengerFeat(actor);
          html.find("#rv-scav-stats").html(`
            <span class="rv-stat-pill">${SC.dcPill(SCAV.dc)}</span>
            <span class="rv-stat-pill">${SC.skillPill(mod)}</span>
            <span class="rv-stat-pill ${hasFeat ? "ok" : "warn"}">${hasFeat ? SC.featOn : SC.featOff}</span>
          `);
          html.find("#rv-scav-tiers").html(`
            <span class="rv-stat-pill ok">${SC.prodPill(materialLabel(SCAV.material))}</span>
            <span class="rv-stat-pill">${SC.tierPill}</span>
          `);
        }

        // Iniciar despiece
        html.find("#rv-btn-scav-start").on("click", async () => {
          if (scavPlaying) return;
          const SC = STRINGS[currentLang].scav;

          scavPlaying = true;
          html.find("#rv-btn-scav-start").prop("disabled", true).hide();
          html.find("#rv-scav-result").hide().removeClass("ok fail");
          const $cIcons = html.find("#rv-scav-icons").empty();
          html.find("#rv-scav-status-roll").remove();

          // ── Tirada de Supervivencia ──
          const mod = getSkillMod(actor, "survival", "sur");
          let rollTotal = 0;
          try {
            const roll = await new Roll(`1d20 + ${mod}`).evaluate();
            rollTotal = roll.total;
            await roll.toMessage({
              speaker: ChatMessage.getSpeaker({ actor }),
              flavor: `<strong>${SC.chatTitle}</strong> (DC ${SCAV.dc})`,
            });
          } catch (err) {
            console.error("RedVelvet | Error en tirada de despiece:", err);
            rollTotal = Math.floor(Math.random() * 20) + 1 + mod;
          }
          const margin = rollTotal - SCAV.dc;

          const rollInfo = $(`<p id="rv-scav-status-roll" style="font-size:12px;color:#ccc;">
            ${SC.rollLine(rollTotal, SCAV.dc)}
          </p>`);
          $cIcons.before(rollInfo);

          // Misma escala de dificultad del mini-juego que la forja
          let TIME_LIMIT, HIT_START, HIT_END;
          if (margin >= 10) {
            TIME_LIMIT = 4500; HIT_START = 2800; HIT_END = 3900;
          } else if (margin >= 0) {
            TIME_LIMIT = 3200; HIT_START = 2000; HIT_END = 2700;
          } else if (margin >= -9) {
            TIME_LIMIT = 2200; HIT_START = 1200; HIT_END = 1600;
          } else {
            TIME_LIMIT = 1500; HIT_START = 700; HIT_END = 950;
          }

          let iconsDone = 0, hits = 0;

          function spawnScavIcon() {
            const $icon = $(`<button type="button" class="rv-forge-icon">
              <img src="${SCAV.icon}" />
              <div class="rv-bar"></div>
              <span class="rv-countdown"></span>
            </button>`);
            $cIcons.append($icon);
            $icon[0]?.focus({preventScroll:true});

            const $bar = $icon.find(".rv-bar");
            const $cd = $icon.find(".rv-countdown");
            let progress = 0; const began = performance.now();
            let resolved = false;

            const interval = setInterval(() => {
              progress = performance.now() - began;
              $bar.css("width", `${(progress / TIME_LIMIT) * 100}%`);
              $cd.text(Math.ceil((TIME_LIMIT - progress) / 1000));

              const inWindow = progress >= HIT_START && progress <= HIT_END;
              $icon.css("box-shadow", inWindow ? "0 0 20px 6px rgba(232,201,106,0.8)" : "none");

              if (progress >= TIME_LIMIT && !resolved) {
                resolved = true; $icon.prop("disabled",true);
                clearInterval(interval);
                $icon.addClass("miss");
                playSound(SFX_MISS[SCAV.sfxCat]);
                if (++iconsDone < 3) setTimeout(spawnScavIcon, 400);
                else finalizeScav(hits);
              }
            }, 20);

            $icon.on("click", () => {
              if (resolved) return;
              resolved = true; $icon.prop("disabled",true);
              clearInterval(interval);
              progress = performance.now() - began;
              const inWindow = progress >= HIT_START && progress <= HIT_END;
              if (inWindow) {
                hits++;
                $icon.addClass("hit");
                playSound(SFX_HIT[SCAV.sfxCat]);
              } else {
                $icon.addClass("miss");
                playSound(SFX_MISS[SCAV.sfxCat]);
              }
              if (++iconsDone < 3) setTimeout(spawnScavIcon, 400);
              else finalizeScav(hits);
            });
          }

          spawnScavIcon();
          try { $cIcons[0]?.scrollIntoView({ behavior: "smooth", block: "center" }); } catch { /* */ }

          // ── FINALIZACIÓN ──
          async function finalizeScav(hits) {
            scavPlaying = false;
            html.find("#rv-btn-scav-start").prop("disabled", false).show();

            const SCL = STRINGS[currentLang].scav;
            const baseAmount = SCAV.tierByHits[hits] ?? 0;
            const hasFeat = hasMonsterScavengerFeat(actor);
            const amount = hasFeat ? (SCAV.featMap[baseAmount] ?? baseAmount) : baseAmount;

            const matLabelTxt = materialLabel(SCAV.material);
            const $result = html.find("#rv-scav-result");

            if (amount > 0) {
              const matItem = await getOrCreateMaterial(actor, SCAV.material);
              if (matItem) {
                const qtyNow = Number(matItem.system?.quantity ?? 0);
                await matItem.update({ "system.quantity": qtyNow + amount });
              }
              $result.addClass("ok").html(`
                <div class="rv-degree-label" style="color:#4ade80;">${SCL.resultOkLabel}</div>
                <p style="margin:0;font-size:13px;">${SCL.hitsLine(hits)}<br>${SCL.resultOk(amount, matLabelTxt)}${
                  hasFeat ? `<br><small>${SCL.featNote(baseAmount, amount)}</small>` : ""
                }</p>
              `).show();
            } else {
              $result.addClass("fail").html(`
                <div class="rv-degree-label" style="color:#f87171;">${SCL.resultFailLabel}</div>
                <p style="margin:0;font-size:13px;">${SCL.hitsLine(hits)}<br>${SCL.resultFail}</p>
              `).show();
            }

            // Mensaje al chat (solo al GM)
            const gm = game.users.find((u) => u.isGM && u.active);
            const playerName = actor.name ?? game.user.name;
            await ChatMessage.create({
              user: game.user.id,
              whisper: gm ? [gm.id] : [],
              content: `
                <div style="border:1px solid #554;border-radius:8px;padding:10px;background:rgba(0,0,0,0.7);">
                  <p><strong>${SCL.chatTitle}</strong></p>
                  <p><strong>${SCL.chatWho}</strong> ${playerName}</p>
                  <p>${SCL.rollLine(rollTotal, SCAV.dc)} | ${SCL.hitsLine(hits)}</p>
                  <p><strong>${SCL.chatFeat}</strong> ${hasFeat ? "✅" : "✖"}</p>
                  <p><strong>${SCL.chatGot}</strong> ${amount > 0 ? `${amount} ${matLabelTxt}` : "—"}${hasFeat && amount > 0 ? ` (base ${baseAmount})` : ""}</p>
                </div>
              `,
            });
          } // end finalizeScav
        }); // end scav start

        // ── DROP ZONE ──
        const dropZone = html.find("#rv-dropzone")[0];

        dropZone.addEventListener("dragover", (e) => {
          e.preventDefault();
          dropZone.classList.add("dragover");
        });
        dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));

        dropZone.addEventListener("drop", async (e) => {
          e.preventDefault();
          dropZone.classList.remove("dragover");

          const SL = STRINGS[currentLang];
          let data;
          try { data = JSON.parse(e.dataTransfer.getData("text/plain")); }
          catch { return ui.notifications.warn(SL.notifyDropInvalid); }

          if (data.type !== "Item") return ui.notifications.warn(SL.notifyItemOnly);

          const item = await fromUuid(data.uuid);
          if (!item) return ui.notifications.warn(SL.notifyItemLoad);

          draggedItem = item;

          // Detectar categoría del item
          const detectedCat = detectCategory(item);
          if (detectedCat !== selectedCategory) {
            html.find("#rv-item-info").hide();
            html.find("#rv-btn-forge").hide();
            html.find("#rv-dropzone").html(SL.catMismatch(item.name, detectedCat, selectedCategory));
            return;
          }

          // ── Leer datos del item ──
          itemLevel = Number.parseInt(item.system?.level?.value ?? item.system?.level ?? 0);
          finalDC = getDCforLevel(itemLevel);
          batchCost = getBatchCost(item);
          const rarityInfo = getRarityInfo(item);
          featInfo = getCraftingFeatInfo(actor, selectedCategory);

          // ── Material propio de la categoría seleccionada ──
          const matName = CATEGORY_MATERIALS[selectedCategory] ?? "Crafting Materials";
          const matLabel = materialLabel(matName);
          let materialsItem = await getOrCreateMaterial(actor, matName);
          if (!materialsItem) return;

          const matQty = Number(materialsItem.system?.quantity ?? 0);
          const hasMats = matQty >= batchCost;

          // ── Actualizar UI ──
          html.find("#rv-item-img").attr("src", item.img ?? RV_ASSETS.icon.crafting);
          html.find("#rv-item-name").html(`${rarityInfo.icon} ${item.name}`);
          html.find("#rv-item-meta").html(SL.itemMeta(itemLevel, rarityInfo.label, selectedCategory));

          // Stats pills
          const featSign = featInfo.modifier > 0 ? "+" : "";
          const featModDisplay = featInfo.modifier === 0 ? "" : ` (${featSign}${featInfo.modifier})`;
          html.find("#rv-stat-row").html(`
            <span class="rv-stat-pill">${SL.dcPill(finalDC)}</span>
            <span class="rv-stat-pill ${hasMats ? "ok" : "danger"}">${SL.batPill(batchCost, matQty, matLabel)}</span>
            <span class="rv-stat-pill">${SL.craftPill(craftingSkill.mod, craftingSkill.label, featModDisplay)}</span>
            <span class="rv-stat-pill ${featInfo.hasFeat ? "ok" : "warn"}">${featInfo.hasFeat
              ? SL.featOk(featInfo.foundFeat ?? SL.featFallback)
              : SL.featWarn}</span>
          `);

          // Barra de proficiencia
          const dotColors = ["", "filled", "filled", "master", "legendary"];
          let dotsHTML = `<span style="margin-right:4px;">${SL.profLabel}</span>`;
          for (let i = 1; i <= 4; i++) {
            dotsHTML += `<div class="rv-prof-dot ${craftingSkill.rank >= i ? dotColors[i] : ""}"></div>`;
          }
          html.find("#rv-prof-bar").html(dotsHTML);

          html.find("#rv-item-info").show();
          html.find("#rv-btn-forge").show().prop("disabled", false);
          html.find("#rv-forge-icons").empty();
          html.find("#rv-result-box").hide();
          html.find("#rv-dropzone").html(SL.dropReady(item.name));

          // ── BOTÓN FORJAR ──
          html.find("#rv-btn-forge").off("click").on("click", async () => {
            // Re-fetch materiales
            materialsItem = actor.items.get(materialsItem?.id)
              ?? actor.items.find((i) => isMaterialItem(i, matName))
              ?? materialsItem;

            const currentQty = Number(materialsItem?.system?.quantity ?? 0);
            if (currentQty < batchCost) {
              return ui.notifications.warn(STRINGS[currentLang].notifyNeedBatches(batchCost, currentQty, matLabel));
            }

            // Gastar materiales
            await materialsItem.update({ "system.quantity": currentQty - batchCost });

            html.find("#rv-btn-forge").prop("disabled", true);
            html.find("#rv-result-box").hide();
            html.find("#rv-forge-icons").empty();

            // ── Tirada de Crafting PF2e ──
            // En PF2e se tira con game.pf2e.Check o directamente
            let rollTotal = 0;
            let naturalRoll = 0;

            try {
              const rollData = actor.getRollData ? actor.getRollData() : {};
              const featPenalty = featInfo?.modifier ?? 0;
              const formula = `1d20 + ${craftingSkill.mod + featPenalty}`;
              const roll = await new Roll(formula, rollData).evaluate();
              rollTotal = roll.total;
              naturalRoll = roll.dice[0]?.results[0]?.result ?? 10;

              const SLF = STRINGS[currentLang];
              const penaltyNote = featPenalty < 0
                ? ` <em style="color:#fbbf24">[${SLF.chatPenalty} ${featPenalty}]</em>`
                : "";
              await roll.toMessage({
                speaker: ChatMessage.getSpeaker({ actor }),
                flavor: `<strong>Crafting Check</strong> (DC ${finalDC}) — <em>${item.name}</em>${penaltyNote}`,
              });
            } catch (err) {
              console.error("RedVelvet | Error en tirada:", err);
              const featPenalty = featInfo?.modifier ?? 0;
              rollTotal = Math.floor(Math.random() * 20) + 1 + craftingSkill.mod + featPenalty;
              naturalRoll = rollTotal - craftingSkill.mod - featPenalty;
            }

            const skillDegree = getDegreeOfSuccess(rollTotal, finalDC, naturalRoll);

            const SLD = STRINGS[currentLang];
            html.find("#rv-forge-status-roll").remove();
            const degreeColor = { critical_success: "#e8c96a", success: "#4ade80", failure: "#fbbf24", critical_failure: "#f87171" };
            const rollInfo = $(`<p id="rv-forge-status-roll" style="font-size:12px;color:#ccc;">
              ${SLD.chatRoll} <strong>${rollTotal}</strong> ${SLD.rollVs} ${finalDC} →
              <span style="color:${degreeColor[skillDegree]};">${SLD.degreeShort[skillDegree]}</span>
            </p>`);
            html.find("#rv-forge-icons").before(rollInfo);

            // ── MINI-JUEGO ──
            const iconSrcs = {
              herreria: RV_ASSETS.icon.blacksmith,
              alquimia: RV_ASSETS.icon.alchemy,
              joyeria: RV_ASSETS.icon.jewelry,
              "trabajo-con-piel": RV_ASSETS.icon.leatherwork,
              "equipo-vario": RV_ASSETS.icon.crafting,
            };

            // Ventana de tiempo según margen sobre el DC
            const margin = rollTotal - finalDC;
            let TIME_LIMIT, HIT_START, HIT_END;
            if (margin >= 10) {
              TIME_LIMIT = 4500; HIT_START = 2800; HIT_END = 3900; // Éxito crítico: amplio
            } else if (margin >= 0) {
              TIME_LIMIT = 3200; HIT_START = 2000; HIT_END = 2700; // Éxito: normal
            } else if (margin >= -9) {
              TIME_LIMIT = 2200; HIT_START = 1200; HIT_END = 1600; // Fallo leve: estrecho
            } else {
              TIME_LIMIT = 1500; HIT_START = 700; HIT_END = 950;   // Fallo crítico: muy estrecho
            }

            const $icons = html.find("#rv-forge-icons");
            let iconsDone = 0, hits = 0;

            function spawnIcon() {
              const $icon = $(`<button type="button" class="rv-forge-icon">
                <img src="${iconSrcs[selectedCategory]}" />
                <div class="rv-bar"></div>
                <span class="rv-countdown"></span>
              </button>`);
              $icons.append($icon); $icon[0]?.focus({preventScroll:true});

              const $bar = $icon.find(".rv-bar");
              const $cd = $icon.find(".rv-countdown");
              let progress = 0; const began = performance.now();
              let resolved = false;

              const interval = setInterval(() => {
                progress = performance.now() - began;
                $bar.css("width", `${(progress / TIME_LIMIT) * 100}%`);
                $cd.text(Math.ceil((TIME_LIMIT - progress) / 1000));

                const inWindow = progress >= HIT_START && progress <= HIT_END;
                $icon.css("box-shadow", inWindow ? "0 0 20px 6px rgba(232,201,106,0.8)" : "none");

                if (progress >= TIME_LIMIT && !resolved) {
                  resolved = true; $icon.prop("disabled",true);
                  clearInterval(interval);
                  $icon.addClass("miss");
                  playSound(SFX_MISS[selectedCategory]);
                  if (++iconsDone < 3) setTimeout(spawnIcon, 400);
                  else finalizeMinigame(hits);
                }
              }, 20);

              $icon.on("click", () => {
                if (resolved) return;
                resolved = true; $icon.prop("disabled",true);
                clearInterval(interval);
                progress = performance.now() - began;
                const inWindow = progress >= HIT_START && progress <= HIT_END;
                if (inWindow) {
                  hits++;
                  $icon.addClass("hit");
                  playSound(SFX_HIT[selectedCategory]);
                } else {
                  $icon.addClass("miss");
                  playSound(SFX_MISS[selectedCategory]);
                }
                if (++iconsDone < 3) setTimeout(spawnIcon, 400);
                else finalizeMinigame(hits);
              });
            }

            spawnIcon();

            // ── FINALIZACIÓN con grados PF2e ──
            async function finalizeMinigame(hits) {
              // Ajustar grado según aciertos del mini-juego
              const degreeOrder = ["critical_failure", "failure", "success", "critical_success"];
              let degreeIndex = degreeOrder.indexOf(skillDegree);

              if (hits === 3) degreeIndex = Math.min(3, degreeIndex + 1);       // Sube 1 grado
              else if (hits <= 1) degreeIndex = Math.max(0, degreeIndex - 1);   // Baja 1 grado
              // hits === 2: mantiene

              const finalDegree = degreeOrder[degreeIndex];

              // Recuperación de materiales según grado
              const refundMap = {
                critical_success: 0,          // Éxito total, sin recuperación (ya se gastó)
                success: 0,                    // Éxito, sin recuperación
                failure: Math.floor(batchCost * 0.5),  // Recupera 50%
                critical_failure: 0,           // Pierde todo
              };
              const refund = refundMap[finalDegree];

              // Reembolso
              if (refund > 0) {
                materialsItem = actor.items.get(materialsItem?.id)
                  ?? actor.items.find((i) => isMaterialItem(i, matName))
                  ?? materialsItem;
                const qtyNow = Number(materialsItem?.system?.quantity ?? 0);
                await materialsItem?.update({ "system.quantity": qtyNow + refund });
              }

              // Texto del resultado
              const SLR = STRINGS[currentLang];
              const rt = SLR.results[finalDegree];
              const $rb = html.find("#rv-result-box");
              $rb.removeClass("critical_success success failure critical_failure")
                .addClass(finalDegree)
                .html(`
                  <div class="rv-degree-label">${rt.label}</div>
                  <p style="margin:0;font-size:13px;">${finalDegree === "failure" ? rt.desc(item.name, refund, matLabel) : rt.desc(item.name)}</p>
                  ${finalDegree === "critical_success" || finalDegree === "success" ? `
                    <button class="rv-take-btn">${SLR.takeBtn}</button>
                  ` : ""}
                `)
                .show();

              // Botón tomar objeto
              $rb.find(".rv-take-btn").on("click", async function () {
                await actor.createEmbeddedDocuments("Item", [draggedItem.toObject()]);
                $(this).prop("disabled", true).text(SLR.takeDone);
              });

              // Mensaje al chat (solo al GM)
              const gm = game.users.find((u) => u.isGM && u.active);
              const playerName = actor.name ?? game.user.name;
              const itemLink = `@UUID[${draggedItem.uuid}]{${item.name}}`;
              const degreeLabel = SLR.degreeShort[finalDegree];
              const featPenaltyFinal = featInfo?.modifier ?? 0;

              await ChatMessage.create({
                user: game.user.id,
                whisper: gm ? [gm.id] : [],
                content: `
                  <div style="border:1px solid #554;border-radius:8px;padding:10px;background:rgba(0,0,0,0.7);">
                    <p><strong>${SLR.chatTitle}</strong></p>
                    <p><strong>${SLR.chatCrafter}</strong> ${playerName}</p>
                    <p><strong>${SLR.chatItem}</strong> ${itemLink} (Lv. ${itemLevel})</p>
                    <p><strong>${SLR.chatResult}</strong> ${degreeLabel}</p>
                    <p><strong>${SLR.chatRoll}</strong> ${rollTotal} ${SLR.rollVs} ${finalDC} | ${SLR.chatHits} ${hits}/3</p>
                    ${featPenaltyFinal < 0 ? `<p><strong>${SLR.chatPenalty}</strong> ${featPenaltyFinal} (${SLR.chatPenaltyReason(selectedCategory)})</p>` : ""}
                    ${refund > 0 ? `<p><strong>${SLR.chatRefund}</strong> ${refund} ${matLabel}</p>` : ""}
                  </div>
                `,
              });
            } // end finalizeMinigame
          }); // end btn-forge click
        }); // end drop
      }, // end render

      buttons: {},
      close: () => {},
    }); // end Dialog

    craftingDialog.options.classes = [...(craftingDialog.options.classes ?? []), "rv-crafting-dialog"];
    craftingDialog.options.width = 430;
    craftingDialog.options.height = 720;
    craftingDialog.render(true);
  }

  // ── Modo Core: taller sencillo por defecto; el taller completo se activa en los ajustes ──
  const coreT = (key, data) => game.i18n.format(`${MODULE_ID}.Core.${key}`, data ?? {});
  const corePriceCp = (item) => {
    const price = item.system?.price?.value;
    if (!price || typeof price !== "object") return Math.max(0, Math.round((Number(price) || 0) * 100));
    const copper = (Number(price.pp) || 0) * 1000 + (Number(price.gp) || 0) * 100 + (Number(price.sp) || 0) * 10 + (Number(price.cp) || 0);
    // "per" is how many units the listed price buys (10 arrows for 1 sp); one unit is crafted.
    return Math.max(0, Math.ceil(copper / Math.max(1, Number(item.system?.price?.per) || 1)));
  };
  const coreLevel = (item) => Number.parseInt(item.system?.level?.value ?? item.system?.level ?? 0) || 0;
  const coreAdapter = {
    moduleId: MODULE_ID, t: coreT, menuBg: RV_ASSETS.bg.menu, rulesBg: RV_ASSETS.bg.rules,
    categories: {
      herreria: { bg: RV_ASSETS.bg.blacksmith, icon: RV_ASSETS.icon.blacksmith },
      alquimia: { bg: RV_ASSETS.bg.alchemy, icon: RV_ASSETS.icon.alchemy },
      joyeria: { bg: RV_ASSETS.bg.jewelry, icon: RV_ASSETS.icon.jewelry },
      "trabajo-con-piel": { bg: RV_ASSETS.bg.leatherwork, icon: RV_ASSETS.icon.leatherwork },
      "equipo-vario": { bg: RV_ASSETS.bg.equipment, icon: RV_ASSETS.icon.crafting },
    },
    // Treasure (coins, gems, art objects) sells for its full price, so half-price crafting would mint coin.
    itemTypes: ["weapon", "armor", "shield", "equipment", "consumable", "backpack"],
    indexFields: ["system.level.value", "system.price", "system.traits.rarity", "system.traits.value"],
    detectCategory,
    priceCp: corePriceCp,
    dc: (item) => getDCforLevel(coreLevel(item)),
    rank: coreLevel,
    meta: (item) => {
      const rarity = String(item.system?.traits?.rarity ?? "common").toLowerCase();
      return [coreT("Meta.Level", { level: coreLevel(item) }), ["uncommon", "rare", "unique"].includes(rarity) ? coreT(`Rarity.${rarity}`) : ""].filter(Boolean).join(" · ");
    },
    funds: (actor) => Number(actor.inventory?.coins?.copperValue) || 0,
    pay: async (actor, cp) => Boolean(await actor.inventory.removeCoins({ cp }, { byValue: true })),
    refund: (actor, cp) => actor.inventory.addCoins(coinsFor(cp)),
    roll: async (actor, category, item, dc) => {
      const mod = Number(actor.skills?.crafting?.mod ?? getCraftingData(actor).mod) || 0;
      const roll = await new Roll(`1d20 + ${mod}`).evaluate();
      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor }),
        flavor: `<strong>${coreT("Chat.Check")}</strong> (${coreT("Bench.DC", { dc })}) — <em>${foundry.utils.escapeHTML?.(item.name) ?? item.name}</em>`,
      }).catch((error) => console.warn(MODULE_ID, "Chat unavailable", error));
      const die = roll.dice?.[0]?.results?.find((result) => result.active !== false);
      return { total: roll.total, natural: die?.result ?? 10 };
    },
    itemData: (item) => {
      const data = item.toObject();
      delete data._id; delete data.folder; delete data.ownership;
      if (data.system && "quantity" in data.system) data.system.quantity = 1;
      return data;
    },
    sound: (kind, category) => playSound(kind === "hit" ? SFX_HIT[category] : kind === "miss" ? SFX_MISS[category] : SFX_NAV[kind]),
  };
  registerCoreMode(MODULE_ID);
  Hooks.once("init",registerAudioSettings);

  /** Opens the workshop the GM chose in the settings; `options.mode` forces one. */
  function openCrafting(options = {}) {
    return (options.mode ?? craftingMode(MODULE_ID)) === MODES.EXTENDED ? openCraftingDialog() : openCore(coreAdapter, options);
  }

  // ── Exponer globalmente y registrar comando de chat ──
  window.openCraftingDialog = openCrafting;
  Hooks.once("ready", () => {
    const module = game.modules.get(MODULE_ID);
    if (module) module.api = { open: openCrafting, openCore: (options) => openCore(coreAdapter, options), openExtended: openCraftingDialog };
  });

  Hooks.on("chatMessage", (chatLog, message, chatData) => {
    // Foundry v14 sends the chat input as HTML ("<p>/craft</p>"); earlier versions send plain text.
    const command = String(message ?? "").replace(/<[^>]*>/g, "").trim().toLowerCase();
    if (command.startsWith("/craft")) {
      // A failure to open must not fall through to Foundry's "not a valid chat message command".
      try { openCrafting(); }
      catch (error) { console.error(MODULE_ID, error); ui.notifications.error(`RedVelvet Crafting: ${error?.message ?? error}`); }
      return false;
    }
    return true;
  });

})();
