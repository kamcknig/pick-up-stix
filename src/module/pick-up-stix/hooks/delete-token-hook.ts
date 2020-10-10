import { LootToken } from "../loot-token";
import { lootTokens } from "../main";

export function deleteTokenHook(scene: Scene, tokenData: any, data: any, userId: string) {
	console.log(`pick-up-stix | deleteTokenHook | called with args:`);
	console.log([scene, tokenData, data, userId]);
	lootTokens?.findSplice((t: LootToken) => t.sceneId === scene.id && t.tokenId === tokenData._id)
}
