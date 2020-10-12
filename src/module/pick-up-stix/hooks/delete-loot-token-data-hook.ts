import { LootToken } from "../loot-token";
import { lootTokens } from "../main";
import { PickUpStixFlags } from "../models";

export function deleteLootTokenDataHook(lootTokenData, sceneId, tokenId, lootData: PickUpStixFlags) {
	console.log(`pick-up-stix | deleteTokenHook | called with args:`);
	console.log([lootTokenData, sceneId, tokenId, lootData]);
	lootTokens?.findSplice((t: LootToken) => t.sceneId === sceneId && t.tokenId === tokenId)
}
