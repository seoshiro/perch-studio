import { mkdir, writeFile } from "node:fs/promises";
const directory = new URL("../src/assets/", import.meta.url);
await mkdir(directory, { recursive: true });
const font = await fetch(
  "https://raw.githubusercontent.com/google/fonts/main/ofl/manrope/Manrope%5Bwght%5D.ttf",
);
if (!font.ok) throw Error(`Font ${font.status}`);
await writeFile(
  new URL("Manrope.ttf", directory),
  new Uint8Array(await font.arrayBuffer()),
);
const license = await fetch(
  "https://raw.githubusercontent.com/google/fonts/main/ofl/manrope/OFL.txt",
);
if (!license.ok) throw Error("Font license unavailable");
await writeFile(
  new URL("../docs/Manrope-OFL.txt", import.meta.url),
  await license.text(),
);
console.log("Local Manrope font and OFL license saved.");
