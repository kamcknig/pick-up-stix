import { PickUpStixFlags, PickUpStixSocketMessage, SocketMessageType, ItemType, DropData } from "./models";
import ItemConfigApplication from "./item-config-application";
import { getCurrencyTypes, getQuantityDataPath } from '../../utils'
import { SettingKeys } from "./settings";
import { LootToken } from "./loot-token";

export interface LootTokenData {
	[sceneId: string]: {
		[tokenId: string]: PickUpStixFlags
	}
}

export const lootTokens: LootToken[] = [];

let _lootTokenData: LootTokenData;
export const getLootTokenData = (): LootTokenData => {
	if (_lootTokenData) {
		return _lootTokenData;
	}

	console.log('pick-up-stix | getLootTokenData | creating initial copy of loot token data from settings DB');
	_lootTokenData = duplicate(game.settings.get('pick-up-stix', SettingKeys.lootTokenData));
	return _lootTokenData;
}

export const getLootToken = (sceneId, tokenId): LootToken => {
	return lootTokens.find(lt => lt.sceneId === sceneId && lt.tokenId === tokenId);
}

export const saveLootTokenData = async (): Promise<void> => {
	console.log('pick-up-stix | saveLootTokenData | saving loot token data to the settings DB');
	await game.settings.set('pick-up-stix', SettingKeys.lootTokenData, _lootTokenData);
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

  // if the item comes from an actor's inventory, then the data structure is a tad different, the item data is stored
	// in a data property on the dropData parameter rather than on the top-level of the dropData
	if (dropData.actor) {
		console.log(`pick-up-stix | handleItemDropped | actor '${dropData.actor.id}' dropped item, get item data from the dropped item's original item data`);
		itemData = {
			...dropData.data
		};
		await dropData.actor.deleteOwnedItem(dropData.data._id);
	}
	else {
		console.log(`pick-up-stix | handleItemDropped | item comes from directory or compendium, item data comes from directory or compendium`);
		pack = dropData.pack;
		const id = dropData.id;
		const item: Item = await game.items.get(id) ?? await game.packs.get(pack)?.getEntity(id);
		if (!item) {
			console.log(`pick-up-stix | handleItemDropped | item '${id}' not found in game items or compendium`);
			return;
		}
		itemData = {
			...item.data
		};
	}

	const droppedItemIsContainer = getProperty(itemData, 'flags.pick-up-stix.pick-up-stix.itemType') === ItemType.CONTAINER;

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

	// if the drop was on another token, check what type of token it was dropped on
	if (targetToken) {
		if (droppedItemIsContainer) {
			ui.notifications.error('Cannot drop container onto target');
			return;
		}

		console.log(`pick-up-stix | handleItemDropped | item dropped onto target token '${targetToken.id}'`);

		const targetTokenFlags: PickUpStixFlags = targetToken.getFlag('pick-up-stix', 'pick-up-stix');

		if (targetTokenFlags?.itemType === ItemType.CONTAINER) {
			// if the target is a container, then add the item to the container's data
			console.log(`pick-up-stix | handleItemDropped | target token is a container`);
			const existingLoot = { ...duplicate(targetTokenFlags.container.loot ?? {}) };
			const existingItem: any = Object.values(existingLoot[itemData.type] ?? [])?.find(i => (i as any)._id === (dropData.actor ? getProperty(itemData, 'flags.pick-up-stix.pick-up-stix.originalItemId') : itemData._id));
			if (existingItem) {
				console.log(`pick-up-stix | handleItemDropped | found existing item for item '${itemData._id}`);
				console.log(existingItem);

				const quantityDataPath = getQuantityDataPath();

				if(!getProperty(existingItem.data, quantityDataPath)) {
					setProperty(existingItem.data, quantityDataPath, 1);
				}
				else {
					setProperty(existingItem.data, quantityDataPath, getProperty(existingItem.data, quantityDataPath) + 1)
				}
			}
			else {
				console.log(`pick-up-stix | handleItemDropped | Could not find existing item from '${itemData._id}`);
				if (!existingLoot[itemData.type]) {
					existingLoot[itemData.type] = [];
				}
				(existingLoot[itemData.type] as any).push({ ...itemData });
			}

			const update = {
				flags: {
					'pick-up-stix': {
						'pick-up-stix': {
							container: {
								loot: {
									...existingLoot
								}
							}
						}
					}
				}
			};

			await updateEntity(targetToken, update);
			return;
		}
		else if (targetToken.actor) {
			// if the token it was dropped on was an actor, add the item to the new actor
			await createOwnedItem(
				targetToken.actor,
				[{
					...itemData
				}]
			);
			return;
		}
	}

	// if it's not a container, then we can assume it's an item. Create the item token
	const hg = canvas.dimensions.size * .5;
	const { x, y } = canvas.grid.getSnappedPosition(dropData.x - hg, dropData.y - hg, 1);

	// if the item being dropped is a container, just create the empty container
	if (droppedItemIsContainer) {
		console.log(`pick-up-stix | handleItemDropped | dropped item is a container`);
		const lootToken = await LootToken.create(
			{
				name: itemData.name,
				img: itemData.flags['pick-up-stix']['pick-up-stix']['container']['imageClosePath'],
				x,
				y,
				disposition: 0
			},
			{
				itemType: ItemType.CONTAINER,
				itemData
			}
		);

		lootTokens.push(lootToken);
		return;
	}

	let tokenData = {
		name: itemData.name,
		disposition: 0,
		x,
		y,
		img: itemData.img
	}

	let lootData = {
		itemType: ItemType.ITEM,
		itemData: {
			...itemData
		}
	}

	let lootToken: LootToken;

	// if a Token was successfully created
	if (!dropData.actor) {
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
							lootToken = await LootToken.create(tokenData, lootData);
							resolve();
            }
					},
					two: {
						icon: '<i class="fas fa-boxes"></i>',
						label: 'Container',
						callback: async () => {
							const img: string = game.settings.get('pick-up-stix', SettingKeys.closeImagePath);
							lootToken = await LootToken.create({ ...tokenData, img }, {
								itemType: ItemType.CONTAINER,
								isLocked: false,
								container: {
									currency: Object.keys(getCurrencyTypes()).reduce((acc, shortName) => ({ ...acc, [shortName]: 0 }), {}),
									canClose: true,
									isOpen: false,
									imageClosePath: img,
									imageOpenPath: game.settings.get('pick-up-stix', SettingKeys.openImagePath),
									soundOpenPath: game.settings.get('pick-up-stix', SettingKeys.defaultContainerOpenSound),
									soundClosePath: game.settings.get('pick-up-stix', SettingKeys.defaultContainerCloseSound)
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
		lootToken = await LootToken.create(tokenData, lootData);
	}

	lootTokens.push(lootToken);
}

async function handleTokenItemConfig(e?, controlledToken?: Token) {
	console.log(`pick-up-stix | handleTokenItemConfig called with args`);
	clearTimeout(clickTimeout);
	const clickedToken: Token = this;

	if (this.getFlag('pick-up-stix', 'pick-up-stix.itemType') === ItemType.CONTAINER) {
    new ItemConfigApplication(clickedToken).render(true);
    return;
  }
}

export async function toggleItemLocked(e): Promise<any> {
	console.log(`pick-up-stix | toggleItemLocked`);

	const clickedToken: Token = this;
	const flags: PickUpStixFlags = clickedToken.getFlag('pick-up-stix', 'pick-up-stix');
	await clickedToken.setFlag('pick-up-stix', 'pick-up-stix.isLocked', !flags.isLocked);
}

let clickTimeout;

export async function updateEntity(entity: { id: string, update: (data, options?) => void }, updates): Promise<void> {
	console.log(`pick-up-stix | updateToken with args:`);
	console.log([entity, updates]);

	if (game.user.isGM) {
		await entity.update(updates);
		return;
	}

	const msg: PickUpStixSocketMessage = {
		sender: game.user.id,
		type: SocketMessageType.updateEntity,
		data: {
			tokenId: entity.id,
			updates
		}
	};

	socket.emit('module.pick-up-stix', msg, () => {
		console.log(`pick-up-stix | updateToken | socket message handled`);
	});
}

export async function updateActor(actor, updates): Promise<void> {
	if (game.user.isGM) {
		await actor.update(updates);
		return;
	}

	const msg: PickUpStixSocketMessage = {
		sender: game.user.id,
		type: SocketMessageType.updateActor,
		data: {
			actorId: actor.id,
			updates
		}
	};

	socket.emit('module.pick-up-stix', msg);
}

export async function createOwnedItem(actor: Actor, items: any[]) {
	if (game.user.isGM) {
		await actor.createOwnedItem(items);
		return;
	}

	const msg: PickUpStixSocketMessage = {
		sender: game.user.id,
		type: SocketMessageType.createOwnedEntity,
		data: {
			actorId: actor.id,
			items
		}
	};

	socket.emit('module.pick-up-stix', msg, () => {
		console.log(`pick-up-stix | createOwnedEntity | socket message handled`);
	});
}

export const createToken = async (data: any): Promise<string> => {
	console.log(`pick-up-stix | createToken | called with args:`);
	console.log(data);

	if (game.user.isGM) {
		console.log(`pick-up-stix | createToken | current user is GM, creating token`);
		const t = await Token.create({
			...data
		});
		return t.id;
	}

	console.log(`pick-up-stix | createToken | current user is not GM, send socket message`);
	const msg: PickUpStixSocketMessage = {
		sender: game.user.id,
		type: SocketMessageType.createItemToken,
		data
	}

	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			reject('Token never created');
		}, 2000);

		socket.emit('module.pick-up-stix', msg, () => {
			console.log(`pick-up-stix | createToken | socket message handled`);

			Hooks.once('createToken', (scene, data) => {
				// TODO: could possibly add a custom authentication ID to the data we emit, then we can
				// check that ID against this created token ID and make sure we are getting the right one. Seems
				// like it could be rare, but there could be a race condition with other tokens being created
				// near the same time we are creating this token. Maybe through other modules doing it.
				console.log(`pick-up-stix | createToken | createToken hook | Token '${data.id}' created`);
				clearTimeout(timeout);
				resolve(data._id);
			});
		});
	});
}

export const drawLockIcon = async (p: PlaceableObject): Promise<any> => {
	console.log(`pick-up-stix | drawLockIcon | called with args:`);
	console.log(p);

	if (!game.user.isGM) {
		console.log(`pick-up-stix | drawLockIcon | user is not GM, not drawing lock`);
		return;
	}

	const lock = p.getChildByName('pick-up-stix-lock');
	if (lock) {
		console.log(`pick-up-stix | drawLockIcon | found previous lock icon, removing it`)
		p.removeChild(lock);
		lock.destroy();
	}

	const tex = await loadTexture('icons/svg/padlock.svg');
	const icon = p.addChild(new PIXI.Sprite(tex));
	icon.name = 'pick-up-stix-lock';
	icon.width = icon.height = 40;
	icon.alpha = .5;
	icon.position.set(p.width * .5 - icon.width * .5, p.height * .5 - icon.height * .5);
}

export const itemCollected = (actorToken, item) => {
	ChatMessage.create({
		content: `
			<p>Picked up ${item.name}</p>
			<img src="${item.img}" style="width: 40px;" />
		`,
		speaker: {
			alias: actorToken.actor.name,
			scene: (game.scenes as any).active.id,
			actor: actorToken.actor.id,
			token: actorToken.id
		}
	});
}

export const currencyCollected = (actorToken, currency) => {
	console.log(`pick-up-stix | currencyCollected | called with args:`);
	console.log([actorToken, currency]);
	let chatContent = '';
	Object.entries(currency).forEach(([k, v]) => {
		chatContent += `<span class="pick-up-stix-chat-currency ${k}"></span><span>(${k}) ${v}</span><br />`;
	});
	let content = `<p>Picked up:</p>${chatContent}`;
	ChatMessage.create({
		content,
		speaker: {
			alias: actorToken.actor.name,
			scene: (game.scenes as any).active.id,
			actor: actorToken.actor.id,
			token: actorToken.id
		}
	});
}
