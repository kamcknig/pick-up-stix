import { PickUpStixFlags, PickUpStixSocketMessage, SocketMessageType, ItemType } from "./models";
import ItemConfigApplication from "./item-config-application";
import ChooseTokenApplication from "./choose-token-application";
import { dist } from '../../utils'
import { SettingKeys } from "./settings";

export const lootTokens: string[] = [];

/**
 * Handles data dropped onto the canvas.
 * @param dropData
 */
export async function handleDropItem(dropData: { actorId?: string, pack?: string, id?: string, data?: any, x: number, y: number }) {
	console.log(`pick-up-stix | handleDropItem | called with args:`);
	console.log(duplicate(dropData));

	// if the item came from an actor's inventory, then it'll have an actorId property, we'll need to remove the item from that actor
	const sourceActorId: string = dropData.actorId;

	let pack: string;
	let itemData: any;

	// if the item comes from an actor's inventory, then the data structure is a tad different, the item data is stored
	// in a data property on the dropData parameter rather than on the top-level of the dropData
	if (sourceActorId) {
		console.log(`pick-up-stix | handleDropItem | actor '${sourceActorId}' dropped item, get item data from the dropped item's original item data`);
		itemData = {
			...dropData.data
		};
		await game.actors.get(sourceActorId).deleteOwnedItem(dropData.data._id);
	}
	else {
		console.log(`pick-up-stix | handleDropItem | item comes from directory or compendium, item data comes from directory or compendium`);
		pack = dropData.pack;
		const id = dropData.id;
		const item: Item = await game.packs.get(pack)?.getEntity(id) ?? game.items.get(id);
		if (!item) {
			console.log(`pick-up-stix | handleDropItem | item '${dropData.id}' not found in game items or compendium`);
			return;
		}
		itemData = {
			...item.data
		};
	}

	console.log(`pick-up-stix | handleDropItem | itemData:`);
	console.log(itemData);

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

		console.log(`pick-up-stix | handleDropItem | item dropped onto target token '${targetToken.id}'`);

		const targetTokenFlags: PickUpStixFlags = targetToken.getFlag('pick-up-stix', 'pick-up-stix');

		if (targetTokenFlags?.itemType === ItemType.CONTAINER) {
			// if the target is a container, then add the item to the container's data
			console.log(`pick-up-stix | handleDropItem | target token is a container`);
			const existingLoot = { ...duplicate(targetTokenFlags.container.loot) };
			const existingItem: any = Object.values(existingLoot[itemData.type] ?? [])?.find(i => (i as any)._id === itemData._id);
			if (existingItem) {
				console.log(`pick-up-stix | handleDropItem | found existing item for item '${itemData._id}`);
				console.log(existingItem);

				if(!existingItem.data.quantity){
					existingItem.data.quantity = 1;
				}
				else {
					existingItem.data.quantity++;
				}
			}
			else {
				console.log(`pick-up-stix | handleDropItem | Could not find existing item from '${itemData._id}`);
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
	const hg = canvas.dimensions.size / 2;
	dropData.x -= (hg);
	dropData.y -= (hg);

	const { x, y } = canvas.grid.getSnappedPosition(dropData.x, dropData.y, 1);
	dropData.x = x;
	dropData.y = y;

	let tokenId;

	// if the item being dropped is a container, just create the empty container
	if (droppedItemIsContainer) {
		console.log(`pick-up-stix | handleDropItem | dropped item is a container`);
		tokenId = await createItemToken({
			...itemData,
			img: itemData.flags['pick-up-stix']['pick-up-stix']['container']['imageClosePath'],
			x: dropData.x,
			y: dropData.y,
			disposition: 0
		});

		return;
	}

	let updates: any = {};

	const createDefaultItem = () => updates = {
		img: itemData.img,
		flags: {
			'pick-up-stix': {
				version: game.settings.get('pick-up-stix', SettingKeys.version),
				'pick-up-stix': {
					itemType: ItemType.ITEM,
					itemData: {
						...itemData
					}
				}
			}
		}
	}

	// if a Token was successfully created
	if (!sourceActorId) {
		await new Promise(resolve => {
			// render the item type selection form
			new Dialog({
				content: 'What kind of loot is this?',
				default: 'one',
				title: 'Loot Type',
				close: (...args) => resolve(),
				buttons: {
					one: {
						icon: '<i class="fas fa-box"></i>',
						label: 'Item',
						callback: createDefaultItem
					},
					two: {
						icon: '<i class="fas fa-boxes"></i>',
						label: 'Container',
						callback: () => updates = {
							img: game.settings.get('pick-up-stix', SettingKeys.closeImagePath),
							flags: {
								'pick-up-stix': {
									version: game.settings.get('pick-up-stix', SettingKeys.version),
									'pick-up-stix': {
										itemType: ItemType.CONTAINER,
										isLocked: false,
										container: {
											canOpen: true,
											isOpen: false,
											imageClosePath: game.settings.get('pick-up-stix', SettingKeys.closeImagePath),
											imageOpenPath: game.settings.get('pick-up-stix', SettingKeys.openImagePath),
											soundOpenPath: game.settings.get('pick-up-stix', SettingKeys.defaultContainerOpenSound),
											soundClosePath: game.settings.get('pick-up-stix', SettingKeys.defaultContainerCloseSound)
										}
									}
								}
							}
						}
					}
				}
			}).render(true);

			lootTokens.push(tokenId);
		});
	}
	else {
		createDefaultItem();
	}

	tokenId = await createItemToken({
		...updates,
		name: itemData.name,
		x: dropData.x,
		y: dropData.y,
		disposition: 0
	});
}

export function setupMouseManager(): void {
	console.log(`pick-up-stix | setupMouseManager`);

	const permissions = {
		clickLeft: () => true,
		clickLeft2: () => game.user.isGM,
		clickRight: () => game.user.isGM,
		clickRight2: () => game.user.isGM,
		dragStart: this._canDrag
	};

	// Define callback functions for each workflow step
	const callbacks = {
		clickLeft: handleTokenItemClicked.bind(this),
		clickLeft2: handleTokenItemConfig.bind(this),
		clickRight: handleTokenRightClick.bind(this),
		clickRight2: handleTokenItemConfig.bind(this),
		dragLeftStart: this._onDragLeftStart,
		dragLeftMove: this._onDragLeftMove,
		dragLeftDrop: this._onDragLeftDrop,
		dragLeftCancel: this._onDragLeftCancel
	};

	// Define options
	const options = {
		target: this.controlIcon ? "controlIcon" : null
	};

	// Create the interaction manager
	this.mouseInteractionManager = new MouseInteractionManager(this, canvas.stage, permissions, callbacks, options).activate();
}

function handleTokenItemConfig(e?, controlledToken?: Token) {
	console.log(`pick-up-stix | handleTokenItemConfig called with args`);
	clearTimeout(clickTimeout);
	const clickedToken: Token = this;

	try {
		const maxDist = Math.hypot(canvas.grid.size, canvas.grid.size);
		if (!controlledToken && game.user.isGM) {
			controlledToken = canvas.tokens.controlled?.filter((t: Token) => dist(t, clickedToken) < maxDist && t.getFlag('pick-up-stix', 'pick-up-stix') === undefined)[0]
		}
	}
	catch (e) {
		controlledToken = null;
	}

	console.log(clickedToken.sheet)

	const f = new ItemConfigApplication(clickedToken, controlledToken).render(true);
}

async function handleTokenRightClick(e) {
	const hud = canvas.hud.pickUpStixLootHud;
	if (hud) {
		this.control({releaseOthers: true});
		if (hud.object === this) hud.clear();
		else hud.bind(this);
	}
}

export async function toggleItemLocked(e): Promise<any> {
	console.log(`pick-up-stix | toggleItemLocked`);

	const clickedToken: Token = this;
	const flags: PickUpStixFlags = clickedToken.getFlag('pick-up-stix', 'pick-up-stix');
	await clickedToken.setFlag('pick-up-stix', 'pick-up-stix.isLocked', !flags.isLocked);
}

let clickTimeout;
async function handleTokenItemClicked(e): Promise<void> {
	console.log(`pick-up-stix | handleTokenItemClicked | ${this.id}`);

	const clickedToken: Token = this;

	// if the token is hidden just do a normal click
	if (e.currentTarget.data.hidden) {
		console.log(`pick-up-stix | handleTokenItemClicked | token is hidden, handle normal click`);
		(clickedToken as any)._onClickLeft(e);
		return;
	}

	// if the item isn't visible can't pick it up
	if (!clickedToken.isVisible) {
		console.log(`pick-up-stix | handleTokenItemClicked | item is not visible to user`);
		return;
	}

	// get the tokens that the user controls
  let controlledTokens: Token[] = canvas.tokens.controlled;

	// gm special stuff
	if (game.user.isGM) {
		console.log(`pick-up-stix | handleTokenItemClicked | user is GM`);

		if (!controlledTokens.length) {
			console.log(`pick-up-stix | handleTokenItemClicked | no controlled tokens, handle normal click`);
			(clickedToken as any)._onClickLeft(e);
			return;
		}

		// if only controlling the item itself, handle a normal click
		if (controlledTokens.every(t => clickedToken === t)) {
			console.log(`pick-up-stix | handleTokenItemClicked | only controlling the item, handle normal click`);
			(clickedToken as any)._onClickLeft(e);
			return;
		}
	}

	// get only the tokens that are within the right distance
	const maxDist = Math.hypot(canvas.grid.size, canvas.grid.size);
	controlledTokens = controlledTokens.filter(t => dist(t, clickedToken) < (maxDist + 20) && t.getFlag('pick-up-stix', 'pick-up-stix') === undefined);

	// if there are no controlled tokens within reach, show an error
	if (!controlledTokens.length) {
		console.log(`pick-up-stix | handleTokenItemClicked | item is out of reach`);
		ui.notifications.error('You are too far away to interact with that');
		return;
	}

	// get the flags on the clicked token
	const flags: PickUpStixFlags = duplicate(clickedToken.getFlag('pick-up-stix', 'pick-up-stix'));

	// if it's locked then it can't be opened
	if (flags.isLocked) {
		console.log(`pick-up-stix | handleTokenItemClicked | item is locked`);
		var audio = new Audio(CONFIG.sounds.lock);
		audio.play();
		return;
	}

	// checking for double click, the double click handler clears this timeout
	clickTimeout = setTimeout(async () => {
		// if the user controls one token use it, otherwise ask which token to use
		const controlledToken: Token =
			controlledTokens.length === 1 ?
			controlledTokens[0] :
			await new Promise(resolve => {
				const d = new ChooseTokenApplication(controlledTokens).render(true);
				Hooks.once('closeChooseTokenApplication', () => {
					resolve(d.getData().selectedToken);
				});
			});

		if (!controlledToken) {
			console.log(`pick-up-stix | handleTokenItemClicked | No token selected from dialog`);
			ui.notifications.error('You must control at least one token.');
			return;
		}

		if(flags.itemType === ItemType.CONTAINER) {
			console.log(`pick-up-stix | handleTokenItemClicked | item is a container`);

			// if it's a container and it's open and can't be closed then don't do anything
			if (flags.container?.isOpen && !(flags.container?.canClose ?? true)) {
				console.log(`pick-up-stix | handleTokenItemClicked | container is open and can't be closed`);
				return;
			}

			flags.container.isOpen = !flags.container?.isOpen;

			// if there are any container updates then update the container
			await new Promise(resolve => {
				setTimeout(async () => {
					await updateEntity(clickedToken, {
						img: flags.container?.isOpen ? flags.container.imageOpenPath : flags.container.imageClosePath,
						flags: {
							'pick-up-stix': {
								'pick-up-stix': {
									...flags
								}
							}
						}
					});
					const a = new Audio(
						flags.container.isOpen ?
							clickedToken.getFlag('pick-up-stix', 'pick-up-stix.container.soundOpenPath') :
							clickedToken.getFlag('pick-up-stix', 'pick-up-stix.container.soundClosePath')
					);
					try {
						a.play();
					}
					catch (e) {
						// it's ok to error here
					}

					resolve();
				}, 200);
			});

			if (!flags.container?.isOpen) {
				return;
			}

			handleTokenItemConfig.bind(this)(e, controlledToken);
			return;
		}

		console.log(`pick-up-stix | handleTokenItemClicked | token is an ItemType.ITEM`);

		// if it's just a single item, delete the map token and create an new item on the player
		await deleteToken(clickedToken);
		await createOwnedItem(controlledToken.actor, [{
			...flags.itemData
		}]);
		itemCollected(controlledToken, { ...flags.itemData });
	}, 250);

	this.mouseInteractionManager?._deactivateDragEvents();
}

async function deleteToken(token: Token): Promise<void> {
	console.log(`pick-up-stix | deleteToken with args:`);
	console.log(token);

	if (game.user.isGM) {
		await canvas.scene.deleteEmbeddedEntity('Token', token.id);
		return;
	}

	const msg: PickUpStixSocketMessage = {
		sender: game.user.id,
		type: SocketMessageType.deleteToken,
		data: token.id
	}
	socket.emit('module.pick-up-stix', msg);
}

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

async function createItemToken(data: any): Promise<string> {
	console.log(`pick-up-stix | createItemToken | called with args:`);
	console.log(data);

	if (game.user.isGM) {
		console.log(`pick-up-stix | createItemToken | current user is GM, creating token`);
		const t = await Token.create({
			...data
		});
		return t.id;
	}

	console.log(`pick-up-stix | createItemToken | current user is not GM, send socket message`);
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
			console.log(`pick-up-stix | createItemToken | socket message handled`);

			Hooks.once('createToken', (scene, data) => {
				// TODO: could possibly add a custom custom authentication ID to the data we emit, then we can
				// check that ID against this created token ID and make sure we are getting the right one. Seems
				// like it could be rare, but there could be a race condition with other tokens being created
				// near the same time we are creating this token. Maybe through other modules doing it.
				console.log(`pick-up-stix | createItemToken | createToken hook | Token '${data.id}' created`);
				clearTimeout(timeout);
				resolve(data._id);
			});
		});
	});
}

export async function drawLockIcon(p: PlaceableObject): Promise<any> {
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

export function itemCollected(actorToken, item) {
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

export function currencyCollected(actorToken, currency) {
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