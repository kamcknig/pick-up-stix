import { error, log } from "../../../log";
import { collidedTokens } from "../../../utils";
import { TokenFlags } from "../loot-token";
import { deleteToken, getLootToken, handleItemDropped, normalizeDropData } from "../main";

/**
 * One thing we want to check before a token is updated would be if the x or y positions are changing. If they are
 * then we could be moving the token onto another token and in that case we want to check if it's a valid drop target
 *
 * @param scene
 * @param tokenData
 * @param updates
 * @param options
 * @param userId
 * @returns True if the token should update should proces, false if it should not
 */
export const preUpdateTokenHook = async (scene, tokenData, updates, options, userId): Promise<boolean> => {
	log(` preUpdateTokenHook:`);
	log([scene, tokenData, updates, options, userId]);

	const tokenFlags: TokenFlags = getProperty(tokenData, 'flags.pick-up-stix.pick-up-stix');

	// if the x or y positions are not being updated or the token doesn't have an itemId flag, then we don't care
	if ((updates.y === undefined && updates.x === undefined) || !tokenFlags?.itemId) {
		return true;
	}

	// get any tokens that are under the new position
	let tokens = collidedTokens({ x: updates.x ?? tokenData.x, y: updates.y ?? tokenData.y });

	// filter out the token being updated
	tokens = tokens.filter(t => t.id !== tokenData._id);

	if (tokens.length > 1) {
		// if we are dropping it onto more than one token, then we can't know which to drop it onto, notify the user
		ui.notifications.error('You can drop an item onto one and only one target');
		return false;
	}
	else if (tokens.length === 0) {
		// if we're not dropping it onto a token, then we don't care
		return true;
	}

	const item = game.items.get(tokenFlags.itemId);

	const itemDropSuccess = await handleItemDropped(await normalizeDropData({ x: updates.x ?? tokenData.x, y: updates.y ?? tokenData.y, type: item.data.type, id: item.id }));

	if (itemDropSuccess) {
		await deleteToken(tokenData._id, scene.id);
	}

	return false;
}
