import { LootHud } from "../loot-hud-application";

// TODO: maybe this can go in loot hud class?
export function onRenderLootHud(hud: LootHud, hudHtml, tokenData) {
	console.log(`pick-up-stix | onRenderLootHud | called with args:`);
	console.log([hud, hudHtml, tokenData]);
	document.getElementById('hud').appendChild(hud.element[0]);
}
