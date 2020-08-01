/* ------------------------------------ */
/* When ready													  */

import { displayItemContainerApplication, /* toggleLocked, */ setupMouseManager, handleDropItem } from "./main";
import { registerSettings } from "../settings";
import { preloadTemplates } from "../preloadTemplates";
import { PickUpStixSocketMessage, SocketMessageType, PickUpStixFlags } from "./models";
import { handleOnDrop } from "./overrides";

/**
 * TODO: This should be removed once 0.7.0 becomes stable
 */
declare class DragDrop {
	constructor(options: DragDropOptions);

	bind(canvas: any);
}

/**
 * TODO: This should be removed once 0.7.0 becomes stable
 */
declare interface DragDropOptions {
	dragSelector?;
	dropSelector?;
	permissions?;
	callbacks?;
}

/* ------------------------------------ */
/* Initialize module					*/
/* ------------------------------------ */
export async function initHook() {
	console.log('pick-up-stix | initHook');

	CONFIG.debug.hooks = true;

	// Assign custom classes and constants here

	// Register custom module settings
	registerSettings();

	// Preload Handlebars templates
	await preloadTemplates();

	// Register custom sheets (if any)
};

/* ------------------------------------ */
export function readyHook() {
	// Do anything once the module is ready
	console.log(`pick-up-stix | readyHook`);

	socket = game.socket;

	socket.on('module.pick-up-stix', async (msg: PickUpStixSocketMessage) => {
		console.log(`pick-up-stix | socket.on | received socket message with args:`);
		console.log(msg);

		if (msg.sender === game.user.id) {
			console.log(`pick-up-stix | socket.on | i sent this, ignoring`);
			return;
		}

		const firstGm = game.users.find((u) => u.isGM && u.active);
		if (firstGm && game.user !== firstGm) {
   		return;
		}

		let actor;
		let token;

		switch (msg.type) {
			case SocketMessageType.updateActor:
				actor = game.actors.get(msg.data.actorId);
				await actor.update(msg.data.updates);
				break;
			case SocketMessageType.deleteToken:
				await canvas.scene.deleteEmbeddedEntity('Token', msg.data);
				break;
			case SocketMessageType.updateToken:
				token = canvas.tokens.get(msg.data.tokenId);
				await token.update(msg.data.updates);
				break;
			case SocketMessageType.createOwnedEntity:
				actor = game.actors.get(msg.data.actorId);
				await actor.createOwnedItem(msg.data.items);
				break;
			case SocketMessageType.createItemToken:
				await Token.create(msg.data);
				break;
		}
	});
};

export function onCanvasReady(...args) {
	console.log(`pick-up-stix | onCanvasReady | call width args:`);
	console.log(args);

  canvas?.tokens?.placeables?.forEach(async (p: PlaceableObject) => {
		const data: PickUpStixFlags = p.getFlag('pick-up-stix', 'pick-up-stix');

		if (data) {
			console.log(`pick-up-stix | onCanvasReady | found token ${p.id} with itemData`);
			p.mouseInteractionManager = setupMouseManager.bind(p)();
		}
  });

	const coreVersion: string = game.data.version;
	if (isNewerVersion(coreVersion, '0.6.5')) {
    console.log(`pick-up-stix | onCanvasReady | Foundry version newer than 0.6.5. Using dropCanvasData hook`);

		Hooks.on('dropCanvasData', async (canvas, dropData) => {
			console.log(`pick-up-stix | dropCanvasData | called with args:`);
			console.log(canvas, dropData);

			if (dropData.type === "Item") {
				handleDropItem(dropData);
			}
		});
	}
	else {
		console.log(`pick-up-stix | onCanvasReady | Foundry version is 0.6.5 or below. Overriding Canvas._onDrop`);
		canvas._dragDrop = new DragDrop({ callbacks: { drop: handleOnDrop.bind(canvas) } }).bind(document.getElementById('board'));
	}
}

export async function onRenderTokenHud(hud: TokenHUD, hudHtml: JQuery, data: any) {
  if (!data.isGM) {
		console.log(`pick-up-stix | onRenderTokenHud | user is not a gm, don't change HUD`);
		return;
	}

	if (data.actorId && !game.actors.get(data.actorId).isPC && !game.modules.get('lootsheetnpc5e').active) {
		console.log(`pick-up-stix | onRenderTokenHud | token has an actor associated with it, dont' change HUD`);
		return;
	}

	console.log(`pick-up-stix | onRenderTokenHud | called with args:`);
	console.log(hud, hudHtml, data);

	const flags = getProperty(data.flags, 'pick-up-stix.pick-up-stix');

	const containerDiv = document.createElement('div');
	containerDiv.style.display = 'flex';
	containerDiv.style.flexDirection = 'row';

	// create the control icon div and add it to the container div
	const controlIconDiv = document.createElement('div');
	controlIconDiv.className = 'control-icon';
	const controlIconImg = document.createElement('img');
	controlIconImg.src = flags?.['itemData']?.some(data => data.count > 0) || Object.values(flags?.currency ?? {}).some(amount => amount > 0)
		? 'modules/pick-up-stix/assets/pick-up-stix-icon-white.svg'
		: 'modules/pick-up-stix/assets/pick-up-stix-icon-black.svg';
	controlIconImg.className = "item-pick-up";
	controlIconDiv.appendChild(controlIconImg);
	controlIconDiv.addEventListener('mousedown', displayItemContainerApplication(hud, controlIconImg, data));
	containerDiv.appendChild(controlIconDiv);

	// if the item is a container then add the lock icon
	if (flags?.isContainer) {
		const lockDiv = document.createElement('div');
		lockDiv.style.marginRight = '10px';
		lockDiv.className = 'control-icon';
		const lockImg = document.createElement('img');
		lockImg.src = flags?.['isLocked']
			? 'modules/pick-up-stix/assets/lock-white.svg'
			: 'modules/pick-up-stix/assets/lock-black.svg';
		lockDiv.appendChild(lockImg);
		/* lockDiv.addEventListener('mousedown', toggleLocked(hud, data)); */
		containerDiv.prepend(lockDiv);
	}

	// add the container to the hud
	$(hudHtml.children('div')[0]).prepend(containerDiv);
};

export async function onPreCreateOwnedItem(actor: Actor, itemData: any, options: any, userId: string) {
	console.log(`pick-up-stix | onPreCreateOwnedItem | called with args:`);
	console.log([actor, itemData, options, userId]);

	let owner: { actorId: string, itemId: string };
	if (owner = getProperty(itemData.flags, 'pick-up-stix.pick-up-stix.owner')) {
		// if the item is already owned by someone else, set the new actor as the owner and
		// delete the item from the old owner
		setProperty(itemData.flags, 'pick-up-stix.pick-up-stix.owner', { actorId: actor.id });
		const ownerActor = game.actors.get(owner.actorId);
		await ownerActor.deleteOwnedItem(itemData._id);
		return;
	}

	setProperty(itemData.flags, 'pick-up-stix.pick-up-stix.owner', { actorId: actor.id });
};

export function onUpdateToken(scene: Scene, tokenData: any, tokenFlags: any, userId: string) {
  console.log(`pick-up-stix | onUpdateToken | called with args:`)
  console.log([scene, tokenData, tokenFlags, userId]);

  const flags = getProperty(tokenData, 'flags.pick-up-stix.pick-up-stix');

	if (flags) {
      console.log(`pick-up-stix | onUpdateToken | found flags on token data, add mouse interaction`);
      const token: Token = canvas?.tokens?.placeables?.find((p: PlaceableObject) => p.id === tokenData._id);
			token.mouseInteractionManager = setupMouseManager.bind(token)();
			token.activateListeners = setupMouseManager.bind(token);
	}
};

export async function onCreateToken(scene: Scene, tokenData: any, options: any, userId: string) {
  console.log(`pick-up-stix | onCreateToken | called with args:`);
  console.log([scene, tokenData, options, userId]);

  const flags = getProperty(tokenData, 'flags.pick-up-stix.pick-up-stix');

	if (flags) {
      console.log(`pick-up-stix | onCreateToken | found flags on token data, add mouse interaction`);
      const token: Token = canvas?.tokens?.placeables?.find((p: PlaceableObject) => p.id === tokenData._id);
			token.mouseInteractionManager = setupMouseManager.bind(token)();
			token.activateListeners = setupMouseManager.bind(token);
	}
};
