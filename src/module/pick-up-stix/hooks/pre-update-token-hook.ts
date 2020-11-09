import { collidedTokens } from "../../../utils";
import { TokenFlags } from "../loot-token";
import { deleteToken, getLootToken, handleItemDropped } from "../main";

export const preUpdateTokenHook = async (scene, tokenData, updates, options, userId): Promise<boolean> => {
	console.log(`pick-up-stix | preUpdateTokenHook:`);
	console.log([scene, tokenData, updates, options, userId]);

	if (updates.y === undefined && updates.x === undefined) {
		return true;
	}

	let tokens = collidedTokens({ x: updates.x ?? tokenData.x, y: updates.y ?? tokenData.y });
	tokens = tokens.filter(t => t.id !== tokenData._id);

	if (tokens.length > 1) {
		ui.notifications.error('You can drop an item onto one and only one target');
		return false;
	}
	else if (tokens.length === 0) {
		return;
	}

	const lt = getLootToken({ sceneId: scene.id, tokenId: tokenData._id })?.[0];

	if (!lt) {
		console.error(`pick-up-stix | updateTokenHook | not LootToken found for token '${tokenData._id}' in scene '${scene.id}'`);
		return true;
	}

	const tokenFlags: TokenFlags = getProperty(tokenData, 'flags.pick-up-stix.pick-up-stix');

	if (!tokenFlags) {
		console.error(`pick-up-stix | updateTokenHook | Token '${tokenData._id}' has no token flags`);
		return true;
	}

	const item = await fromUuid(tokenFlags.itemUuid);

	const itemDropSuccess = await handleItemDropped({ x: updates.x ?? tokenData.x, y: updates.y ?? tokenData.y, type: item.data.type, id: item.id });

	if (itemDropSuccess) {
		await deleteToken(tokenData._id, scene.id);
	}

	return false;
}
