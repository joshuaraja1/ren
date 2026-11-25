import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

for (const page of ["index.html", "overlay.html"]) {
  const htmlPath = resolve("dist", page);
  const html = readFileSync(htmlPath, "utf8");
  const assets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map((match) => match[1]);
  if (!assets.some((asset) => asset.endsWith(".js"))) throw new Error(`${page} has no renderer script`);
  for (const asset of assets) {
    if (asset.startsWith("/") || !existsSync(fileURLToPath(new URL(asset, pathToFileURL(htmlPath))))) {
      throw new Error(`${page} cannot load ${asset} through file://`);
    }
  }
}
