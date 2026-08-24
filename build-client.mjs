/**
 * Build the dsh-hero-title client bundle.
 * Reads src/client.js, injects the base64 data URL of assets/hero-mark.png
 * into the @@HERO_MARK_DATA_URL@@ placeholder, and writes lib/client.js
 * (the served distribution output). Run: node build-client.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(root, "src", "client.js"), "utf8");
const png = readFileSync(join(root, "assets", "hero-mark.png"));
const dataUrl = "data:image/png;base64," + png.toString("base64");

const placeholder = '"@@HERO_MARK_DATA_URL@@"';
if (!source.includes(placeholder)) {
  throw new Error("src/client.js is missing the @@HERO_MARK_DATA_URL@@ placeholder");
}

const built = source.replace(placeholder, JSON.stringify(dataUrl));
const outPath = join(root, "lib", "client.js");
writeFileSync(outPath, built);
console.log(`wrote ${outPath} (${built.length} bytes, asset ${dataUrl.length} chars)`);
