/**
 * RedVelvet Crafting — Core mode.
 *
 * The simple workshop: pick a trade, search for an item, pay half its price in coin, roll and
 * play the timing mini-game. Everything system-specific (prices, DC, the roll, the purse) comes
 * from an adapter, so this file is identical in the PF2e and D&D 5e editions.
 */

export const MODES = Object.freeze({CORE: "core", EXTENDED: "extended"});
export const CORE_CATEGORIES = Object.freeze(["herreria", "alquimia", "joyeria", "trabajo-con-piel", "equipo-vario"]);
const STRIKES = 3, STRIKE_GAP = 400, RESULT_LIMIT = 60;

/* ------------------------------------------------------------------ */
/*  Pure rules                                                         */
/* ------------------------------------------------------------------ */

/** Crafting costs half the listed price, never less than one copper. */
export const halfCost = priceCp => Math.max(1, Math.ceil(priceCp / 2));

/** Strike window in milliseconds; the same margin bands as the extended workshop. */
export function timingFor(margin) {
  if (margin >= 10) return {limit: 4500, start: 2800, end: 3900};
  if (margin >= 0) return {limit: 3200, start: 2000, end: 2700};
  if (margin >= -9) return {limit: 2200, start: 1200, end: 1600};
  return {limit: 1500, start: 700, end: 950};
}

/** Three hits craft the item; fewer return part of the coin spent. */
export function refundFor(hits, cost) {
  if (hits >= STRIKES) return 0;
  return hits === 2 ? Math.floor(cost / 2) : hits === 1 ? Math.floor(cost / 3) : 0;
}

const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
export const normalize = text => String(text ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function searchEntries(entries, query, limit = RESULT_LIMIT) {
  const wanted = normalize(query);
  const found = wanted ? entries.filter(entry => entry.search.includes(wanted)) : entries;
  return {total: found.length, rows: found.slice(0, limit)};
}

const COIN_VALUES = {pp: 1000, gp: 100, ep: 50, sp: 10, cp: 1};
export const purseValue = purse => Object.entries(COIN_VALUES).reduce((sum, [coin, value]) => sum + Math.max(0, Math.floor(Number(purse?.[coin]) || 0)) * value, 0);
export const coinsFor = cp => ({gp: Math.floor(cp / 100), sp: Math.floor(cp % 100 / 10), cp: cp % 10});

/**
 * Pays `cost` copper from a {pp,gp,ep,sp,cp} purse without reshuffling the player's coins:
 * exact coins first, then one larger coin is broken and the change returned.
 * @returns {object|null} The new purse, or null when the purse is short.
 */
export function payFromPurse(purse, cost) {
  const next = Object.fromEntries(Object.keys(COIN_VALUES).map(coin => [coin, Math.max(0, Math.floor(Number(purse?.[coin]) || 0))]));
  if (!Number.isInteger(cost) || cost < 0 || purseValue(next) < cost) return null;
  let due = cost;
  for (const coin of ["gp", "sp", "cp", "ep", "pp"]) {
    const used = Math.min(next[coin], Math.floor(due / COIN_VALUES[coin]));
    next[coin] -= used; due -= used * COIN_VALUES[coin];
  }
  if (due > 0) {
    // Every coin type still held is now worth more than what is owed, so one coin covers it.
    const coin = ["sp", "ep", "gp", "pp"].find(key => next[key] > 0 && COIN_VALUES[key] > due);
    next[coin]--;
    for (const [key, amount] of Object.entries(coinsFor(COIN_VALUES[coin] - due))) next[key] += amount;
  }
  return next;
}

export function coinLabel(cp, t) {
  const parts = Object.entries(coinsFor(Math.max(0, Math.round(cp)))).filter(([, amount]) => amount > 0).map(([coin, amount]) => `${amount} ${t(`Coin.${coin}`)}`);
  return parts.join(" ") || `0 ${t("Coin.gp")}`;
}

/** One searchable recipe, built from a compendium index row or a full item. */
export function toEntry(adapter, source, origin = "") {
  if (!source?.uuid || !adapter.itemTypes.includes(source.type)) return null;
  const priceCp = adapter.priceCp(source);
  if (!(priceCp > 0)) return null;
  return {uuid: source.uuid, name: source.name, img: source.img, category: adapter.detectCategory(source), priceCp,
    cost: halfCost(priceCp), dc: adapter.dc(source), meta: adapter.meta(source), rank: adapter.rank(source), origin, search: normalize(source.name)};
}

/* ------------------------------------------------------------------ */
/*  Setting and recipe index                                           */
/* ------------------------------------------------------------------ */

export function registerCoreMode(moduleId) {
  Hooks.once("init", () => game.settings.register(moduleId, "craftingMode", {
    name: `${moduleId}.Settings.Mode.Name`, hint: `${moduleId}.Settings.Mode.Hint`,
    scope: "world", config: true, type: String, default: MODES.CORE,
    choices: {[MODES.CORE]: `${moduleId}.Settings.Mode.Core`, [MODES.EXTENDED]: `${moduleId}.Settings.Mode.Extended`}
  }));
}

export function craftingMode(moduleId) {
  try { return game.settings.get(moduleId, "craftingMode") === MODES.EXTENDED ? MODES.EXTENDED : MODES.CORE; }
  catch { return MODES.CORE; }
}

const indexes = new Map();

/** Every priced, craftable item this user can see: Item compendiums plus world items. */
export function loadEntries(adapter) {
  if (!indexes.has(adapter.moduleId)) {
    indexes.set(adapter.moduleId, buildEntries(adapter).catch(error => { indexes.delete(adapter.moduleId); throw error; }));
  }
  return indexes.get(adapter.moduleId);
}

async function buildEntries(adapter) {
  const entries = [];
  const add = (source, origin) => { const entry = toEntry(adapter, source, origin); if (entry) entries.push(entry); };
  for (const pack of game.packs ?? []) {
    if (pack.documentName !== "Item" || pack.visible === false) continue;
    try {
      const index = await pack.getIndex({fields: adapter.indexFields});
      for (const row of index) add(row, pack.title ?? pack.metadata?.label ?? "");
    } catch (error) { console.warn(`${adapter.moduleId} | Compendium skipped`, pack.collection, error); }
  }
  for (const item of game.items ?? []) if (item.visible !== false) add(item, "");
  return entries.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
}

/* ------------------------------------------------------------------ */
/*  Window                                                             */
/* ------------------------------------------------------------------ */

const open = new Map();
let CoreApp = null;

/** Opens the Core workshop for an actor; one window per actor. */
export function openCore(adapter, options = {}) {
  const actor = options.actor ?? globalThis.canvas?.tokens?.controlled?.[0]?.actor ?? game.user.character;
  if (!actor) return void ui.notifications.warn(adapter.t("Warn.NoActor"));
  if (!actor.isOwner && !game.user.isGM) return void ui.notifications.warn(adapter.t("Warn.NotOwner"));
  const key = `${adapter.moduleId}:${actor.uuid ?? actor.id}`;
  const existing = open.get(key);
  if (existing) { existing.bringToFront?.(); return existing; }
  CoreApp ??= defineApp();
  const app = new CoreApp(adapter, actor, key);
  open.set(key, app);
  Promise.resolve(app.render({force: true})).catch(error => { open.delete(key); console.error(adapter.moduleId, error); });
  return app;
}

function defineApp() {
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  return class CoreCraftingApp extends foundry.applications.api.ApplicationV2 {
    static DEFAULT_OPTIONS = {classes: ["rvc-app"], tag: "div", window: {resizable: false}, position: {width: 440, height: "auto"}};

    constructor(adapter, actor, key) {
      super({id: `rvc-${key.replace(/[^a-zA-Z0-9-]/g, "-")}`, window: {title: adapter.t("Title")}});
      this.adapter = adapter; this.actor = actor; this.key = key;
      this.screen = "menu"; this.category = null; this.entries = []; this.entry = null; this.item = null;
      this.busy = false; this.query = ""; this.cancelStrike = null; this.gone = false;
    }

    t(key, data) { return this.adapter.t(key, data); }
    coins(cp) { return coinLabel(cp, key => this.t(key)); }

    async _renderHTML() {
      const t = key => escapeHTML(this.t(key));
      const buttons = CORE_CATEGORIES.map(id => `<button type="button" class="rvc-cat" data-category="${id}">
        <img src="${this.adapter.categories[id].icon}" alt=""><span>${t(`Category.${id}`)}</span></button>`).join("");
      const rules = Array.from({length: 6}, (_, i) => `<li>${t(`Rules.${i + 1}`)}</li>`).join("");
      return `<section class="rvc" data-screen="menu">
        <div class="rvc-bg"></div>
        <header class="rvc-head"><button type="button" class="rvc-back" data-act="back" aria-label="${t("Back")}">←</button>
          <h2 class="rvc-title"></h2><span class="rvc-purse"></span></header>
        <div class="rvc-menu"><p class="rvc-lead">${t("Menu.Lead")}</p><div class="rvc-cats">${buttons}</div>
          <button type="button" class="rvc-link" data-act="rules">${t("Menu.Rules")}</button></div>
        <div class="rvc-rules"><ol>${rules}</ol></div>
        <div class="rvc-shop"><input type="search" class="rvc-search" placeholder="${t("Search.Placeholder")}" aria-label="${t("Search.Placeholder")}">
          <p class="rvc-count" role="status"></p><ul class="rvc-list"></ul><p class="rvc-hint">${t("Search.Drop")}</p></div>
        <div class="rvc-bench"><div class="rvc-item"><img class="rvc-item-img" alt=""><div><strong class="rvc-item-name"></strong><span class="rvc-item-meta"></span></div></div>
          <div class="rvc-stats"><span class="rvc-dc"></span><span class="rvc-cost"></span></div>
          <button type="button" class="rvc-craft" data-act="craft">${t("Craft")}</button>
          <p class="rvc-roll" role="status"></p><div class="rvc-strikes"></div><div class="rvc-result" role="status"></div></div>
      </section>`;
    }

    _replaceHTML(result, content) { content.innerHTML = result; }

    _onRender(context, options) {
      super._onRender?.(context, options);
      const root = this.root = this.element.querySelector(".rvc");
      this.nodes = Object.fromEntries(["bg", "title", "purse", "search", "count", "list", "item-img", "item-name", "item-meta", "dc", "cost", "craft", "roll", "strikes", "result"]
        .map(name => [name, root.querySelector(`.rvc-${name}`)]));
      root.addEventListener("click", event => {
        const category = event.target.closest("[data-category]"), act = event.target.closest("[data-act]"), row = event.target.closest("[data-uuid]");
        if (category) this.showShop(category.dataset.category);
        else if (row) void this.choose(row.dataset.uuid, {listed: true});
        else if (act?.dataset.act === "back") this.back();
        else if (act?.dataset.act === "rules") this.show("rules");
        else if (act?.dataset.act === "craft") void this.craft();
      });
      this.nodes.search.addEventListener("input", foundry.utils.debounce(() => { this.query = this.nodes.search.value; this.list(); }, 120));
      root.addEventListener("dragover", event => event.preventDefault());
      root.addEventListener("drop", event => void this.drop(event));
      this.show(this.screen);
    }

    show(screen) {
      this.screen = screen; this.root.dataset.screen = screen;
      const category = this.adapter.categories[this.category];
      this.nodes.bg.style.backgroundImage = `url("${screen === "menu" ? this.adapter.menuBg : screen === "rules" ? this.adapter.rulesBg : category.bg}")`;
      this.nodes.title.textContent = screen === "menu" ? this.t("Menu.Title") : screen === "rules" ? this.t("Menu.Rules") : this.t(`Category.${this.category}`);
      this.purse();
    }

    purse() { this.nodes.purse.textContent = this.coins(this.adapter.funds(this.actor)); }

    back() {
      if (this.busy) return;
      this.adapter.sound("back");
      this.show(this.screen === "bench" ? "shop" : "menu");
    }

    async showShop(category) {
      this.category = category; this.adapter.sound("select");
      this.show("shop");
      this.nodes.list.replaceChildren(); this.nodes.count.textContent = this.t("Search.Loading");
      try {
        const all = await loadEntries(this.adapter);
        if (this.gone || this.category !== category) return;
        this.entries = all.filter(entry => entry.category === category);
        this.list();
        this.nodes.search.focus({preventScroll: true});
      } catch (error) {
        console.error(this.adapter.moduleId, error);
        this.nodes.count.textContent = this.t("Search.Failed");
      }
    }

    list() {
      const {rows, total} = searchEntries(this.entries, this.query);
      this.nodes.count.textContent = total > rows.length ? this.t("Search.Capped", {shown: rows.length, total}) : this.t("Search.Count", {total});
      this.nodes.list.replaceChildren(...rows.map(entry => {
        const row = el("li"), button = el("button", "rvc-row"), image = el("img"), text = el("span", "rvc-row-text");
        button.type = "button"; button.dataset.uuid = entry.uuid; image.src = entry.img || "icons/svg/item-bag.svg"; image.alt = ""; image.loading = "lazy";
        text.append(el("strong", "", entry.name), el("small", "", [entry.meta, entry.origin].filter(Boolean).join(" · ")));
        button.append(image, text, el("span", "rvc-row-cost", this.coins(entry.cost)));
        row.append(button);
        return row;
      }));
    }

    async drop(event) {
      event.preventDefault();
      if (this.busy || this.screen === "menu" || this.screen === "rules") return;
      let data;
      try { data = JSON.parse(event.dataTransfer.getData("text/plain")); } catch { return; }
      if (data?.type === "Item" && data.uuid) await this.choose(data.uuid);
    }

    /** Loads the full item, so price and DC never come from a stale index row. */
    async choose(uuid, {listed = false} = {}) {
      if (this.busy) return;
      const item = await fromUuid(uuid);
      const entry = item && toEntry(this.adapter, item);
      if (!entry) return void ui.notifications.warn(this.t("Warn.NotCraftable"));
      // A row already sits in this trade's list; only dropped items need sorting into a trade.
      if (!listed && entry.category !== this.category) {
        return void ui.notifications.warn(this.t("Warn.WrongCategory", {category: this.t(`Category.${entry.category}`)}));
      }
      this.entry = entry; this.item = item; this.adapter.sound("select");
      this.nodes["item-img"].src = item.img || "icons/svg/item-bag.svg";
      this.nodes["item-name"].textContent = item.name;
      this.nodes["item-meta"].textContent = entry.meta;
      this.nodes.dc.textContent = this.t("Bench.DC", {dc: entry.dc});
      this.nodes.roll.textContent = ""; this.nodes.strikes.replaceChildren(); this.nodes.result.replaceChildren(); this.nodes.result.className = "rvc-result";
      this.show("bench");
      this.afford();
    }

    afford() {
      const enough = this.adapter.funds(this.actor) >= this.entry.cost;
      this.nodes.cost.textContent = this.t("Bench.Cost", {cost: this.coins(this.entry.cost)});
      this.nodes.cost.classList.toggle("rvc-short", !enough);
      this.nodes.craft.disabled = this.busy || !enough;
    }

    async craft() {
      if (this.busy || !this.entry) return;
      const {adapter, actor, entry, item, category} = this;
      this.busy = true; this.root.classList.add("rvc-busy"); this.nodes.craft.disabled = true;
      this.nodes.result.replaceChildren(); this.nodes.result.className = "rvc-result"; this.nodes.strikes.replaceChildren(); this.nodes.roll.textContent = "";
      let paid = false, roll = null, hits = 0, refund = 0, crafted = false;
      try {
        if (!await adapter.pay(actor, entry.cost)) {
          ui.notifications.warn(this.t("Warn.NoCoin", {cost: this.coins(entry.cost)}));
          return;
        }
        paid = true; this.purse();
        // Paid before rolling: closing the window on a bad roll must not be a free retry.
        roll = await adapter.roll(actor, category, item, entry.dc);
        if (!roll) { await adapter.refund(actor, entry.cost); paid = false; return; }
        this.nodes.roll.textContent = this.t("Bench.Roll", {total: roll.total, dc: entry.dc});
        hits = await this.strikes(timingFor(roll.total - entry.dc), category);
        refund = refundFor(hits, entry.cost);
        if (hits >= STRIKES) { await actor.createEmbeddedDocuments("Item", [adapter.itemData(item)]); crafted = true; }
        else if (refund > 0) await adapter.refund(actor, refund);
        paid = false;
        this.report({hits, refund, crafted});
        await this.announce({roll, hits, refund, crafted});
      } catch (error) {
        console.error(adapter.moduleId, error);
        // Nothing was delivered, so the coin goes back.
        if (paid && !crafted) await Promise.resolve(adapter.refund(actor, entry.cost)).catch(inner => console.error(adapter.moduleId, inner));
        ui.notifications.error(this.t("Warn.Failed"));
      } finally {
        this.busy = false;
        if (!this.gone) { this.root.classList.remove("rvc-busy"); this.purse(); this.afford(); }
      }
    }

    /** Three timed strikes in a row. Closing the window counts the rest as misses. */
    async strikes(timing, category) {
      let hits = 0;
      for (let i = 0; i < STRIKES && !this.gone; i++) {
        const hit = await this.strike(timing, category);
        if (hit) hits++;
        this.adapter.sound(hit ? "hit" : "miss", category);
        if (i < STRIKES - 1 && !this.gone) await new Promise(resolve => setTimeout(resolve, STRIKE_GAP));
      }
      return hits;
    }

    strike(timing, category) {
      return new Promise(resolve => {
        const button = el("button", "rvc-strike"), image = el("img"), bar = el("span", "rvc-strike-bar");
        button.type = "button"; button.setAttribute("aria-label", this.t("Bench.Strike"));
        image.src = this.adapter.categories[category].icon; image.alt = "";
        button.append(image, bar); this.nodes.strikes.append(button);
        const began = performance.now();
        let frame = null, done = false;
        const elapsed = () => performance.now() - began, inWindow = () => { const now = elapsed(); return now >= timing.start && now <= timing.end; };
        const finish = hit => {
          if (done) return;
          done = true; this.cancelStrike = null; cancelAnimationFrame(frame);
          button.disabled = true; button.classList.remove("rvc-live"); button.classList.add(hit ? "rvc-hit" : "rvc-miss");
          resolve(hit);
        };
        const tick = () => {
          const now = elapsed();
          bar.style.width = `${Math.min(100, now / timing.limit * 100)}%`;
          button.classList.toggle("rvc-live", now >= timing.start && now <= timing.end);
          if (now >= timing.limit) finish(false); else frame = requestAnimationFrame(tick);
        };
        button.addEventListener("click", () => finish(inWindow()));
        this.cancelStrike = () => finish(false);
        button.focus({preventScroll: true});
        frame = requestAnimationFrame(tick);
      });
    }

    report({hits, refund, crafted}) {
      if (this.gone) return;
      const box = this.nodes.result;
      box.className = `rvc-result ${crafted ? "rvc-success" : "rvc-failure"}`;
      box.replaceChildren(el("strong", "", this.t(crafted ? "Result.Success" : "Result.Failure", {hits})),
        el("span", "", crafted ? this.t("Result.Added", {item: this.item.name})
          : refund > 0 ? this.t("Result.Refund", {refund: this.coins(refund)}) : this.t("Result.NoRefund")));
    }

    /** A short report whispered to the connected GMs. */
    async announce({roll, hits, refund, crafted}) {
      const escape = escapeHTML, {entry, item, actor} = this;
      const lines = [
        `<strong>${escape(actor.name)}</strong> — ${this.t(crafted ? "Chat.Success" : "Chat.Failure")}: @UUID[${item.uuid}]{${escape(item.name)}}`,
        this.t("Chat.Detail", {total: roll.total, dc: entry.dc, hits, cost: this.coins(entry.cost)}),
        ...(refund > 0 ? [this.t("Chat.Refund", {refund: this.coins(refund)})] : [])
      ];
      const whisper = game.users.filter(user => user.isGM && user.active).map(user => user.id);
      await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}), whisper, content: `<div class="rvc-chat">${lines.map(line => `<p>${line}</p>`).join("")}</div>`})
        .catch(error => console.warn(this.adapter.moduleId, "Chat unavailable", error));
    }

    async close(options) {
      this.gone = true;
      this.cancelStrike?.();
      open.delete(this.key);
      return super.close(options);
    }
  };
}
