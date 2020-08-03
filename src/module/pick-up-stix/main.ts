import { PickUpStixFlags, PickUpStixSocketMessage, SocketMessageType, ItemType } from "./models";
import ItemTypeSelectionApplication from "./item-type-selection-application";
import ItemConfigApplication from "./item-config-application";

export const lootTokens: string[] = [];

/**
 * Handles data dropped onto the canvas.
 * @param dropData
 */
export async function handleDropItem(dropData: { actorId?: string, pack?: string, id?: string, data?: any, x: number, y: number }) {
	console.log(`pick-up-stix | handleDropItem | called with args:`);
	console.log(dropData);

	// if the item came from an actor's inventory, then it'll have an actorId property, we'll need to remove the item from that actor
	const sourceActorId: string = dropData.actorId;

	let pack: string;
	let itemId: string;
	let itemData: any;

	// if the item comes from an actor's inventory, then the data structure is a tad different, the item data is stored
	// in a data property on the dropData parameter rather than on the top-level of the dropData
	if (sourceActorId) {
		console.log(`pick-up-stix | handleDropItem | actor '${sourceActorId}' dropped item`);
		itemData = {
			...dropData.data.flags?.['pick-up-stix']?.['pick-up-stix']?.['initialState']?.['itemData'] ?? {}
		};

		await game.actors.get(sourceActorId).deleteOwnedItem(dropData.data._id);
	}
	else {
		console.log(`pick-up-stix | handleDropItem | item comes from directory or compendium`);
		pack = dropData.pack;
		itemId = dropData.id;
		const item: Item = await game.packs.get(pack)?.getEntity(itemId) ?? game.items.get(itemId);
		if (!item) {
			console.log(`pick-up-stix | handleDropItem | item '${dropData.id}' not found in game items or compendium`);
			return;
		}
		itemData = {
			...item.data
		}
	}

	let targetToken: Token;
	let p: PlaceableObject;
	for (p of canvas.tokens.placeables) {
		if (dropData.x < p.x + p.width && dropData.x > p.x && dropData.y < p.y + p.height && dropData.y > p.y && p instanceof Token) {
			targetToken = p;
			break;
		}
	}

	// if the drop was ont another token, check what type of token it was dropped on
	if (targetToken) {
		console.log(`pick-up-stix | handleDropItem | item dropped onto target token '${targetToken.id}'`);

		const targetTokenFlags: PickUpStixFlags = targetToken.getFlag('pick-up-stix', 'pick-up-stix');

		if (targetTokenFlags?.itemType === ItemType.CONTAINER) {
			// if the target is a container, then add the item to the container's data
			console.log(`pick-up-stix | handleDropItem | target token is a container`);
			const existingItemData = targetTokenFlags.itemData;
			const existingItem = existingItemData.find(i => i.id === itemData._id);
			if (existingItem) {
				existingItem.count++;
			}
			else {
				existingItemData.push({ id: itemData._id, count: 1, itemData: { ...itemData }});
			}

			await targetToken.setFlag('pick-up-stix', 'pick-up-stix.itemData', [...existingItemData]);
			return;
		}
		else if (targetToken.actor) {
			// if the token it was dropped on was an actor, add the item to the new actor
			await createOwnedEntity(targetToken.actor, [{
				...itemData,
				flags: {
					'pick-up-stix': {
						'pick-up-stix': {
							initialState: { id: itemData._id, count: 1, itemData: { ...itemData } },
							imageOriginalPath: itemData.img,
							itemType: ItemType.ITEM,
							isLocked: false
						}
					}
				}
			}]);
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
	try {
		tokenId = await createItemToken({
			img: itemData.img,
			name: itemData.name,
			x: dropData.x,
			y: dropData.y,
			disposition: 0,
			flags: {
				'pick-up-stix': {
					'pick-up-stix': {
						initialState: { id: itemData._id, count: 1, itemData: { ...itemData } },
						imageOriginalPath: itemData.img,
						itemType: sourceActorId ? ItemType.ITEM : null,
						isLocked: false
					}
				}
			}
		});
	}
	catch (e) {
		ui.notifications.error('Could not create token');
	}

	// if a Token was successfully created
	if (tokenId && !sourceActorId) {
		// get a reference to the Token
		const token: Token = canvas.tokens.placeables.find(p => p.id === tokenId);
		// render the item type selection form
		new ItemTypeSelectionApplication(token).render(true);
		// store the Token ID
		lootTokens.push(tokenId);
	}
}

export function setupMouseManager(): void {
	console.log(`pick-up-stix | setupMouseManager`);

	const permissions = {
		clickLeft: () => true,
		clickLeft2: () => game.user.isGM,
		clickRight: () => game.user.isGM,
		dragStart: this._canDrag
	};

	// Define callback functions for each workflow step
	const callbacks = {
		clickLeft: handleTokenItemClicked.bind(this),
		clickLeft2: handleTokenItemConfig.bind(this),
		clickRight: toggleItemLocked.bind(this),
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

function handleTokenItemConfig(e) {
	console.log(`pick-up-stix | handleTokenItemConfig`);
	clearTimeout(clickTimeout);
	const clickedToken: Token = this;
	const f = new ItemConfigApplication(clickedToken).render(true);
}

async function toggleItemLocked(e): Promise<any> {
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
  const controlledTokens: Token[] = canvas.tokens.controlled;

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

	if (controlledTokens.length > 1) {
		ui.notifications.error('You must be controlling only one token to pick up an item');
		return;
	}

	// get the token the user is controlling
	const controlledToken: Token = controlledTokens[0];

	// get the distance to the token and if it's too far then can't pick it up
	const dist = Math.hypot(controlledToken.x - clickedToken.x, controlledToken.y - clickedToken.y);
	const maxDist = Math.hypot(canvas.grid.size, canvas.grid.size);
	if (dist > maxDist) {
		console.log(`pick-up-stix | handleTokenItemClicked | item is out of reach`);
		ui.notifications.error('You are too far away to interact with that');
		return;
	}

	// get the flags on the clicked token
	const flags: PickUpStixFlags = duplicate(clickedToken.getFlag('pick-up-stix', 'pick-up-stix'));

	// if it's locked then it can't be opened
	if (flags.isLocked) {
		console.log(`pick-up-stix | handleTokenItemClicked | item is locked`);
		var audio = new Audio('sounds/lock.wav');
		audio.play();
		return;
	}

	clickTimeout = setTimeout(async () => {
		if(flags.itemType === ItemType.CONTAINER) {
			console.log(`pick-up-stix | handleTokenItemClicked | item is a container`);

			// if it's a container and it's open and can't be closed then don't do anything
			if (flags.isOpen && !(flags.canClose ?? true)) {
				console.log(`pick-up-stix | handleTokenItemClicked | container is open and can't be closed`);
				return;
			}

			flags.isOpen = !flags.isOpen;

			// if there are any container updates then update the container
			await new Promise(resolve => {
				setTimeout(() => {
					updateToken(clickedToken, {
						img: (flags.isOpen ? flags.imageContainerOpenPath : flags.imageContainerClosedPath) ?? flags.imageOriginalPath,
						flags: {
							'pick-up-stix': {
								'pick-up-stix': {
									...flags
								}
							}
						}
					});
					resolve();
				}, 200);
			});

			if (!flags.isOpen) {
				return;
			}

			// if the token clicked is an actor and the lootsheetnpc5e module is installed and it's now in the open
			// state, perform a double-left click which will open the loot sheet from that module
			if (clickedToken.actor) {
				if (game.modules.get('lootsheetnpc5e').active && flags.isOpen) {
					(clickedToken as any)._onClickLeft2(e);
				}
			}
			else {
				const f = new ItemConfigApplication(clickedToken).render(true);
			}

			return;
		}

		console.log(`pick-up-stix | handleTokenItemClicked | token is an ItemType.ITEM`);

		// if it's just a single item, delete the map token and create an new item on the player
		await deleteToken(clickedToken);
		await createOwnedEntity(controlledToken.actor, {
			...flags.initialState.itemData,
			flags: {
				...clickedToken.data.flags
			}
		});

		ChatMessage.create({
			content: `
				<p>Picked up ${flags.initialState.count} ${flags.initialState.itemData.name}</p>
				<img src="${flags.imageOriginalPath}" style="width: 40px;" />
			`,
			speaker: {
				alias: controlledToken.actor.name,
				scene: (game.scenes as any).active.id,
				actor: controlledToken.actor.id,
				token: controlledToken.id
			}
		});
	}, 250);

	// if it's not a container or if it is and it's open it's now open (from switching above) then update
	// the actor's currencies if there are any in the container
	// if (!flags.isContainer || flags.isOpen) {
	// 	let currencyFound = false;
	// 	let chatContent = '';
	// 	const userCurrencies = controlledToken?.actor?.data?.data?.currency;
	// 	Object.keys(flags?.currency || {})?.reduce((acc, next) => {
	// 		if (flags?.currency?.[next] > 0) {
	// 			currencyFound = true;
	// 			chatContent += `<span class="pick-up-stix-chat-currency ${next}"></span><span>(${next}) ${flags?.currency?.[next]}</span><br />`;
	// 			userCurrencies[next] = userCurrencies[next] ? +userCurrencies[next] + +flags.currency?.[next] : flags.currency?.[next];
	// 		}
	// 		return userCurrencies;
	// 	}, userCurrencies);

	// 	if (currencyFound) {
	// 		let content = `<p>Picked up:</p>${chatContent}`;
	// 		ChatMessage.create({
	// 			content,
	// 			speaker: {
	// 				alias: controlledToken.actor.name,
	// 				scene: (game.scenes as any).active.id,
	// 				actor: controlledToken.actor.id,
	// 				token: controlledToken.id
	// 			}
	// 		});
	// 		await updateActor(controlledToken.actor, { data: { data: { currency: { ...userCurrencies }}}});
	// 	}

	// 	const itemsToCreate = [];

	// 	// if itemData was set through the item selection window, use that as the item data. If not then check if there
	// 	// are any currencies and if we have currencies then we have no items. If we don't have currencies OR itemData
	// 	// from the selection window and it's not a container, then use the intiial state
	// 	const itemDatas = flags?.itemData?.length
	// 		? flags.itemData
	// 		: (Object.values(flags.currency ?? {}).some(amount => amount > 0)
	// 			? []
	// 			: (!flags.isContainer
	// 				? [flags.initialState]
	// 				: [])
	// 			);

	// 	for (let i=0; i < itemDatas.length; i++) {
	// 		const itemData = itemDatas[i];
	// 		const datas = [];
	// 		for (let i = 0; i < itemData.count; i++) {
	// 			datas.push({
	// 				...itemData.data
	// 			});
	// 		}

	// 		itemsToCreate.push(...datas)

	// 		if (itemData.count > 0) {
	// 			ChatMessage.create({
	// 				content: `
	// 					<p>Picked up ${itemData.count} ${itemData.data.name}</p>
	// 					<img src="${itemData.data.img}" style="width: 40px;" />
	// 				`,
	// 				speaker: {
	// 					alias: controlledToken.actor.name,
	// 					scene: (game.scenes as any).active.id,
	// 					actor: controlledToken.actor.id,
	// 					token: controlledToken.id
	// 				}
	// 			});
	// 		}
	// 	}

	// 	// if it's a container, clear out the items as they've been picked up now
	// 	if (flags.isContainer) {
	// 		let containerUpdates;
	// 		containerUpdates.flags['pick-up-stix']['pick-up-stix'].itemData = [];
	// 		containerUpdates.flags['pick-up-stix']['pick-up-stix'].currency = { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 };
	// 	}

	// 	await createOwnedEntity(controlledToken.actor, itemsToCreate);
	// }

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

export async function updateToken(token: Token, updates): Promise<void> {
	console.log(`pick-up-stix | updateToken with args:`);
	console.log([token, updates]);

	if (game.user.isGM) {
		await token.update(updates);
		return;
	}

	const msg: PickUpStixSocketMessage = {
		sender: game.user.id,
		type: SocketMessageType.updateToken,
		data: {
			tokenId: token.id,
			updates
		}
	};

	socket.emit('module.pick-up-stix', msg, () => {
		console.log(`pick-up-stix | updateToken | socket message handled`);
	});
}

async function updateActor(actor, updates): Promise<void> {
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

export async function createOwnedEntity(actor: Actor, items: any[]) {
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

	const tex = await loadTexture('icons/svg/padlock.svg');
	const icon = p.addChild(new PIXI.Sprite(tex));
	icon.width = icon.height = 40;
	icon.alpha = .5;
	icon.position.set(p.width * .5 - icon.width * .5, p.height * .5 - icon.height * .5);
}
