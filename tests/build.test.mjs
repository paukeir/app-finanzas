import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
test("publicación estática usa una lista explícita sin CSV ni datos privados", async () => {
  await import("../scripts/build.mjs?test=" + Date.now());
  assert.deepEqual(readdirSync(root + "dist").sort(), [
    ".nojekyll",
    "index.html",
    "src",
  ]);
  assert.deepEqual(readdirSync(root + "dist/src").sort(), [
    "app.js",
    "core.js",
    "style.css",
  ]);
  for (const file of ["app.js", "core.js", "style.css"])
    assert.equal(
      readFileSync(root + "dist/src/" + file, "utf8"),
      readFileSync(root + "src/" + file, "utf8"),
    );
  const html = readFileSync(root + "dist/index.html", "utf8");
  assert.match(html, /href="\.\/src\/style.css"/);
  assert.match(html, /src="\.\/src\/app.js"/);
  assert.ok(!html.includes(".local/historico.csv"));
});
