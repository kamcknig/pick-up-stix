//@ts-ignore
import { DND5E } from "../../../../systems/dnd5e/module/config.js";
import ContainerImageSelectionApplication from "../container-image-selection-application";
import { createOwnedEntity, itemCollected, updateActor, currencyCollected, updateToken, lootTokens } from './main';
import { ItemType } from "./models";

/**
 * Application class to display to select an item that the token is
 * associated with
 */
export default class ItemConfigApplication extends FormApplication {
	private _tokenUpdateHandler;
	private _tokenDeletedHandler;
	private _html: any;

	/**
	 * This is an object of the loot that this container holds. The keys are the loot type
	 * `weapon`, `equipment`, `consumable`, `backpack`, `tool`, `loot`. The values will
	 * be an array of Item instance data
	 */
	private _loot: {
		[key: string]: any[];
	};

	static get defaultOptions(): ApplicationOptions {
		return mergeObject(super.defaultOptions, {
			closeOnSubmit: false,
			submitOnClose: false,
			submitOnChange: true,
			id: "pick-up-stix-item-config",
			template: "modules/pick-up-stix/module/pick-up-stix/templates/item-config.html",
			width: 500,
			height: 'auto',
			minimizable: false,
			title: `${game.user.isGM ? 'Configure Loot Container' : 'Loot Container'}`,
			resizable: true,
			classes: ['dnd5e', 'sheet', 'actor', 'character'],
			dragDrop: [{ dropSelector: null }]
		});
	}

	constructor(private _token: Token) {
		super({});
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | constructor called with:`)
		console.log(this._token);
		this._loot = {
			currency: Object.keys(DND5E.currencies).reduce((prev, k) => { prev[k] = 0; return prev; }, {}),
			...duplicate(this._token.getFlag('pick-up-stix', 'pick-up-stix.containerLoot') ?? {})
		}
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | constructor | initial loot:`);
		console.log(this._loot);
		this._tokenUpdateHandler = this._tokenUpdated.bind(this);
		this._tokenDeletedHandler = this._tokenDeleted.bind(this);
		Hooks.on('updateToken', this._tokenUpdateHandler);
		Hooks.on('deleteToken', this._tokenDeletedHandler);
	}

	protected _tokenDeleted(scene: Scene, tokenData: any, data: any, userId: string) {
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | _tokenDeleted called with args:`);
		console.log([scene, tokenData, data, userId]);

		if (tokenData._id === this._token.id) {
			console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | _tokenDeleted | token ID matches this app's token`)
			this.close();
		}
	}

	protected _tokenUpdated(scene, data, flags, options, userId) {
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId}  | _tokenUpdated called with args:`);
		console.log([scene, data, flags, options, userId]);

		if (data._id === this._token.id) {
			console.log(`pick-up-stix | ItemConfigApplication ${this.appId}  | _tokenUpdated | token has been updated, re-render`);
			this._loot = duplicate(this._token.getFlag('pick-up-stix', 'pick-up-stix.containerLoot') ?? {});
			this.render();
		}
	}

	activateListeners(html) {
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId}  | activateListeners`);
		this._html = html;
		super.activateListeners(this._html);

		// set the click listener on the image
		$(html).find(`[data-edit="img"]`).click(e => this._onEditImage(e));

		// set click listeners on the buttons to pick up individual items
		$(html).find(`a.item-take`).click(e => this._onTakeItem(e));

		// set click listener for taking currency
		$(html).find(`a.currency-take`).click(e => this._onTakeCurrency(e));

		$(html).find('[data-currency-input], [data-quantity-input]').prop('readonly', !game.user.isGM);

		if (!game.user.isGM) {
			console.log($(html).find('input[type="text"].currency-input'));
			$(html).find('input[type="text"][data-currency-input], input[type="text"][data-quantity-input]').addClass('isNotGM');
		}
	}

	getData() {
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId}  | getData:`);
		const data = {
			object: this._token.data,
			containerDescription: getProperty(this._token.data, 'flags.pick-up-stix.pick-up-stix.initialState.itemData.data.description.value')?.replace(/font-size:\s*\d*.*;/, 'font-size: 16px;') ?? '',
			lootTypes: Object.keys(this._loot).filter(k => k !== 'currency'),
			loot: this._loot,
			currencyTypes: Object.entries(DND5E.currencies).map(([k, v]) => ({ short: k, long: v })),
			user: game.user
		};
		console.log(data);
		return data;
	}

	protected async _onTakeCurrency(e) {
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | _onTakeCurrency`);
		const token: Token = canvas.tokens.controlled?.[0];
		const actor: Actor = token.actor;
		if (!token || !actor) {
			ui.notifications.error('You must be controlling only one token to pick up an item');
			return;
		}
		const currentCurrency = { ...getProperty(actor, 'data.data.currency') };
		const lootCurrencies = this._loot['currency'];
		if (!Object.values(lootCurrencies).some(c => c > 0)) {
			console.log(`pick-up-stix | ItemCOnfigApplication ${this.appId} | _onTakeCurrency | No currency to loot`);
			return;
		}

		Object.keys(currentCurrency).forEach(k => currentCurrency[k] = +currentCurrency[k] + +lootCurrencies[k]);
		await updateActor(actor, {'data.currency': currentCurrency});

		currencyCollected(token, Object.entries(lootCurrencies).filter(([, v]) => v > 0).reduce((prev, [k, v]) => { prev[k] = v; return prev; }, {}));

		Object.values(this._loot['currency'])?.forEach(k => this._loot['currency'][k] = 0);
		$(this._html).find('[data-currency-input').val(0);
		await this.submit({});
	}

	protected async _onTakeItem(e) {
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | _onTakeItem`);
		const token = canvas.tokens.controlled?.[0];
		const actor = token.actor;
		if (!token || !actor) {
			ui.notifications.error('You must be controlling only one token to pick up an item');
			return;
		}
		const itemType = $(e.currentTarget).parents(`ol[data-itemType]`).attr('data-itemType');
		const itemId = e.currentTarget.dataset.id;
		const itemData = this._loot?.[itemType]?.find(i => i._id === itemId);
		if (--itemData.qty <= 0) {
			this._loot?.[itemType]?.findSplice(v => v._id === itemId);
		}
		setProperty(itemData, 'flags.pick-up-stix.pick-up-stix', {
			initialState: { id: itemData._id, count: 1, itemData: { ...itemData, flags: {} } },
			imageOriginalPath: itemData.img,
			itemType: ItemType.ITEM,
			isLocked: false
		});
		console.log(itemData)
		console.log(this._loot);
		await createOwnedEntity(actor, [itemData]);
		itemCollected(token, itemData);

		await this.submit({});
	}

	protected _onEditImage(e) {
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId}  | _onEditImage`);
		const f = new ContainerImageSelectionApplication(this._token).render(true);

		Hooks.once('closeContainerImageSelectionApplication', () => {
			console.log(`pick-up-stix | ItemConfigApplication ${this.appId}  | closeContainerImageSelectionApplication hook`);
			this.submit({});
		});
	}

	protected async _onDrop(e) {
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId}  | _onDrop with data:`);
		const droppedData = JSON.parse(e.dataTransfer.getData('text/plain'));
		console.log(droppedData);

		if (droppedData.type !== "Item") {
			console.log(`pick-up-stix | ItemConfigApplication ${this.appId}  | _onDrop | item is not 'Item' type`);
			return;
		}

		let itemData = droppedData.data ?? await game.items.get(droppedData.id)?.data ?? await game.packs.get(droppedData.pack).getEntry(droppedData.id);

		if (droppedData.actorId) {
			console.log(`pick-up-stix | ItemConfigApplication ${this.appId}  | _onDrop | drop data contains actor ID '${droppedData.actorId}', delete item from actor`);
			await game.actors.get(droppedData.actorId).deleteOwnedItem(droppedData.data._id);
			itemData = { ...getProperty(itemData, 'flags.pick-up-stix.pick-up-stix.initialState.itemData') };
		}

		const itemType = itemData.type;

		if (!this._loot[itemType]) {
			console.log(`pick-up-stix | ItemConfigApplication ${this.appId}  | _onDrop | no items of type '${itemType}', creating new slot`);
			this._loot[itemType] = [];
		}
		const existingItem = this._loot?.[itemType]?.find(i => i._id === itemData._id);
		if (existingItem) {
			console.log(`pick-up-stix | ItemConfigApplication ${this.appId}  | _onDrop | existing data for type '${itemType}', increase quantity by 1`);
			existingItem.qty++;
		}
		else {
			console.log(`pick-up-stix | ItemConfigApplication ${this.appId}  | _onDrop | existing data for item '${itemData._id}' does not exist, set quantity to 1 and add to slot`);
			itemData.qty = 1;
			this._loot[itemType].push(itemData);
		}

		await this.submit({});
	}

	protected async _updateObject(e, formData) {
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | _onUpdateObject called with args:`);
		formData.img = this._token.getFlag('pick-up-stix', 'pick-up-stix.isOpen') ? this._token.getFlag('pick-up-stix', 'pick-up-stix.imageContainerOpenPath') : this._token.getFlag('pick-up-stix', 'pick-up-stix.imageContainerClosedPath');
		let formCopy = duplicate(formData);
		console.log(formCopy);

		Object.entries(this._loot).filter(([k,]) => k !== 'currency').forEach(([k, v]) => {
			if (v.length === 0) {
				setProperty(formData, `flags.pick-up-stix.pick-up-stix.containerLoot.-=${k}`, null);
			}
			else {
				setProperty(formData, `flags.pick-up-stix.pick-up-stix.containerLoot.${k}`, v.map(loot => ({ ...loot, flags: {} })));
			}
		});

		formCopy = mergeObject(formData, formCopy);
		const flattendOb = flattenObject(formCopy);
		await updateToken(this._token, flattendOb);
		this.render();
	}

	async close() {
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | close`);
		Hooks.off('updateToken', this._tokenUpdateHandler);
		Hooks.off('deleteToken', this._tokenDeletedHandler);
		return super.close();
	}
}
