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

	private _html: any;

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
		this._html = html;
		super.activateListeners(this._html);

		const currItemIds: Set<string> = new Set(this._token.getFlag('pick-up-stix', 'pick-up-stix.itemIds'));
		currItemIds.forEach(itemId => {
			$(html).find(`[data-item-id="${itemId}"]`).addClass('active');
		});

		$(html).find('.item').on('click', async (e) => {
			const itemId = $(e.currentTarget).attr('data-item-id');
			$(e.currentTarget).toggleClass('active');

			await this._token.setFlag('pick-up-stix', 'pick-up-stix.itemIds', Array.from(currItemIds.add(itemId)));
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
		const itemIds = [];
		$(this._html).find('.active').each((i, e) => {
			itemIds.push($(e).attr('data-item-id'));
		});
		await this._token.setFlag('pick-up-stix', 'pick-up-stix.itemIds', itemIds);

		super.close();
	}
}

/* ------------------------------------ */
/* Initialize module					*/
/* ------------------------------------ */
Hooks.once('init', async function() {
	CONFIG.debug.hooks = true;

	Canvas.prototype._onDrop = handleOnDrop;

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

	const tokens: Token[] = canvas?.tokens?.placeables?.filter((p: PlaceableObject) => p.getFlag('pick-up-stix', 'pick-up-stix.itemIds'));
	tokens.forEach(t => {
		t.on('mousedown', handleTokenItemClicked);
	});
});

// WARNING: Overwritten from foundry method in order to be able to drop actor data. This is the Canvas
// on drop handler
//
// TODO 0.7.0 of Foundry should all for better drop handling so switch to that when it's
// available
function handleOnDrop(event) {
	console.log(`pick-up-stix | handleDrop`);
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
		const item: Item = game.items.get(data.id);
		Token.create({
			bar1: {	},
			img: item.img,
			name: item.name,
			x: data.x,
			y: data.y,
			disposition: 0
		});
	}
}

async function handleTokenItemClicked(e): Promise<void> {
	console.log(`pick-up-stix | handleTokenItemClicked | ${this.id}`);

	if (e.currentTarget.data.hidden) {
		return;
	}

	const tokens = (canvas.tokens as TokenLayer).controlled;
	if (tokens.length !== 1) {
		ui.notifications.error('You must be controlling only one token to pick up an item');
		return;
	}

	let items: any[] = this.getFlag('pick-up-stix', 'pick-up-stix.itemIds');
	items = items.map(id => game.items.get(id));
	const token = tokens[0];

	items.forEach(async item => {
		await token.actor.createEmbeddedEntity('OwnedItem', item.data);
	});

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

	const controlIcon = document.createElement('div');
	controlIcon.className = 'control-icon';
	const img = document.createElement('img');
	img.src = token.getFlag('pick-up-stix', 'pick-up-stix.itemIds')?.length
		? 'modules/pick-up-stix/assets/pick-up-stix-icon-white.svg'
		: 'modules/pick-up-stix/assets/pick-up-stix-icon-black.svg';
	img.className = "item-pick-up";

	controlIcon.addEventListener('click', toggleItemPickup(hud, img, data));
	controlIcon.appendChild(img);
	$(hudHtml.children('div')[0]).prepend(controlIcon);
});

function toggleItemPickup(hud: TokenHUD, img: HTMLImageElement, tokenData: any): (this: HTMLDivElement, ev: MouseEvent) => any {
	return async function(this, ev: MouseEvent) {
		console.log(`pick-up-sticks | toggle icon clicked`);
		const token: Token = canvas?.tokens?.placeables?.find((p: PlaceableObject) => p.id === tokenData._id);
		if (!token) {
			console.log(`pick-up-sticx | Couldn't find token '${tokenData._id}'`);
			return;
		}

		const hasTokenId = !!tokenData?.flags?.pickUpStix?.itemIds?.length;

		if (hasTokenId) {
			console.log(`pick-up-stix | token already has itemIds ${tokenData?.flags?.pickUpStix?.itemIds}`);
		}

		let b = new SelectItemApplication(token);
		b.render(true);
	}
}

Hooks.on('updateToken', (scene: Scene, tokenData: any, tokenFlags: any, userId: string) => {
	console.log(`pick-up-stix | updateToken`)
	const token: Token = canvas?.tokens?.placeables?.find((p: PlaceableObject) => p.id === tokenData._id);
	token.off('mousedown');

	const itemIds = token.getFlag('pick-up-stix', 'pick-up-stix.itemIds');
	if (itemIds?.length) {
		token.on('mousedown', handleTokenItemClicked);
		console.log(`pick-up-stix | updateToken | itemIds ${itemIds}`);
	}
});

// Add any additional hooks if necessary
