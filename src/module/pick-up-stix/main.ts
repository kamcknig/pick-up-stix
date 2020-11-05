import { PickUpStixSocketMessage, SocketMessageType, ItemType, DropData } from "./models";
import { dist, getCurrencyTypes } from '../../utils'
import { SettingKeys } from "./settings";
import { ItemFlags, LootToken, TokenData, TokenFlags } from "./loot-token";

declare function fromUuid(uuid: string): Promise<Entity>;

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
	console.log(`pick-up-stix | getValidControlledTokens:`);
  console.log([data]);

	let token: Token;

	if (typeof data === 'string') {
		token = canvas.tokens.placeables.find(p => p.id === data);
	}
	else {
		token = data;
	}

  if (!token) {
    console.log(`pick-up-stix | getValidControlledTokens | no token provided so returning nothing`);
		return [];
  }

  console.log(`pick-up-stix | getValidControlledTokens | Looking for tokens near '${token.id}' '${token.name}`);

  console.log(`pick-up-stix | getValidControlledTokens | looping through currently controlled tokens`);
  console.log([canvas.tokens.controlled]);

  const controlled = canvas.tokens.controlled.filter(t => {
    if (!t.actor) {
      console.log(`pick-up-stix | getValidControlledTokens | token '${t.id}' '${t.name}' has no actor, skipping`);
			return false;
		}

		return (
		  t.x + t.w > token.x - canvas.grid.size &&
			t.x < token.x + token.w + canvas.grid.size &&
			t.y + t.h > token.y - canvas.grid.size &&
			t.y < token.y + token.h + canvas.grid.size
		);
	});

	console.log(`pick-up-stix | getValidControlledTokens | controlled tokens within range`);
	console.log([controlled]);
	return controlled;
}

export const normalizeDropData = (data: DropData): any => {
	console.log('pick-up-stix | normalizeDropData called with args:');
	console.log([data]);

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
export async function handleItemDropped(dropData: DropData) {
	console.log(`pick-up-stix | handleItemDropped | called with args:`);
	console.log(dropData);

	// The data here should already be normalized, meaning that if we were able to determine the actor reference,
	// it should exist here. So if we have an actor ID but no actor, that means we weren't able to figure out
	// which actor this item might have come from.
  if (dropData.actorId && !dropData.actor) {
    ui.notifications.error(`Please ensure you are only controlling the token (and only the one token) for the character you're working with.`);
    return;
	}

	let pack: string;
	let itemData: any;
	let lootTokens: LootToken[] = [];

  // if the item comes from an actor's inventory, then the data structure is a tad different, the item data is stored
	// in a data property on the dropData parameter rather than on the top-level of the dropData
	if (dropData.actor) {
		console.log(`pick-up-stix | handleItemDropped | actor '${dropData.actor.id}' dropped item, get item data from the dropped item's original item data`);
		itemData = duplicate(dropData.data);
		await dropData.actor.deleteOwnedItem(dropData.data._id);
	}
	else {
		console.log(`pick-up-stix | handleItemDropped | item comes from directory or compendium, item data comes from directory or compendium`);
		pack = dropData.pack;
		const id = dropData.id;
		const item: Item = await game.items.get(id) ?? await game.packs.get(pack)?.getEntity(id);
		lootTokens = getLootToken({ uuid: item.uuid });
		if (!item) {
			console.log(`pick-up-stix | handleItemDropped | item '${id}' not found in game items or compendium`);
			return;
		}
		itemData = duplicate(item.data);
	}

  console.log(`pick-up-stix | handleItemDropped`);
  console.log([itemData]);

	const droppedItemFlags: ItemFlags = getProperty(itemData, 'flags.pick-up-stix.pick-up-stix');

	let targetToken: Token;
	let p: PlaceableObject;
	// loop through placeables on the map and see if it's being dropped onto a token
	for (p of canvas.tokens.placeables) {
		if (dropData.x < p.x + p.width && dropData.x > p.x && dropData.y < p.y + p.height && dropData.y > p.y && p instanceof Token) {
			// dropped it onto a token, set the targetToken
			targetToken = p;
			break;
		}
	}

	if (targetToken) {
		console.log(`pick-up-stix | handleItemDroped | dropping onto target '${targetToken.id}' '${targetToken.name}`);

    if (droppedItemFlags?.itemType === ItemType.CONTAINER) {
			// if the item being dropped is a container, you can't add it to another token
      console.log(`pick-up-stix | handleItemDroped | cannot drop container ${itemData.id} onto token '${targetToken.id}' '${targetToken.name}`);
			ui.notifications.error('A container may only be placed onto an empty square without any tokens.');
			return;
		}

		if (targetToken.actor) {
			// if the token it was dropped on was an actor, add the item to the new actor
			await createOwnedItem(targetToken.actor, itemData);
			return;
		}

		const targetTokenFlags: TokenFlags = targetToken.getFlag('pick-up-stix', 'pick-up-stix');
		const item = await fromUuid(targetTokenFlags?.itemUuid);
		const itemFlags: ItemFlags = item?.getFlag('pick-up-stix', 'pick-up-stix');

		if (itemFlags.itemType !== ItemType.CONTAINER) {
			ui.notifications.error(`Cannot place '${item.name}' onto token ${targetToken.name}`);
			console.log(`pick-up-stix | handleItemDropped | Can't drop ${item.name} ${item.id} onto target token ${targetToken.name} ${targetToken.id}`);
			console.log([targetToken, item]);
			return;
		}

		// TODO: need to implement adding to loot container
		//await lootToken.addItem(itemData, id);
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
	if (droppedItemFlags.itemType === ItemType.CONTAINER) {
		console.log(`pick-up-stix | handleItemDropped | dropped item is a container`);
		const img: string = droppedItemFlags.container.imageClosePath;
		if (lootTokens.length > 0) {
			await LootToken.create({ ...tokenData }, lootTokens[0].itemUuid);
		}
		else {
			await LootToken.create({ ...tokenData }, {
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
		return;
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
							await LootToken.create({ ...tokenData }, itemData);
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
		console.log(`pick-up-stix | handleItemDropped | Dropped item doesn't come from actor and a loot token already exists, so not creating a new item`);
		await LootToken.create({ ...tokenData }, lootTokens[0].itemUuid);
	}
}

export const deleteToken = async (tokenId: string, sceneId: string): Promise<void> => {
  console.log(`pick-up-stix | deleteToken with args:`);
  console.log([tokenId, sceneId]);

  if (game.user.isGM) {
		const scene = Scene.collection.get(sceneId);
    await scene?.deleteEmbeddedEntity('Token', tokenId);
    return;
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(null);
    }, 2000);

    const msg: PickUpStixSocketMessage = {
      sender: game.user.id,
      type: SocketMessageType.deleteToken,
      data: {
				tokenId,
				sceneId
			}
    }

    Hooks.once('deleteToken', (scene, data, options, userId) => {
      console.log(`pick-up-stix | deleteToken | deleteToken hook`);
      clearTimeout(timeout);
      resolve(data);
    });

    game.socket.emit('module.pick-up-stix', msg);
  });
}

export async function updateEntity(entity: { id: string, update: (data, options?) => void }, updates): Promise<void> {
	console.log(`pick-up-stix | updateEntity with args:`);
	console.log([entity, updates]);

	if (game.user.isGM) {
		console.log('pick-up-stix | user is GM, making update');
		await entity.update(updates);
		return;
	}

  console.log('pick-up-stix | user is not GM, sending socket msg');

	const msg: PickUpStixSocketMessage = {
		sender: game.user.id,
		type: SocketMessageType.updateEntity,
		data: {
			tokenId: entity.id,
			updates
		}
	};

	game.socket.emit('module.pick-up-stix', msg);
}

export async function updateActor(actor, updates): Promise<void> {
	console.log('pick-up-stix | updateActor | called with args:');
	console.log([actor, updates]);

	if (game.user.isGM) {
		console.log(`pick-up-stix | user is GM, udating actor`);
		await actor.update(updates);
		return;
	}

	console.log('pick-up-stix | user is not GM, sending socket msg');

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(null);
    }, 2000);

    const msg: PickUpStixSocketMessage = {
      sender: game.user.id,
      type: SocketMessageType.updateActor,
      data: {
        actorId: actor.id,
        updates
      }
    };

    Hooks.once('updateActor', (actor, data, options, userId) => {
      console.log(`pick-up-stix | updateActor | updateActor hook`);
      clearTimeout(timeout);
      resolve(actor);
    });

    game.socket.emit('module.pick-up-stix', msg);
  });
}

export async function createOwnedItem(actor: Actor, data: any | any[]) {
	console.log('pick-up-stix | createOwnedItem | called with args:');
	data = Array.isArray(data) ? data : [data];
	console.log([actor, data]);

	if (game.user.isGM) {
		console.log(`pick-up-stix | user is GM, creating owned item`);
		await actor.createOwnedItem(data);
		return;
	}

	console.log('pick-up-stix | user is not GM, sending socket msg');

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(null);
    }, 2000);

    const msg: PickUpStixSocketMessage = {
      sender: game.user.id,
      type: SocketMessageType.createOwnedEntity,
      data: {
        actorId: actor.id,
        items: data
      }
    };

    Hooks.once('createOwnedItem', (actor, item, options, userId) => {
      console.log(`pick-up-stix | createOwnedItem | createOwnedItem hook | item '${item.id}' created`);
      clearTimeout(timeout);
      resolve(item);
    });

    game.socket.emit('module.pick-up-stix', msg);
  });
}

export const createItem = async (data: any, options: any = {}): Promise<Item<any>> => {
	console.log(`pick-up-stix | createItem | called with args:`);
	console.log([data]);

	if (game.user.isGM) {
		console.log(`pick-up-stix | user is GM, creating entity`);
		const e = await Item.create(data, options);
		return e as Item<any>
	}

	console.log('pick-up-stix | user is not GM, sending socket msg');

	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			reject(null);
		}, 2000);

		const msg: PickUpStixSocketMessage = {
			sender: game.user.id,
			type: SocketMessageType.createEntity,
			data: {
				data,
				options
			}
		};

		Hooks.once('createItem', (item, options, userId) => {
			console.log(`pick-up-stix | createItem | createItem hook | item '${item.id}' created`);
			clearTimeout(timeout);
			resolve(item);
		});

		game.socket.emit('module.pick-up-stix', msg);
	});
}

export const deleteOwnedItem = async (actorId: string, itemId: string) => {
	console.log('pick-up-stix | deleteOwnedItem | called with args:');
	console.log([actorId, itemId]);

	if (game.user.isGM) {
		console.log(`pick-up-stix | deleteOwnedItem | user is GM, deleting entity`);
		const actor = game.actors.get(actorId);
		await actor.deleteOwnedItem(itemId);
		return;
	}

	console.log('pick-up-stix | deleteOwnedItem | user is not GM, sending socket msg');

	const msg: PickUpStixSocketMessage = {
		sender: game.user.id,
		type: SocketMessageType.deleteOwnedItem,
		data: {
			actorId,
			itemId
		}
	}

	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			reject({ actorId, itemId });
		}, 2000);

		Hooks.once('createOwnedItem', (actor, itemData, options, userId) => {
			console.log('pick-up-stix | deleteOwnedItem | createOwnedItem hook');
			clearTimeout(timeout);
			resolve(itemData._id);
		});

		game.socket.emit('module.pick-up-stix', msg);
	});
}

export const deleteEntity = async (uuid: string) => {
	console.log('pick-up-stix | deleteEntity | called with args:');
	console.log([uuid]);

	const e = await fromUuid(uuid);

	if (!e) {
		console.log(`pick-up-stix | deleteEntity | entity not found from uuid '${uuid}'`);
		return uuid;
	}

	if (game.user.isGM) {
		console.log(`pick-up-stix | user is GM, deleting entity`);
		return await e.delete();
	}

	console.log('pick-up-stix | user is not GM, sending socket msg');

	const msg: PickUpStixSocketMessage = {
		sender: game.user.id,
		type: SocketMessageType.deleteEntity,
		data: {
			uuid
		}
	}

	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			reject(uuid);
		}, 2000);

		Hooks.once('deleteItem', (item, options, userId) => {
			console.log('pick-up-stix | deleteEntity | deleteItem hook');
			clearTimeout(timeout);
			resolve(item.id);
		});

		game.socket.emit('module.pick-up-stix', msg);
	});
}

export const deleteEmbeddedEntity = async (parentUuid, entityType, entityId) => {
	console.log('pick-up-stix | deleteEmbeddedEntity | called with args:');
	console.log([parentUuid, entityType, entityId]);

	const e = await fromUuid(parentUuid);

	if (!e) {
		console.log(`pick-up-stix | deleteEmbeddedEntity | parent entity not found from uuid '${parentUuid}'`);
		return parentUuid;
	}

	if (game.user.isGM) {
		console.log(`pick-up-stix | deleteEmbeddedEntity | user is GM, deleting entity`);
		return await e.deleteEmbeddedEntity(entityType, entityId)
	}

	console.log('pick-up-stix | deleteEmbeddedEntity | user is not GM, sending socket msg');

	const msg: PickUpStixSocketMessage = {
		sender: game.user.id,
		type: SocketMessageType.deleteEmbeddedEntity,
		data: {
			parentUuid,
			entityType,
			entityId
		}
	}

	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			reject({ parentUuid, entityType, entityId });
		}, 2000);

		Hooks.once('deleteItem', (item, options, userId) => {
			console.log('pick-up-stix | deleteEmbeddedEntity | deleteItem hook');
			clearTimeout(timeout);
			resolve(item.id);
		});

		game.socket.emit('module.pick-up-stix', msg);
	})

}

export const updateEmbeddedEntity = async (parentUuid, entityType, data) => {
	console.log('pick-up-stix | updateEmbeddedEntity | called with args:');
	console.log([parentUuid, entityType, data]);

	const e = await fromUuid(parentUuid);

	if (!e) {
		console.log(`pick-up-stix | updateEmbeddedEntity | parent entity not found from uuid '${parentUuid}'`);
		return parentUuid;
	}

	if (game.user.isGM) {
		console.log(`pick-up-stix | updateEmbeddedEntity | user is GM, deleting entity`);
		return await e.updateEmbeddedEntity('Token', data);
	}

	console.log('pick-up-stix | updateEmbeddedEntity | user is not GM, sending socket msg');

	const msg: PickUpStixSocketMessage = {
		sender: game.user.id,
		type: SocketMessageType.updateEmbeddedEntity,
		data: {
			parentUuid,
			entityType,
			data
		}
	}

	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			reject({ parentUuid, entityType, data });
		}, 2000);

		Hooks.once('updateToken', (scene, tokenData, data, options, userId) => {
			console.log('pick-up-stix | updateEmbeddedEntity | updateToken hook');
			clearTimeout(timeout);
			resolve(tokenData._id);
		});

		game.socket.emit('module.pick-up-stix', msg);
	})

}

export const createToken = async (data: any): Promise<string> => {
	console.log(`pick-up-stix | createToken | called with args:`);
	console.log([data]);

	if (game.user.isGM) {
		console.log(`pick-up-stix | user is GM, creating token`);
		const t = await Token.create({
			...data
		});
		return t.id;
	}

	console.log('pick-up-stix | user is not GM, sending socket msg');

	const msg: PickUpStixSocketMessage = {
		sender: game.user.id,
		type: SocketMessageType.createItemToken,
		data
	}

	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			reject('Token never created');
		}, 2000);

		Hooks.once('createToken', (scene, data) => {
			console.log(`pick-up-stix | createToken | createToken hook | Token '${data.id}' created`);
			clearTimeout(timeout);
			resolve(data._id);
		});

		game.socket.emit('module.pick-up-stix', msg);
	});
}

export const currencyCollected = async (token, currency) => {
	console.log(`pick-up-stix | currencyCollected | called with args:`);
	console.log([token, currency]);
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