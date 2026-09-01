/**
 * dsh-web-custom-title — client bundle SOURCE TEMPLATE.
 * Build with: node build-client.mjs  (replaces @@HERO_MARK_DATA_URL@@ with the
 * base64 of assets/hero-mark.png and writes lib/client.js).
 *
 * 1. Replaces the empty/new-page hero headline ("探索未至之境" / "Into the
 *    Unknown") with user text rendered with the element's OWN default styles
 *    (plain skin heading color — the original font look):
 *      - double-click the headline to rename inline (Enter/blur saves, Esc
 *        cancels); the value persists in localStorage; a declarative
 *        `config.title` acts as the fallback when no override is stored;
 *      - a MutationObserver re-applies the custom text after React rewrites
 *        the default headline.
 * 2. Swaps the whale/fish brand mark above the headline for a circular photo
 *    icon (48px — a bigger circle than the shipped 34px mark):
 *      - default icon is the bundled 1.png;
 *      - DOUBLE-CLICK the icon to pick your own photo (system file picker);
 *        the chosen photo is cover-cropped to a circle, persisted in
 *        localStorage, and survives restarts;
 *      - the hero headline's grid column is widened through an owned
 *        stylesheet rule so the bigger circle lays out cleanly.
 *    Everything is plain DOM injection with no React or slot-service
 *    dependency, so a failure on either feature can never take down the
 *    other.
 *
 * All DOM/CSS writes are owned by this activation and restored by the Cordis
 * effect disposer (per the skin-lifecycle review rules).
 */
window.__ModuleLoader__.load({
	id: "dsh-web-custom-title",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const STORAGE_KEY = "dsh.web-custom-title.custom";
		const MARK_STORAGE_KEY = "dsh.web-custom-title.mark";
		// Legacy keys from the plugin's previous name (dsh-hero-title); read once
		// and migrated so existing users keep their saved title and icon.
		const LEGACY_STORAGE_KEY = "dsh.hero-title.custom";
		const LEGACY_MARK_STORAGE_KEY = "dsh.hero-title.mark";
		const CSS_TAG_ID = "dsh-web-custom-title/web-custom-title.css";
		const DEFAULT_TITLES = new Set(["探索未至之境", "Into the Unknown"]);
		const HEADLINE_TEXT_SELECTOR = "span[class*='headlineText']";
		const BRAND_MARK_SELECTOR = "span[class*='fishHitbox']";
		const BRAND_MARK_IMG_ATTR = "data-hero-mark";
		const BRAND_MARK_SIZE = 48; // circular icon size — larger circle than the shipped 34px whale/fish mark
		const MARK_CANVAS_SIZE = 192; // stored photo resolution (4x the 48px display)
		const HINT_ZH = "双击修改标题（Enter 保存，Esc 取消）";
		const HINT_EN = "Double-click to rename (Enter saves, Esc cancels)";
		const MARK_HINT_ZH = "双击更换图标（选择照片）";
		const MARK_HINT_EN = "Double-click to change the icon (pick a photo)";
		const HERO_MARK_DATA_URL = "@@HERO_MARK_DATA_URL@@";

		const INJECTED_CSS = [
			`span[class*='headlineText']{cursor:text}`,
			`span[data-hero-title-editing]{outline:1px dashed var(--dsw-alias-border-l3,currentColor);outline-offset:3px;border-radius:6px}`,
			`img[data-hero-mark]{border-radius:50%;object-fit:cover;display:block;user-select:none;pointer-events:none}`,
			// Enlarge the brand-mark slot so the circular icon fills a bigger
			// circle: widen the hitbox and the hero headline's first grid column
			// (the shipped layout pins that column to 34px).
			`[data-phase='hero'] span[class*='fishHitbox']{width:${BRAND_MARK_SIZE}px !important;height:${BRAND_MARK_SIZE}px !important;cursor:pointer}`,
			`[data-phase='hero'] [class*='headline']{grid-template-columns:${BRAND_MARK_SIZE}px auto auto !important}`,
		].join("\n");

		function injectCss() {
			if (typeof document === "undefined") return null;
			if (document.querySelector(`style[data-plugin-css="${CSS_TAG_ID}"]`) !== null) return null;
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-web-custom-title";
			tag.dataset.pluginCss = CSS_TAG_ID;
			tag.textContent = INJECTED_CSS;
			document.head.appendChild(tag);
			return tag;
		}

		function readStored() {
			try {
				const value = localStorage.getItem(STORAGE_KEY);
				return value === null ? "" : value;
			} catch {
				return "";
			}
		}
		/** One-time migration from the legacy dsh-hero-title storage keys. */
		function migrateLegacyStorage() {
			try {
				for (const [legacy, current] of [
					[LEGACY_STORAGE_KEY, STORAGE_KEY],
					[LEGACY_MARK_STORAGE_KEY, MARK_STORAGE_KEY],
				]) {
					if (localStorage.getItem(current) === null) {
						const old = localStorage.getItem(legacy);
						if (typeof old === "string" && old.length > 0) {
							localStorage.setItem(current, old);
							localStorage.removeItem(legacy);
						}
					}
				}
			} catch {
				/* storage unavailable — the plugin still works for the session */
			}
		}
		function writeStored(value) {
			try {
				if (value) localStorage.setItem(STORAGE_KEY, value);
				else localStorage.removeItem(STORAGE_KEY);
			} catch {
				/* private mode / quota — editing still works for the session */
			}
		}

		function readStoredMark() {
			try {
				const value = localStorage.getItem(MARK_STORAGE_KEY);
				return typeof value === "string" && value.startsWith("data:image/") ? value : "";
			} catch {
				return "";
			}
		}
		function writeStoredMark(value) {
			try {
				if (value) localStorage.setItem(MARK_STORAGE_KEY, value);
				else localStorage.removeItem(MARK_STORAGE_KEY);
			} catch {
				/* private mode / quota — the pick still works for the session */
			}
		}
		/** The active icon source: the user's stored photo, else the bundled default. */
		function effectiveMark() {
			return readStoredMark() || HERO_MARK_DATA_URL;
		}

		function fileToDataUrl(file) {
			return new Promise((resolve, reject) => {
				const reader = new FileReader();
				reader.onload = () => resolve(String(reader.result));
				reader.onerror = () => reject(reader.error || new Error("read failed"));
				reader.readAsDataURL(file);
			});
		}
		function loadImage(src) {
			return new Promise((resolve, reject) => {
				const image = new Image();
				image.onload = () => resolve(image);
				image.onerror = () => reject(new Error("image decode failed"));
				image.src = src;
			});
		}
		/** Cover-crop the photo to a centered square, circular-mask it, downscale. */
		async function toCircularSquare(dataUrl) {
			const image = await loadImage(dataUrl);
			const side = Math.min(image.naturalWidth, image.naturalHeight);
			const canvas = document.createElement("canvas");
			canvas.width = MARK_CANVAS_SIZE;
			canvas.height = MARK_CANVAS_SIZE;
			const ctx = canvas.getContext("2d");
			if (!ctx) throw new Error("canvas unavailable");
			ctx.save();
			ctx.beginPath();
			ctx.arc(MARK_CANVAS_SIZE / 2, MARK_CANVAS_SIZE / 2, MARK_CANVAS_SIZE / 2, 0, Math.PI * 2);
			ctx.closePath();
			ctx.clip();
			ctx.drawImage(
				image,
				(image.naturalWidth - side) / 2,
				(image.naturalHeight - side) / 2,
				side,
				side,
				0,
				0,
				MARK_CANVAS_SIZE,
				MARK_CANVAS_SIZE,
			);
			ctx.restore();
			return canvas.toDataURL("image/png");
		}

		/** Locate every hero headline span currently rendered. */
		function findHeadlines() {
			const spans = [];
			const seen = new Set();
			const accept = (el) => {
				if (seen.has(el)) return;
				const phase = el.closest("[data-phase]");
				if (phase !== null && phase.getAttribute("data-phase") !== "hero") return;
				seen.add(el);
				spans.push(el);
			};
			try {
				for (const span of document.querySelectorAll(HEADLINE_TEXT_SELECTOR)) accept(span);
			} catch {
				/* selector engine quirks */
			}
			// Text-match fallback: any span inside the hero phase whose text is a
			// shipped default, in case the hashed class name ever changes.
			try {
				for (const phase of document.querySelectorAll("[data-phase='hero']")) {
					for (const span of phase.querySelectorAll("span")) {
						if (seen.has(span)) continue;
						const text = (span.textContent || "").trim();
						if (DEFAULT_TITLES.has(text)) {
							seen.add(span);
							spans.push(span);
						}
					}
				}
			} catch {
				/* not in a DOM yet */
			}
			return spans;
		}

		/**
		 * Locate the brand-mark container (the span holding the whale/fish mark
		 * above the headline). Primary: the fish-hitbox span inside the hero.
		 * Fallback: the headline span's parent's first span child (the hero
		 * headline row lays out brand mark, headline text, preview badge).
		 */
		function findBrandMarkContainers() {
			const found = [];
			const seen = new Set();
			try {
				for (const phase of document.querySelectorAll("[data-phase='hero']")) {
					for (const span of phase.querySelectorAll(BRAND_MARK_SELECTOR)) {
						seen.add(span);
						found.push(span);
					}
				}
			} catch {
				/* not in a DOM yet */
			}
			if (found.length === 0) {
				for (const headline of findHeadlines()) {
					const row = headline.parentElement;
					if (row === null) continue;
					for (const child of row.children) {
						if (child instanceof Element && child.tagName === "SPAN" && !seen.has(child)) {
							seen.add(child);
							found.push(child);
						}
					}
				}
			}
			return found;
		}

		function apply(ctx) {
			// Composer placeholder customization (merged feature).
			applyComposerPlaceholder(ctx);
			migrateLegacyStorage();

			const configTitle = (() => {
				try {
					const value = ctx && ctx.config && ctx.config.title;
					return typeof value === "string" ? value.trim() : "";
				} catch {
					return "";
				}
			})();

			const effectiveTitle = () => {
				const stored = readStored();
				return stored || configTitle;
			};

			const styleTag = injectCss();

			/** span -> { previousCssText, originalText, hint } */
			const decorated = new Map();
			/** span -> handler references, so cleanup removes exactly those. */
			const attached = new Map();
			/** brand-mark container -> dblclick handler (for cleanup). */
			const markHandlers = new Map();
			/** brand-mark spans we injected into (for cleanup). */
			const injectedMarks = new Set();
			const editing = new WeakSet();
			let observer = null;
			let fileInput = null;

			const restoreSpan = (span, record) => {
				span.removeAttribute("contenteditable");
				delete span.dataset.heroTitleEditing;
				if (record) {
					if (record.hint) span.removeAttribute("title");
					span.style.cssText = record.previousCssText;
					if (record.originalText !== null && span.textContent !== record.originalText) {
						span.textContent = record.originalText;
					}
				}
			};

			const syncSpan = (span) => {
				if (editing.has(span)) return;
				const title = effectiveTitle();
				const record = decorated.get(span);

				if (!title) {
					if (record) {
						restoreSpan(span, record);
						decorated.delete(span);
					}
					return;
				}

				if (!record) {
					decorated.set(span, {
						previousCssText: span.style.cssText,
						originalText: span.textContent,
						hint: false,
					});
				}
				if ((span.textContent || "").trim() !== title) span.textContent = title;
				if (!span.hasAttribute("title")) {
					const lang = typeof document !== "undefined" ? document.documentElement.lang : "";
					span.setAttribute("title", lang === "zh-CN" ? HINT_ZH : HINT_EN);
					decorated.get(span).hint = true;
				}
			};

			const beginEdit = (span) => {
				if (editing.has(span)) return;
				editing.add(span);
				span.dataset.heroTitleEditing = "";
				const record = decorated.get(span);
				if (record) record.previousCssText = span.style.cssText;
				span.contentEditable = "plaintext-only";
				if (span.contentEditable !== "plaintext-only") span.contentEditable = "true";
				span.focus();
				try {
					const range = document.createRange();
					range.selectNodeContents(span);
					const selection = window.getSelection();
					selection.removeAllRanges();
					selection.addRange(range);
				} catch {
					/* selection API unavailable */
				}
			};

			const endEdit = (span, commit) => {
				if (!editing.has(span)) return;
				editing.delete(span);
				delete span.dataset.heroTitleEditing;
				span.removeAttribute("contenteditable");
				if (commit) writeStored((span.textContent || "").trim());
				// Esc (commit=false): re-render effectiveTitle, which is exactly
				// the state that was showing before editing began.
				syncSpan(span);
			};

			const decorate = (span) => {
				if (!attached.has(span)) {
					const handlers = {
						dblclick: () => beginEdit(span),
						keydown: (event) => {
							if (event.key === "Enter") {
								event.preventDefault();
								span.blur();
							} else if (event.key === "Escape") {
								event.preventDefault();
								endEdit(span, false);
							}
						},
						blur: () => endEdit(span, true),
					};
					attached.set(span, handlers);
					span.addEventListener("dblclick", handlers.dblclick);
					span.addEventListener("keydown", handlers.keydown);
					span.addEventListener("blur", handlers.blur);
				}
				syncSpan(span);
			};

			/** Open the system file picker and turn the chosen photo into the icon. */
			const pickMarkImage = () => {
				if (fileInput === null) {
					fileInput = document.createElement("input");
					fileInput.type = "file";
					fileInput.accept = "image/*";
					fileInput.style.display = "none";
					fileInput.addEventListener("change", () => {
						const file = fileInput.files && fileInput.files[0];
						if (file && file.type.startsWith("image/")) {
							fileToDataUrl(file)
								.then(toCircularSquare)
								.then((dataUrl) => {
									writeStoredMark(dataUrl);
									syncAll();
								})
								.catch(() => {
									/* decode/size failure — keep the current icon */
								});
						}
						// Reset so picking the same file again still fires change.
						fileInput.value = "";
					});
					document.body.appendChild(fileInput);
				}
				fileInput.click();
			};

			/** Replace the whale/fish mark with the circular icon (double-click to change). */
			const injectBrandMark = (container) => {
				if (!(container instanceof Element)) return;
				if (!markHandlers.has(container)) {
					const handler = (event) => {
						event.preventDefault();
						event.stopPropagation();
						pickMarkImage();
					};
					markHandlers.set(container, handler);
					container.addEventListener("dblclick", handler);
				}
				const src = effectiveMark();
				let img = container.querySelector(`img[${BRAND_MARK_IMG_ATTR}]`);
				if (img !== null && img.getAttribute("src") === src) return;
				if (img !== null) img.remove();
				// Drop whatever React rendered (the fish svg / slot fill) so the
				// mark shows only our icon; React restores it on re-render and
				// the observer re-injects, exactly like the headline text.
				container.textContent = "";
				img = document.createElement("img");
				img.setAttribute(BRAND_MARK_IMG_ATTR, "");
				img.src = src;
				img.width = BRAND_MARK_SIZE;
				img.height = BRAND_MARK_SIZE;
				img.alt = "";
				container.appendChild(img);
				if (!container.hasAttribute("title")) {
					const lang = typeof document !== "undefined" ? document.documentElement.lang : "";
					container.setAttribute("title", lang === "zh-CN" ? MARK_HINT_ZH : MARK_HINT_EN);
				}
				injectedMarks.add(container);
			};

			const syncAll = () => {
				for (const span of findHeadlines()) decorate(span);
				try {
					for (const container of findBrandMarkContainers()) injectBrandMark(container);
				} catch {
					/* icon failure must never break the rename */
				}
			};

			ctx.effect(() => () => {
				observer?.disconnect();
				for (const [span, handlers] of attached) {
					span.removeEventListener("dblclick", handlers.dblclick);
					span.removeEventListener("keydown", handlers.keydown);
					span.removeEventListener("blur", handlers.blur);
				}
				attached.clear();
				for (const [span, record] of decorated) restoreSpan(span, record);
				decorated.clear();
				for (const [container, handler] of markHandlers) {
					container.removeEventListener("dblclick", handler);
				}
				markHandlers.clear();
				for (const container of injectedMarks) {
					const img = container.querySelector(`img[${BRAND_MARK_IMG_ATTR}]`);
					if (img !== null) img.remove();
				}
				injectedMarks.clear();
				fileInput?.remove();
				styleTag?.remove();
			}, "dsh-hero-title: hero headline rename + brand mark");

			syncAll();

			observer = new MutationObserver((records) => {
				let heroTouched = false;
				for (const record of records) {
					if (record.type === "attributes") continue;
					const raw = record.type === "childList" ? record.addedNodes : [record.target];
					for (const node of raw) {
						if (node == null) continue;
						const el = node instanceof Element ? node : node.parentElement;
						if (el === null) continue;
						if (el.closest("[data-phase]") !== null || el.matches("[data-phase]") || el.matches(HEADLINE_TEXT_SELECTOR) || el.matches(BRAND_MARK_SELECTOR)) {
							heroTouched = true;
						}
					}
				}
				if (heroTouched) {
					syncAll();
				}
			});
			observer.observe(document.body, {
				childList: true,
				characterData: true,
				subtree: true,
			});
		}


		/**
		 * Composer placeholder customization (merged from
		 * dsh-web-custom-placeholder): a pencil button sits LEFT of the model
		 * selector in the composer; clicking it opens an editor for the
		 * new-session (hero) and existing-session placeholder texts. Values
		 * persist in localStorage; declarative config.hero / config.session
		 * act as fallbacks. Colors auto-match the surrounding surface (app
		 * theme variables first, luminance detection second); special composer
		 * states (workspace picker / plan / steer queue / offline) are never
		 * touched. All DOM/CSS writes are restored by its own ctx.effect
		 * disposer.
		 */
function applyComposerPlaceholder(ctx) {
const HERO_STORAGE_KEY = "dsh.web-custom-placeholder.hero";
		const SESSION_STORAGE_KEY = "dsh.web-custom-placeholder.session";
		const CSS_TAG_ID = "dsh-web-custom-placeholder/web-custom-placeholder.css";
		const MODE_ATTR = "data-cpp-mode";
		const CARD_SELECTOR = "div[data-composer-card]";
		// Shipped default placeholders we are allowed to override (zh/en).
		const HERO_DEFAULTS = new Set(["描述你想要构建的内容", "Describe what you want to build"]);
		const SESSION_DEFAULTS = new Set(["给智能体发消息", "Message the agent"]);
		const HERO_LABELS = { zh: "描述你想要构建的内容", en: "Describe what you want to build" };
		const SESSION_LABELS = { zh: "给智能体发消息", en: "Message the agent" };
		const PENCIL_SVG =
			'<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11.5 2.5l2 2L6.5 11.5 3 12l.5-3.5z"/></svg>';

		function isZh() {
			return typeof document !== "undefined" && document.documentElement.lang === "zh-CN";
		}
		function t(zh, en) {
			return isZh() ? zh : en;
		}
		function defaultLabel(mode) {
			const labels = mode === "hero" ? HERO_LABELS : SESSION_LABELS;
			return isZh() ? labels.zh : labels.en;
		}
		function modeFromPlaceholder(value) {
			if (HERO_DEFAULTS.has(value)) return "hero";
			if (SESSION_DEFAULTS.has(value)) return "session";
			return null;
		}

		const INJECTED_CSS = [
			// Pencil button, placed in the composer's trailing action row.
			`button[data-cpp-btn]{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;flex:none;margin-left:2px;border-radius:8px;border:1px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary,currentColor);opacity:.72;cursor:pointer;padding:0}`,
			`button[data-cpp-btn]:hover{opacity:1;background:color-mix(in srgb,currentColor 10%,transparent);border-color:var(--dsw-alias-border-l3,transparent)}`,
			// Editor popover (centered modal).
			//
			// Colors: every rule prefers the runtime-computed --cpp-* theme
			// (derived from the surrounding surface luminance) and falls back
			// to the app's OWN theme variables (--dsw-specific-menu surface,
			// --dsw-alias-label-* text, --dsw-alias-button-info-fill accent),
			// so the popover always matches the current skin/theme — light or
			// dark — with the app's tuned, high-contrast text colors.
			`div[data-cpp-panel]{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center}`,
			`div[data-cpp-panel][hidden]{display:none!important}`,
			`div[data-cpp-backdrop]{position:absolute;inset:0;background:var(--cpp-scrim,rgba(0,0,0,.38))}`,
			`div[data-cpp-box]{position:relative;width:min(430px,calc(100vw - 48px));background:var(--cpp-bg,var(--dsw-specific-menu,var(--dsw-alias-bg-layer-3,#ffffff)));color:var(--cpp-fg,var(--dsw-alias-label-primary,#1f2328));border-radius:12px;padding:16px 18px;box-shadow:0 12px 40px rgba(0,0,0,.28);font-family:var(--dsw-font-family,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei","Helvetica Neue",Helvetica,Arial,sans-serif);font-size:14px;line-height:22px}`,
			`div[data-cpp-box] h3{margin:0 0 12px;font:var(--dsw-font-s-strong-14,600 14px/22px var(--dsw-font-family))}`,
			`div[data-cpp-field]{margin:0 0 10px}`,
			`div[data-cpp-field] label{display:block;margin-bottom:4px;font:var(--dsw-font-xxs-12,12px/18px var(--dsw-font-family));color:var(--cpp-muted,var(--dsw-alias-label-secondary,inherit))}`,
			`div[data-cpp-field] input{width:100%;box-sizing:border-box;padding:8px 10px;border-radius:8px;border:1px solid var(--cpp-border,var(--dsw-alias-border-l3,rgba(128,128,128,.45)));background:var(--cpp-input-bg,var(--dsw-alias-bg-multi-select,var(--dsw-alias-bg-layer-1,transparent)));color:var(--cpp-fg,var(--dsw-alias-label-primary,#1f2328));font:var(--dsw-font-xs-13,13px/20px var(--dsw-font-family));outline:none}`,
			`div[data-cpp-field] input::placeholder{color:var(--cpp-muted,var(--dsw-alias-label-caption,rgba(128,128,128,.7)))}`,
			`div[data-cpp-field] input:focus{border-color:var(--cpp-accent,var(--dsw-alias-state-business-primary,#3b82f6));box-shadow:0 0 0 2px color-mix(in srgb,var(--cpp-accent,var(--dsw-alias-state-business-primary,#3b82f6)) 28%,transparent)}`,
			`div[data-cpp-actions]{display:flex;gap:8px;align-items:center;justify-content:flex-end;margin-top:14px}`,
			`div[data-cpp-actions] button{padding:6px 12px;border-radius:8px;font:var(--dsw-font-xs-13,13px/20px var(--dsw-font-family));cursor:pointer;border:1px solid var(--cpp-border,var(--dsw-alias-border-l3,rgba(128,128,128,.45)));background:transparent;color:var(--cpp-fg,var(--dsw-alias-label-primary,#1f2328))}`,
			`div[data-cpp-actions] button[data-cpp-reset]{margin-right:auto;color:var(--cpp-muted,var(--dsw-alias-label-secondary,inherit))}`,
			`div[data-cpp-actions] button[data-cpp-save]{background:var(--cpp-accent,var(--dsw-alias-button-info-fill,#3b82f6));border-color:transparent;color:var(--cpp-accent-fg,var(--dsw-alias-label-primary-foreground,#fff));font-weight:600}`,
		].join("\n");

		function injectCss() {
			if (typeof document === "undefined") return null;
			if (document.querySelector(`style[data-plugin-css="${CSS_TAG_ID}"]`) !== null) return null;
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-web-custom-placeholder";
			tag.dataset.pluginCss = CSS_TAG_ID;
			tag.textContent = INJECTED_CSS;
			document.head.appendChild(tag);
			return tag;
		}

		function readStored(key) {
			try {
				const v = localStorage.getItem(key);
				return typeof v === "string" ? v.trim() : "";
			} catch {
				return "";
			}
		}
		function writeStored(key, value) {
			try {
				if (value) localStorage.setItem(key, value);
				else localStorage.removeItem(key);
			} catch {
				/* private mode / quota — editing still works for the session */
			}
		}

		/** Parse "rgb(r,g,b)" / "rgba(r,g,b,a)" into { r, g, b, a } or null. */
		function parseRgb(str) {
			if (typeof str !== "string") return null;
			const m = /rgba?\(([^)]+)\)/i.exec(str.trim());
			if (m === null) return null;
			const parts = m[1].split(",").map((s) => parseFloat(s.trim()));
			if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null;
			return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
		}
		/** WCAG relative luminance of an {r,g,b} color (0..1). */
		function colorLuminance({ r, g, b }) {
			const f = (v) => {
				v /= 255;
				return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
			};
			return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
		}
		/** Extract the first color token out of a gradient background-image. */
		function gradientColor(bgImage) {
			if (typeof bgImage !== "string" || !bgImage.includes("gradient")) return null;
			const m = bgImage.match(/(?:rgba?\([^)]*\)|#[0-9a-fA-F]{3,8})/);
			if (m === null) return null;
			const tok = m[0];
			if (tok.startsWith("#")) {
				let h = tok.slice(1);
				if (h.length === 3 || h.length === 4) h = h.split("").map((ch) => ch + ch).join("");
				if (h.length !== 6 && h.length !== 8) return null;
				return {
					r: parseInt(h.slice(0, 2), 16),
					g: parseInt(h.slice(2, 4), 16),
					b: parseInt(h.slice(4, 6), 16),
					a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
				};
			}
			return parseRgb(tok);
		}
		/** Alpha-composite `front` over `back` (a = front alpha). */
		function blendColor(front, back, a) {
			const aa = Math.min(Math.max(a, 0), 1);
			return {
				r: Math.round(front.r * aa + back.r * (1 - aa)),
				g: Math.round(front.g * aa + back.g * (1 - aa)),
				b: Math.round(front.b * aa + back.b * (1 - aa)),
			};
		}
		/**
		 * The surrounding UI surface color: walks the composer card's ancestor
		 * chain up to <html>, compositing translucent backgrounds and picking
		 * up gradient layers, so the popover always matches the outside even
		 * when the page paints its background on :root (skins) or via images.
		 */
		function surfaceColor() {
			try {
				let start = document.querySelector(CARD_SELECTOR);
				if (!(start instanceof Element)) start = document.body;
				const chain = [];
				for (let n = start; n instanceof Element; n = n.parentElement) chain.push(n);
				chain.push(document.documentElement);
				// Composite from the back (html) toward the front (card).
				let base = null;
				for (let i = chain.length - 1; i >= 0; i--) {
					const cs = getComputedStyle(chain[i]);
					let layer = parseRgb(cs.backgroundColor);
					if (layer === null || layer.a <= 0.02) layer = gradientColor(cs.backgroundImage);
					if (layer === null) continue;
					if (base === null) base = { r: layer.r, g: layer.g, b: layer.b };
					else base = blendColor(layer, base, layer.a);
				}
				if (base !== null) return base;
			} catch {
				/* computed style unavailable */
			}
			// Last resort: the OS color scheme.
			try {
				if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) return { r: 24, g: 26, b: 30 };
			} catch {
				/* matchMedia unavailable */
			}
			return null;
		}
		/** Apply a light/dark theme to the popover based on the surface color. */
		function applyPanelTheme(panelEl) {
			const surface = surfaceColor();
			if (surface === null) return;
			const dark = colorLuminance(surface) < 0.35;
			const vars = {
				// The panel takes the external background color itself, so it
				// visually merges with the page behind it.
				"--cpp-bg": `rgba(${Math.round(surface.r)},${Math.round(surface.g)},${Math.round(surface.b)},.97)`,
				"--cpp-fg": dark ? "#f2f4f8" : "#1b1f24",
				"--cpp-muted": dark ? "rgba(242,244,248,.72)" : "rgba(27,31,36,.68)",
				"--cpp-border": dark ? "rgba(255,255,255,.22)" : "rgba(0,0,0,.18)",
				"--cpp-input-bg": dark ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.05)",
				"--cpp-accent": dark ? "#6aa9ff" : "#2563eb",
				"--cpp-accent-fg": dark ? "#0a1220" : "#ffffff",
				"--cpp-scrim": dark ? "rgba(0,0,0,.5)" : "rgba(0,0,0,.28)",
			};
			for (const [k, v] of Object.entries(vars)) panelEl.style.setProperty(k, v);
		}

		
			const configValue = (mode) => {
				try {
					const v = ctx && ctx.config && (mode === "hero" ? ctx.config.hero : ctx.config.session);
					return typeof v === "string" ? v.trim() : "";
				} catch {
					return "";
				}
			};
			const effective = (mode) => {
				return readStored(mode === "hero" ? HERO_STORAGE_KEY : SESSION_STORAGE_KEY) || configValue(mode);
			};

			const styleTag = injectCss();
			/** textarea -> { original, mode } (text we first saw before override). */
			const decorated = new Map();
			const attachedButtons = new Map();
			let panel = null;
			let heroInput = null;
			let sessionInput = null;
			let observer = null;
			let rafPending = false;

			const ui = {
				btnTitle: t("自定义提示文字", "Customize placeholder text"),
				panelTitle: t("自定义聊天框提示文字", "Customize chat placeholder"),
				heroLabel: t("新会话（无会话首页）", "New session (hero page)"),
				sessionLabel: t("已有会话", "Existing session"),
				save: t("保存", "Save"),
				cancel: t("取消", "Cancel"),
				reset: t("恢复默认", "Reset to default"),
			};

			/**
			 * Bring one textarea back to its pre-override placeholder and drop
			 * our bookkeeping (React will keep the shipped default from here).
			 */
			function restoreTextarea(ta) {
				const rec = decorated.get(ta);
				if (rec) {
					ta.setAttribute("placeholder", rec.original);
					decorated.delete(ta);
				}
				ta.removeAttribute(MODE_ATTR);
			}

			/** Override one composer textarea if its state is eligible. */
			function syncTextarea(ta) {
				if (!(ta instanceof Element) || ta.tagName !== "TEXTAREA") return;
				const current = ta.getAttribute("placeholder") ?? "";

				// Mode resolution order:
				//  1. current text equals one of our custom texts (re-apply that
				//     mode — covers React keeping our value across renders),
				//  2. current text is a shipped default (fresh render),
				//  3. surviving mode tag (React kept the node, text unknown).
				let mode = null;
				if (current !== "" && current === effective("hero")) mode = "hero";
				else if (current !== "" && current === effective("session")) mode = "session";
				else mode = modeFromPlaceholder(current);
				if (mode === null) {
					const tag = ta.getAttribute(MODE_ATTR);
					if (tag === "hero" || tag === "session") mode = tag;
				}
				if (mode === null) {
					// Special state (workspace picker / plan / steer queue /
					// parent offline / unavailable) — leave untouched.
					if (decorated.has(ta)) restoreTextarea(ta);
					return;
				}

				const custom = effective(mode);
				if (!custom) {
					// No custom text for this mode: show the shipped default.
					if (decorated.has(ta)) restoreTextarea(ta);
					else ta.removeAttribute(MODE_ATTR);
					return;
				}
				if (!decorated.has(ta)) decorated.set(ta, { original: current, mode });
				ta.setAttribute(MODE_ATTR, mode);
				if (current !== custom) ta.setAttribute("placeholder", custom);
			}

			/** Inject / re-inject the pencil button into one composer card. */
			function placeButton(card) {
				if (!(card instanceof Element)) return;
				let btn = card.querySelector("button[data-cpp-btn]");
				if (btn === null) {
					btn = document.createElement("button");
					btn.type = "button";
					btn.dataset.cppBtn = "";
					btn.title = ui.btnTitle;
					btn.setAttribute("aria-label", ui.btnTitle);
					btn.innerHTML = PENCIL_SVG;
					btn.addEventListener("click", openPanel);
					// Insert into the trailing action row, immediately LEFT of
					// the model selector ([data-slot="conversation.input.model"],
					// e.g. "DeepSeek-V4-Flash High"); fall back to the row end,
					// then the card root. React wipes the node on re-render and
					// the observer re-injects it — same as the title plugin.
					const trailing = card.querySelector("[class*='trailing']");
					const modelSlot = card.querySelector('[data-slot="conversation.input.model"]');
					if (trailing !== null) {
						if (modelSlot !== null && modelSlot.parentElement === trailing) trailing.insertBefore(btn, modelSlot);
						else trailing.appendChild(btn);
					} else card.appendChild(btn);
				}
				attachedButtons.set(card, btn);
			}

			function syncAll() {
				for (const card of document.querySelectorAll(CARD_SELECTOR)) {
					placeButton(card);
					const ta = card.querySelector("textarea");
					if (ta !== null) syncTextarea(ta);
				}
			}

			function buildPanel() {
				panel = document.createElement("div");
				panel.dataset.cppPanel = "";
				panel.hidden = true;
				panel.innerHTML = [
					`<div data-cpp-backdrop></div>`,
					`<div data-cpp-box role="dialog" aria-modal="true" aria-label="${ui.panelTitle}">`,
					`<h3>${ui.panelTitle}</h3>`,
					`<div data-cpp-field><label for="dsh-cpp-hero">${ui.heroLabel}</label><input id="dsh-cpp-hero" data-cpp-field="hero" type="text" /></div>`,
					`<div data-cpp-field><label for="dsh-cpp-session">${ui.sessionLabel}</label><input id="dsh-cpp-session" data-cpp-field="session" type="text" /></div>`,
					`<div data-cpp-actions><button type="button" data-cpp-reset>${ui.reset}</button><button type="button" data-cpp-cancel>${ui.cancel}</button><button type="button" data-cpp-save>${ui.save}</button></div>`,
					`</div>`,
				].join("");
				heroInput = panel.querySelector('input[data-cpp-field="hero"]');
				sessionInput = panel.querySelector('input[data-cpp-field="session"]');
				panel.querySelector("[data-cpp-backdrop]").addEventListener("click", closePanel);
				panel.querySelector("[data-cpp-cancel]").addEventListener("click", closePanel);
				panel.querySelector("[data-cpp-save]").addEventListener("click", savePanel);
				panel.querySelector("[data-cpp-reset]").addEventListener("click", resetDefaults);
				for (const input of [heroInput, sessionInput]) {
					input.addEventListener("keydown", (event) => {
						if (event.key === "Escape") {
							event.preventDefault();
							closePanel();
						} else if (event.key === "Enter") {
							event.preventDefault();
							savePanel();
						}
					});
				}
				document.body.appendChild(panel);
			}

			function openPanel() {
				if (panel === null) buildPanel();
				applyPanelTheme(panel);
				heroInput.value = readStored(HERO_STORAGE_KEY);
				sessionInput.value = readStored(SESSION_STORAGE_KEY);
				heroInput.placeholder = effective("hero") || defaultLabel("hero");
				sessionInput.placeholder = effective("session") || defaultLabel("session");
				panel.hidden = false;
				try {
					heroInput.focus();
					heroInput.select();
				} catch {
					/* focus API unavailable */
				}
			}

			function closePanel() {
				if (panel !== null) panel.hidden = true;
			}

			function savePanel() {
				writeStored(HERO_STORAGE_KEY, heroInput.value.trim());
				writeStored(SESSION_STORAGE_KEY, sessionInput.value.trim());
				closePanel();
				syncAll();
			}

			/** Clear both overrides, put the shipped defaults back, close. */
			function resetDefaults() {
				writeStored(HERO_STORAGE_KEY, "");
				writeStored(SESSION_STORAGE_KEY, "");
				for (const [ta, rec] of decorated) {
					ta.setAttribute("placeholder", defaultLabel(rec.mode === "session" ? "session" : "hero"));
					ta.removeAttribute(MODE_ATTR);
				}
				decorated.clear();
				closePanel();
				syncAll();
			}

			const scheduleSync = () => {
				if (rafPending) return;
				rafPending = true;
				requestAnimationFrame(() => {
					rafPending = false;
					syncAll();
				});
			};

			observer = new MutationObserver((records) => {
				for (const record of records) {
					if (record.type === "attributes") {
						if (
							record.attributeName === "placeholder" &&
							record.target instanceof Element &&
							record.target.tagName === "TEXTAREA"
						) {
							scheduleSync();
							return;
						}
						continue;
					}
					const raw = record.type === "childList" ? record.addedNodes : [record.target];
					for (const node of raw) {
						if (node == null) continue;
						const el = node instanceof Element ? node : node.parentElement;
						if (el === null) continue;
						if (
							el.matches(CARD_SELECTOR) ||
							el.closest(CARD_SELECTOR) !== null ||
							el.tagName === "TEXTAREA"
						) {
							scheduleSync();
							return;
						}
					}
				}
			});
			observer.observe(document.body, {
				childList: true,
				subtree: true,
				attributes: true,
				attributeFilter: ["placeholder"],
				characterData: true,
			});

			ctx.effect(() => () => {
				observer?.disconnect();
				for (const [ta] of decorated) {
					ta.setAttribute("placeholder", decorated.get(ta).original);
					ta.removeAttribute(MODE_ATTR);
				}
				decorated.clear();
				for (const [, btn] of attachedButtons) btn.remove();
				attachedButtons.clear();
				panel?.remove();
				panel = null;
				styleTag?.remove();
			}, "dsh-web-custom-placeholder: composer placeholder + pencil editor");

			const start = () => {
				syncAll();
			};
			if (typeof document !== "undefined" && document.readyState === "loading") {
				document.addEventListener("DOMContentLoaded", start, { once: true });
			} else {
				start();
			}
		}

		exports.apply = apply;
		return module.exports;
	},
});
