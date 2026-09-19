/** Reuse the game's approved vector character kit; no third-party game art. */
import fs from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CelCharacter } from "../client/src/components/ui/cel-character";
(globalThis as any).React = React;
const variants = [
  { skinTone: "tan", hairStyle: "fade", headwear: "cap", jerseyColor: "#224d3b" },
  { skinTone: "dark", hairStyle: "curly", jerseyColor: "#224d3b" },
  { skinTone: "light", hairColor: "brown", hairStyle: "medium", jerseyColor: "#ddd4b7" },
  { skinTone: "olive", hairColor: "black", hairStyle: "short", coach: true },
];
fs.mkdirSync("docs/art-direction/pc-sports/assets", { recursive: true });
variants.forEach((props, index) => fs.writeFileSync("docs/art-direction/pc-sports/assets/player-" + index + ".svg", renderToStaticMarkup(<CelCharacter {...props} />).replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ')));
console.log("Exported four study portraits from the existing character kit.");
