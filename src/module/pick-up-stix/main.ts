import { log } from '../../log';
import { collidedTokens, getCurrencyTypes } from '../../utils';
import { ItemFlags, LootToken, TokenData, TokenFlags } from "./loot-token";
import { DropData, ItemType, PickUpStixSocketMessage, SocketMessageType } from "./models";
import { gmActionTimeout, SettingKeys } from "./settings";

export const lootTokens: LootToken[] = [];
window['lootTokens'] = lootTokens;

export const getLootToken = (options: { uuid?: string, tokenId?: string, sceneId?: string }): LootToken[] => {
	if (!options.uuid && !options.tokenId && !options.sceneId) {
		throw new Error('Must provide uuid, tokenId or sceneId');
	}

	return lootTokens.filter(lt => {
		if (options.uuid && options.uuid !== lt.itemUuid) {
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
	const msg: PickUpStixSocketMessage = {
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
		lootTokens = getLootToken({ uuid: item.uuid });
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
			await createOwnedItem(targetToken.actor, itemData);
			return true;
		}

		const targetTokenFlags: TokenFlags = targetToken.getFlag('pick-up-stix', 'pick-up-stix');
		const item = await fromUuid(targetTokenFlags?.itemUuid);
		const itemFlags: ItemFlags = item?.getFlag('pick-up-stix', 'pick-up-stix');

		if (itemFlags?.itemType !== ItemType.CONTAINER) {
			ui.notifications.error(`Cannot place '${item.name}' onto token ${targetToken.name}`);
			log(`pick-up-stix | handleItemDropped | Can't drop ${item.name} ${item.id} onto target token ${targetToken.name} ${targetToken.id}`);
			log([targetToken, item]);
			return false;
		}

		const lt = getLootToken({ uuid: item.uuid, tokenId: targetToken.id })?.[0];
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
			await LootToken.create({ ...tokenData, ...droppedItemFlags.tokenData }, lootTokens[0].itemUuid);
		}
		else {
			await LootToken.create({ ...tokenData, ...droppedItemFlags.tokenData }, {
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
			});
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
							await LootToken.create({ ...tokenData }, mergeObject(itemData, {
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
							await LootToken.create({ ...tokenData, img }, {
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
		await LootToken.create({ ...tokenData }, mergeObject(itemData, {
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

export const deleteToken = async (tokenId: string, sceneId: string): Promise<void> => {
	log(`pick-up-stix | deleteToken with args:`);
	log([tokenId, sceneId]);

	if (game.user.isGM) {
		log(`pick-up-stix | deleteToken | user is GM, deleting token '${tokenId}' from scene '${sceneId}'`);
		const scene = Scene.collection.get(sceneId);
		await scene?.deleteEmbeddedEntity('Token', tokenId);
		return;
	}

	return new Promise((resolve) => {
		const timeout = setTimeout(() => {
			resolve(null);
		}, gmActionTimeout());

		const msg: PickUpStixSocketMessage = {
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
			resolve(data);
		});

		log(`pick-up-stix | deleteToken | user is not GM, sending socket msg:`);
		log([msg]);
		game.socket.emit('module.pick-up-stix', msg);
	});
}

export async function updateToken(sceneId: string, updates: { _id: string; [key: string]: any } | { _id: string; [key: string]: any }[]): Promise<any> {
	log(`pick-up-stix | updateToken with args:`);
	log([sceneId, updates]);

	if (game.user.isGM) {
		log(`pick-up-stix | updateToken | user is GM, making update`);
		await Scene.collection.get(sceneId).updateEmbeddedEntity('Token', updates);
		return;
	}

	const msg: PickUpStixSocketMessage = {
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
			resolve({ sceneId: scene.id, tokenId: tokenData._id });
		});

		log(`pick-up-stix | updateToken | user is not GM, sending socket msg:`);
		log([msg]);

		game.socket.emit('module.pick-up-stix', msg);
	});
}

export async function updateEntity(uuid, updates): Promise<void> {
	log(`pick-up-stix | updateEntity:`);
	log([uuid, updates]);

	if (game.user.isGM) {
		log('pick-up-stix | updateEntity | user is GM, making update');
		const entity = await fromUuid(uuid);
		entity.update(updates);
		return;
	}

	return new Promise(resolve => {
		const timeout = setTimeout(() => {
			resolve(null);
		}, gmActionTimeout());

		const msg: PickUpStixSocketMessage = {
			sender: game.user.id,
			type: SocketMessageType.updateEntity,
			data: {
				uuid,
				updates
			}
		};

		Hooks.once('updateEntity', (entity, data, options, userId) => {
			log(`pick-up-stix | updateEntity | updateEntity hook`);
			clearTimeout(timeout);
			resolve(entity.id);
		});

		log(`pick-up-stix | updateEntity | user is not GM, sending socket msg:`);
		log([msg]);

		game.socket.emit('module.pick-up-stix', msg);
	});
}

export async function updateActor(actor, updates): Promise<void> {
	log('pick-up-stix | updateActor | called with args:');
	log([actor, updates]);

	if (game.user.isGM) {
		log(`pick-up-stix | updateActor | user is GM, udating actor`);
		await actor.update(updates);
		return;
	}

	return new Promise((resolve) => {
		const timeout = setTimeout(() => {
			resolve(null);
		}, gmActionTimeout());

		const msg: PickUpStixSocketMessage = {
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
			resolve(actor);
		});

		log(`pick-up-stix | updateActor | user is not GM, sending socket msg:`);
		log([msg]);

		game.socket.emit('module.pick-up-stix', msg);
	});
}

export async function createOwnedItem(actor: Actor, data: any | any[]) {
	log('pick-up-stix | createOwnedItem | called with args:');
	data = Array.isArray(data) ? data : [data];
	log([actor, data]);

	if (game.user.isGM) {
		log(`pick-up-stix | createOwnedItem | user is GM, creating owned item`);
		await actor.createOwnedItem(data);
		return;
	}

	return new Promise((resolve) => {
		const timeout = setTimeout(() => {
			resolve(null);
		}, gmActionTimeout());

		const msg: PickUpStixSocketMessage = {
			sender: game.user.id,
			type: SocketMessageType.createOwnedEntity,
			data: {
				actorId: actor.id,
				items: data
			}
		};

		Hooks.once('createOwnedItem', (actor, item, options, userId) => {
			log(`pick-up-stix | createOwnedItem | createOwnedItem hook | item '${item.id}' created`);
			clearTimeout(timeout);
			resolve(item);
		});

		log(`pick-up-stix | createOwnedItem | user is not GM, sending socket msg:`);
		log([msg]);

		game.socket.emit('module.pick-up-stix', msg);
	});
}

export const createItem = async (data: any, options: any = {}): Promise<Item<any>> => {
	log(`pick-up-stix | createItem | called with args:`);
	log([data]);

	if (game.user.isGM) {
		log(`pick-up-stix | | createItem | user is GM, creating entity`);
		const e = await Item.create(data, options);
		return e as Item<any>
	}

	return new Promise((resolve) => {
		const timeout = setTimeout(() => {
			resolve(null);
		}, gmActionTimeout());

		const msg: PickUpStixSocketMessage = {
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
			resolve(item);
		});

		log(`pick-up-stix | createItem | user is not GM, sending socket msg:`);
		log([msg]);

		game.socket.emit('module.pick-up-stix', msg);
	});
}

export const deleteOwnedItem = async (actorId: string, itemId: string) => {
	log('pick-up-stix | deleteOwnedItem | called with args:');
	log([actorId, itemId]);

	if (game.user.isGM) {
		log(`pick-up-stix | deleteOwnedItem | user is GM, deleting owned item`);
		const actor = game.actors.get(actorId);
		await actor.deleteOwnedItem(itemId);
		return;
	}

	const msg: PickUpStixSocketMessage = {
		sender: game.user.id,
		type: SocketMessageType.deleteOwnedItem,
		data: {
			actorId,
			itemId
		}
	}

	return new Promise((resolve) => {
		const timeout = setTimeout(() => {
			resolve({ actorId, itemId });
		}, gmActionTimeout());

		Hooks.once('deleteOwnedItem', (actor, itemData, options, userId) => {
			log('pick-up-stix | deleteOwnedItem | deleteOwnedItem hook');
			clearTimeout(timeout);
			resolve(itemData._id);
		});

		log('pick-up-stix | deleteOwnedItem | user is not GM, sending socket msg:');
		log([msg]);

		game.socket.emit('module.pick-up-stix', msg);
	});
}

export const deleteItem = async (uuid: string) => {
	log('pick-up-stix | deleteItem | called with args:');
	log([uuid]);

	const e = await fromUuid(uuid);

	if (!e) {
		log(`pick-up-stix | deleteItem | Item not found from uuid '${uuid}'`);
		return uuid;
	}

	if (game.user.isGM) {
		log(`pick-up-stix | deleteItem | user is GM, deleting entity`);
		return await e.delete();
	}

	const msg: PickUpStixSocketMessage = {
		sender: game.user.id,
		type: SocketMessageType.deleteItem,
		data: {
			uuid
		}
	}

	return new Promise((resolve) => {
		const timeout = setTimeout(() => {
			resolve(uuid);
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

export const deleteEmbeddedEntity = async (parentUuid, entityType, entityId) => {
	log('pick-up-stix | deleteEmbeddedEntity | called with args:');
	log([parentUuid, entityType, entityId]);

	const e = await fromUuid(parentUuid);

	if (!e) {
		log(`pick-up-stix | deleteEmbeddedEntity | parent entity not found from uuid '${parentUuid}'`);
		return parentUuid;
	}

	if (game.user.isGM) {
		log(`pick-up-stix | deleteEmbeddedEntity | user is GM, deleting embedded entity`);
		return await e.deleteEmbeddedEntity(entityType, entityId)
	}

	const msg: PickUpStixSocketMessage = {
		sender: game.user.id,
		type: SocketMessageType.deleteEmbeddedEntity,
		data: {
			parentUuid,
			entityType,
			entityId
		}
	}

	return new Promise((resolve) => {
		const timeout = setTimeout(() => {
			resolve({ parentUuid, entityType, entityId });
		}, gmActionTimeout());

		Hooks.once(`delete${entityType}`, (entity, options, userId) => {
			log(`pick-up-stix | deleteEmbeddedEntity | delete${entityType} hook`);
			clearTimeout(timeout);
			resolve(entity.id);
		});

		log('pick-up-stix | deleteEmbeddedEntity | user is not GM, sending socket msg:');
		log([msg]);

		game.socket.emit('module.pick-up-stix', msg);
	})

}

export const updateEmbeddedEntity = async (parentUuid, entityType, data) => {
	log('pick-up-stix | updateEmbeddedEntity | called with args:');
	log([parentUuid, entityType, data]);

	const e = await fromUuid(parentUuid);

	if (!e) {
		log(`pick-up-stix | updateEmbeddedEntity | parent entity not found from uuid '${parentUuid}'`);
		return parentUuid;
	}

	if (game.user.isGM) {
		log(`pick-up-stix | updateEmbeddedEntity | user is GM, updating embedded entity`);
		return await e.updateEmbeddedEntity(entityType, data);
	}

	const msg: PickUpStixSocketMessage = {
		sender: game.user.id,
		type: SocketMessageType.updateEmbeddedEntity,
		data: {
			parentUuid,
			entityType,
			data
		}
	}

	return new Promise((resolve) => {
		const timeout = setTimeout(() => {
			resolve({ parentUuid, entityType, data });
		}, gmActionTimeout());

		Hooks.once(`update${entityType}`, (parent, data, update, options, userId) => {
			log(`pick-up-stix | updateEmbeddedEntity | update${entityType} hook`);
			clearTimeout(timeout);
			resolve(data._id);
		});

		log('pick-up-stix | updateEmbeddedEntity | user is not GM, sending socket msg');
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

	const msg: PickUpStixSocketMessage = {
		sender: game.user.id,
		type: SocketMessageType.createItemToken,
		data
	}

	return new Promise((resolve) => {
		const timeout = setTimeout(() => {
			resolve('Token never created');
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

export const itemCollected = async (token, item) => {
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