import { log } from '../../log';
import {
	getCurrencyTypes,
	getPriceDataPath,
	getQuantityDataPath,
	onChangeInputDelta
} from '../../utils';
import ContainerImageSelectionApplication from "./container-image-selection-application.js";
import { ContainerSoundConfig } from './container-sound-config-application';
import { ContainerLoot, ItemFlags } from './loot-token';
import {
	dropItemOnToken,
	getLootToken,
	getValidControlledTokens,
	lootCurrency,
	lootItem,
	normalizeDropData,
	updateItem
} from './main';
import {
	DropData
} from "./models";
import { SettingKeys } from './settings';

/**
 * Application class to display to select an item that the token is
 * associated with
 */
export default class ItemConfigApplication extends BaseEntitySheet {
	private _html: any;
	private _sourceTokenId: string;
	private _selectedTokenId: string;
	private _stopperElement = $(`<div class="stopper">
		<div class="loader"></div>
	</div>`);

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

	private get currencyEnabled(): boolean {
		return !game.settings.get('pick-up-stix', SettingKeys.disableCurrencyLoot);
	}

	get itemFlags(): ItemFlags {
		return this.object.getFlag('pick-up-stix', 'pick-up-stix');
	}

	get tokenDatas(): any[] {
		const tokens = getLootToken({ itemId: this.object.id }).map(lt => lt.tokenData);
		return tokens;
	}

	get isToken(): boolean {
		return !!this.tokenDatas.length;
	}

	constructor(object: Item, ...args) {
		super(object, args);

		log(`pick-up-stix | ItemConfigApplication ${this.appId} | constructor called with:`);
		log([object]);
	}

	activateListeners(html) {
		log(`pick-up-stix | ItemConfigApplication ${this.appId}  | activateListeners`);
		log([html]);
		this._html = html;
		super.activateListeners(this._html);

		Hooks.off('updateToken', this.updateTokenHook);
		Hooks.off('controlToken', this.controlTokenHook);

		Hooks.on('updateToken', this.updateTokenHook);
		Hooks.on('controlToken', this.controlTokenHook);

		$(html)
			.find('input')
			.on('focus', e => e.currentTarget.select())
			.on('change', onChangeInputDelta.bind(this.itemFlags));

		if (game.user.isGM) {
			$(html)
				.find('.configure-sound')
				.on('click', this._onConfigureSound)
				.css('cursor', 'pointer');

			$(html)
				.find(`[data-edit="img"]`)
				.on('click', this._onEditImage)
				.css('cursor', 'pointer');

				// set click listeners on the buttons to delete items
			$(html)
				.find(`a.item-delete`)
				.on('click', this._onDeleteItem);
		}

		$(html)
			.find('[data-actor_select]')
			.on('click', this._onSelectActor);

		if (this.currencyEnabled) {
			// set click listener for taking currency
			$(html)
				.find(`a.currency-take`)
				.on('click', this._onTakeCurrency);
		}

		// set click listeners on the buttons to pick up individual items
		$(html)
			.find(`a.item-take`)
			.on('click', this._onTakeItem);

		$(html)
			.find(`input[type="text"]`)
			.prop('readonly', !game.user.isGM);

		$(html)
			.find(`input[type="text"]`)
			.prop('disabled', !game.user.isGM);

		$(html)
			.find('input#canCloseCheckbox')
			.prop('checked', this.itemFlags?.container?.canClose ?? true);

		if (!game.user.isGM) {
			$(html)
				.find(`input[type="text"]`)
				.addClass('isNotGM');
		}
	}

	/**
	 *
	 * @param options
	 */
	getData(options?: { renderData: { tokens?: Token[]; sourceToken: string; [key:string]: any }}): any {
		log(`pick-up-stix | ItemConfigApplication ${this.appId} | getData:`);
		log([options]);
		this._sourceTokenId = this._sourceTokenId !== options?.renderData?.sourceToken
			? options?.renderData?.sourceToken ?? this._sourceTokenId
			: this._sourceTokenId;

		const actionTokens = options.renderData?.tokens ?? [];
		const quantityDataPath = getQuantityDataPath();
		const priceDataPath = getPriceDataPath();

		const loot = Object.entries(this.itemFlags?.container?.loot as ContainerLoot ?? {})
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


		let description = this.itemFlags?.container?.description ?? this.object.data?.data?.description?.value ?? '';
		description = description.replace(/font-size:\s*\d*.*;/, 'font-size: 16px;');

		const currencyTypes = getCurrencyTypes();
		const tokens = getValidControlledTokens(this._sourceTokenId)
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
			log(`pick-up-stix | ItemConfigApplication ${this.appId} | getData | setting selected token '${tokens[0].token.id}'`);
			this._selectedTokenId = tokens[0].token.id;
			tokens[0].class = 'active';
		}

		const data = {
			currencyEnabled: this.currencyEnabled,
			currencyTypes: Object.entries(currencyTypes).map(([k, v]) => ({ short: k, long: v })),
			currency: this.itemFlags.container.currency,
			showTakeCurrency: Object.values(this.itemFlags.container.currency).some(amount => amount > 0),
			lootTypes: Object.keys(loot),
			loot,
			profileImage: this.itemFlags.container.imageOpenPath,
			description,
			object: this.object.data,
			width: this.itemFlags.tokenData.width ?? 1,
			height: this.itemFlags.tokenData.height ?? 1,
			user: game.user,
			quantityDataPath,
			hasToken: this.isToken,
			tokens
		};

		log(`pick-up-stix | ItemConfigApplication ${this.appId} | getData | data to render:`);
		log([data]);
		return data;
	}

	/**
	 * @override
	 * @param e
	 */
	protected async _onDrop(e) {
		log(`pick-up-stix | ItemConfigApplication ${this.appId}  | _onDrop`);
		const dropData: DropData = await normalizeDropData(JSON.parse(e.dataTransfer.getData('text/plain')) ?? {});

		log(`pick-up-stix | ItemConfigApplication ${this.appId}  | _onDrop | dropped data`);
		log([dropData]);

		this.addStopper();

		dropItemOnToken({
			dropData,
			targetTokenId: this._sourceTokenId
		}).then(() => {
			this._stopperElement.remove();
		});
	}

	/**
	 * @override
	 * @param e
	 * @param formData
	 */
	protected async _updateObject(e, formData) {
		log(`pick-up-stix | ItemConfigApplication ${this.appId} | _updateObject called with args:`);
		log([e, duplicate(formData)]);

		const containerData = duplicate(this.itemFlags.container);

		formData = duplicate(formData);

		const token = canvas.tokens.placeables.find(p => p.id === this._sourceTokenId);

		formData.img = token?.getFlag('pick-up-stix', 'pick-up-stix')?.isOpen
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
					const data = { ...itemData };
					setProperty(data.data,
						getQuantityDataPath(),
						$(e.currentTarget).hasClass('quantity-input') && e.currentTarget.dataset.lootType === itemData.type && e.currentTarget.dataset.lootId === itemData._id ?
							+$(e.currentTarget).val() :
							+getProperty(itemData.data, getQuantityDataPath())
					);
					return data;
				}));
			});
		}

		if (this.currencyEnabled) {
			// when the user is a GM the currency is taken from the inputs on the form, but when the user NOT a GM, there are no inputs
			if (!game.user.isGM) {
				if (containerData.currency) {
					setProperty(formData, `container.currency`, { ...containerData.currency });
				}
			}
		}

		const expandedObject = expandObject(flattenObject(formData));
		log(`pick-up-stix | ItemConfigApplication ${this.appId} | _updateObject | expanded 'formData' object:`);
		log(expandedObject);

		await updateItem(this.object.id, {
			name: formData.name,
			flags: {
				'pick-up-stix': {
					'pick-up-stix': {
						...expandedObject
					}
				}
			}
		});
	}

	/**
	 * @override
	 */
	close = async () => {
		log(`pick-up-stix | ItemConfigApplication ${this.appId} | close`);
		Hooks.off('updateToken', this.updateTokenHook);
		Hooks.off('controlToken', this.controlTokenHook);
		return super.close();
	}

	/**
	 * @override
	 * @param token
	 * @param controlled
	 */
	private controlTokenHook = (token, controlled): void => {
		log(`pick-up-stix | ItemConfigApplication ${this.appId} | controlTokenHook`);
		log([token, controlled]);

		const options = {};
		if (this.isToken) {
			options['renderData'] = { tokens: getValidControlledTokens(this._sourceTokenId), sourceTokenId: this._sourceTokenId };
		}
		setTimeout((options) => {
			this.render(true, options);
		}, 100, options);
	}

	private updateTokenHook = (scene, token, diff, options): void => {
		log(`pick-up-stix | ItemConfigApplication ${this.appId} | updateTokenHook`);

		// clear the selected token because the token might have moved too far away to be
		// eligible
		this._selectedTokenId = null;
		setTimeout(this.render.bind(this), 100, { sourceTokenId: this._sourceTokenId });
	}

	private _onSelectActor = (e): void => {
		log(`pick-up-stix | ItemConfigApplication ${this.appId} | onActorSelect`);
		this._selectedTokenId = e.currentTarget.dataset.token_id;
		const options = { sourceTokenId: this._sourceTokenId };
		this.render(false, options);
	}

	private _onConfigureSound = (e): void => {
		log(`pick-up-stix | ItemConfigApplication ${this.appId} | onConfigureSound`);
		new ContainerSoundConfig(this.object, {}).render(true);
	}

	protected _onDeleteItem = async (e) => {
		log(`pick-up-stix | ItemConfigApplication | _onDeleteItem`);
		const itemId = e.currentTarget.dataset.id;

		const loot: ContainerLoot = duplicate(this.itemFlags.container.loot);

		Object.values(loot).forEach(lootItems => {
			lootItems.findSplice(l => l._id === itemId);
    });

    await this.submit({
      updateData: {
        container: {
          loot
        }
      }
    });
	}

	protected _onTakeCurrency = async (e) => {
		log(`pick-up-stix | ItemConfigApplication ${this.appId} | _onTakeCurrency`);

    if (!this._selectedTokenId) {
			ui.notifications.error(`You must be controlling at least one token that is within reach of the loot.`);
			return;
		}

		const token = canvas.tokens.placeables.find(t => t.id === this._selectedTokenId);

		$(this._html)
			.find('.data-currency-input')
			.val(0);

		this.addStopper();

		lootCurrency({ looterActorId: token.actor.id, looterTokenId: token.id, containerItemId: this.object.id, currencies: this.itemFlags.container.currency }).then(() => {
			this._stopperElement.remove();
		})
	}

	protected _onTakeItem = async (e) => {
		log(`pick-up-stix | ItemConfigApplication ${this.appId} | _onTakeItem`);

		if (!this._selectedTokenId) {
			ui.notifications.error(`You must be controlling at least one token that is within reach of the loot.`);
			return;
		}

    const flags: ItemFlags = duplicate(this.itemFlags);
		const loot: ContainerLoot = flags.container.loot;
		const itemType = $(e.currentTarget).parents(`ol[data-itemType]`).attr('data-itemType');
		const itemId = e.currentTarget.dataset.id;
		const itemData = loot?.[itemType]?.find(i => i._id === itemId);
		const token = canvas.tokens.placeables.find(t => t.id === this._selectedTokenId);

		this.addStopper();

		lootItem({ looterTokenId: token.id, looterActorId: token.actor.id, itemData, containerItemId: this.object.id }).then(() => {
			this._stopperElement.remove();
		});
	}

	protected _onEditImage = async (e) => {
		log(`pick-up-stix | ItemConfigApplication ${this.appId}  | _onEditImage`);

		new ContainerImageSelectionApplication(this.object).render(true);
		Hooks.once('closeContainerImageSelectionApplication', (app, html) => {
			log(`pick-up-stix | ItemConfigApplication ${this.appId} | _onEditImage | closeContainerImageSelectionApplication hook`);
			log([app, html]);
		});
	}

	private addStopper(): void {
		$(this._html).parents('#pick-up-stix-item-config').children().first().before(this._stopperElement);
	}
}
