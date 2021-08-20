import { log } from "../../../log.js";
// TODO: maybe this can go in loot hud class?
export function onRenderLootHud(hud, hudHtml, tokenData) {
    log(`pick-up-stix | onRenderLootHud | called with args:`);
    log([hud, hudHtml, tokenData]);
    document.getElementById('hud').appendChild(hud.element[0]);
}

//# sourceMappingURL=../../../maps/module/pick-up-stix/hooks/render-loot-hud-hook.js.map
