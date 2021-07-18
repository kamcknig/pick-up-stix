import { log } from '../../log';
import {
	collidedTokens,
	getActorCurrencyPath,
	getCurrencyTypes,
	getPriceDataPath,
	getQuantityDataPath,
	getWeightDataPath
} from './utils';
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
import { getCanvas, getGame, gmActionTimeout, SettingKeys } from "./settings";

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
export const getValidControlledTokens = (data: string | Token): Token[]|undefined => {
	log(`getValidControlledTokens:`);
	log([data]);

	let token: Token;

	if (typeof data === 'string') {
		token = <Token>getCanvas().tokens?.placeables.find(p => p.id === data);
	}
	else {
		token = data;
	}

	if (!token) {
		log(`getValidControlledTokens | no token provided so returning nothing`);
		return [];
	}

	log(`getValidControlledTokens | Looking for tokens near '${token.id}' '${token.name}`);

	log(`getValidControlledTokens | looping through currently controlled tokens`);
	log([getCanvas().tokens?.controlled]);

	const controlled = getCanvas().tokens?.controlled.filter(t => {
		if (!t.actor) {
			log(`getValidControlledTokens | token '${t.id}' '${t.name}' has no actor, skipping`);
			return false;
		}

		return (
			t.x + t.w > token.x - <number>getCanvas().grid?.size &&
			t.x < token.x + token.w + <number>getCanvas().grid?.size &&
			t.y + t.h > token.y - <number>getCanvas().grid?.size &&
			t.y < token.y + token.h + <number>getCanvas().grid?.size
		);
	});

	log(`getValidControlledTokens | controlled tokens within range`);
	log([controlled]);
	return controlled;
}

export const normalizeDropData = async (data: Partial<DropData>): Promise<DropData> => {
	log(' normalizeDropData called with args:');
	log([data]);

	if (data.actorId) {
		data.actor = data.tokenId ? getGame().actors?.tokens[data.tokenId] : getGame().actors?.get(data.actorId);
	}

	const pack: any = data.pack ? getGame().packs?.get(data.pack) : null;
	const id: string = data.id;
	data.data = data.actor
		? data.data
		: (
			pack
				? (await pack.getEntity(id))?.data
				: getGame().items?.get(id)?.data
		);

	// if it's not a container, then we can assume it's an item. Create the item token
	const hg = <number>getCanvas().dimensions?.size * .5;
	const { x, y } = <any>getCanvas().grid?.getSnappedPosition(<number>data.x - hg, <number>data.y - hg, 1);
	data.gridX = x;
	data.gridY = y;

	return data as DropData;
}

/**
 * Handles data dropped onto the getCanvas().
 *
 * @param dropData
 */
export async function handleItemDropped(dropData: DropData): Promise<boolean> {
	log(`handleItemDropped | called with args:`);
	log(dropData);

	// The data here should already be normalized, meaning that if we were able to determine the actor reference,
	// it should exist here. So if we have an actor ID but no actor, that means we weren't able to figure out
	// which actor this item might have come from.
	if (dropData.actorId && !dropData.actor) {
		ui.notifications?.error(`Please ensure you are only controlling the token (and only the one token) for the character you're working with.`);
		return false;
	}

	// loop through placeables on the map and see if it's being dropped onto a token
	const targetTokens = <Token[]>collidedTokens({ x: dropData.x, y: dropData.y });

	if (targetTokens.length > 1) {
		ui.notifications?.error('You can drop an item onto one and only one target');
		return false;
	}

	const targetToken = targetTokens?.[0];

	return targetToken
		? dropItemOnToken({ targetTokenId: targetToken.id, dropData })
		: dropItemOnCanvas({ dropData });
}

const dropItemOnCanvas = async ({ dropData }) => {
	log(`dropItemOnCanvas:`);
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
			...itemData.flags?.['pick-up-stix']?.tokenData ?? {}
		}
	);

	mergeObject(itemData, {
		flags: {
			'pick-up-stix': {
				'pick-up-stix': {
					tokenData: {
						width: itemData.flags?.['pick-up-stix']?.tokenData?.width ?? 1,
						height: itemData.flags?.['pick-up-stix']?.tokenData?.height ?? 1
					}
				}
			}
		}
	});

	const droppedItemFlags: ItemFlags = getProperty(itemData, 'flags.pick-up-stix.pick-up-stix');

	// if the item being dropped is a container, just create the empty container
	if (droppedItemFlags?.itemType === ItemType.CONTAINER) {
		log(`dropItemOnCanvas | dropped item is a container`);
		const img: string = droppedItemFlags.container.imageClosePath;

		return lootTokens.length > 0
			? !!await createLootToken(tokenData, lootTokens[0].itemId)
			: !!await createLootToken(tokenData, {
				_id: itemData._id,
				name: itemData.name,
				img,
				folder: getGame().settings.get('pick-up-stix', SettingKeys.tokenFolderId),
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

	log(`dropItemOnCanvas | Dropped item is not a container`);

	// if we don't have any loot tokens already associated with the item, we'll create a new
	// loot token
	if (!dropData.actor) {
		log(`dropItemOnCanvas | Dropped item comes from an actor`);

	 	if (lootTokens.length === 0) {
			log(`dropItemOnCanvas | No LootTokens for the dropped item currently`);
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
				const img: string = <string>getGame().settings.get('pick-up-stix', SettingKeys.closeImagePath);

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
										width: itemData.flags?.['pick-up-stix']?.tokenData?.width ?? 1,
										height: itemData.flags?.['pick-up-stix']?.tokenData?.height ?? 1,
										name: 'Empty Container',
										img
									}, {  ...tokenData, img } ),
									itemType: ItemType.CONTAINER,
									container: {
										currency: Object.keys(getCurrencyTypes()).reduce((acc, shortName) => ({ ...acc, [shortName]: 0 }), {}),
										imageClosePath: img,
										imageOpenPath: getGame().settings.get('pick-up-stix', SettingKeys.openImagePath),
										soundOpenPath: getGame().settings.get('pick-up-stix', SettingKeys.defaultContainerOpenSound),
										soundClosePath: getGame().settings.get('pick-up-stix', SettingKeys.defaultContainerCloseSound),
										loot: getGame().settings.get('pick-up-stix', SettingKeys.addItemOnContainerCreation)
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
			log(`dropItemOnCanvas | LootTokens for the dropped item already exist, create new token with same item data`);
			// we already have loot tokens, so create a new loot token but use the previous item ID
			return !!await createLootToken(
				{ ...tokenData },
				itemData._id
			);
		}
	}

	log(`dropItemOnCanvas | Dropped data comes from actor '${dropData.actor.name}', delete it first`);
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

/**
 * Api for creating a container with specified items inside at desired position
 * @param items array of items
 * @param currency obect like {cp:0, sp:0, gp:0, pp:0}
 * @param position object like {gridX:0, gridY:0}
 * @param tokenDataOverride available values to override are width, height , closeImg, openImg
 */
export const makeContainerApi = async (items, currency, position, tokenDataOverride = {width:1,height:1, closeImg:undefined, openImg:undefined }) => {
	log(`makeContainerApi:`);
	log([items, currency, position]);

	let lootData = {};

	items.forEach((item) => {
		mergeObject(item, {
			flags: {
				'pick-up-stix': {
					'pick-up-stix': {
						tokenData: {
							width: 1,
							height: 1
						}
					}
				}
			}
		});

		if (lootData[item.data.type]) {
			lootData[item.data.type].push(item.data);
		} else {
			lootData[item.data.type] = [item.data];
		}
	});

	let tokenData: TokenData = {
		name: 'Container',
		disposition: 0,
		img: '',
		width: tokenDataOverride.width,
		height: tokenDataOverride.height,
		x: position.gridX,
		y: position.gridY,
		flags: {
			'pick-up-stix': {
				'pick-up-stix': {
					isOpen: false,
					minPerceiveValue: 0
				}
			}
		}
	};

	const img: string = tokenDataOverride.closeImg || getGame().settings.get(
		'pick-up-stix',
		SettingKeys.closeImagePath
	);

	return !!(await createLootToken({ ...tokenData, img }, {
		name: 'Container',
		img,
		type: ItemType.CONTAINER,
		flags: {
			'pick-up-stix': {
				'pick-up-stix': {
					tokenData: mergeObject(
						{
							disposition: 0,
							width: 1,
							height: 1,
							name: 'Container',
							img
						},
						{ ...tokenData, img }
					),
					itemType: ItemType.CONTAINER,
					container: {
						currency: Object.keys(getCurrencyTypes()).reduce(
							(acc, shortName) => ({
								...acc,
								[shortName]: currency[shortName] || 0
							}),
							{}
						),
						imageClosePath: img,
						imageOpenPath: tokenDataOverride.openImg || getGame().settings.get(
							'pick-up-stix',
							SettingKeys.openImagePath
						),
						soundOpenPath: getGame().settings.get(
							'pick-up-stix',
							SettingKeys.defaultContainerOpenSound
						),
						soundClosePath: getGame().settings.get(
							'pick-up-stix',
							SettingKeys.defaultContainerCloseSound
						),
						loot: lootData
					}
				}
			}
		}
	} as ItemData));
};

const chooseLootTokenType = (): Promise<ItemType> => {
	log(`chooseLootTokenType | creating dialog`);
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
						log(`chooseLootTokenType | '${ItemType.ITEM}' type chosen`);
						resolve(ItemType.ITEM);
					}
				},
				two: {
					icon: '<i class="fas fa-boxes"></i>',
					label: 'Container',
					callback: async () => {
						log(`chooseLootTokenType | '${ItemType.CONTAINER}' type chosen`);
						resolve(ItemType.CONTAINER);
					}
				}
			}
		}).render(true);
	});
}

export const createLootToken: CreateLootToken = async (tokenData: any, itemData: any, notify: boolean=true) => {
	log(`createLootToken:`)
	log([tokenData, itemData, notify]);

	if (getGame().user.isGM) {
		if (typeof itemData === 'object') {
			itemData = await createItem({
				...itemData,
				permission: {
					default: 2
				},
				folder: getGame().settings.get('pick-up-stix', SettingKeys.tokenFolderId),
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
			sender: getGame().user.id,
			type: SocketMessageType.lootTokenCreated,
			data: {
				tokenId: tokenData
			}
		}
		getGame().socket.emit('module.pick-up-stix', msg);
		Hooks.callAll(PickUpStixHooks.lootTokenCreated, msg.data.tokenId);
	}

	return t;
}

export const deleteToken = async (tokenId: string, sceneId: string): Promise<string> => {
	log(`deleteToken with args:`);
	log([tokenId, sceneId]);

	if (getGame().user.isGM) {
		log(`deleteToken | user is GM, deleting token '${tokenId}' from scene '${sceneId}'`);
		const scene = Scene.collection.get(sceneId);
		const { _id } = await scene?.deleteEmbeddedEntity('Token', tokenId);
		return _id;
	}

	return new Promise((resolve) => {
		const timeout = setTimeout(() => {
			resolve(null);
		}, gmActionTimeout());

		const msg: SocketMessage = {
			sender: getGame().user.id,
			type: SocketMessageType.deleteToken,
			data: {
				tokenId,
				sceneId
			}
		}

		Hooks.once('deleteToken', (scene, data, options, userId) => {
			log(`deleteToken | deleteToken hook`);
			clearTimeout(timeout);
			resolve(data._id);
		});

		log(`deleteToken | user is not GM, sending socket msg:`);
		log([msg]);
		getGame().socket.emit('module.pick-up-stix', msg);
	});
}

export async function updateToken(sceneId: string, updates: { _id: string; [key: string]: any } | { _id: string; [key: string]: any }[]): Promise<{ tokenId: string; sceneId: string }> {
	log(`updateToken with args:`);
	log([sceneId, updates]);

	if (getGame().user.isGM) {
		log(`updateToken | user is GM, making update`);
		const { _id } = await Scene.collection.get(sceneId).updateEmbeddedEntity('Token', updates);
		return { tokenId: _id, sceneId: sceneId };
	}

	const msg: SocketMessage = {
		sender: getGame().user.id,
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
			log(`updateToken | updateToken hook`);
			clearTimeout(timeout);
			resolve({ tokenId: tokenData._id, sceneId });
		});

		log(`updateToken | user is not GM, sending socket msg:`);
		log([msg]);

		getGame().socket.emit('module.pick-up-stix', msg);
	});
}

export async function updateItem(id, updates): Promise<string> {
	log(`updateItem:`);
	log([id, updates]);

	if (getGame().user.isGM) {
		log(' updateItem | user is GM, making update');
		const entity = getGame().items.get(id);
		const { _id } = await entity.update(updates, {});
		return _id;
	}

	return new Promise(resolve => {
		const timeout = setTimeout(() => {
			resolve(null);
		}, gmActionTimeout());

		const msg: SocketMessage = {
			sender: getGame().user.id,
			type: SocketMessageType.updateItem,
			data: {
				id,
				updates
			}
		};

		Hooks.once('updateItem', (entity, data, options, userId) => {
			log(`updateItem | updateItem hook`);
			clearTimeout(timeout);
			resolve(entity.id);
		});

		log(`updateItem | user is not GM, sending socket msg:`);
		log([msg]);

		getGame().socket.emit('module.pick-up-stix', msg);
	});
}

export async function updateActor(actor: Actor, updates): Promise<string> {
	log(' updateActor | called with args:');
	log([actor, updates]);

	if (getGame().user.isGM) {
		log(`updateActor | user is GM, udating actor`);
		const { _id } = await actor.update(updates);
		return _id;
	}

	return new Promise((resolve) => {
		const timeout = setTimeout(() => {
			resolve(null);
		}, gmActionTimeout());

		const msg: SocketMessage = {
			sender: getGame().user.id,
			type: SocketMessageType.updateActor,
			data: {
				actorId: actor.id,
				updates
			}
		};

		Hooks.once('updateActor', (actor, data, options, userId) => {
			log(`updateActor | updateActor hook`);
			clearTimeout(timeout);
			resolve(actor.id);
		});

		log(`updateActor | user is not GM, sending socket msg:`);
		log([msg]);

		getGame().socket.emit('module.pick-up-stix', msg);
	});
}

export async function createOwnedItem(actorId: string, data: any | any[]): Promise<boolean> {
	log(' createOwnedItem | called with args:');
	data = Array.isArray(data) ? data : [data];
	log([actorId, data]);

	const actor = getGame().actors.get(actorId);

	if (getGame().user.isGM) {
		log(`createOwnedItem | user is GM, creating owned item`);
		await actor.createOwnedItem(data);
		return true;
	}

	return new Promise((resolve) => {
		const timeout = setTimeout(() => {
			resolve(false);
		}, gmActionTimeout());

		const msg: SocketMessage = {
			sender: getGame().user.id,
			type: SocketMessageType.createOwnedItem,
			data: {
				actorId,
				items: data
			}
		};

		Hooks.once('createOwnedItem', (actor, item, options, userId) => {
			log(`createOwnedItem | createOwnedItem hook | item '${item._id}' created`);
			clearTimeout(timeout);
			resolve(true);
		});

		log(`createOwnedItem | user is not GM, sending socket msg:`);
		log([msg]);

		getGame().socket.emit('module.pick-up-stix', msg);
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
	log(`createItem | called with args:`);
	log([data]);

	if (getGame().user.isGM) {
		log(`| createItem | user is GM, creating entity`);
		const e = await Item.create(data, options);
		return e.id;
	}

	return new Promise((resolve) => {
		const timeout = setTimeout(() => {
			resolve(null);
		}, gmActionTimeout());

		const msg: SocketMessage = {
			sender: getGame().user.id,
			type: SocketMessageType.createItem,
			data: {
				data,
				options
			}
		};

		Hooks.once('createItem', (item, options, userId) => {
			log(`createItem | createItem hook | item '${item.id}' created`);
			clearTimeout(timeout);
			resolve(item.id);
		});

		log(`createItem | user is not GM, sending socket msg:`);
		log([msg]);

		getGame().socket.emit('module.pick-up-stix', msg);
	});
}

export const deleteOwnedItem = async (actorId: string, itemId: string): Promise<{ actorId: string; itemId: string }> => {
	log(' deleteOwnedItem | called with args:');
	log([actorId, itemId]);

	if (getGame().user.isGM) {
		log(`deleteOwnedItem | user is GM, deleting owned item`);
		const actor = getGame().actors.get(actorId);
		await actor.deleteOwnedItem(itemId);
		return { actorId, itemId };
	}

	const msg: SocketMessage = {
		sender: getGame().user.id,
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
			log(' deleteOwnedItem | deleteOwnedItem hook');
			clearTimeout(timeout);
			resolve({ actorId, itemId });
		});

		log(' deleteOwnedItem | user is not GM, sending socket msg:');
		log([msg]);

		getGame().socket.emit('module.pick-up-stix', msg);
	});
}

export const deleteItem = async (id: string): Promise<string> => {
	log(' deleteItem | called with args:');
	log([id]);

	const e = getGame().items.get(id);

	if (!e) {
		log(`deleteItem | Item '${id}' not found`);
		return null;
	}

	if (getGame().user.isGM) {
		log(`deleteItem | user is GM, deleting entity`);
		return (<Item>await e.delete())._id;
	}

	const msg: SocketMessage = {
		sender: getGame().user.id,
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
			log(' deleteItem | deleteItem hook');
			clearTimeout(timeout);
			resolve(item.id);
		});

		log(`deleteItem | user is not GM, sending socket msg:`);
		log([msg]);

		getGame().socket.emit('module.pick-up-stix', msg);
	});
}

export const updateOwnedItem = async (actorId, data): Promise<{ actorId: string; id: string}> => {
	log(' updateOwnedItem | called with args:');
	log([actorId, data]);

	const actor = getGame().actors.get(actorId);

	if (!actor) {
		log(`updateOwnedItem | Actor '${actorId}' not found`);
		return null;
	}

	if (getGame().user.isGM) {
		log(`updateOwnedItem | user is GM, updating embedded entity`);
		const { _id } = await actor.updateOwnedItem(data);
		return { actorId: actor.id, id: _id };
	}

	const msg: SocketMessage = {
		sender: getGame().user.id,
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
			log(`updateOwnedItem | updateOwnedItem hook`);
			clearTimeout(timeout);
			resolve({ actorId: parent.id, id: data._id });
		});

		log(' updateOwnedItem | user is not GM, sending socket msg');
		log([msg]);

		getGame().socket.emit('module.pick-up-stix', msg);
	})

}

export const createToken = async (data: any): Promise<string> => {
	log(`createToken | called with args:`);
	log([data]);

	if (getGame().user.isGM) {
		log(`createToken | user is GM, creating token`);
		const t:any = await Token.create({
			...data
		});
		return t.id;
	}

	const msg: SocketMessage = {
		sender: getGame().user.id,
		type: SocketMessageType.createToken,
		data
	}

	return new Promise((resolve) => {
		const timeout = setTimeout(() => {
			resolve(null);
		}, gmActionTimeout());

		Hooks.once('createToken', (scene, data) => {
			log(`createToken | createToken hook | Token '${data.id}' created`);
			clearTimeout(timeout);
			resolve(data._id);
		});

		log(' createToken | user is not GM, sending socket msg:');
		log([msg]);

		getGame().socket.emit('module.pick-up-stix', msg);
	});
}

export const dropItemOnToken = async ({ dropData, targetTokenId }: { dropData: DropData, targetTokenId: string }): Promise<boolean> => {
	log(`dropItemOnToken:`);
	log([dropData, targetTokenId]);

	if (!getGame().user.isGM) {
		return new Promise(resolve => {
			const timeout = setTimeout(() => {
				resolve(null);
			}, gmActionTimeout());

			const msg: SocketMessage = {
				type: SocketMessageType.dropItemOnToken,
				sender: getGame().user.id,
				data: {
					dropData,
					targetTokenId
				}
			}

			getGame().socket.emit('module.pick-up-stix', msg);
		});
	}

	const targetToken: Token = getCanvas().tokens.placeables.find(p => p.id === targetTokenId);
	const targetTokenFlags: TokenFlags = <TokenFlags>targetToken.getFlag('pick-up-stix', 'pick-up-stix');
	const targetTokenItem = getGame().items.get(targetTokenFlags?.itemId);
	const targetTokenItemFlags: ItemFlags = <ItemFlags>targetTokenItem?.getFlag('pick-up-stix', 'pick-up-stix');

	if (!targetToken?.actor && targetTokenItemFlags?.itemType !== ItemType.CONTAINER) {
		ui.notifications.error(`Cannot drop '${dropData.data.name}' onto ${targetToken.name}`);
		return false;
	}

	let itemData: any;

	if (dropData.actor) {
		// if the dropped item comes from an actor, we need to delete the item from that actor and get the data from the dropped data
		log(`dropItemOnToken | Actor '${dropData.actor.id}' dropped item '${dropData.data._id}', get item data from the dropped item's original item data`);
		itemData = duplicate(dropData.data);
		await deleteOwnedItem(dropData.actor.id, dropData.data._id);
	}
	else {
		// if the dropped item doesn't come from an actor, get it from the game's items or a compendium
		log(`dropItemOnToken | item comes from directory or compendium, item data comes from directory or compendium`);
		const pack = dropData.pack;
		const id = dropData.id;
		const item: Item = <Item>(await getGame().items.get(id) ?? await getGame().packs.get(pack)?.getEntity(id));
		if (!item) {
			log(`dropItemOnToken | item '${id}' not found in game items or compendium`);
			return false;
		}
		itemData = duplicate(item.data);
	}

	log(`dropItemOnToken | item data:`);
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
				sender: getGame().user.id,
				type: SocketMessageType.itemDroppedOnToken,
				data: {
					dropData,
					targetTokenId
				}
			}
			getGame().socket.emit('module.pick-up-stix', msg);
			return !!result;
		});
	}

	return addItemToContainer({ itemData, containerItemId: targetTokenItem.id }).then(result => {
		Hooks.callAll(PickUpStixHooks.itemDroppedOnToken);
		const msg: SocketMessage = {
			sender: getGame().user.id,
			type: SocketMessageType.itemDroppedOnToken,
			data: {
				dropData,
				targetTokenId
			}
		}
		getGame().socket.emit('module.pick-up-stix', msg);
		return result;
	})
}

export const addItemToContainer = async (data: { itemData: any, containerItemId: string }): Promise<boolean> => {
	log(`addItemToContainer:`);
	log([data]);

	if (getGame().user.isGM) {
		log(`addItemToContainer | User is GM`);

		const itemData = data.itemData;
		const itemType = itemData.type;
		const itemFlags: ItemFlags = getProperty(itemData, 'flags.pick-up-stix.pick-up-stix');

		if (itemFlags?.itemType === ItemType.CONTAINER) {
			// if the item being dropped is a container, you can't add it to another token
			log(`addItemToContainer | Cannot add item '${itemData._id}' to container because it's a container`);
			ui.notifications.error('A container may only be placed onto an empty square without any tokens.');
			return false;
		}

		const containerItem = getGame().items.get(data.containerItemId);
		const containerItemFlags: ItemFlags = <ItemFlags>duplicate(containerItem.getFlag('pick-up-stix', 'pick-up-stix'));
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
			log(`addItemToContainer | No items of type '${itemType}', creating new slot`);
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
			log(`addItemToContainer | existing data for type '${itemType}', increase quantity by 1`);
			setProperty(existingItem.data, qtyDataPath, +getProperty(existingItem.data, qtyDataPath) + 1)
		}
		else {
			log(`addItemToContainer | existing data for item '${itemData._id}' does not exist, set quantity to 1 and add to slot`);
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
			sender: getGame().user.id,
			type: SocketMessageType.itemAddedToContainer,
			data
		}

		getGame().socket.emit('module.pick-up-stix', msg);
		Hooks.callAll(PickUpStixHooks.itemAddedToContainer, data);
		return true;
	}

	return new Promise(resolve => {
		const timeout = setTimeout(() => {
			resolve(false);
		}, gmActionTimeout());

		const msg: SocketMessage = {
			sender: getGame().user.id,
			type: SocketMessageType.addItemToContainer,
			data
		};

		log(`addItemToContainer | User is not GM, sending socket msg:`);
		log([msg]);

		Hooks.once(PickUpStixHooks.itemAddedToContainer, () => {
			log(`addItemToContainer | pick-up-stix.itemAddedToContainer hook | User is not GM, sending socket msg:`);
			clearTimeout(timeout);
			resolve(true);
		});

		getGame().socket.emit('module.pick-up-stix', msg);
	});
}

export const  lootCurrency = async (data: { looterTokenId: string, currencies: any; containerItemId: string }): Promise<boolean> => {
	log(`lootCurrency:`);
	console.log([data]);

	if (getGame().user.isGM) {
		log(`lootCurrency | User is GM, looting currency`);

		const looterToken = getCanvas().tokens.placeables.find(p => p.id === data.looterTokenId);
		const containerItem = getGame().items.get(data.containerItemId);
		const containerFlags: ItemFlags = <ItemFlags>duplicate(containerItem.getFlag('pick-up-stix', 'pick-up-stix'));
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
			sender: getGame().user.id,
			data
		}

		getGame().socket.emit('module.pick-up-stix', msg)
		return true;
	}

	return new Promise(resolve => {
		const timeout = setTimeout(() => {
			resolve(false);
		}, gmActionTimeout());

		const msg: SocketMessage = {
			sender: getGame().user.id,
			type: SocketMessageType.lootCurrency,
			data
		}

		Hooks.once(PickUpStixHooks.currencyLooted, () => {
			log(`lootCurrency | pick-up-stix.currencyLooted hook`);
			clearTimeout(timeout);
			resolve(true);
		});

		log(`lootCurrency | User is not GM, sending socket msg:`);
		log([msg]);

		getGame().socket.emit('module.pick-up-stix', msg);
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
	log(`lootItem:`);
	log([data]);

	if (getGame().user.isGM) {
		console.log(`lootItem | User is GM`);

		const qtyLootedById = {};
		const looterToken = getCanvas().tokens.placeables.find(p => p.id === data.looterTokenId);
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

    log(`lootItem | Items being looted:`);
    console.log([newItemDatas]);

		await createOwnedItem(
			looterActorId,
			newItemDatas
		);

		if (data.containerItemId) {
			const containerItem = getGame().items.get(data.containerItemId);
			const containerItemFlags: ItemFlags = <ItemFlags>duplicate(containerItem?.getFlag('pick-up-stix', 'pick-up-stix') ?? {});
			const sourceLoot: ContainerLoot = containerItemFlags?.container?.loot;

			for (let [itemType, itemsOfType] of Object.entries(sourceLoot)) {
				for (let itemData of itemsOfType) {
					if (qtyLootedById[itemData._id] === undefined) {
						continue;
					}

					const oldQty = getProperty(itemData?.data, getQuantityDataPath());
          const newQty = oldQty - qtyLootedById[itemData._id];

					if (newQty <= 0) {
						log(`lootItem | Quantity is now 0, removing item from loot`);
						sourceLoot?.[itemType]?.findSplice(v => v._id === itemData._id);
					}
					else {
            log(`lootItem | Subtracting one from quantity`);
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
			const lootTokenToken: Token = getCanvas().tokens.placeables.find(p => p.id === data.lootTokenTokenId);
			await deleteToken(lootTokenToken.id, lootTokenToken.scene.id);
		}

		const msg: SocketMessage = {
			sender: getGame().user.id,
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

		getGame().socket.emit('module.pick-up-stix', msg);
		Hooks.callAll(PickUpStixHooks.itemCollected, data);
		return true;
	}

	return new Promise(resolve => {
		const timeout = setTimeout(() => {
			resolve(null);
		}, gmActionTimeout());

		const msg: SocketMessage = {
			sender: getGame().user.id,
			type: SocketMessageType.collectItem,
			data
		}

		Hooks.once(PickUpStixHooks.itemCollected, () => {
			console.log(`lootItem | pick-up-stix.itemCollected hook`);
			clearTimeout(timeout);
			resolve(true);
		});

		console.log(`lootItem | User is not GM send msg:`);
		console.log([msg]);

		getGame().socket.emit('module.pick-up-stix', msg);
	});
}

export const currencyCollected = async (token, currency) => {
	log(`currencyCollected | called with args:`);
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
