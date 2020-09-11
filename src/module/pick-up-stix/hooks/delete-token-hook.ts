import { lootTokens } from "../main";

export function onDeleteToken(scene: Scene, tokenData: any, data: any, userId: string) {
	console.log(`pick-up-stix | onDeleteToken | called with args:`);
	console.log([scene, tokenData, data, userId]);
	lootTokens.findSplice(t => t === tokenData._id);
}
