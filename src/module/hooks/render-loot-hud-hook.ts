import { log } from '../../main';
import { LootHud } from "../loot-hud-application";

// TODO: maybe this can go in loot hud class?
export function onRenderLootHud(hud: LootHud, hudHtml, tokenData) {
	log(` onRenderLootHud | called with args:`);
	log([hud, hudHtml, tokenData]);
	document.getElementById('hud')?.appendChild(hud.element[0]);
}
