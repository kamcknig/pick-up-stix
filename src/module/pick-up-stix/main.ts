import { log } from '../../log';
import { collidedTokens, getActorCurrencyPath, getCurrencyTypes, getPriceDataPath, getQuantityDataPath, getWeightDataPath } from '../../utils';
import { ContainerLoot, ItemData, ItemFlags, LootToken, TokenData, TokenFlags } from "./loot-token";
import { DropData, ItemType, SocketMessage, SocketMessageType } from "./models";
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

export const lootTokenCreated = (tokenId: string) => {
	const msg: SocketMessage = {
		sender: game.user.id,
		type: SocketMessageType.lootTokenCreated,
		data: {
			tokenId
		}
	}
	game.socket.emit('module.pick-up-stix', msg);
	Hooks.callAll('pick-up-stix.lootTokenCreated', msg.data.tokenId);
}

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

export const normalizeDropData = (data: DropData): any => {
	log('pick-up-stix | normalizeDropData called with args:');
	log([data]);

	if (data.actorId) {
		data.actor = data.tokenId ? game.actors.tokens[data.tokenId] : game.actors.get(data.actorId);
	}

	return data;
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

	let pack: string;
	let itemData: any;
	let lootTokens: LootToken[] = [];

	// if the item comes from an actor's inventory, then the data structure is a tad different, the item data is stored
	// in a data property on the dropData parameter rather than on the top-level of the dropData
	if (dropData.actor) {
		log(`pick-up-stix | handleItemDropped | actor '${dropData.actor.id}' dropped item, get item data from the dropped item's original item data`);
		itemData = duplicate(dropData.data);
		await deleteOwnedItem(dropData.actor.id, dropData.data._id)
	}
	else {
		log(`pick-up-stix | handleItemDropped | item comes from directory or compendium, item data comes from directory or compendium`);
		pack = dropData.pack;
		const id = dropData.id;
		const item: Item = await game.items.get(id) ?? await game.packs.get(pack)?.getEntity(id);
		lootTokens = getLootToken({ itemId: item.id });
		if (!item) {
			log(`pick-up-stix | handleItemDropped | item '${id}' not found in game items or compendium`);
			return false;
		}
		itemData = duplicate(item.data);
	}

	log(`pick-up-stix | handleItemDropped`);
	log([itemData]);

	const droppedItemFlags: ItemFlags = getProperty(itemData, 'flags.pick-up-stix.pick-up-stix');

	// loop through placeables on the map and see if it's being dropped onto a token
	const targetTokens = collidedTokens({ x: dropData.x, y: dropData.y });
	if (targetTokens.length > 1) {
		ui.notifications.error('You can drop an item onto one and only one target');
		return false;
	}
	const targetToken = targetTokens?.[0]

	if (targetToken) {
		log(`pick-up-stix | handleItemDroped | dropping onto target '${targetToken.id}' '${targetToken.name}`);

		if (droppedItemFlags?.itemType === ItemType.CONTAINER) {
			// if the item being dropped is a container, you can't add it to another token
			log(`pick-up-stix | handleItemDroped | cannot drop container ${itemData.id} onto token '${targetToken.id}' '${targetToken.name}`);
			ui.notifications.error('A container may only be placed onto an empty square without any tokens.');
			return false;
		}

		if (targetToken.actor) {
			// if the token it was dropped on was an actor, add the item to the new actor
			await createOwnedItem(targetToken.actor.id, itemData);
			return true;
		}

		const targetTokenFlags: TokenFlags = targetToken.getFlag('pick-up-stix', 'pick-up-stix');
		const item = game.items.get(targetTokenFlags?.itemId);
		const itemFlags: ItemFlags = item?.getFlag('pick-up-stix', 'pick-up-stix');

		if (itemFlags?.itemType !== ItemType.CONTAINER) {
			ui.notifications.error(`Cannot place '${item.name}' onto token ${targetToken.name}`);
			log(`pick-up-stix | handleItemDropped | Can't drop ${item.name} ${item.id} onto target token ${targetToken.name} ${targetToken.id}`);
			log([targetToken, item]);
			return false;
		}

		const lt = getLootToken({ itemId: item.id, tokenId: targetToken.id })?.[0];
		await lt.addItem(itemData);
		return true;
	}

	// if it's not a container, then we can assume it's an item. Create the item token
	const hg = canvas.dimensions.size * .5;
	const { x, y } = canvas.grid.getSnappedPosition(dropData.x - hg, dropData.y - hg, 1);

	let tokenData: TokenData = {
		name: itemData.name,
		disposition: 0,
		img: itemData.img,
		width: itemData.flags?.['pick-up-stix']?.['pick-up-stix']?.tokenData?.width ?? 1,
		height: itemData.flags?.['pick-up-stix']?.['pick-up-stix']?.tokenData?.height ?? 1,
		x,
		y,
		flags: {
			'pick-up-stix': {
				'pick-up-stix': {
					isOpen: false
				}
			}
		}
	}

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

	// if the item being dropped is a container, just create the empty container
	if (droppedItemFlags?.itemType === ItemType.CONTAINER) {
		log(`pick-up-stix | handleItemDropped | dropped item is a container`);
		const img: string = droppedItemFlags.container.imageClosePath;
		if (lootTokens.length > 0) {
			await createLootToken({ ...tokenData, ...droppedItemFlags.tokenData }, lootTokens[0].itemId);
		}
		else {
			await createLootToken(
				{ ...mergeObject(tokenData, droppedItemFlags.tokenData) },
				{
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
				}
			);
		}
		return true;
	}

	// if the dropped item doesn't come from an actor
	if (!dropData.actor && lootTokens.length === 0) {
		await new Promise(resolve => {
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
							await createLootToken({ ...tokenData }, mergeObject(itemData, {
								flags: {
									'pick-up-stix': {
										'pick-up-stix': {
											itemType: ItemType.ITEM
										}
									}
								}
							}));
							resolve();
						}
					},
					two: {
						icon: '<i class="fas fa-boxes"></i>',
						label: 'Container',
						callback: async () => {
							const img: string = game.settings.get('pick-up-stix', SettingKeys.closeImagePath);
							await createLootToken({ ...tokenData, img }, {
								name: 'Empty Container',
								img,
								type: ItemType.CONTAINER,
								flags: {
									'pick-up-stix': {
										'pick-up-stix': {
											tokenData: {
												disposition: 0,
												width: itemData.flags?.['pick-up-stix']?.['pick-up-stix']?.tokenData?.width ?? 1,
												height: itemData.flags?.['pick-up-stix']?.['pick-up-stix']?.tokenData?.height ?? 1,
												name: 'Empty Container',
												img
											},
											itemType: ItemType.CONTAINER,
											container: {
												currency: Object.keys(getCurrencyTypes()).reduce((acc, shortName) => ({ ...acc, [shortName]: 0 }), {}),
												imageClosePath: img,
												imageOpenPath: game.settings.get('pick-up-stix', SettingKeys.openImagePath),
												soundOpenPath: game.settings.get('pick-up-stix', SettingKeys.defaultContainerOpenSound),
												soundClosePath: game.settings.get('pick-up-stix', SettingKeys.defaultContainerCloseSound)
											}
										}
									}
								}
							});
							resolve();
						}
					}
				}
			}).render(true);
		});
	}
	else {
		log(`pick-up-stix | handleItemDropped | Dropped item doesn't come from actor and a loot token already exists, so not creating a new item`);
		await createLootToken({ ...tokenData }, mergeObject(itemData, {
			flags: {
				'pick-up-stix': {
					'pick-up-stix': {
						itemType: ItemType.ITEM
					}
				}
			}
		}));
	}

	return true;
}

export const createLootToken: CreateLootToken = async (tokenData: any, itemData: any, notify: boolean=true) => {
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
		lootTokenCreated(tokenData);
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

export async function createOwnedItem(actorId: string, data: any | any[]): Promise<{ actorId: string; itemId: string }> {
	log('pick-up-stix | createOwnedItem | called with args:');
	data = Array.isArray(data) ? data : [data];
	log([actorId, data]);

	const actor = game.actors.get(actorId);

	if (game.user.isGM) {
		log(`pick-up-stix | createOwnedItem | user is GM, creating owned item`);
		const { _id } = await actor.createOwnedItem(data);
		return { actorId, itemId: _id };
	}

	return new Promise((resolve) => {
		const timeout = setTimeout(() => {
			resolve(null);
		}, gmActionTimeout());

		const msg: SocketMessage = {
			sender: game.user.id,
			type: SocketMessageType.createOwnedEntity,
			data: {
				actorId,
				items: data
			}
		};

		Hooks.once('createOwnedItem', (actor, item, options, userId) => {
			log(`pick-up-stix | createOwnedItem | createOwnedItem hook | item '${item._id}' created`);
			clearTimeout(timeout);
			resolve({ actorId, itemId: item._id });
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
			type: SocketMessageType.createEntity,
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
		return actorId;
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
		type: SocketMessageType.createItemToken,
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

export const dropItemOnContainer = async (data: { dropData: DropData, containerItemId: string }): Promise<boolean> => {
	log(`pick-up-stix | dropItemOnContainer:`);
	log([data]);

	if (game.user.isGM) {
		log(`pick-up-stix | dropItemOnContainer | User is GM`);

		const dropData: DropData = data.dropData;

		let droppedItemData;

		// if the dropped item comes from an actor, we need to delete the item from that actor
		if (dropData.actor) {
			log(`pick-up-stix | dropItemOnContainer | Drop data contains actor ID '${dropData.actorId}', deleting item from actor`);
			droppedItemData = dropData.data;
			await deleteOwnedItem(dropData.actorId, droppedItemData._id);
		}
		else {
			droppedItemData = await game.items.get(dropData.id)?.data ?? await game.packs.get(dropData.pack).getEntry(dropData.id);
		}

		const droppedItemType = droppedItemData.type;

		const item = game.items.get(data.containerItemId);
		const itemFlags: ItemFlags = duplicate(item.getFlag('pick-up-stix', 'pick-up-stix'));
		const containerData = itemFlags?.container;

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
		if (!loot[droppedItemType]) {
			log(`pick-up-stix | dropItemOnContainer | No items of type '${droppedItemType}', creating new slot`);
			loot[droppedItemType] = [];
		}

		const qtyDataPath = getQuantityDataPath();

		const existingItem = loot[droppedItemType]
			?.find(i =>
				i.name?.toLowerCase() === droppedItemData.name?.toLowerCase()
				&& i.img === droppedItemData.img
				&& i.data?.description?.value?.toLowerCase() === droppedItemData.data?.description?.value?.toLowerCase()
				&& getProperty(i.data, getPriceDataPath()) === getProperty(droppedItemData.data, getPriceDataPath())
				&& getProperty(i.data, getWeightDataPath()) === getProperty(droppedItemData.data, getWeightDataPath())
			);

		if (existingItem) {
			log(`pick-up-stix | dropItemOnContainer | existing data for type '${droppedItemType}', increase quantity by 1`);
			setProperty(existingItem.data, qtyDataPath, +getProperty(existingItem.data, qtyDataPath) + 1)
		}
		else {
			log(`pick-up-stix | dropItemOnContainer | existing data for item '${droppedItemData._id}' does not exist, set quantity to 1 and add to slot`);
			setProperty(droppedItemData.data, qtyDataPath, 1);
			loot[droppedItemType].push({
				...droppedItemData
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
			type: SocketMessageType.itemDroppedOnContainer,
			data
		}

		game.socket.emit('module.pick-up-stix', msg);
		Hooks.callAll('pick-up-stix.itemDroppedOnContainer', data);
		return true;
	}

	return new Promise(resolve => {
		const timeout = setTimeout(() => {
			resolve(false);
		}, gmActionTimeout());

		const msg: SocketMessage = {
			sender: game.user.id,
			type: SocketMessageType.dropItemOnContainer,
			data
		};

		log(`pick-up-stix | dropItemOnContainer | User is not GM, sending socket msg:`);
		log([msg]);

		Hooks.once('pick-up-stix.itemDroppedOnContainer', () => {
			log(`pick-up-stix | dropItemOnContainer | pick-up-stix.itemDroppedOnContainer hook | User is not GM, sending socket msg:`);
			clearTimeout(timeout);
			resolve(true);
		});

		game.socket.emit('module.pick-up-stix', msg);
	});
}

export const  lootCurrency = async (data: { looterTokenId: string, looterActorId: string; currencies: any; containerItemId: string }): Promise<boolean> => {
	log(`pick-up-stix | lootCurrency:`);
	console.log([data]);

	if (game.user.isGM) {
		log(`pick-up-stix | lootCurrency | User is GM, looting currency`);

		const token = canvas.tokens.placeables.find(p => p.id === data.looterTokenId);
		const containerItem = game.items.get(data.containerItemId);
		const containerFlags: ItemFlags = duplicate(containerItem.getFlag('pick-up-stix', 'pick-up-stix'));
		const containerCurrencies = containerFlags?.container?.currency;
		const currencyToLoot = data.currencies;

		// get the actor's current currencies
		const actorCurrency = {
			...getProperty(token.actor.data, getActorCurrencyPath()) ?? {}
		};

		Object.keys(actorCurrency).forEach(k => actorCurrency[k] = +actorCurrency[k] + +currencyToLoot[k]);
		Object.keys(containerCurrencies).forEach(k => containerCurrencies[k] = +containerCurrencies[k] - +currencyToLoot[k]);

		await updateActor(token.actor, {
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
			token,
			Object.entries(currencyToLoot)
				.filter(([, v]) => v > 0)
				.reduce((prev, [k, v]) => { prev[k] = v; return prev; }, {})
		);

		Hooks.callAll('pick-up-stix.currencyLooted');

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

		Hooks.once('pick-up-stix.currencyLooted', () => {
			log(`pick-up-stix | lootCurrency | pick-up-stix.currencyLooted hook`);
			clearTimeout(timeout);
			resolve(true);
		});

		log(`pick-up-stix | lootCurrency | User is not GM, sending socket msg:`);
		log([msg]);

		game.socket.emit('module.pick-up-stix', msg);
	});
}

type LootItemFunction = {
	(data: { looterTokenId: string, looterActorId: string, itemData: any }): Promise<boolean>;
	(data: { looterTokenId: string, looterActorId: string, itemData: any, containerItemId: string}): Promise<boolean>;
}

export const lootItem: LootItemFunction = async (data: any): Promise<boolean> => {
	log(`pick-up-stix | lootItem:`);
	log([data]);

	if (game.user.isGM) {
		const token = canvas.tokens.placeables.find(p => p.id === data.looterTokenId);

		console.log(`pick-up-stix | lootItem | User is GM`);

		await createOwnedItem(
			data.looterActorId,
			mergeObject(duplicate(data.itemData), {
				data: {
					[getQuantityDataPath()]: 1
				},
				flags: {
					'pick-up-stix': {
						'pick-up-stix': {
							owner: data.looterActorId
						}
					}
				}
			})
		);

		if (data.containerItemId) {
			const containerItem = game.items.get(data.containerItemId);
			const containerItemFlags: ItemFlags = duplicate(containerItem?.getFlag('pick-up-stix', 'pick-up-stix') ?? {});
			const sourceLoot: ContainerLoot = containerItemFlags.container?.loot;
			const itemType = data.itemData?.type;
			const itemId = data.itemData?._id;
			const itemData = sourceLoot?.[itemType]?.find(i => i._id === itemId);
			const oldQty = getProperty(itemData?.data, getQuantityDataPath());

			if (oldQty - 1 <= 0) {
				log(`pick-up-stix | lootItem | Quantity is now 0, removing item from loot`);
				sourceLoot?.[itemType]?.findSplice(v => v._id === itemId);
			}
			else {
				log(`pick-up-stix | lootItem | Subtracting one from quantity`);
				setProperty(itemData.data, getQuantityDataPath(), oldQty - 1);
			}

			await containerItem.update({
				flags: {
					'pick-up-stix': {
						'pick-up-stix': containerItemFlags
					}
				}
			}, {});
		}
		else if (data.looterTokenId) {
			await deleteToken(token.id, token.scene.id);
		}

		const msg: SocketMessage = {
			sender: game.user.id,
			type: SocketMessageType.itemCollected,
			data: {
				tokenId: data.tokenId,
				actorId: data.actorId,
				sourceItemId: data.containerItemId,
				itemData: data.itemData
			}
		};

		createItemCollectedChatMessage(token, data.itemData);

		game.socket.emit('module.pick-up-stix', msg);
		Hooks.callAll('pick-up-stix.itemCollected', data);
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

		Hooks.once('pick-up-stix.itemCollected', () => {
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
			<p>Picked up ${item.name}</p>
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