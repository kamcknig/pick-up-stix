import { log } from '../../log';
import {
	collidedTokens,
	getActorCurrencyPath,
	getCurrencyTypes,
	getPriceDataPath,
	getQuantityDataPath,
	getWeightDataPath
} from '../../utils';
import {
	ContainerLoot,
	ItemData,
	ItemFlags,
	LootToken,
	TokenData,
	TokenFlags
} from "./loot-token";
import {
	DropData,
	ItemType,
	PickUpStixHooks,
	SocketMessage,
	SocketMessageType
} from "./models";
import { gmActionTimeout, SettingKeys } from "./settings";

export const lootTokens: LootToken[] = [];
window['lootTokens'] = lootTokens;

export type CreateLootToken = {
	(tokenData: string, itemData: string, notify?: boolean): Promise<LootToken>;
	(tokenData: TokenData, itemData: string, notify?: boolean): Promise<LootToken>;
	(tokenData: TokenData, itemData: ItemData, notify?: boolean): Promise<LootToken>;
}

export const getLootToken = (options: { itemId?: string, tokenId?: string, sceneId?: string }): LootToken[] => {
	if (!options.itemId && !options.tokenId && !options.sceneId) {
		throw new Error('Must provide itemId, tokenId or sceneId');
	}

	return lootTokens.filter(lt => {
		if (options.itemId && options.itemId !== lt.itemId) {
			return false;
		}

		if (options.sceneId && options.sceneId !== lt.sceneId) {
			return false;
		}

		if (options.tokenId && options.tokenId !== lt.tokenId) {
			return false;
		}

		return true;
	});
};

/**
 * @param data Either a Token or a Token ID
 */
export const getValidControlledTokens = (data: string | Token): Token[] => {
	log(`pick-up-stix | getValidControlledTokens:`);
	log([data]);

	let token: Token;

	if (typeof data === 'string') {
		token = canvas.tokens.placeables.find(p => p.id === data);
	}
	else {
		token = data;
	}

	if (!token) {
		log(`pick-up-stix | getValidControlledTokens | no token provided so returning nothing`);
		return [];
	}

	log(`pick-up-stix | getValidControlledTokens | Looking for tokens near '${token.id}' '${token.name}`);

	log(`pick-up-stix | getValidControlledTokens | looping through currently controlled tokens`);
	log([canvas.tokens.controlled]);

	const controlled = canvas.tokens.controlled.filter(t => {
		if (!t.actor) {
			log(`pick-up-stix | getValidControlledTokens | token '${t.id}' '${t.name}' has no actor, skipping`);
			return false;
		}

		return (
			t.x + t.w > token.x - canvas.grid.size &&
			t.x < token.x + token.w + canvas.grid.size &&
			t.y + t.h > token.y - canvas.grid.size &&
			t.y < token.y + token.h + canvas.grid.size
		);
	});

	log(`pick-up-stix | getValidControlledTokens | controlled tokens within range`);
	log([controlled]);
	return controlled;
}

export const normalizeDropData = async (data: Partial<DropData>): Promise<DropData> => {
	log('pick-up-stix | normalizeDropData called with args:');
	log([data]);

	if (data.actorId) {
		data.actor = data.tokenId ? game.actors.tokens[data.tokenId] : game.actors.get(data.actorId);
	}

	const pack: any = data.pack ? game.packs.get(data.pack) : null;
	const id: string = data.id;
	data.data = data.actor
		? data.data
		: (
			pack
				? (await pack.getEntity(id))?.data
				: game.items.get(id)?.data
		);

	// if it's not a container, then we can assume it's an item. Create the item token
	const hg = canvas.dimensions.size * .5;
	const { x, y } = canvas.grid.getSnappedPosition(data.x - hg, data.y - hg, 1);
	data.gridX = x;
	data.gridY = y;

	return data as DropData;
}

/**
 * Handles data dropped onto the canvas.
 *
 * @param dropData
 */
export async function handleItemDropped(dropData: DropData): Promise<boolean> {
	log(`pick-up-stix | handleItemDropped | called with args:`);
	log(dropData);

	// The data here should already be normalized, meaning that if we were able to determine the actor reference,
	// it should exist here. So if we have an actor ID but no actor, that means we weren't able to figure out
	// which actor this item might have come from.
	if (dropData.actorId && !dropData.actor) {
		ui.notifications.error(`Please ensure you are only controlling the token (and only the one token) for the character you're working with.`);
		return false;
	}

	// loop through placeables on the map and see if it's being dropped onto a token
	const targetTokens = collidedTokens({ x: dropData.x, y: dropData.y });

	if (targetTokens.length > 1) {
		ui.notifications.error('You can drop an item onto one and only one target');
		return false;
	}

	const targetToken = targetTokens?.[0];

	return targetToken
		? dropItemOnToken({ targetTokenId: targetToken.id, dropData })
		: dropItemOnCanvas({ dropData });
}

const dropItemOnCanvas = async ({ dropData }) => {
	log(`pick-up-stix | dropItemOnCanvas:`);
	log([dropData]);

	let itemData: any = duplicate(dropData.data);
	let lootTokens: LootToken[] = getLootToken({ itemId: itemData._id });

	let tokenData: TokenData = mergeObject(
		{
			name: itemData.name,
			disposition: 0,
			img: itemData.img,
			width: 1,
			height: 1,
			x: dropData.gridX,
			y: dropData.gridY,
			flags: {
				'pick-up-stix': {
					'pick-up-stix': {
						isOpen: false
					}
				}
			}
		},
		{
			...itemData.flags?.['pick-up-stix']?.['pick-up-stix']?.tokenData ?? {}
		}
	);

	mergeObject(itemData, {
		flags: {
			'pick-up-stix': {
				'pick-up-stix': {
					tokenData: {
						width: itemData.flags?.['pick-up-stix']?.['pick-up-stix']?.tokenData?.width ?? 1,
						height: itemData.flags?.['pick-up-stix']?.['pick-up-stix']?.tokenData?.height ?? 1
					}
				}
			}
		}
	});

	const droppedItemFlags: ItemFlags = getProperty(itemData, 'flags.pick-up-stix.pick-up-stix');

	// if the item being dropped is a container, just create the empty container
	if (droppedItemFlags?.itemType === ItemType.CONTAINER) {
		log(`pick-up-stix | dropItemOnCanvas | dropped item is a container`);
		const img: string = droppedItemFlags.container.imageClosePath;

		return lootTokens.length > 0
			? !!await createLootToken(tokenData, lootTokens[0].itemId)
			: !!await createLootToken(tokenData, {
				_id: itemData._id,
				name: itemData.name,
				img,
				folder: game.settings.get('pick-up-stix', SettingKeys.tokenFolderId),
				type: ItemType.CONTAINER,
				flags: {
					'pick-up-stix': {
						'pick-up-stix': {
							...droppedItemFlags
						}
					}
				}
			} as ItemData);
	}

	log(`pick-up-stix | dropItemOnCanvas | Dropped item is not a container`);

	// if we don't have any loot tokens already associated with the item, we'll create a new
	// loot token
	if (!dropData.actor) {
		log(`pick-up-stix | dropItemOnCanvas | Dropped item comes from an actor`);

	 	if (lootTokens.length === 0) {
			log(`pick-up-stix | dropItemOnCanvas | No LootTokens for the dropped item currently`);
			const lootType = await chooseLootTokenType();

			if (lootType === ItemType.ITEM) {
				return !!await createLootToken(
					tokenData,
					mergeObject(itemData, {
						flags: {
							'pick-up-stix': {
								'pick-up-stix': {
									itemType: ItemType.ITEM
								}
							}
						}
					})
				);
			}
			else if (lootType === ItemType.CONTAINER) {
				const img: string = game.settings.get('pick-up-stix', SettingKeys.closeImagePath);

				return !!await createLootToken(
					{ ...tokenData, img },
					{
						name: 'Empty Container',
						img,
						type: ItemType.CONTAINER,
						flags: {
							'pick-up-stix': {
								'pick-up-stix': {
									tokenData: mergeObject({
										disposition: 0,
										width: itemData.flags?.['pick-up-stix']?.['pick-up-stix']?.tokenData?.width ?? 1,
										height: itemData.flags?.['pick-up-stix']?.['pick-up-stix']?.tokenData?.height ?? 1,
										name: 'Empty Container',
										img
									}, {  ...tokenData, img } ),
									itemType: ItemType.CONTAINER,
									container: {
										currency: Object.keys(getCurrencyTypes()).reduce((acc, shortName) => ({ ...acc, [shortName]: 0 }), {}),
										imageClosePath: img,
										imageOpenPath: game.settings.get('pick-up-stix', SettingKeys.openImagePath),
										soundOpenPath: game.settings.get('pick-up-stix', SettingKeys.defaultContainerOpenSound),
										soundClosePath: game.settings.get('pick-up-stix', SettingKeys.defaultContainerCloseSound),
										loot: game.settings.get('pick-up-stix', SettingKeys.addItemOnContainerCreation)
											? {
													[itemData.type]: [
														mergeObject(
															itemData,
															{
																...expandObject({
																	data: {
																		[getQuantityDataPath()]: 1
																	}
																})
															}
														)
													]
											}
											: null
									}
								}
							}
						}
					} as ItemData
				)
			}
		}
		else {
			log(`pick-up-stix | dropItemOnCanvas | LootTokens for the dropped item already exist, create new token with same item data`);
			// we already have loot tokens, so create a new loot token but use the previous item ID
			return !!await createLootToken(
				{ ...tokenData },
				itemData._id
			);
		}
	}

	log(`pick-up-stix | dropItemOnCanvas | Dropped data comes from actor '${dropData.actor.name}', delete it first`);
	await deleteOwnedItem(dropData.actor.id, itemData._id);

	return !!await createLootToken(
		{ ...tokenData },
		mergeObject(itemData, {
			flags: {
				'pick-up-stix': {
					'pick-up-stix': {
						itemType: ItemType.ITEM
					}
				}
			}
		})
	);
}

const chooseLootTokenType = (): Promise<ItemType> => {
	log(`pick-up-stix | chooseLootTokenType | creating dialog`);
	return new Promise(resolve => {
		// render the item type selection form
		new Dialog({
			content: 'What kind of loot is this?',
			default: 'one',
			title: 'Loot Type',
			buttons: {
				one: {
					icon: '<i class="fas fa-box"></i>',
					label: 'Item',
					callback: async () => {
						log(`pick-up-stix | chooseLootTokenType | '${ItemType.ITEM}' type chosen`);
						resolve(ItemType.ITEM);
					}
				},
				two: {
					icon: '<i class="fas fa-boxes"></i>',
					label: 'Container',
					callback: async () => {
						log(`pick-up-stix | chooseLootTokenType | '${ItemType.CONTAINER}' type chosen`);
						resolve(ItemType.CONTAINER);
					}
				}
			}
		}).render(true);
	});
}

export const createLootToken: CreateLootToken = async (tokenData: any, itemData: any, notify: boolean=true) => {
	log(`pick-up-stix | createLootToken:`)
	log([tokenData, itemData, notify]);

	if (game.user.isGM) {
		if (typeof itemData === 'object') {
			itemData = await createItem({
				...itemData,
				permission: {
					default: 2
				},
				folder: game.settings.get('pick-up-stix', SettingKeys.tokenFolderId),
			});
		}

		if (typeof tokenData === 'object') {
			tokenData = await createToken({
				...tokenData,
				flags: {
					'pick-up-stix': {
						'pick-up-stix': {
							itemId: itemData
						}
					}
				}
			});
		}
	}

	const t = new LootToken(tokenData, itemData);
	lootTokens.push(t);

	if (notify) {
		const msg: SocketMessage = {
			sender: game.user.id,
			type: SocketMessageType.lootTokenCreated,
			data: {
				tokenId: tokenData
			}
		}
		game.socket.emit('module.pick-up-stix', msg);
		Hooks.callAll(PickUpStixHooks.lootTokenCreated, msg.data.tokenId);
	}

	return t;
}

export const deleteToken = async (tokenId: string, sceneId: string): Promise<string> => {
	log(`pick-up-stix | deleteToken with args:`);
	log([tokenId, sceneId]);

	if (game.user.isGM) {
		log(`pick-up-stix | deleteToken | user is GM, deleting token '${tokenId}' from scene '${sceneId}'`);
		const scene = Scene.collection.get(sceneId);
		const { _id } = await scene?.deleteEmbeddedEntity('Token', tokenId);
		return _id;
	}

	return new Promise((resolve) => {
		const timeout = setTimeout(() => {
			resolve(null);
		}, gmActionTimeout());

		const msg: SocketMessage = {
			sender: game.user.id,
			type: SocketMessageType.deleteToken,
			data: {
				tokenId,
				sceneId
			}
		}

		Hooks.once('deleteToken', (scene, data, options, userId) => {
			log(`pick-up-stix | deleteToken | deleteToken hook`);
			clearTimeout(timeout);
			resolve(data._id);
		});

		log(`pick-up-stix | deleteToken | user is not GM, sending socket msg:`);
		log([msg]);
		game.socket.emit('module.pick-up-stix', msg);
	});
}

export async function updateToken(sceneId: string, updates: { _id: string; [key: string]: any } | { _id: string; [key: string]: any }[]): Promise<{ tokenId: string; sceneId: string }> {
	log(`pick-up-stix | updateToken with args:`);
	log([sceneId, updates]);

	if (game.user.isGM) {
		log(`pick-up-stix | updateToken | user is GM, making update`);
		const { _id } = await Scene.collection.get(sceneId).updateEmbeddedEntity('Token', updates);
		return { tokenId: _id, sceneId: sceneId };
	}

	const msg: SocketMessage = {
		sender: game.user.id,
		type: SocketMessageType.updateToken,
		data: {
			sceneId,
			updates
		}
	}

	return new Promise(resolve => {
		const timeout = setTimeout(() => {
			resolve(null);
		}, gmActionTimeout());

		Hooks.once('updateToken', (scene, tokenData, options, userId) => {
			log(`pick-up-stix | updateToken | updateToken hook`);
			clearTimeout(timeout);
			resolve({ tokenId: tokenData._id, sceneId });
		});

		log(`pick-up-stix | updateToken | user is not GM, sending socket msg:`);
		log([msg]);

		game.socket.emit('module.pick-up-stix', msg);
	});
}

export async function updateItem(id, updates): Promise<string> {
	log(`pick-up-stix | updateItem:`);
	log([id, updates]);

	if (game.user.isGM) {
		log('pick-up-stix | updateItem | user is GM, making update');
		const entity = game.items.get(id);
		const { _id } = await entity.update(updates, {});
		return _id;
	}

	return new Promise(resolve => {
		const timeout = setTimeout(() => {
			resolve(null);
		}, gmActionTimeout());

		const msg: SocketMessage = {
			sender: game.user.id,
			type: SocketMessageType.updateItem,
			data: {
				id,
				updates
			}
		};

		Hooks.once('updateItem', (entity, data, options, userId) => {
			log(`pick-up-stix | updateItem | updateItem hook`);
			clearTimeout(timeout);
			resolve(entity.id);
		});

		log(`pick-up-stix | updateItem | user is not GM, sending socket msg:`);
		log([msg]);

		game.socket.emit('module.pick-up-stix', msg);
	});
}

export async function updateActor(actor: Actor, updates): Promise<string> {
	log('pick-up-stix | updateActor | called with args:');
	log([actor, updates]);

	if (game.user.isGM) {
		log(`pick-up-stix | updateActor | user is GM, udating actor`);
		const { _id } = await actor.update(updates);
		return _id;
	}

	return new Promise((resolve) => {
		const timeout = setTimeout(() => {
			resolve(null);
		}, gmActionTimeout());

		const msg: SocketMessage = {
			sender: game.user.id,
			type: SocketMessageType.updateActor,
			data: {
				actorId: actor.id,
				updates
			}
		};

		Hooks.once('updateActor', (actor, data, options, userId) => {
			log(`pick-up-stix | updateActor | updateActor hook`);
			clearTimeout(timeout);
			resolve(actor.id);
		});

		log(`pick-up-stix | updateActor | user is not GM, sending socket msg:`);
		log([msg]);

		game.socket.emit('module.pick-up-stix', msg);
	});
}

export async function createOwnedItem(actorId: string, data: any | any[]): Promise<boolean> {
	log('pick-up-stix | createOwnedItem | called with args:');
	data = Array.isArray(data) ? data : [data];
	log([actorId, data]);

	const actor = game.actors.get(actorId);

	if (game.user.isGM) {
		log(`pick-up-stix | createOwnedItem | user is GM, creating owned item`);
		await actor.createOwnedItem(data);
		return true;
	}

	return new Promise((resolve) => {
		const timeout = setTimeout(() => {
			resolve(false);
		}, gmActionTimeout());

		const msg: SocketMessage = {
			sender: game.user.id,
			type: SocketMessageType.createOwnedItem,
			data: {
				actorId,
				items: data
			}
		};

		Hooks.once('createOwnedItem', (actor, item, options, userId) => {
			log(`pick-up-stix | createOwnedItem | createOwnedItem hook | item '${item._id}' created`);
			clearTimeout(timeout);
			resolve(true);
		});

		log(`pick-up-stix | createOwnedItem | user is not GM, sending socket msg:`);
		log([msg]);

		game.socket.emit('module.pick-up-stix', msg);
	});
}

/**
 *
 * @param data
 * @param options
 *
 * @returns The ID of the Item entity created or null if it was not created
 */
export const createItem = async (data: any, options: any = {}): Promise<string> => {
	log(`pick-up-stix | createItem | called with args:`);
	log([data]);

	if (game.user.isGM) {
		log(`pick-up-stix | | createItem | user is GM, creating entity`);
		const e = await Item.create(data, options);
		return e.id;
	}

	return new Promise((resolve) => {
		const timeout = setTimeout(() => {
			resolve(null);
		}, gmActionTimeout());

		const msg: SocketMessage = {
			sender: game.user.id,
			type: SocketMessageType.createItem,
			data: {
				data,
				options
			}
		};

		Hooks.once('createItem', (item, options, userId) => {
			log(`pick-up-stix | createItem | createItem hook | item '${item.id}' created`);
			clearTimeout(timeout);
			resolve(item.id);
		});

		log(`pick-up-stix | createItem | user is not GM, sending socket msg:`);
		log([msg]);

		game.socket.emit('module.pick-up-stix', msg);
	});
}

export const deleteOwnedItem = async (actorId: string, itemId: string): Promise<{ actorId: string; itemId: string }> => {
	log('pick-up-stix | deleteOwnedItem | called with args:');
	log([actorId, itemId]);

	if (game.user.isGM) {
		log(`pick-up-stix | deleteOwnedItem | user is GM, deleting owned item`);
		const actor = game.actors.get(actorId);
		await actor.deleteOwnedItem(itemId);
		return { actorId, itemId };
	}

	const msg: SocketMessage = {
		sender: game.user.id,
		type: SocketMessageType.deleteOwnedItem,
		data: {
			actorId,
			itemId
		}
	}

	return new Promise((resolve) => {
		const timeout = setTimeout(() => {
			resolve(null);
		}, gmActionTimeout());

		Hooks.once('deleteOwnedItem', (actor, itemData, options, userId) => {
			log('pick-up-stix | deleteOwnedItem | deleteOwnedItem hook');
			clearTimeout(timeout);
			resolve({ actorId, itemId });
		});

		log('pick-up-stix | deleteOwnedItem | user is not GM, sending socket msg:');
		log([msg]);

		game.socket.emit('module.pick-up-stix', msg);
	});
}

export const deleteItem = async (id: string): Promise<string> => {
	log('pick-up-stix | deleteItem | called with args:');
	log([id]);

	const e = game.items.get(id);

	if (!e) {
		log(`pick-up-stix | deleteItem | Item '${id}' not found`);
		return null;
	}

	if (game.user.isGM) {
		log(`pick-up-stix | deleteItem | user is GM, deleting entity`);
		return await e.delete();
	}

	const msg: SocketMessage = {
		sender: game.user.id,
		type: SocketMessageType.deleteItem,
		data: {
			id
		}
	}

	return new Promise((resolve) => {
		const timeout = setTimeout(() => {
			resolve(null);
		}, gmActionTimeout());

		Hooks.once('deleteItem', (item, options, userId) => {
			log('pick-up-stix | deleteItem | deleteItem hook');
			clearTimeout(timeout);
			resolve(item.id);
		});

		log(`pick-up-stix | deleteItem | user is not GM, sending socket msg:`);
		log([msg]);

		game.socket.emit('module.pick-up-stix', msg);
	});
}

export const updateOwnedItem = async (actorId, data): Promise<{ actorId: string; id: string}> => {
	log('pick-up-stix | updateOwnedItem | called with args:');
	log([actorId, data]);

	const actor = game.actors.get(actorId);

	if (!actor) {
		log(`pick-up-stix | updateOwnedItem | Actor '${actorId}' not found`);
		return null;
	}

	if (game.user.isGM) {
		log(`pick-up-stix | updateOwnedItem | user is GM, updating embedded entity`);
		const { _id } = await actor.updateOwnedItem(data);
		return { actorId: actor.id, id: _id };
	}

	const msg: SocketMessage = {
		sender: game.user.id,
		type: SocketMessageType.updateOwnedItem,
		data: {
			actorId,
			data
		}
	}

	return new Promise((resolve) => {
		const timeout = setTimeout(() => {
			resolve(null);
		}, gmActionTimeout());

		Hooks.once(`updateOwnedItem`, (parent, data, update, options, userId) => {
			log(`pick-up-stix | updateOwnedItem | updateOwnedItem hook`);
			clearTimeout(timeout);
			resolve({ actorId: parent.id, id: data._id });
		});

		log('pick-up-stix | updateOwnedItem | user is not GM, sending socket msg');
		log([msg]);

		game.socket.emit('module.pick-up-stix', msg);
	})

}

export const createToken = async (data: any): Promise<string> => {
	log(`pick-up-stix | createToken | called with args:`);
	log([data]);

	if (game.user.isGM) {
		log(`pick-up-stix | createToken | user is GM, creating token`);
		const t = await Token.create({
			...data
		});
		return t.id;
	}

	const msg: SocketMessage = {
		sender: game.user.id,
		type: SocketMessageType.createToken,
		data
	}

	return new Promise((resolve) => {
		const timeout = setTimeout(() => {
			resolve(null);
		}, gmActionTimeout());

		Hooks.once('createToken', (scene, data) => {
			log(`pick-up-stix | createToken | createToken hook | Token '${data.id}' created`);
			clearTimeout(timeout);
			resolve(data._id);
		});

		log('pick-up-stix | createToken | user is not GM, sending socket msg:');
		log([msg]);

		game.socket.emit('module.pick-up-stix', msg);
	});
}

export const dropItemOnToken = async ({ dropData, targetTokenId }: { dropData: DropData, targetTokenId: string }): Promise<boolean> => {
	log(`pick-up-stix | dropItemOnToken:`);
	log([dropData, targetTokenId]);

	if (!game.user.isGM) {
		return new Promise(resolve => {
			const timeout = setTimeout(() => {
				resolve(null);
			}, gmActionTimeout());

			const msg: SocketMessage = {
				type: SocketMessageType.dropItemOnToken,
				sender: game.user.id,
				data: {
					dropData,
					targetTokenId
				}
			}

			game.socket.emit('module.pick-up-stix', msg);
		});
	}

	const targetToken: Token = canvas.tokens.placeables.find(p => p.id === targetTokenId);
	const targetTokenFlags: TokenFlags = targetToken.getFlag('pick-up-stix', 'pick-up-stix');
	const targetTokenItem = game.items.get(targetTokenFlags?.itemId);
	const targetTokenItemFlags: ItemFlags = targetTokenItem?.getFlag('pick-up-stix', 'pick-up-stix');

	if (!targetToken?.actor && targetTokenItemFlags?.itemType !== ItemType.CONTAINER) {
		ui.notifications.error(`Cannot drop '${dropData.data.name}' onto ${targetToken.name}`);
		return false;
	}

	let itemData: any;

	if (dropData.actor) {
		// if the dropped item comes from an actor, we need to delete the item from that actor and get the data from the dropped data
		log(`pick-up-stix | dropItemOnToken | Actor '${dropData.actor.id}' dropped item '${dropData.data._id}', get item data from the dropped item's original item data`);
		itemData = duplicate(dropData.data);
		await deleteOwnedItem(dropData.actor.id, dropData.data._id);
	}
	else {
		// if the dropped item doesn't come from an actor, get it from the game's items or a compendium
		log(`pick-up-stix | dropItemOnToken | item comes from directory or compendium, item data comes from directory or compendium`);
		const pack = dropData.pack;
		const id = dropData.id;
		const item: Item = await game.items.get(id) ?? await game.packs.get(pack)?.getEntity(id);
		if (!item) {
			log(`pick-up-stix | dropItemOnToken | item '${id}' not found in game items or compendium`);
			return false;
		}
		itemData = duplicate(item.data);
	}

	log(`pick-up-stix | dropItemOnToken | item data:`);
	log([itemData]);

	if (targetToken.actor) {
		const droppedItemFlags: ItemFlags = getProperty(itemData, 'flags.pick-up-stix.pick-up-stix');

		if (droppedItemFlags.itemType === ItemType.CONTAINER) {
			ui.notifications.error('Cannot add a container to a PC/NPC');
			return false;
		}

		return createOwnedItem(
			targetToken.actor.id,
			mergeObject(itemData, {
				data: {
					[getQuantityDataPath()]: 1
				},
				flags: {
					'pick-up-stix': {
						'pick-up-stix': {
							owner: targetToken.actor.id
						}
					}
				}
			})
		).then(result => {
			Hooks.callAll(PickUpStixHooks.itemDroppedOnToken);
			const msg: SocketMessage = {
				sender: game.user.id,
				type: SocketMessageType.itemDroppedOnToken,
				data: {
					dropData,
					targetTokenId
				}
			}
			game.socket.emit('module.pick-up-stix', msg);
			return !!result;
		});
	}

	return addItemToContainer({ itemData, containerItemId: targetTokenItem.id }).then(result => {
		Hooks.callAll(PickUpStixHooks.itemDroppedOnToken);
		const msg: SocketMessage = {
			sender: game.user.id,
			type: SocketMessageType.itemDroppedOnToken,
			data: {
				dropData,
				targetTokenId
			}
		}
		game.socket.emit('module.pick-up-stix', msg);
		return result;
	})
}

export const addItemToContainer = async (data: { itemData: any, containerItemId: string }): Promise<boolean> => {
	log(`pick-up-stix | addItemToContainer:`);
	log([data]);

	if (game.user.isGM) {
		log(`pick-up-stix | addItemToContainer | User is GM`);

		const itemData = data.itemData;
		const itemType = itemData.type;
		const itemFlags: ItemFlags = getProperty(itemData, 'flags.pick-up-stix.pick-up-stix');

		if (itemFlags?.itemType === ItemType.CONTAINER) {
			// if the item being dropped is a container, you can't add it to another token
			log(`pick-up-stix | addItemToContainer | Cannot add item '${itemData._id}' to container because it's a container`);
			ui.notifications.error('A container may only be placed onto an empty square without any tokens.');
			return false;
		}

		const containerItem = game.items.get(data.containerItemId);
		const containerItemFlags: ItemFlags = duplicate(containerItem.getFlag('pick-up-stix', 'pick-up-stix'));
		const containerData = containerItemFlags?.container;

		let loot: ContainerLoot = containerData?.loot;

		// if the container never had any loot, then 'loot' will not exist, so
		// create an empty object
		if (!loot) {
			containerData.loot = {};
			loot = containerData.loot;
		}

		// if the 'loot' object doesn't have any loot of the type being
		// dropped it'll be undefined, so create an empty array, to hold
		// loot of that item type
		if (!loot[itemType]) {
			log(`pick-up-stix | addItemToContainer | No items of type '${itemType}', creating new slot`);
			loot[itemType] = [];
		}

		const qtyDataPath = getQuantityDataPath();

		const existingItem = loot[itemType]
			?.find(i =>
				i.name?.toLowerCase() === itemData.name?.toLowerCase()
				&& i.img === itemData.img
				&& i.data?.description?.value?.toLowerCase() === itemData.data?.description?.value?.toLowerCase()
				&& getProperty(i.data, getPriceDataPath()) === getProperty(itemData.data, getPriceDataPath())
				&& getProperty(i.data, getWeightDataPath()) === getProperty(itemData.data, getWeightDataPath())
			);

		if (existingItem) {
			log(`pick-up-stix | addItemToContainer | existing data for type '${itemType}', increase quantity by 1`);
			setProperty(existingItem.data, qtyDataPath, +getProperty(existingItem.data, qtyDataPath) + 1)
		}
		else {
			log(`pick-up-stix | addItemToContainer | existing data for item '${itemData._id}' does not exist, set quantity to 1 and add to slot`);
			setProperty(itemData.data, qtyDataPath, 1);
			loot[itemType].push({
				...itemData
			});
		}

		await updateItem(data.containerItemId, {
			flags: {
				'pick-up-stix': {
					'pick-up-stix': {
						container: {
							loot
						}
					}
				}
			}
		});

		const msg: SocketMessage = {
			sender: game.user.id,
			type: SocketMessageType.itemAddedToContainer,
			data
		}

		game.socket.emit('module.pick-up-stix', msg);
		Hooks.callAll(PickUpStixHooks.itemAddedToContainer, data);
		return true;
	}

	return new Promise(resolve => {
		const timeout = setTimeout(() => {
			resolve(false);
		}, gmActionTimeout());

		const msg: SocketMessage = {
			sender: game.user.id,
			type: SocketMessageType.addItemToContainer,
			data
		};

		log(`pick-up-stix | addItemToContainer | User is not GM, sending socket msg:`);
		log([msg]);

		Hooks.once(PickUpStixHooks.itemAddedToContainer, () => {
			log(`pick-up-stix | addItemToContainer | pick-up-stix.itemAddedToContainer hook | User is not GM, sending socket msg:`);
			clearTimeout(timeout);
			resolve(true);
		});

		game.socket.emit('module.pick-up-stix', msg);
	});
}

export const  lootCurrency = async (data: { looterTokenId: string, currencies: any; containerItemId: string }): Promise<boolean> => {
	log(`pick-up-stix | lootCurrency:`);
	console.log([data]);

	if (game.user.isGM) {
		log(`pick-up-stix | lootCurrency | User is GM, looting currency`);

		const looterToken = canvas.tokens.placeables.find(p => p.id === data.looterTokenId);
		const containerItem = game.items.get(data.containerItemId);
		const containerFlags: ItemFlags = duplicate(containerItem.getFlag('pick-up-stix', 'pick-up-stix'));
		const containerCurrencies = containerFlags?.container?.currency;
		const currencyToLoot = data.currencies;

		// get the actor's current currencies
		const actorCurrency = {
			...getProperty(looterToken.actor.data, getActorCurrencyPath()) ?? {}
		};

		Object.keys(actorCurrency).forEach(k => actorCurrency[k] = +(actorCurrency[k] ?? 0) + +currencyToLoot[k]);
		Object.keys(containerCurrencies).forEach(k => containerCurrencies[k] = +containerCurrencies[k] - +currencyToLoot[k]);

		await updateActor(looterToken.actor, {
			[getActorCurrencyPath()]: actorCurrency
		});

		await updateItem(data.containerItemId, {
			flags: {
				'pick-up-stix': {
					'pick-up-stix': {
						container: {
							currency: {
								...containerCurrencies
							}
						}
					}
				}
			}
		});

		currencyCollected(
			looterToken,
			Object.entries(currencyToLoot)
				.filter(([, v]) => v > 0)
				.reduce((prev, [k, v]) => { prev[k] = v; return prev; }, {})
		);

		Hooks.callAll(PickUpStixHooks.currencyLooted);

		const msg: SocketMessage = {
			type: SocketMessageType.currencyLooted,
			sender: game.user.id,
			data
		}

		game.socket.emit('module.pick-up-stix', msg)
		return true;
	}

	return new Promise(resolve => {
		const timeout = setTimeout(() => {
			resolve(false);
		}, gmActionTimeout());

		const msg: SocketMessage = {
			sender: game.user.id,
			type: SocketMessageType.lootCurrency,
			data
		}

		Hooks.once(PickUpStixHooks.currencyLooted, () => {
			log(`pick-up-stix | lootCurrency | pick-up-stix.currencyLooted hook`);
			clearTimeout(timeout);
			resolve(true);
		});

		log(`pick-up-stix | lootCurrency | User is not GM, sending socket msg:`);
		log([msg]);

		game.socket.emit('module.pick-up-stix', msg);
	});
}

interface LootItemFunction {
	/**
	 * A
	 */
	(data: { looterTokenId: string, itemData: ItemData | ItemData[], lootTokenTokenId: string, takeAll: boolean }): Promise<boolean>;
	/**
	 * B
	 */
	(data: { looterTokenId: string, itemData: ItemData | ItemData[], containerItemId: string, lootTokenTokenId: string, takeAll: boolean }): Promise<boolean>;
}

export const lootItem: LootItemFunction = async (data: any): Promise<boolean> => {
	log(`pick-up-stix | lootItem:`);
	log([data]);

	if (game.user.isGM) {
		console.log(`pick-up-stix | lootItem | User is GM`);

		const qtyLootedById = {};
		const looterToken = canvas.tokens.placeables.find(p => p.id === data.looterTokenId);
		const looterActorId = looterToken.actor.id;
		const itemDatas: ItemData[] = Array.isArray(data.itemData) ? data.itemData : [data.itemData];
		const newItemDatas: ItemData[] = itemDatas.reduce((acc, itemData) => {
			const qty = getProperty(itemData.data, getQuantityDataPath());
			const datas = [];
			const actualQty = data.takeAll ? qty : 1;
      qtyLootedById[itemData._id] = actualQty;

			for (let i = 0; i < actualQty; i++) {
				datas.push(mergeObject(itemData, { data: { [getQuantityDataPath()]: 1 } } as ItemData ));
			}
			return acc.concat(datas);
		}, []);

    log(`pick-up-stix | lootItem | Items being looted:`);
    console.log([newItemDatas]);

		await createOwnedItem(
			looterActorId,
			newItemDatas
		);

		if (data.containerItemId) {
			const containerItem = game.items.get(data.containerItemId);
			const containerItemFlags: ItemFlags = duplicate(containerItem?.getFlag('pick-up-stix', 'pick-up-stix') ?? {});
			const sourceLoot: ContainerLoot = containerItemFlags?.container?.loot;

			for (let [itemType, itemsOfType] of Object.entries(sourceLoot)) {
				for (let itemData of itemsOfType) {
					if (qtyLootedById[itemData._id] === undefined) {
						continue;
					}

					const oldQty = getProperty(itemData?.data, getQuantityDataPath());
          const newQty = oldQty - qtyLootedById[itemData._id];

					if (newQty <= 0) {
						log(`pick-up-stix | lootItem | Quantity is now 0, removing item from loot`);
						sourceLoot?.[itemType]?.findSplice(v => v._id === itemData._id);
					}
					else {
            log(`pick-up-stix | lootItem | Subtracting one from quantity`);
            mergeObject(
              itemData.data,
              {
                [getQuantityDataPath()]: newQty
              }
            );
					}
				}
			}

			await containerItem.update({
				flags: {
					'pick-up-stix': {
						'pick-up-stix': containerItemFlags
					}
				}
			}, {});
		}
		else if (data.lootTokenTokenId) {
			const lootTokenToken: Token = canvas.tokens.placeables.find(p => p.id === data.lootTokenTokenId);
			await deleteToken(lootTokenToken.id, lootTokenToken.scene.id);
		}

		const msg: SocketMessage = {
			sender: game.user.id,
			type: SocketMessageType.itemCollected,
			data: {
				tokenId: data.looterTokenId,
				actorId: looterToken.actor.id,
				sourceItemId: data.containerItemId,
				itemData: data.itemData
			}
		};

    for (const [id, qty] of Object.entries(qtyLootedById)) {
      createItemCollectedChatMessage(
        looterToken,
        mergeObject({
          ...newItemDatas.find(d => d._id === id)
        },
        {
          data: {
            [getQuantityDataPath()]: qty
          }
        })
      );
    }

		game.socket.emit('module.pick-up-stix', msg);
		Hooks.callAll(PickUpStixHooks.itemCollected, data);
		return true;
	}

	return new Promise(resolve => {
		const timeout = setTimeout(() => {
			resolve(null);
		}, gmActionTimeout());

		const msg: SocketMessage = {
			sender: game.user.id,
			type: SocketMessageType.collectItem,
			data
		}

		Hooks.once(PickUpStixHooks.itemCollected, () => {
			console.log(`pick-up-stix | lootItem | pick-up-stix.itemCollected hook`);
			clearTimeout(timeout);
			resolve(true);
		});

		console.log(`pick-up-stix | lootItem | User is not GM send msg:`);
		console.log([msg]);

		game.socket.emit('module.pick-up-stix', msg);
	});
}

export const currencyCollected = async (token, currency) => {
	log(`pick-up-stix | currencyCollected | called with args:`);
	log([token, currency]);
	let chatContent = '';
	Object.entries(currency).forEach(([k, v]) => {
		chatContent += `<span class="pick-up-stix-chat-currency ${k}"></span><span>(${k}) ${v}</span><br />`;
	});
	let content = `<p>Picked up:</p>${chatContent}`;
	await ChatMessage.create({
		content,
		speaker: {
			alias: token.actor.name,
			scene: token.scene.id,
			actor: token.actor.id,
			token: token.id
		}
	});
}

export const createItemCollectedChatMessage = async (token, item) => {
	await ChatMessage.create({
		content: `
			<p>Picked up ${item.name} (x${getProperty(item.data, getQuantityDataPath())})</p>
			<img src="${item.img}" style="width: 40px;" />
		`,
		speaker: {
			alias: token.actor.name,
			scene: token.scene.id,
			actor: token.actor.id,
			token: token.id
		}
	});
}