/**
 * This is your TypeScript entry file for Foundry VTT.
 * Register custom settings, sheets, and constants using the Foundry API.
 * Change this heading to be more descriptive to your module, or remove it.
 * Author: [your name]
 * Content License: [copyright and-or license] If using an existing system
 * 					you may want to put a (link to a) license or copyright
 * 					notice here (e.g. the OGL).
 * Software License: [your license] Put your desired license here, which
 * 					 determines how others may use and modify your module
 */

// Import TypeScript modules
import { registerSettings } from './module/settings.js';
import { preloadTemplates } from './module/preloadTemplates.js';

/**
 * Application class to display to select an item that the token is
 * associated with
 */
class SelectItemApplication extends Application {
	static created: boolean = false;

	static get defaultOptions(): ApplicationOptions {
	  const options = super.defaultOptions;
    options.id = "pick-up-stix-selectItem";
	  options.template = "modules/pick-up-stix/templates/select-item.html";
		options.width = 500;
		options.minimizable = false;
		options.title = "Select an Item";
		options.resizable = true;
    return options;
	}

	constructor(private _token: Token) {
		super({});
	}

	activateListeners(html) {
		super.activateListeners(html);

		$(html).find('.item').on('click', async (e) => {
			const itemId = $(e.currentTarget).attr('data-item');
			await this._token.setFlag('pick-up-stix', 'pick-up-stix.itemId', itemId);
		});
	}

	getData(): any {
		return {
			options: this.options,
			object: {
				items: duplicate(Array.from(game.items))
			}
		}
	}

	async close() {
		super.close();
	}
}

/* ------------------------------------ */
/* Initialize module					*/
/* ------------------------------------ */
Hooks.once('init', async function() {
	CONFIG.debug.hooks = true;
	console.log('pick-up-stix | Init pick-up-stix');

	// Assign custom classes and constants here

	// Register custom module settings
	registerSettings();

	// Preload Handlebars templates
	await preloadTemplates();

	// Register custom sheets (if any)
});

/* ------------------------------------ */
/* Setup module							*/
/* ------------------------------------ */
Hooks.once('setup', function() {
	// Do anything after initialization but before
	// ready
	console.log(`pick-up-stix | Setup`);
});

/* ------------------------------------ */
/* When ready													  */
/* ------------------------------------ */
Hooks.once('ready', function() {
	// Do anything once the module is ready
	console.log(`pick-up-stix | Add-on ready`);

	const tokens: Token[] = canvas?.tokens?.placeables?.filter((p: PlaceableObject) => p.getFlag('pick-up-stix', 'pick-up-stix.itemId'));
	tokens.forEach(t => {
		t.on('mousedown', handleTokenItemClicked);
	});
});

async function handleTokenItemClicked(...args): Promise<void> {
	console.log(`pick-up-stix | handleTokenItemClicked | ${this.id}`);

	const tokens = (canvas.tokens as TokenLayer).controlled;
	if (tokens.length !== 1) {
		ui.notifications.error('You must be controlling only one token to pick up an item');
		return;
	}

	const itemId = this.getFlag('pick-up-stix', 'pick-up-stix.itemId');
	const item = game.items.get(itemId);
	const token = tokens[0];

	await token.actor.createEmbeddedEntity('OwnedItem', item.data);
	await canvas.scene.deleteEmbeddedEntity('Token', this.id);
}

Hooks.once('canvasReady', function() {
	console.log(`pick-up-stix | Canvas ready, adding PickUpStixItemLayer`);
});

Hooks.on('renderTokenHUD', (hud: TokenHUD, hudHtml: JQuery, data: any) => {
	const token: Token = canvas.tokens.placeables.find(p => p.id === data._id);

	// TODO when you get to dropping an item, check for a flag here to determine
	// the token can actually be picked up

	if (!data.isGM) {
		return;
	}

	const div = document.createElement('div');
	div.className = 'control-icon';
	const img = document.createElement('img');
	img.src = token.getFlag('pick-up-stix', 'pick-up-stix.itemId')
		? 'modules/pick-up-stix/assets/pick-up-stix-icon-white.svg'
		: 'modules/pick-up-stix/assets/pick-up-stix-icon-black.svg';
	img.className = "item-pick-up";

	div.addEventListener('click', toggleItemPickup(hud, img, data));
	div.appendChild(img);
	$(hudHtml.children('div')[0]).prepend(div);
});

function toggleItemPickup(hud: TokenHUD, img: HTMLImageElement, tokenData: any): (this: HTMLDivElement, ev: MouseEvent) => any {
	return async function(this, ev: MouseEvent) {
		console.log(`pick-up-sticks | toggle icon clicked`);
		const token: Token = canvas?.tokens?.placeables?.find((p: PlaceableObject) => p.id === tokenData._id);
		if (!token) {
			console.log(`pick-up-sticx | Couldn't find token '${tokenData._id}'`);
			return;
		}

		const hasTokenId = !!tokenData?.flags?.pickUpStix?.itemId;

		if (hasTokenId) {
			console.log(`pick-up-stix | token already has itemId ${tokenData?.flags?.pickUpStix?.itemId}`);
		}

		let b = new SelectItemApplication(token);
		b.render(true);
	}
}

Hooks.on('updateToken', (scene: Scene, tokenData: any, tokenFlags: any, userId: string) => {
	console.log(`pick-up-stix | updateToken`)
	const token: Token = canvas?.tokens?.placeables?.find((p: PlaceableObject) => p.id === tokenData._id);
	token.off('mousedown');

	const itemId = token.getFlag('pick-up-stix', 'pick-up-stix.itemId');
	if (itemId) {
		token.on('mousedown', handleTokenItemClicked);
		console.log(`pick-up-stix | updateToken | itemId ${itemId}`);
	}
});

// Add any additional hooks if necessary
