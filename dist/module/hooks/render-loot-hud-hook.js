import { log } from "../../main.js";
// TODO: maybe this can go in loot hud class?
export function onRenderLootHud(hud, hudHtml, tokenData) {
    log(` onRenderLootHud | called with args:`);
    log([hud, hudHtml, tokenData]);
    document.getElementById('hud')?.appendChild(hud.element[0]);
}
