import ContainerImageSelectionApplication from "../container-image-selection-application";

/**
 * Application class to display to select an item that the token is
 * associated with
 */
export default class ItemConfigApplication extends FormApplication {
	private _html: any;
	private _loot: {
		[key: string]: any[]
	} = {};

	static get defaultOptions(): ApplicationOptions {
		return mergeObject(super.defaultOptions, {
			closeOnSubmit: false,
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
		console.log(`pick-up-stix | ItemConfigApplication | constructed with args:`)
		console.log(this._token);
	}

	activateListeners(html) {
		console.log(`pick-up-stix | ItemConfigApplication | activateListeners called with args:`);
		console.log(html);

		this._html = html;
		super.activateListeners(this._html);

		$(html).find(`[data-edit="img"]`).click(e => this._onEditImage(e));
		$(html).find('.item-list img').css('')

	}

	getData() {
		const data = {
			object: this._token.data,
			containerDescription: getProperty(this._token.data, 'flags.pick-up-stix.pick-up-stix.initialState.itemData.data.description.value')?.replace(/font-size:\s*\d*.*;/, 'font-size: 18px;') ?? '',
			loot: this._loot
		};
		console.log(`pick-up-stix | ItemConfigApplication | getData`);
		console.log(data);
		return data;
	}

	protected _onEditImage(e) {
		console.log(`pick-up-stix | ItemConfigApplication | _onEditImage`);
		const f = new ContainerImageSelectionApplication(this._token).render(true);

		Hooks.once('closeContainerImageSelectionApplication', () => {
			console.log(`pick-up-stix | ItemConfigApplication | closeContainerImageSelectionApplication hook`);
			this.render();
		});
	}

	protected async _onDrop(e) {
		console.log(`pick-up-stix | ItemConfigApplication | _onDrop`)
		const data = JSON.parse(e.dataTransfer.getData('text/plain'));

		if (data.type !== "Item") {
			console.log(`pick-up-stix | ItemConfigApplication | _onDrop | item is not 'Item' type`);
			return;
		}

		const itemData = data.data ?? await game.items.get(data.id)?.data ?? await game.packs.get(data.pack).getEntry(data.id);
		const itemType = itemData.type;

		if (!this._loot[itemType]) {
			this._loot[itemType] = [];
		}
		this._loot[itemType].push(itemData);
		//this.submit({});
		this.render();
	}

	protected _updateObject(e, formData) {
		return Promise.resolve(true);
	}
}
