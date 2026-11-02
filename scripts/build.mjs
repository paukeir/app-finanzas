import { mkdir, readFile, writeFile, cp, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const output = root + "dist/";
// Publish an explicit allowlist. Never recursively copy the checkout or .local.
await rm(output, { recursive: true, force: true });
await mkdir(output + "src", { recursive: true });
const html = await readFile(root + "index.html", "utf8");
await writeFile(output + "index.html", html);
for (const file of ["app.js", "core.js", "style.css"]) {
  await cp(root + "src/" + file, output + "src/" + file);
}
await writeFile(output + ".nojekyll", "");
console.log(
  "Web preparada en dist/: solo HTML, JavaScript y CSS; sin datos privados.",
);
