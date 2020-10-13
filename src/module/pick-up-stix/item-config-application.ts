import { getCurrencyTypes, getPriceDataPath, getQuantityDataPath, _onChangeInputDelta } from '../../utils';
import ContainerImageSelectionApplication from "./container-image-selection-application.js";
import {
	createOwnedItem,
	currencyCollected,
	getValidControlledTokens,
	itemCollected,
	lootTokens,
	normalizeDropData,
	updateActor,
	updateEntity
} from './main';
import { ItemType, ContainerLoot, PickUpStixFlags, DropData } from "./models";
import { SettingKeys } from './settings';
import { ContainerSoundConfig } from './container-sound-config-application';
import { LootToken } from './loot-token';

/**
 * Application class to display to select an item that the token is
 * associated with
 */
export default class ItemConfigApplication extends BaseEntitySheet {
	private _updateItemHook;
	private _preDeleteItemHook;
	private _updateTokenHook;
	private _controlTokenHook;
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
			width: 850,
			title: `${game.user.isGM ? 'Configure Loot Container' : 'Loot Container'}`,
			resizable: true,
			classes: ['pick-up-stix', 'item-config-sheet'],
			dragDrop: [{ dropSelector: null }]
		});
	}

	constructor(object: any, ...args) {
		super(object, args);

		console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | constructor called with:`);
		console.log([object]);

		this._currencyEnabled = !game.settings.get('pick-up-stix', SettingKeys.disableCurrencyLoot);
	}

	protected preDeleteItemHook(item): boolean {
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | preDeleteItemHook:`);
		console.log([item]);

		if (item.id === this.object.id) {
			ui.notifications.error('This Item is currently being edited. Close the config window to delete the item.');
		}
		return item.id !== this.object.id;
	}

	protected updateItemHook(item, data, options): void {
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | updateItemHook | called with args:`);
		console.log([item, data, options]);
		this.render();
	}

	activateListeners(html) {
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId}  | activateListeners`);
		console.log([html]);
		this._html = html;
		super.activateListeners(this._html);

		if (this._preDeleteItemHook) {
			Hooks.off('preDeleteItem', this._preDeleteItemHook);
			this._preDeleteItemHook = null;
		}

		if (this._updateItemHook) {
			Hooks.off('updateItem', this._updateItemHook);
			this._updateItemHook = null;
		}

		if (this._updateTokenHook) {
			Hooks.off('updateToken', this._updateTokenHook);
			this._updateTokenHook = null;
		}

		if (this._controlTokenHook) {
			Hooks.off('controlToken', this._controlTokenHook);
			this._controlTokenHook = null;
		}

		this._updateItemHook = Hooks.on('updateItem', this.updateItemHook.bind(this));
		this._preDeleteItemHook = Hooks.on('preDeleteItem', this.preDeleteItemHook.bind(this));
		this._updateTokenHook = Hooks.on('updateToken', this.updateTokenHook.bind(this));
		this._controlTokenHook = Hooks.on('controlToken', this.controlTokenHook.bind(this));

		$(html)
			.find('input')
			.on('focus', e => e.currentTarget.select())
			.addBack()
			.find('[data-dtype="Number"]')
			.on('change', _onChangeInputDelta.bind(this.object));

		// set click listeners on the buttons to pick up individual items
		$(html).find(`a.item-take`).on('click', e => this._onTakeItem(e));

		// set click listeners on the buttons to delete items
		$(html).find(`a.item-delete`).on('click', e => this._onDeleteItem(e));

		if (game.user.isGM) {
			$(html)
				.find('.configure-sound')
				.on('click', e => this._onConfigureSound(e))
				.css('cursor', 'pointer');

			$(html)
				.find(`[data-edit="img"]`)
				.on('click', e => this._onEditImage(e))
				.css('cursor', 'pointer');
		}

		$(html)
			.find('[data-actor_select]')
			.on('click', e => this._onActorSelect(e));

		if (this._currencyEnabled) {
			// set click listener for taking currency
			$(html).find(`a.currency-take`).click(e => this._onTakeCurrency(e));
		}

		$(html).find(`input[type="text"]`).prop('readonly', !game.user.isGM);
		$(html).find(`input[type="text"]`).prop('disabled', 	!game.user.isGM);

		$(html).find('input#canCloseCheckbox').prop('checked', this.object.getFlag('pick-up-stix', 'pick-up-stix.container.canClose') ?? true);

		if (this.object) {
			$(html).find('input#scale').val(this.object?.data?.width ?? 1);
		}

		if (!game.user.isGM) {
			$(html).find(`input[type="text"]`).addClass('isNotGM');
		}
	}

	private controlTokenHook(token, controlled): void {
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | controlTokenHook`);
		this._selectedTokenId;
		setTimeout(this.render.bind(this), 100);
	}

	private updateTokenHook(scene, data, diff, options): void {
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | updateTokenHook`);
		this._selectedTokenId = null;
		setTimeout(this.render.bind(this), 100);
	}

	private _onActorSelect(e): void {
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | onActorSelect`);
		this._selectedTokenId = e.currentTarget.dataset.token_id;
		this.render();
	}

	private _onConfigureSound(e): void {
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | onConfigureSound`);
		new ContainerSoundConfig(this.object, {}).render(true);
	}

	private _lootToken: LootToken;

	getData(options?: any): any {
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId}  | getData:`);
		this._lootToken = this._lootToken || canvas.tokens.placeables.find(t => t.id === options.renderData?.lootTokenId);
		const actionTokens = options.renderData?.tokens ?? [];
		const itemType = this.object.getFlag('pick-up-stix', 'pick-up-stix.itemType');
		const quantityDataPath = getQuantityDataPath();
		const priceDataPath = getPriceDataPath();
		const tokenLoot: ContainerLoot = duplicate(this.object.getFlag('pick-up-stix', `pick-up-stix.container.loot`) ?? {});
		const loot = Object.entries(tokenLoot).reduce((prev, [lootKey, lootItems]) => {
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

		let description = this.object.getFlag('pick-up-stix', 'pick-up-stix.container.description') ?? '';
		description = description.replace(/font-size:\s*\d*.*;/, 'font-size: 16px;');

		const currencyTypes = getCurrencyTypes();
		const tokens = getValidControlledTokens(this._lootToken)
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
			this._selectedTokenId = tokens[0].token.id;
			tokens[0].class = 'active';
		}

		const data = {
			currencyEnabled: this._currencyEnabled,
			currencyTypes: Object.entries(currencyTypes).map(([k, v]) => ({ short: k, long: v })),
			currency: duplicate(this.object.getFlag('pick-up-stix', 'pick-up-stix.container.currency') ?? {}),
			lootTypes: Object.keys(loot),
			loot,
			profileImage: itemType === ItemType.CONTAINER ? this.object.getFlag('pick-up-stix', 'pick-up-stix.container.imageOpenPath') : this.object.data.img,
			isContainer: itemType === ItemType.CONTAINER,
			description,
			isToken: this.object instanceof Token,
			object: this.object.data,
			user: game.user,
			quantityDataPath,
			hasToken: !!this._lootToken,
			tokens
		};

		console.log(data);
		return data;
	}

	protected async _onDeleteItem(e) {
		console.log(`pick-up-stix | ItemConfigApplication | _onDeleteItem`);
		const itemId = e.currentTarget.dataset.id;

		const loot: ContainerLoot = duplicate(this.object.getFlag('pick-up-stix', 'pick-up-stix.container.loot'));

		Object.values(loot).forEach(lootItems => {
			lootItems.findSplice(l => l._id === itemId);
		});

		this.submit({
			updateData: {
				flags: {
					'pick-up-stix': {
						'pick-up-stix': {
							container: {
								loot
							}
						}
					}
				}
			}
		});
	}

	protected async _onTakeCurrency(e) {
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | _onTakeCurrency`);

		if (!this._selectedTokenId) {
			ui.notifications.error(`You must be controlling at least one token that is within reach of the loot.`);
			return;
		}

		const token = canvas.tokens.placeables.find(t => t.id === this._selectedTokenId);

		// TODO: this code will need to be updated to support different system's currencies
		const actorCurrency = { ...getProperty(token.actor, 'data.data.currency') ?? {} };

		const currency = duplicate(this.object.getFlag('pick-up-stix', 'pick-up-stix.container.currency') ?? {});
		if (!Object.values(currency).some(c => c > 0)) {
			console.log(`pick-up-stix | ItemCOnfigApplication ${this.appId} | _onTakeCurrency | No currency to loot`);
			return;
		}

		Object.keys(actorCurrency).forEach(k => actorCurrency[k] = +actorCurrency[k] + +currency[k]);
		await updateActor(token.actor, {'data.currency': actorCurrency});

		currencyCollected(token, Object.entries(currency).filter(([, v]) => v > 0).reduce((prev, [k, v]) => { prev[k] = v; return prev; }, {}));

		Object.keys(currency)?.forEach(k => currency[k] = 0);
		$(this._html).find('.data-currency-input').val(0);
		await this.submit({
			updateData: {
				flags: {
					'pick-up-stix': {
						'pick-up-stix': {
							container: {
								currency
							}
						}
					}
				}
			}
		});
	}

	protected async _onTakeItem(e) {
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | _onTakeItem`);

		if (!this._selectedTokenId) {
			ui.notifications.error(`You must be controlling at least one token that is within reach of the loot.`);
			return;
		}

		const loot: ContainerLoot = duplicate(this.object.getFlag('pick-up-stix', 'pick-up-stix.container.loot') ?? {});
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
			...duplicate(itemData),
			data: {
				...duplicate(itemData.data),
				[getQuantityDataPath()]: 1
			}
		}]);

		itemCollected(token, itemData);

		await this.submit({
			updateData: {
				flags: {
					'pick-up-stix': {
						'pick-up-stix': {
							container: {
								loot
							}
						}
					}
				}
			}
		});
	}

	protected _onEditImage(e) {
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId}  | _onEditImage`);

		new ContainerImageSelectionApplication(this.object).render(true);
		Hooks.once('closeContainerImageSelectionApplication', () => {
			console.log(`pick-up-stix | ItemConfigApplication ${this.appId}  | closeContainerImageSelectionApplication hook`);
			const img =
				this.object.getFlag('pick-up-stix', 'pick-up-stix.container.isOpen') ?
				this.object.getFlag('pick-up-stix', 'pick-up-stix.container.imageOpenPath') :
				this.object.getFlag('pick-up-stix', 'pick-up-stix.container.imageClosePath');
			this.object.update({ img });
		});
	}

	protected async _onDrop(e) {
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId}  | _onDrop with data:`);
		const dropData: DropData = normalizeDropData(JSON.parse(e.dataTransfer.getData('text/plain')) ?? {});
		console.log(dropData);

		if (dropData.type !== "Item") {
			console.log(`pick-up-stix | ItemConfigApplication ${this.appId}  | _onDrop | item is not 'Item' type`);
			return;
		}

		let itemData;
		const coreVersion = game.data.verson;
		const is7Newer = isNewerVersion(coreVersion, '0.6.9');

		// ensure we have a controlled token so that we know which token's actor if need be that we will
		// be interacting with. We only need to do this for versions lower than 0.7.0 because 0.7.0
		// contains more data in the drop data that we need
		if (dropData.actor && canvas.tokens.controlled.length !== 1 && !is7Newer) {
			ui.notifications.error(`Please ensure you are only controlling the token (and only the one token) for the character you're working with.`);
			return;
		}

		if (!dropData.actor && dropData.actorId) {
			ui.notifications.error(`No valid actor found for actor '${dropData.actorId}', please ensure you are controlling the token (and only the one token) for the character you're working with`);
			return;
		}

		// if the dropped item comes from an actor, we need to delete the item from that actor
		if (dropData.actor) {
			console.log(`pick-up-stix | ItemConfigApplication ${this.appId}  | _onDrop | drop data contains actor ID '${dropData.actorId}', delete item from actor`);
			itemData = duplicate(dropData.data);
			await dropData.actor.deleteOwnedItem(itemData._id);
		}
		else {
			itemData = await game.items.get(dropData.id)?.data ?? await game.packs.get(dropData.pack).getEntry(dropData.id);
		}

		const itemType = itemData.type;
		const lootTokenFlags: PickUpStixFlags = duplicate(this.object.getFlag('pick-up-stix', 'pick-up-stix') ?? {});
		const loot: ContainerLoot = lootTokenFlags?.container?.loot ?? {};
		if (!loot[itemType]) {
			console.log(`pick-up-stix | ItemConfigApplication ${this.appId}  | _onDrop | no items of type '${itemType}', creating new slot`);
			loot[itemType] = [];
		}
		const qtyDataPath = getQuantityDataPath();
		const existingItem = loot[itemType]?.find(i => i._id === (dropData.actor ? getProperty(itemData, 'flags.pick-up-stix.pick-up-stix.originalItemId') : itemData._id));
		if (existingItem) {
			console.log(`pick-up-stix | ItemConfigApplication ${this.appId}  | _onDrop | existing data for type '${itemType}', increase quantity by 1`);
			setProperty(existingItem.data, qtyDataPath, getProperty(existingItem.data, qtyDataPath) + 1)
		}
		else {
			console.log(`pick-up-stix | ItemConfigApplication ${this.appId}  | _onDrop | existing data for item '${itemData._id}' does not exist, set quantity to 1 and add to slot`);
			setProperty(itemData.data, qtyDataPath, 1);
			loot[itemType].push({
				...itemData
			});
		}

		const updateData = {
			flags: {
				'pick-up-stix': {
					'pick-up-stix': {
						container: {
							loot
						}
					}
				}
			}
		};
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | _onDrop | submit data:`);
		console.log(updateData);
		await this.submit({ updateData });
	}

	protected async _updateObject(e, formData) {
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | _updateObject called with args:`);
		console.log([e, duplicate(formData)]);

		if (this.object.getFlag('pick-up-stix', 'pick-up-stix.itemType') === ItemType.CONTAINER) {
			formData.img = this.object.getFlag('pick-up-stix', 'pick-up-stix.container.isOpen') ? this.object.getFlag('pick-up-stix', 'pick-up-stix.container.imageOpenPath') : this.object.getFlag('pick-up-stix', 'pick-up-stix.conatiner.imageClosePath');
		}

		const tokenLoot: ContainerLoot = duplicate(this.object.getFlag('pick-up-stix', `pick-up-stix.container.loot`) ?? {});

		if (e.type === 'change') {
			Object.entries(tokenLoot).forEach(([lootType, v]) => {
				if (v.length === 0) {
					return;
				}

				setProperty(formData, `flags.pick-up-stix.pick-up-stix.container.loot.${lootType}`, v.map(itemData => {
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
				if (tokenLoot.currency) {
					setProperty(formData, `flags.pick-up-stix.pick-up-stix.container.loot.currency`, { ...tokenLoot.currency });
				}
			}
		}

		if (formData.width !== undefined) {
			// we only collect the one size and store it as the width, so here we also store the height to be the same
			formData.height = formData.width;
		}

		const flattendOb = flattenObject(formData);
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | _updateObject | flattend 'formData' object:`);
		console.log(flattendOb);
		await updateEntity(this.object, flattendOb);
		this.render();
	}

	async close() {
		console.log(`pick-up-stix | ItemConfigApplication ${this.appId} | close`);
		Hooks.off('preDeleteItem', this._preDeleteItemHook);
		Hooks.off('updateItem', this._updateItemHook);
		Hooks.off('updateToken', this._updateTokenHook);
		Hooks.off('controlToken', this._controlTokenHook);
		return super.close();
	}
}
