//@ts-ignore
import { DND5E } from "../../../../systems/dnd5e/module/config.js";
import ContainerImageSelectionApplication from "../container-image-selection-application";
import { createOwnedEntity, itemCollected } from './main';
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
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | constructed with args:`)
		console.log(this._token);
		this._loot = {
			...duplicate(this._token.getFlag('pick-up-stix', 'pick-up-stix.containerLoot') ?? {})
		}

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
	}

	getData() {
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId}  | getData:`);
		const data = {
			object: this._token.data,
			containerDescription: getProperty(this._token.data, 'flags.pick-up-stix.pick-up-stix.initialState.itemData.data.description.value')?.replace(/font-size:\s*\d*.*;/, 'font-size: 16px;') ?? '',
			lootTypes: Object.keys(this._loot).findSplice(k => k ==='currency'),
			loot: this._loot,
			currencyTypes: Object.entries(DND5E.currencies).map(([k, v]) => ({ short: k, long: v })),
			user: game.user
		};
		console.log(data);
		return data;
	}

	protected async _onTakeItem(e) {
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId}  | _onTakeItem`);
		const itemId = e.currentTarget.dataset.id;
		const token = canvas.tokens.controlled?.[0];
		if (!token || !token.actor) {
			ui.notifications.error('You must be controlling only one token to pick up an item');
			return;
		}
		const actor = token.actor;
		const itemType = $(e.currentTarget).parents(`ol[data-itemType]`).attr('data-itemType');
		const itemData = this._loot?.[itemType]?.find(i => i._id === itemId);
		if (--itemData.qty === 0) {
			this._loot?.[itemType].findSplice(i => i._id === itemId);
		}
		setProperty(itemData, 'flags.pick-up-stix.pick-up-stix', {
			initialState: { id: itemData._id, count: 1, itemData: { ...itemData, flags: {} } },
			imageOriginalPath: itemData.img,
			itemType: ItemType.ITEM,
			isLocked: false
		});
		console.log([itemId, actor, itemType, itemData]);
		await createOwnedEntity(actor, [itemData]);
		itemCollected(token, itemData);
		this.submit();
	}

	protected _onEditImage(e) {
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId}  | _onEditImage`);
		const f = new ContainerImageSelectionApplication(this._token).render(true);

		Hooks.once('closeContainerImageSelectionApplication', () => {
			console.log(`pick-up-stix | ItemConfigApplication ${this.appId}  | closeContainerImageSelectionApplication hook`);
			this.submit();
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

		if (droppedData.actorId) {
			await game.actors.get(droppedData.actorId).deleteOwnedItem(droppedData.data._id);
		}

		let itemData = droppedData.data ?? await game.items.get(droppedData.id)?.data ?? await game.packs.get(droppedData.pack).getEntry(droppedData.id);

		if (droppedData.actorId) {
			itemData = { ...getProperty(itemData, 'flags.pick-up-stix.pick-up-stix.initialState.itemData') };
		}

		const itemType = itemData.type;

		if (!this._loot[itemType]) {
			this._loot[itemType] = [];
		}
		const existingItem = this._loot[itemType].find(i => i._id === itemData._id);
		if (existingItem) {
			existingItem.qty++;
		}
		else {
			itemData.qty = 1;
			this._loot[itemType].push(itemData);
		}
		await this.submit();
	}

	protected async _updateObject(e, formData) {
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | _onUpdateObject called with args:`);
		formData.img = this._token.getFlag('pick-up-stix', 'pick-up-stix.isOpen') ? this._token.getFlag('pick-up-stix', 'pick-up-stix.imageContainerOpenPath') : this._token.getFlag('pick-up-stix', 'pick-up-stix.imageContainerClosedPath');
		console.log([e, formData]);
		await this._token.update(formData);
		this.render();
	}

	async close() {
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | close`);
		Hooks.off('updateToken', this._tokenUpdateHandler);
		Hooks.off('deleteToken', this._tokenDeletedHandler);
		return super.close();
	}
}
