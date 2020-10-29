import {
	getCurrencyTypes,
	getPriceDataPath,
	getQuantityDataPath,
	onChangeInputDelta
} from '../../utils';
import ContainerImageSelectionApplication from "./container-image-selection-application.js";
import {
	createOwnedItem,
	currencyCollected,
	getLootTokenData,
	getValidControlledTokens,
	itemCollected,
	normalizeDropData,
	saveLootTokenData,
	updateActor
} from './main';
import {
	ContainerLoot,
	PickUpStixFlags,
	DropData
} from "./models";
import { SettingKeys } from './settings';
import { ContainerSoundConfig } from './container-sound-config-application';

/**
 * Application class to display to select an item that the token is
 * associated with
 */
export default class ItemConfigApplication extends FormApplication {
	private _html: any;
	private _currencyEnabled: boolean;
	private _selectedTokenId: string;

	static get defaultOptions(): ApplicationOptions {
		return mergeObject(super.defaultOptions, {
			closeOnSubmit: false,
			submitOnClose: false,
			submitOnChange: true,
			id: "pick-up-stix-item-config",
			template: "modules/pick-up-stix/module/pick-up-stix/templates/item-config.html",
			width: 900,
			title: `${game.user.isGM ? 'Configure Loot Container' : 'Loot Container'}`,
			resizable: true,
			classes: ['pick-up-stix', 'item-config-sheet'],
			dragDrop: [{ dropSelector: null }]
		});
	}

	private _token: Token;
	private get token(): Token {
		if (!this._token) {
			this._token = canvas.tokens.placeables.find(p => p.id === this._tokenId);
		}
		return this._token;
	}

	private _lootTokenData: PickUpStixFlags
	private _sceneId;
	private _tokenId;
	private get isToken(): boolean {
		return !!this._tokenId;
	}

	constructor(object: any, ...args) {
		super(object, args);

		console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | constructor called with:`);
		console.log([object]);

		const flags = this.object.getFlag('pick-up-stix', 'pick-up-stix');

		// these will exist on the flags if the object represents a Token that we are configuring
		// rather than an Item
		this._sceneId = flags.sceneId;
		this._tokenId = flags.tokenId;

		this._lootTokenData = this.isToken
			? getLootTokenData()[this._sceneId][this._tokenId]
			: duplicate(flags);

		this._currencyEnabled = !game.settings.get('pick-up-stix', SettingKeys.disableCurrencyLoot);

		Hooks.on('updateItem', this.updateItemHook);
		Hooks.on('updateToken', this.updateTokenHook);
		Hooks.on('controlToken', this.controlTokenHook);
		Hooks.on('pick-up-stix.lootTokenDataSaved', this.lootTokenDataSavedHook);
	}

	activateListeners(html) {
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId}  | activateListeners`);
		console.log([html]);
		this._html = html;
		super.activateListeners(this._html);

		$(html)
			.find('input')
			.on('focus', e => e.currentTarget.select())
			.on('change', onChangeInputDelta.bind(this._lootTokenData));

		if (game.user.isGM) {
			$(html)
				.find('.configure-sound')
				.on('click', this._onConfigureSound)
				.css('cursor', 'pointer');

			$(html)
				.find(`[data-edit="img"]`)
				.on('click', this._onEditImage)
				.css('cursor', 'pointer');
		}

		$(html)
			.find('[data-actor_select]')
			.on('click', this._onSelectActor);

		if (this._currencyEnabled) {
			// set click listener for taking currency
			$(html)
				.find(`a.currency-take`)
				.on('click', this._onTakeCurrency);
		}

		// set click listeners on the buttons to pick up individual items
		$(html)
			.find(`a.item-take`)
			.on('click', this._onTakeItem);

		// set click listeners on the buttons to delete items
		$(html)
			.find(`a.item-delete`)
			.on('click', this._onDeleteItem);

		$(html)
			.find(`input[type="text"]`)
			.prop('readonly', !game.user.isGM);

		$(html)
			.find(`input[type="text"]`)
			.prop('disabled', !game.user.isGM);

		$(html)
			.find('input#canCloseCheckbox')
			.prop('checked', this._lootTokenData.container.canClose ?? true);

		if (!game.user.isGM) {
			$(html)
				.find(`input[type="text"]`)
				.addClass('isNotGM');
		}
	}

	getData(options?: any): any {
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | getData:`);
		console.log([options]);
		const actionTokens = options.renderData?.tokens ?? [];
		const quantityDataPath = getQuantityDataPath();
		const priceDataPath = getPriceDataPath();

		console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | getData | application is for ${this.isToken ? 'a Token' : 'an Item'}`);

		const loot = Object.entries(
			this._lootTokenData.container?.loot as ContainerLoot ?? {})
				.reduce((prev, [lootKey, lootItems]) => {
					const items = lootItems?.map(i => {
						if (!i.data.hasOwnProperty('quantity')) {
							setProperty(i.data, quantityDataPath, 0);
						}

						return {
							...i,
							price: +getProperty(i.data, quantityDataPath) * +parseFloat(getProperty(i.data, priceDataPath) ?? 0),
							qty: +getProperty(i.data, quantityDataPath)
						}
					});

					if (items?.length > 0) {
						prev[lootKey] = items;
					}

					return prev;
				}, {});


		let description = this._lootTokenData.container?.description ?? '';
		description = description.replace(/font-size:\s*\d*.*;/, 'font-size: 16px;');

		const currencyTypes = getCurrencyTypes();
		const tokens = getValidControlledTokens(this.token)
			.concat(actionTokens)
			.reduce((acc, next) => {
				if (!next || acc.map(t => t.id).includes(next.id)) {
					return acc;
				}
				acc.push(next);
				return acc;
			}, [])
			.map(t => ({ token: t, class: this._selectedTokenId === t.id ? 'active' : '' }))
			.filter(t => !!t.token)
			.sort((a, b) => {
				if (a.token.name < b.token.name) return -1;
				if (a.token.name > b.token.name) return 1;
				return 0;
			});

		if (!this._selectedTokenId && tokens.length) {
			console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | getData | setting selected token '${tokens[0].token.id}'`);
			this._selectedTokenId = tokens[0].token.id;
			tokens[0].class = 'active';
		}

		const data = {
			currencyEnabled: this._currencyEnabled,
			currencyTypes: Object.entries(currencyTypes).map(([k, v]) => ({ short: k, long: v })),
			currency: this._lootTokenData.container.currency,
			lootTypes: Object.keys(loot),
			loot,
			profileImage: this._lootTokenData.container.imageOpenPath,
			description,
			object: this.object.data,
			width: this._lootTokenData.width ?? 1,
			height: this._lootTokenData.height ?? 1,
			user: game.user,
			quantityDataPath,
			hasToken: this.isToken,
			tokens
		};

		console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | getData | data to render:`);
		console.log([data]);
		return data;
	}

	/**
	 * @override
	 * @param e
	 */
	protected async _onDrop(e) {
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId}  | _onDrop`);
		const dropData: DropData = normalizeDropData(JSON.parse(e.dataTransfer.getData('text/plain')) ?? {});
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId}  | _onDrop | dropped data`);
		console.log([dropData]);

		if (dropData.type !== "Item") {
			console.log(`pick-up-stix | ItemConfigApplication ${this.appId}  | _onDrop | item is not 'Item' type`);
			return;
		}

		let droppedItemData;

		if (!dropData.actor && dropData.actorId) {
			ui.notifications.error(`No valid actor found for actor '${dropData.actorId}', please ensure you are controlling the token (and only the one token) for the character you're working with`);
			return;
		}

		// if the dropped item comes from an actor, we need to delete the item from that actor
		if (dropData.actor) {
			console.log(`pick-up-stix | ItemConfigApplication ${this.appId}  | _onDrop | drop data contains actor ID '${dropData.actorId}', delete item from actor`);
			droppedItemData = duplicate(dropData.data);
			await dropData.actor.deleteOwnedItem(droppedItemData._id);
		}
		else {
			droppedItemData = await game.items.get(dropData.id)?.data ?? await game.packs.get(dropData.pack).getEntry(dropData.id);
		}

		const itemType = droppedItemData.type;
		const containerData = this._lootTokenData?.container;

		let loot: ContainerLoot = containerData?.loot;
		if (!loot) {
			containerData.loot = {};
			loot = containerData.loot;
		}

		if (!loot[itemType]) {
			console.log(`pick-up-stix | ItemConfigApplication ${this.appId}  | _onDrop | no items of type '${itemType}', creating new slot`);
			loot[itemType] = [];
		}
		const qtyDataPath = getQuantityDataPath();
		const existingItem = loot[itemType]?.find(i => i._id === (dropData.actor ? getProperty(droppedItemData, 'flags.pick-up-stix.pick-up-stix.originalItemId') : droppedItemData._id));
		if (existingItem) {
			console.log(`pick-up-stix | ItemConfigApplication ${this.appId}  | _onDrop | existing data for type '${itemType}', increase quantity by 1`);
			setProperty(existingItem.data, qtyDataPath, +getProperty(existingItem.data, qtyDataPath) + 1)
		}
		else {
			console.log(`pick-up-stix | ItemConfigApplication ${this.appId}  | _onDrop | existing data for item '${droppedItemData._id}' does not exist, set quantity to 1 and add to slot`);
			setProperty(droppedItemData.data, qtyDataPath, 1);
			loot[itemType].push({
				...droppedItemData
			});
		}

		console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | _onDrop | submit data:`);
		console.log(this._lootTokenData);

		if (this.isToken) {
			await saveLootTokenData(this._sceneId, this._tokenId, this._lootTokenData);
		}
		else {
			await this.submit({ updateData: { ...this._lootTokenData }});
		}
	}

	/**
	 * @override
	 * @param e
	 * @param formData
	 */
	protected async _updateObject(e, formData) {
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | _updateObject called with args:`);
		console.log([e, duplicate(formData)]);

		const containerData = this._lootTokenData.container;

		formData.img = containerData.isOpen
			? containerData?.imageOpenPath
			: containerData?.imageClosePath;

		const tokenLoot: ContainerLoot = containerData?.loot;

		if (e.type === 'change') {
			if ($(e.currentTarget).hasClass('currency-input')) {
				if (!e.currentTarget.value) {
					const name = e.currentTarget.name;
					setProperty(formData, name, 0);
				}
			}

			Object.entries(tokenLoot ?? {}).forEach(([lootType, v]) => {
				if (v.length === 0) {
					return;
				}

				setProperty(formData, `container.loot.${lootType}`, v.map(itemData => {
					setProperty(
						itemData.data,
						getQuantityDataPath(),
						$(e.currentTarget).hasClass('quantity-input') && e.currentTarget.dataset.lootType === itemData.type && e.currentTarget.dataset.lootId === itemData._id ?
							+$(e.currentTarget).val() :
							+getProperty(itemData.data, getQuantityDataPath())
					);
					return itemData;
				}));
			});
		}

		if (this._currencyEnabled) {
			// when the user is a GM the currency is taken from the inputs on the form, but when the user NOT a GM, there are no inputs
			if (!game.user.isGM) {
				if (containerData.currency) {
					setProperty(formData, `container.currency`, { ...containerData.currency });
				}
			}
		}

		const expandedObject = expandObject(flattenObject(formData));
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | _updateObject | expanded 'formData' object:`);
		console.log(expandedObject);

		if (!this.isToken) {
			await this.object.update({
				name: formData.name,
				'flags': {
					'pick-up-stix': {
						'pick-up-stix': {
							...expandedObject
						}
					}
				}
			});
		}
		else {
			await this.object.update({
				name: formData.name
			});
			await saveLootTokenData(this._sceneId, this._tokenId, {...expandedObject});
		}
	}

	/**
	 * @override
	 */
	close = async () => {
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | close`);
		Hooks.off('updateToken', this.updateTokenHook);
		Hooks.off('controlToken', this.controlTokenHook);
		Hooks.off('updateItem', this.updateItemHook);
		Hooks.off('pick-up-stix.lootTokenDataSaved', this.lootTokenDataSavedHook);
		return super.close();
	}

	private updateItemHook = async (item, data, options, userId) => {
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | updateItemHook`);
		console.log([item, data, options, userId]);
    this._lootTokenData = duplicate(mergeObject(this._lootTokenData, data.flags?.['pick-up-stix']?.['pick-up-stix'] ?? {}));
    await this.render(true)
	}

	/**
	 * @override
	 * @param token
	 * @param controlled
	 */
	private controlTokenHook = (token, controlled): void => {
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | controlTokenHook`);
		const options = {};
		if (this.isToken) {
			options['renderData'] = { tokens: getValidControlledTokens(this.token) };
		}
		setTimeout((options) => {
			this.render(true, options);
		}, 100, options);
	}

	private lootTokenDataSavedHook = (sceneId, tokenId, data): void => {
		const token = canvas.tokens.placeables.find(p => p.id === tokenId);

		if (token.scene.id !== sceneId || token.id !== tokenId) {
			return;
		}

		console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | lootTokenDataSavedHook`);
		console.log([sceneId, tokenId, data]);

		this._lootTokenData = { ...data };
		this.render();
	}

	private updateTokenHook = (scene, token, diff, options): void => {
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | updateTokenHook`);

		// clear the selected token because the token might have moved too far away to be
		// eligible
		this._selectedTokenId = null;
		setTimeout(this.render.bind(this), 100);
	}

	private _onSelectActor = (e): void => {
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | onActorSelect`);
		this._selectedTokenId = e.currentTarget.dataset.token_id;
		this.render();
	}

	private _onConfigureSound = (e): void => {
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | onConfigureSound`);
		new ContainerSoundConfig(this.object, {}).render(true);
	}

	protected _onDeleteItem = async (e) => {
		console.log(`pick-up-stix | ItemConfigApplication | _onDeleteItem`);
		const itemId = e.currentTarget.dataset.id;

		const loot: ContainerLoot = this._lootTokenData.container.loot;

		Object.values(loot).forEach(lootItems => {
			lootItems.findSplice(l => l._id === itemId);
		});

		if (this.isToken) {
			await saveLootTokenData(this._sceneId, this._tokenId, this._lootTokenData);
		}
		else {
			await this.submit({ updateData: { container: { ...this._lootTokenData.container, loot } } });
		}
	}

	protected _onTakeCurrency = async (e) => {
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | _onTakeCurrency`);

		if (!this._selectedTokenId) {
			ui.notifications.error(`You must be controlling at least one token that is within reach of the loot.`);
			return;
		}

		const token = canvas.tokens.placeables.find(t => t.id === this._selectedTokenId);

		// TODO: this code will need to be updated to support different system's currencies
		const actorCurrency = { ...getProperty(token.actor, 'data.data.currency') ?? {} };

		const containerData = this._lootTokenData.container;

		const currency = containerData.currency;
		if (!Object.values(currency).some(c => c > 0)) {
			console.log(`pick-up-stix | ItemCOnfigApplication ${this.appId} | _onTakeCurrency | No currency to loot`);
			return;
		}

		Object.keys(actorCurrency).forEach(k => actorCurrency[k] = +actorCurrency[k] + +currency[k]);
		await updateActor(token.actor, {'data.currency': actorCurrency});

		await currencyCollected(token, Object.entries(currency).filter(([, v]) => v > 0).reduce((prev, [k, v]) => { prev[k] = v; return prev; }, {}));

		Object.keys(currency)?.forEach(k => currency[k] = 0);

		$(this._html)
			.find('.data-currency-input')
			.val(0);

		if (this.isToken) {
			await saveLootTokenData(this._sceneId, this._tokenId, this._lootTokenData);
		}
		else {
			await this.submit({ updateData: { container: { currency } } });
		}
	}

	protected _onTakeItem = async (e) => {
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | _onTakeItem`);

		if (!this._selectedTokenId) {
			ui.notifications.error(`You must be controlling at least one token that is within reach of the loot.`);
			return;
		}

		const loot = this._lootTokenData.container.loot;
		const itemType = $(e.currentTarget).parents(`ol[data-itemType]`).attr('data-itemType');
		const itemId = e.currentTarget.dataset.id;
		const itemData = loot?.[itemType]?.find(i => i._id === itemId);
		const oldQty = getProperty(itemData.data, getQuantityDataPath());

		if (oldQty - 1 <= 0) {
			loot?.[itemType]?.findSplice(v => v._id === itemId);
		}
		else {
			setProperty(itemData.data, getQuantityDataPath(), oldQty - 1);
		}

		const token = canvas.tokens.placeables.find(t => t.id === this._selectedTokenId);

		await createOwnedItem(token.actor, [{
			...itemData,
			data: {
				...itemData.data,
				[getQuantityDataPath()]: 1
			}
		}]);

		await itemCollected(token, itemData);

		if (this.isToken) {
			await saveLootTokenData(this._sceneId, this._tokenId, this._lootTokenData);
		}
		else {
			await this.submit({ updateData: { container: { ...this._lootTokenData.container, loot } } });
		}
	}

	protected _onEditImage = async (e) => {
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId}  | _onEditImage`);

		new ContainerImageSelectionApplication(this.object).render(true);
		Hooks.once('closeContainerImageSelectionApplication', () => {
			console.log(`pick-up-stix | ItemConfigApplication ${this.appId}  | closeContainerImageSelectionApplication hook`);

			const flags: PickUpStixFlags = this.object.getFlag('pick-up-stix', 'pick-up-stix');
			const { sceneId, tokenId } = flags;
			const isToken = sceneId !== undefined && tokenId !== undefined;
			const lootTokenData = isToken
				? getLootTokenData()?.[sceneId]?.[tokenId]
				: flags;
			const containerData = lootTokenData?.container;

			const img =
				containerData.isOpen ?
				containerData.imageOpenPath :
				containerData.imageClosePath;

			this.object.update({ img });
		});
	}
}
