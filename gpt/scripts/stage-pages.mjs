// Only copy public runtime files. Never copy local records, tests, or backups.
import { cp, mkdir, access, rm } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const source = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export async function stagePages(output = resolve("site")) {
  // Require the existing Claude build; do not replace its root entry point.
  await access(join(output, "index.html"));
  const target = join(output, "prism");
  const files = [
    "index.html",
    "styles.css",
    "app.js",
    "components/ui.js",
    "services/storage.js",
    "services/portfolio.js",
    "services/market.js",
    "data/catalog.js",
    "config/app.js",
  ];
  for (const file of files) await access(join(source, file));
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  for (const file of files) {
    await mkdir(dirname(join(target, file)), { recursive: true });
    await cp(join(source, file), join(target, file));
  }
  return target;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await stagePages();
  console.log("PRISM runtime staged at site/prism/; Claude root preserved.");
}
