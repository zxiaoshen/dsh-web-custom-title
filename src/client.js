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

		exports.apply = apply;
		return module.exports;
	},
});
