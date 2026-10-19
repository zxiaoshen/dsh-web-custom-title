/**
 * Headless verification for lib/client.js (the pencil-button self-healing patch).
 *
 * Why a stub DOM: the clientside bundle talks to a real browser through a tiny
 * surface (document.querySelector*, createElement, MutationObserver,
 * localStorage, requestAnimationFrame/setInterval). Stubbing exactly that
 * surface lets CI prove the behaviours that are hard to eyeball in the GUI:
 *
 *   1. the bundle still evaluates and registers through __ModuleLoader__;
 *   2. apply() injects the pencil button into a composer card;
 *   3. a REMOVE-ONLY React re-render (the classic "the pen just vanished" case,
 *      which the MutationObserver deliberately cannot see) is repaired by the
 *      watchdog on its own;
 *   4. custom placeholder text is applied to the composer textarea;
 *   5. the disposer removes button, listeners and timer WITHOUT throwing.
 *
 * Run: node tools/verify-client.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

let failures = 0;
function check(label, ok, detail = "") {
  if (ok) console.log(`  ok   ${label}`);
  else {
    failures += 1;
    console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

/* ------------------------------------------------------------------ stub DOM */

class ClassList {
  constructor() {
    this.set = new Set();
  }
  add(...names) {
    for (const n of names) this.set.add(n);
  }
  remove(...names) {
    for (const n of names) this.set.delete(n);
  }
  contains(name) {
    return this.set.has(name);
  }
  toggle(name, force) {
    const want = force === undefined ? !this.set.has(name) : force;
    if (want) this.set.add(name);
    else this.set.delete(name);
    return want;
  }
}

class Element {
  constructor(tagName) {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.attrs = new Map();
    this.listeners = new Map();
    this.classList = new ClassList();
    this.className = "";
    this.style = { setProperty(key, value) { this[key] = String(value); } };
    this._dataset = new Map();
    this.dataset = new Proxy(this._dataset, {
      get: (target, prop) => {
        if (typeof prop !== "string") return undefined;
        if (prop === "cppBtn") return target.has("cpp-btn") ? target.get("cpp-btn") : undefined;
        return target.get(prop);
      },
      set: (target, prop, value) => {
        if (prop === "cppBtn") {
          const name = "data-cpp-btn";
          this.attrs.set(name, String(value));
          target.set("cpp-btn", String(value));
        } else target.set(prop, value);
        return true;
      },
      has: (target, prop) => (prop === "cppBtn" ? target.has("cpp-btn") : target.has(prop)),
    });
  }

  /* --- tree --- */
  appendChild(node) {
    if (node.parentElement !== null) node.parentElement.removeChild(node);
    this.children.push(node);
    node.parentElement = this;
    return node;
  }
  insertBefore(node, ref) {
    if (node.parentElement !== null) node.parentElement.removeChild(node);
    const index = this.children.indexOf(ref);
    if (index === -1) this.children.push(node);
    else this.children.splice(index, 0, node);
    node.parentElement = this;
    return node;
  }
  append(...nodes) {
    for (const n of nodes) this.appendChild(n);
  }
  prepend(node) {
    this.insertBefore(node, this.children[0] ?? null);
  }
  removeChild(node) {
    const index = this.children.indexOf(node);
    if (index !== -1) this.children.splice(index, 1);
    node.parentElement = null;
    return node;
  }
  remove() {
    if (this.parentElement !== null) this.parentElement.removeChild(this);
  }
  get firstChild() {
    return this.children[0] ?? null;
  }
  get firstElementChild() {
    return this.children[0] ?? null;
  }
  get previousElementSibling() {
    const parent = this.parentElement;
    if (parent === null) return null;
    const index = parent.children.indexOf(this);
    if (index <= 0) return null;
    return parent.children[index - 1];
  }
  contains(node) {
    for (let n = node; n !== null; n = n.parentElement) if (n === this) return true;
    return false;
  }
  _descendants(out = []) {
    for (const child of this.children) {
      out.push(child);
      child._descendants(out);
    }
    return out;
  }
  querySelectorAll(selector) {
    return this._descendants().filter((el) => match(el, selector));
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }
  closest(selector) {
    for (let n = this; n !== null; n = n.parentElement) if (match(n, selector)) return n;
    return null;
  }

  /* --- text --- */
  get textContent() {
    if (this.children.length === 0) return this._text ?? "";
    return this.children.map((c) => c.textContent).join("");
  }
  set textContent(value) {
    for (const child of this.children) child.parentElement = null;
    this.children = [];
    this._text = String(value);
  }
  set innerHTML(markup) {
    this._html = String(markup);
    const btn = /<button\b/i.test(this._html);
    if (btn) {
      const child = new Element("span");
      child._text = "";
      this.appendChild(child);
    }
  }
  get innerHTML() {
    return this._html ?? "";
  }
  get offsetWidth() {
    return 28;
  }
  get offsetHeight() {
    return 28;
  }

  /* --- attributes --- */
  setAttribute(name, value) {
    this.attrs.set(name, String(value));
    if (name === "class") this.className = String(value);
  }
  getAttribute(name) {
    return this.attrs.has(name) ? this.attrs.get(name) : null;
  }
  hasAttribute(name) {
    return this.attrs.has(name);
  }
  removeAttribute(name) {
    this.attrs.delete(name);
  }
  set contentEditable(value) {
    this.setAttribute("contenteditable", value);
  }
  get contentEditable() {
    return this.getAttribute("contenteditable") ?? "inherit";
  }
  focus() {}

  /* --- events --- */
  addEventListener(type, handler) {
    const list = this.listeners.get(type) ?? [];
    list.push(handler);
    this.listeners.set(type, list);
  }
  removeEventListener(type, handler) {
    const list = this.listeners.get(type) ?? [];
    this.listeners.set(type, list.filter((h) => h !== handler));
  }
  dispatch(type) {
    const event = {
      type,
      key: "",
      preventDefault() {},
      stopPropagation() {},
      target: this,
    };
    for (const handler of [...(this.listeners.get(type) ?? [])]) handler(event);
    return event;
  }
  listenerCount(type) {
    return (this.listeners.get(type) ?? []).length;
  }
  getBoundingClientRect() {
    return { left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 };
  }
}

/** The handful of selectors the plugin actually uses. */
function match(el, selector) {
  const sel = selector.trim();
  if (sel === "body" || sel === "html") return el.tagName === sel.toUpperCase();
  if (sel === "div[data-composer-card]") return el.tagName === "DIV" && el.hasAttribute("data-composer-card");
  if (sel === "button[data-cpp-btn]") return el.tagName === "BUTTON" && el.hasAttribute("data-cpp-btn");
  if (sel === '[data-slot="conversation.input.model"]') {
    return el.getAttribute("data-slot") === "conversation.input.model";
  }
  if (sel === "[class*='trailing']") return el.className.includes("trailing");
  if (sel === "textarea") return el.tagName === "TEXTAREA";
  if (sel === "[data-phase]") return el.hasAttribute("data-phase");
  if (sel === "[data-phase='active']") return el.getAttribute("data-phase") === "active";
  if (sel === "[data-conversation-scroll]") return el.hasAttribute("data-conversation-scroll");
  if (sel === "[data-composer-seat]") return el.hasAttribute("data-composer-seat");
  if (sel === "[data-composer-seat].dsh-composer-fixed") {
    return el.hasAttribute("data-composer-seat") && el.classList.contains("dsh-composer-fixed");
  }
  // Any "chained attribute" selector, e.g. [data-conversation-scroll][data-dsh-fix].
  const chained = /^(?:\[[^\]]+\])+$/.test(sel);
  if (chained) {
    const names = sel.match(/\[([^\]]+)\]/g).map((part) => part.slice(1, -1));
    return names.every((name) => el.hasAttribute(name));
  }
  if (sel === "[data-chat-flow]") return el.hasAttribute("data-chat-flow");
  if (sel.startsWith("span[class*='")) {
    const token = sel.slice("span[class*='".length, -"']".length);
    return el.tagName === "SPAN" && el.className.includes(token);
  }
  if (sel.startsWith("style[data-plugin-css=")) {
    const token = sel.slice("style[data-plugin-css=".length, -"]".length).replace(/"/g, "");
    return el.tagName === "STYLE" && el.getAttribute("data-plugin-css") === token;
  }
  if (sel.startsWith("img[")) {
    const token = sel.slice("img[".length, -"]".length);
    return el.tagName === "IMG" && el.hasAttribute(token);
  }
  throw new Error(`stub DOM: unsupported selector ${sel}`);
}

const body = new Element("body");
const head = new Element("head");
const documentElement = new Element("html");
documentElement.lang = "zh-CN";
documentElement.append(head, body);

const observerState = { instances: [] };

class MutationObserver {
  constructor(callback) {
    this.callback = callback;
    this.observed = null;
    observerState.instances.push(this);
  }
  observe(target, options) {
    this.observed = { target, options };
  }
  disconnect() {
    this.observed = null;
  }
  takeRecords() {
    return [];
  }
}

const document = {
  documentElement,
  head,
  body,
  hidden: false,
  readyState: "complete",
  createElement: (tag) => new Element(tag),
  querySelector: (selector) => (match(body, selector) ? body : body.querySelector(selector)),
  querySelectorAll: (selector) => body.querySelectorAll(selector),
  addEventListener: (type, handler) => body.addEventListener(type, handler),
  removeEventListener: (type, handler) => body.removeEventListener(type, handler),
};

const storage = new Map();
const localStorage = {
  getItem: (key) => (storage.has(key) ? storage.get(key) : null),
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
};

const timers = new Set();
const intervals = new Set();
const window = {
  document,
  localStorage,
  devicePixelRatio: 1,
  pageXOffset: 0,
  pageYOffset: 0,
  innerWidth: 1280,
  innerHeight: 800,
  addEventListener: (type, handler) => body.addEventListener(type, handler),
  removeEventListener: (type, handler) => body.removeEventListener(type, handler),
  matchMedia: () => ({ matches: false }),
};
globalThis.window = window;
globalThis.document = document;
globalThis.Element = Element;
globalThis.HTMLElement = Element;
globalThis.localStorage = localStorage;
globalThis.MutationObserver = MutationObserver;
globalThis.ResizeObserver = class {
  observe() {}
  disconnect() {}
};
globalThis.getComputedStyle = () => ({ backgroundColor: "rgb(20,22,26)", backgroundImage: "none" });
globalThis.requestAnimationFrame = (fn) => {
  const id = setTimeout(() => {
    timers.delete(id);
    fn();
  }, 0);
  timers.add(id);
  return id;
};
globalThis.cancelAnimationFrame = (id) => {
  clearTimeout(id);
  timers.delete(id);
};
const nativeSetInterval = globalThis.setInterval;
const nativeClearInterval = globalThis.clearInterval;
globalThis.setInterval = (fn, ms) => {
  const id = nativeSetInterval(fn, ms);
  intervals.add(id);
  return id;
};
globalThis.clearInterval = (id) => {
  intervals.delete(id);
  return nativeClearInterval(id);
};
globalThis.Image = class {
  set src(value) {
    this._src = value;
  }
};
globalThis.FileReader = class {};

/* ------------------------------------------------------- load the real bundle */

let captured = null;
window.__ModuleLoader__ = {
  load(registration) {
    captured = registration;
  },
};

const code = readFileSync(join(root, "lib", "client.js"), "utf8");
const runBundle = new Function("window", "document", "globalThis", code);
try {
  runBundle(window, document, globalThis);
} catch (error) {
  console.error(`bundle did not evaluate: ${error.message}`);
  process.exit(1);
}

console.log("dsh-web-custom-title — lib/client.js verification\n");

check("bundle registers through __ModuleLoader__.load", captured !== null && captured.id === "dsh-web-custom-title");
if (captured === null) process.exit(1);

const module_ = captured.factory(() => {
  throw new Error("stub require called: the client bundle must not import at load");
});
check("factory exports apply()", typeof module_.apply === "function");

/* ------------------------------------------------------------- composer card */

function buildComposerCard() {
  const card = new Element("div");
  card.setAttribute("data-composer-card", "");
  const toolbar = new Element("div");
  toolbar.className = "composer_trailing__x";
  // DSH 0.2.1 layout: the model selector lives in its own `standardControls`
  // group inside the trailing row, and the send button is a LATER sibling of
  // that group — appending to `toolbar` would seat the pencil right of send.
  const controls = new Element("div");
  controls.className = "composer_standardControls__x";
  const modelSlot = new Element("span");
  modelSlot.setAttribute("data-slot", "conversation.input.model");
  controls.append(modelSlot);
  const send = new Element("button");
  send.className = "composer_primary__x";
  toolbar.append(controls, send);
  const textarea = new Element("textarea");
  textarea.setAttribute("placeholder", "给智能体发消息");
  card.append(toolbar, textarea);
  body.appendChild(card);
  return { card, toolbar, controls, modelSlot, send, textarea };
}

const disposers = [];
const ctx = {
  config: {},
  effect(callback) {
    const dispose = callback();
    disposers.push(dispose);
    return dispose;
  },
};

let composer = buildComposerCard();
module_.apply(ctx);

const button = () => document.querySelector("button[data-cpp-btn]");
const first = button();
check("apply() injects the pencil button", first !== null);
check("button sits immediately LEFT of the model selector", first !== null && composer.modelSlot.previousElementSibling === first);
check("button lives inside the model selector's own group (0.2.1 layout)", first !== null && composer.controls.contains(first));
check("button is not dropped after the send button", first !== null && composer.toolbar.children[composer.toolbar.children.length - 1] !== first);
check("button carries a click handler", first !== null && first.listenerCount("click") > 0);
check("watchdog interval installed", intervals.size >= 1);

/* ------------------------------ the repair that the MutationObserver misses */

// React remove-only re-render: the toolbar is rebuilt, so our node is detached
// (still findable by querySelector) while the new row has no button.
composer.toolbar.remove();
composer.toolbar = new Element("div");
composer.toolbar.className = "composer_trailing__x";
composer.controls = new Element("div");
composer.controls.className = "composer_standardControls__x";
composer.modelSlot = new Element("span");
composer.modelSlot.setAttribute("data-slot", "conversation.input.model");
composer.controls.append(composer.modelSlot);
composer.send = new Element("button");
composer.send.className = "composer_primary__x";
composer.toolbar.append(composer.controls, composer.send);
composer.card.append(composer.toolbar);

await new Promise((resolve) => setTimeout(resolve, 1200));

const repaired = composer.card.querySelector("button[data-cpp-btn]");
const live = repaired !== null && composer.card.contains(repaired);
const seated = repaired !== null && composer.modelSlot.previousElementSibling === repaired;
check("watchdog re-injects after a remove-only re-render", live);
check("re-injected button is re-seated left of the model selector", seated);
check("only one button exists in the card", composer.card.querySelectorAll("button[data-cpp-btn]").length === 1);

const strays = body._descendants().filter((el) => el.tagName === "BUTTON" && el.hasAttribute("data-cpp-btn") && !composer.card.contains(el));
check("no detached button left behind", strays.length === 0, `${strays.length} stray node(s)`);

/* -------------------------------------------------------- placeholder override */

const ta = composer.card.querySelector("textarea");
check("shipped default placeholder is left alone with no override", ta.getAttribute("placeholder") === "给智能体发消息");

localStorage.setItem("dsh.web-custom-placeholder.session", "继续聊聊这个任务吧");
localStorage.setItem("dsh.web-custom-placeholder.hero", "描述你希望构建的东西");
await new Promise((resolve) => setTimeout(resolve, 1200));
check("custom placeholder is applied from localStorage", ta.getAttribute("placeholder") === "继续聊聊这个任务吧");
check("mode tag marks the decorated textarea", ta.getAttribute("data-cpp-mode") === "session");

/* ------ DSH 0.2.1 shipped placeholders: the wording gained a capability suffix */

ta.setAttribute("placeholder", "发消息或创建任务, / 调用指令, @ 文件或对话");
await new Promise((resolve) => setTimeout(resolve, 1200));
check(
  "0.2.1 session placeholder (with command hints) is still overridden",
  ta.getAttribute("placeholder") === "继续聊聊这个任务吧",
  ta.getAttribute("placeholder"),
);

ta.setAttribute("placeholder", "描述你想要构建的内容, / 调用指令, @ 文件或对话");
await new Promise((resolve) => setTimeout(resolve, 1200));
check(
  "0.2.1 hero placeholder (with command hints) is still overridden",
  ta.getAttribute("placeholder") === "描述你希望构建的东西",
  ta.getAttribute("placeholder"),
);


/* ------------------------------- a second card must not steal the first seat */

const second = buildComposerCard();
await new Promise((resolve) => setTimeout(resolve, 1200));
check("every composer card gets its own button", second.card.querySelector("button[data-cpp-btn]") !== null);
check("first card keeps its button", composer.card.querySelector("button[data-cpp-btn]") !== null);

/* ------------------------------------------------------------------ teardown */

let teardownError = null;
for (const dispose of disposers) {
  try {
    dispose();
  } catch (error) {
    teardownError = error;
  }
}
check("disposer runs without throwing", teardownError === null, teardownError?.message ?? "");
check("disposer removes every button", document.querySelector("button[data-cpp-btn]") === null);
check("disposer clears the watchdog interval", intervals.size === 0, `${intervals.size} interval(s) still armed`);
check("disposer restores the shipped placeholder", ta.getAttribute("placeholder") === "给智能体发消息");

for (const id of timers) clearTimeout(id);
for (const id of intervals) clearInterval(id);

console.log("");
if (failures === 0) console.log("all checks passed");
else console.error(`${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
