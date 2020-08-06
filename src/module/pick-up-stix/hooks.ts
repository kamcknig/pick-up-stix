/* ------------------------------------ */
/* When ready													  */
import {
	setupMouseManager,
	handleDropItem,
	drawLockIcon,
	lootTokens,
	updateToken
} from "./main";
import { registerSettings } from "../settings";
import { preloadTemplates } from "../preloadTemplates";
import { PickUpStixSocketMessage, SocketMessageType, PickUpStixFlags, ItemType } from "./models";
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

	Handlebars.registerHelper('capitalize', (input: string) => {
		return `${input[0].toUpperCase()} ${input.slice(1)}`;
	});

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

export async function onCanvasReady(...args) {
	console.log(`pick-up-stix | onCanvasReady | call width args:`);
	console.log(args);

  canvas?.tokens?.placeables?.forEach(async (p: PlaceableObject) => {
		const flags: PickUpStixFlags = p.getFlag('pick-up-stix', 'pick-up-stix');

		if (flags) {
			console.log(`pick-up-stix | onCanvasReady | found token ${p.id} with itemData`);
			p.mouseInteractionManager = setupMouseManager.bind(p)();

			if (flags.isLocked) {
				await drawLockIcon(p);
			}
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

	setProperty(itemData.flags, 'pick-up-stix.pick-up-stix', {
		owner: {
			actorId: actor.id
		},
		initialState: { id: itemData._id, count: 1, itemData: { ...itemData, flags: {} } },
		imageOriginalPath: itemData.img,
		itemType: ItemType.ITEM,
		isLocked: false
	});
};

export function onDeleteToken(scene: Scene, tokenData: any, data: any, userId: string) {
	console.log(`pick-up-stix | onDeleteToken | called with args:`);
	console.log([scene, tokenData, data, userId]);
	lootTokens.findSplice(t => t === tokenData._id);
}

export async function onUpdateToken(scene: Scene, tokenData: any, tokenFlags: any, userId: string) {
  console.log(`pick-up-stix | onUpdateToken | called with args:`)
  console.log([scene, tokenData, tokenFlags, userId]);

  const flags = getProperty(tokenData, 'flags.pick-up-stix.pick-up-stix');

	if (flags) {
      console.log(`pick-up-stix | onUpdateToken | found flags on token data, add mouse interaction`);
			const token: Token = canvas?.tokens?.placeables?.find((p: PlaceableObject) => p.id === tokenData._id);

			if (flags.isLocked) {
				await drawLockIcon(token);
			}
			else {
				const lock = token.getChildByName('pick-up-stix-lock');
				if (lock) {
					token.removeChild(lock);
				}
			}
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
