import ItemSheetApplication, { PickUpStixFlags, PickUpStixSocketMessage, SocketMessageType } from "./item-sheet-application";

export function toggleLocked(hud: TokenHUD, data): () => void {
	return async () => {
		const token = canvas.tokens.get(data._id);
		const isLocked = token.getFlag('pick-up-stix', 'pick-up-stix.isLocked');
		await token.setFlag('pick-up-stix', 'pick-up-stix.isLocked', !isLocked);
		hud.render();
	}
}

export function displayItemContainerApplication(hud: TokenHUD, img: HTMLImageElement, tokenData: any): (this: HTMLDivElement, ev: MouseEvent) => any {
	return async function(this, ev: MouseEvent) {
		console.log(`pick-up-sticks | toggle icon clicked`);

		// make sure we can find the token
		const token: Token = canvas?.tokens?.placeables?.find((p: PlaceableObject) => p.id === tokenData._id);
		if (!token) {
			console.log(`pick-up-stix | displayItemContainerApplication | Couldn't find token '${tokenData._id}'`);
			return;
		}

		// create and render the item selection sheet
		new ItemSheetApplication(token).render(true);

		// listen for when the item render sheet closes and re-render the token HUD
		Hooks.once('closeItemSheetApplication', () => {
			console.log(`pick-up-stix | closeItemSheetApplication`);
			hud.render();
		});
	}
}

export function setupMouseManager(): void {
	console.log(`pick-up-stix | setupMouseManager`);

	const permissions = {
		clickLeft: () => true,
		clickLeft2: this._canView,
		clickRight: this._canHUD,
		clickRight2: this._canConfigure,
		dragStart: this._canDrag
	};

	// Define callback functions for each workflow step
	const callbacks = {
		clickLeft: handleTokenItemClicked.bind(this),
		clickLeft2: this._onClickLeft2,
		clickRight: this._onClickRight,
		clickRight2: this._onClickRight2,
		dragLeftStart: this._onDragLeftStart,
		dragLeftMove: this._onDragLeftMove,
		dragLeftDrop: this._onDragLeftDrop,
		dragLeftCancel: this._onDragLeftCancel,
		dragRightStart: null,
		dragRightMove: null,
		dragRightDrop: null,
		dragRightCancel: null
	};

	// Define options
	const options = {
		target: this.controlIcon ? "controlIcon" : null
	};

	// Create the interaction manager
	this.mouseInteractionManager = new MouseInteractionManager(this, canvas.stage, permissions, callbacks, options).activate();
}

async function handleTokenItemClicked(e): Promise<void> {
	console.log(`pick-up-stix | handleTokenItemClicked | ${this.id}`);

	// if the token is hidden just do a normal click
	if (e.currentTarget.data.hidden) {
		console.log(`pick-up-stix | handleTokenItemClicked | token is hidden, handle normal click`);
		this._onClickLeft(e);
		return;
	}

	// get the tokens that the user controls
  const controlledTokens = canvas.tokens.controlled;

  console.log(`pick-up-stix | handleTokenItemClicked | controlledTokens:`);
  console.log(controlledTokens);
  console.log('this', this);

	// get the flags on the clicked token
	const flags: PickUpStixFlags = duplicate(this.getFlag('pick-up-stix', 'pick-up-stix'));

	// gm special stuff
	if (game.user.isGM) {
    console.log(`pick-up-stix | handleTokenItemClicked | user is GM`);

		if (!controlledTokens.length) {
			console.log(`pick-up-stix | handleTokenItemClicked | no controlled tokens, handle normal click`);
			this._onClickLeft(e);
			return;
		}

		const controlledFlags = controlledTokens[0].getFlag('pick-up-stix', 'pick-up-stix')

		// if there is only one controlled token and it's the item itself, don't do anything
		if (controlledTokens.length === 1 && (controlledTokens.includes(this) || controlledFlags)) {
			console.log(`pick-up-stix | handleTokenItemClicked | only controlling the item, handle normal click`);
			this._onClickLeft(e);
			return;
		}
	}

	if (controlledTokens.length !== 1 || controlledTokens[0]?.getFlag('pick-up-stix', 'pick-up-stix.itemData')?.length > 0) {
		ui.notifications.error('You must be controlling only one token to pick up an item');
		return;
	}

	// get the token the user is controlling
	const userControlledToken: Token = controlledTokens[0];

	// if the item isn't visible can't pick it up
	if (!this.isVisible) {
		console.log(`pick-up-stix | handleTokenItemClicked | item is not visible to user`);
		return;
	}

	// get the distance to the token and if it's too far then can't pick it up
	const dist = Math.hypot(userControlledToken.x - this.x, userControlledToken.y - this.y);
	const maxDist = Math.hypot(canvas.grid.size, canvas.grid.size);
	if (dist > maxDist) {
		console.log(`pick-up-stix | handleTokenItemClicked | item is out of reach`);
		return;
	}

	const isLocked = flags.isLocked;

	// if it's locked then it can't be opened
	if (isLocked) {
		console.log(`pick-up-stix | handleTokenItemClicked | item is locked, play lock sound`);
		var audio = new Audio('sounds/lock.wav');
		audio.play();
		return;
	}

	// if it's a container and it's open and can't be closed then don't do anything
	if (flags.isContainer && flags.isOpen && !flags.canClose) {
		console.log(`pick-up-stix | handleTokenItemClicked | container is open and can't be closed`);
		return;
	}

	let containerUpdates;

	// create an update for the container but don't run update it yet. if it's container then switch then
	// open property
	if(flags.isContainer) {
		console.log(`pick-up-stix | handleTokenItemClicked | item is a container`);
		flags.isOpen = !flags.isOpen;

		containerUpdates = {
			img: flags.isOpen ? flags.imageContainerOpenPath : flags.imageContainerClosedPath,
			flags: {
				'pick-up-stix': {
					'pick-up-stix': {
						...flags
					}
				}
			}
		};

		// if there are any container updates then update the container
		if (containerUpdates) {
			await new Promise(resolve => {
				setTimeout(() => {
					updateToken(this, containerUpdates);
					resolve();
				}, 200);
			});
		}

		if (this.actor && game.modules.get('lootsheetnpc5e').active && flags.isOpen) {
			this._onClickLeft2(e);
			return;
		}
	}

	// if it's not a container or if it is and it's open it's now open (from switching above) then update
	// the actor's currencies if there are any in the container
	if (!flags.isContainer || flags.isOpen) {
		let currencyFound = false;
		let chatContent = '';
		const userCurrencies = userControlledToken?.actor?.data?.data?.currency;
		Object.keys(flags?.currency || {})?.reduce((acc, next) => {
			if (flags?.currency?.[next] > 0) {
				currencyFound = true;
				chatContent += `<span class="pick-up-stix-chat-currency ${next}"></span><span>(${next}) ${flags?.currency?.[next]}</span><br />`;
				userCurrencies[next] = userCurrencies[next] ? +userCurrencies[next] + +flags.currency?.[next] : flags.currency?.[next];
			}
			return userCurrencies;
		}, userCurrencies);

		if (currencyFound) {
			let content = `<p>Picked up:</p>${chatContent}`;
			ChatMessage.create({
				content,
				speaker: {
					alias: userControlledToken.actor.name,
					scene: (game.scenes as any).active.id,
					actor: userControlledToken.actor.id,
					token: userControlledToken.id
				}
			});
			await updateActor(userControlledToken.actor, { data: { data: { currency: { ...userCurrencies }}}});
		}

		const itemsToCreate = [];

		// if itemData was set through the item selection window, use that as the item data. If not then check if there
		// are any currencies and if we have currencies then we have no items. If we don't have currencies OR itemData
		// from the selection window and it's not a container, then use the intiial state
		const itemDatas = flags?.itemData?.length
			? flags.itemData
			: (Object.values(flags.currency ?? {}).some(amount => amount > 0)
				? []
				: (!flags.isContainer
					? [flags.initialState]
					: [])
				);

		for (let i=0; i < itemDatas.length; i++) {
			const itemData = itemDatas[i];
			const datas = [];
			for (let i = 0; i < itemData.count; i++) {
				datas.push({
					...itemData.data
				});
			}

			itemsToCreate.push(...datas)

			if (itemData.count > 0) {
				ChatMessage.create({
					content: `
						<p>Picked up ${itemData.count} ${itemData.data.name}</p>
						<img src="${itemData.data.img}" style="width: 40px;" />
					`,
					speaker: {
						alias: userControlledToken.actor.name,
						scene: (game.scenes as any).active.id,
						actor: userControlledToken.actor.id,
						token: userControlledToken.id
					}
				});
			}
		}

		// if it's a container, clear out the items as they've been picked up now
		if (flags.isContainer) {
			containerUpdates.flags['pick-up-stix']['pick-up-stix'].itemData = [];
			containerUpdates.flags['pick-up-stix']['pick-up-stix'].currency = { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 };
		}

		await createOwnedEntity(userControlledToken.actor, itemsToCreate);
	}

	if (!flags.isContainer) {
		await deleteToken(this);
	}

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

async function updateToken(token: Token, updates): Promise<void> {
	console.log(`pick-up-stix | updateToken with args:`);
	console.log(token, updates);

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

	socket.emit('module.pick-up-stix', msg);
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

async function createOwnedEntity(actor: Actor, items: any[]) {
	if (game.user.isGM) {
		await actor.createEmbeddedEntity('OwnedItem', items);
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

	socket.emit('module.pick-up-stix', msg);
}

async function createItemToken(data: any) {
	console.log(`pick-up-stix | createItemToken | called with args:`);
	console.log(data);
	if (game.user.isGM) {
		console.log(`pick-up-stix | createItemToken | current user is GM, creating token`);
		await Token.create({
			...data
		});
		return;
	}

	console.log(`pick-up-stix | createItemToken | current user is not GM, send socket message`);
	const msg: PickUpStixSocketMessage = {
		sender: game.user.id,
		type: SocketMessageType.createItemToken,
		data
	}
	socket.emit('module.pick-up-stix', msg);
}

/**
 * @override
 *
 * @param event
 */
export async function handleOnDrop(event) {
	console.log(`pick-up-stix | handleOnDrop | called with args:`);
	console.log(event);
	event.preventDefault();

	// Try to extract the data
	let data;
	try {
		data = JSON.parse(event.dataTransfer.getData('text/plain'));
	}
	catch (err) {
		return false;
	}

	// Acquire the cursor position transformed to Canvas coordinates
	const [x, y] = [event.clientX, event.clientY];
	const t = this.stage.worldTransform;
	data.x = (x - t.tx) / canvas.stage.scale.x;
	data.y = (y - t.ty) / canvas.stage.scale.y;

	// Dropped Actor
	if ( data.type === "Actor" ) canvas.tokens._onDropActorData(event, data);

	// Dropped Journal Entry
	else if ( data.type === "JournalEntry" ) canvas.notes._onDropData(event, data);

	// Dropped Macro (clear slot)
	else if ( data.type === "Macro" ) {
		game.user.assignHotbarMacro(null, data.slot);
	}

	// Dropped Tile artwork
	else if ( data.type === "Tile" ) {
		return canvas.tiles._onDropTileData(event, data);
	}
	// Dropped Item
	else if (data.type === "Item") {
		handleDropItem(data);
	}
}

export async function handleDropItem(dropData) {
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
			...dropData.data
		};
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

	if (sourceActorId) {
		await game.actors.get(sourceActorId).deleteOwnedItem(dropData.data._id);
	}

	let targetToken: Token;
	let p: PlaceableObject;
	for (p of canvas.tokens.placeables) {
		if (dropData.x < p.x + p.width && dropData.x > p.x && dropData.y < p.y + p.height && dropData.y > p.y && p instanceof Token && p.actor) {
			targetToken = p;
			break;
		}
	}

	if (targetToken) {
		console.log(`pick-up-stix | handleDropItem | item dropped onto target token '${targetToken.id}'`);
		await createOwnedEntity(targetToken.actor, [{
			...itemData
		}]);
	}
	else {
		const hg = canvas.dimensions.size / 2;
		dropData.x -= (hg);
		dropData.y -= (hg);

		const { x, y } = canvas.grid.getSnappedPosition(dropData.x, dropData.y, 1);
		dropData.x = x;
		dropData.y = y;

		await createItemToken({
			img: itemData.img,
			name: itemData.name,
			x: dropData.x,
			y: dropData.y,
			disposition: 0,
			flags: {
				'pick-up-stix': {
					'pick-up-stix': {
						initialState: { id: itemData._id, count: 1, data: { ...itemData } },
						originalImagePath: itemData.img
					}
				}
			}
		});
	}
}
