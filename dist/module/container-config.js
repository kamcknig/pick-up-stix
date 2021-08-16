import { log } from "../main.js";
import ContainerImageSelectionApplication from "./container-image-selection-application.js";
import { ContainerSoundConfig } from "./container-sound-config-application.js";
import { addItemToContainer, deleteOwnedItem, getLootToken, getValidControlledTokens, lootCurrency, lootItem, normalizeDropData, updateItem } from "./mainEntry.js";
import { getCanvas, getGame, PICK_UP_STIX_FLAG, PICK_UP_STIX_MODULE_NAME, SettingKeys } from "./settings.js";
import { getCurrencyTypes, getPriceDataPath, getQuantityDataPath, onChangeInputDelta } from "./utils.js";
/**
 * Application class to display to select an item that the token is
 * associated with
 */
export default class ContainerConfigApplication extends FormApplication {
    constructor(object, ...args) {
        super(object, args);
        this._stopperElement = $(`<div class="stopper">
		<div class="loader"></div>
	</div>`);
        /**
         * @override
         */
        this.close = async () => {
            log(` ContainerConfigApplication ${this.appId} | close`);
            Hooks.off('updateToken', this.updateTokenHook);
            Hooks.off('controlToken', this.controlTokenHook);
            return super.close();
        };
        /**
         * @override
         * @param token
         * @param controlled
         */
        this.controlTokenHook = (token, controlled) => {
            log(` ContainerConfigApplication ${this.appId} | controlTokenHook`);
            log([token, controlled]);
            const options = {};
            if (this.isToken) {
                options['renderData'] = { tokens: getValidControlledTokens(this._sourceTokenId), sourceTokenId: this._sourceTokenId };
            }
            setTimeout((options) => {
                this.render(true, options);
            }, 100, options);
        };
        this.updateTokenHook = (scene, token, diff, options) => {
            log(` ContainerConfigApplication ${this.appId} | updateTokenHook`);
            // clear the selected token because the token might have moved too far away to be
            // eligible
            this._selectedTokenId = "";
            setTimeout(this.render.bind(this), 100, { sourceTokenId: this._sourceTokenId });
        };
        this._onSelectActor = (e) => {
            log(` ContainerConfigApplication ${this.appId} | onActorSelect`);
            this._selectedTokenId = e.currentTarget.dataset.token_id;
            const options = { sourceTokenId: this._sourceTokenId };
            this.render(false, options);
        };
        this._onConfigureSound = (e) => {
            log(` ContainerConfigApplication ${this.appId} | onConfigureSound`);
            new ContainerSoundConfig(this.object, {}).render(true);
        };
        this._onDeleteItem = async (e) => {
            log(` ContainerConfigApplication | _onDeleteItem`);
            const itemId = e.currentTarget.dataset.id;
            const loot = duplicate(this.itemFlags.container?.loot);
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
        };
        this._onTakeCurrency = async (e) => {
            log(` ContainerConfigApplication ${this.appId} | _onTakeCurrency`);
            if (!this._selectedTokenId) {
                ui.notifications?.error(`You must be controlling at least one token that is within reach of the loot.`);
                return;
            }
            const token = getCanvas().tokens?.placeables.find(t => t.id === this._selectedTokenId);
            $(this._html)
                .find('.data-currency-input')
                .val(0);
            this.addStopper();
            //@ts-ignore
            lootCurrency({ looterTokenId: token.id, containerItemId: this.object.id, currencies: this.itemFlags.container?.currency }).then(() => {
                this._stopperElement.remove();
            });
        };
        this._onLootAll = async (e) => {
            log(` ContainerConfigApplication ${this.appId} | _onLootAll`);
            if (!this._selectedTokenId) {
                ui.notifications?.error(`You must be controlling at least one token that is within reach of the loot.`);
                return;
            }
            const flags = duplicate(this.itemFlags);
            const loot = flags.container?.loot;
            /* const itemType = $(e.currentTarget).parents(`ol[data-itemType]`).attr('data-itemType');
            const itemId = e.currentTarget.dataset.id; */
            const itemData = Object.values(loot)?.reduce((acc, itemDatas) => acc.concat(itemDatas), []);
            const token = getCanvas().tokens?.placeables.find(t => t.id === this._selectedTokenId);
            //@ts-ignore
            lootItem({ looterTokenId: token.id, itemData, containerItemId: this.object.id, lootTokenTokenId: this._sourceTokenId, takeAll: true }).then(() => {
                this._stopperElement.remove();
            });
        };
        this._onTakeItem = async (e) => {
            log(` ContainerConfigApplication ${this.appId} | _onTakeItem`);
            if (!this._selectedTokenId) {
                ui.notifications?.error(`You must be controlling at least one token that is within reach of the loot.`);
                return;
            }
            const flags = duplicate(this.itemFlags);
            const loot = flags.container?.loot;
            const itemType = $(e.currentTarget).parents(`ol[data-itemType]`).attr('data-itemType');
            const itemId = e.currentTarget.dataset.id;
            const itemData = loot?.[itemType]?.find(i => i._id === itemId);
            const token = getCanvas().tokens?.placeables.find(t => t.id === this._selectedTokenId);
            this.addStopper();
            //@ts-ignore
            lootItem({ looterTokenId: token.id, itemData, containerItemId: this.object.id, lootTokenTokenId: this._sourceTokenId, takeAll: false }).then(() => {
                this._stopperElement.remove();
            });
        };
        this._onEditImage = async (e) => {
            log(` ContainerConfigApplication ${this.appId}  | _onEditImage`);
            new ContainerImageSelectionApplication(this.object).render(true);
            Hooks.once('closeContainerImageSelectionApplication', (app, html) => {
                log(` ContainerConfigApplication ${this.appId} | _onEditImage | closeContainerImageSelectionApplication hook`);
                log([app, html]);
            });
        };
        log(` ContainerConfigApplication ${this.appId} | constructor called with:`);
        log([object]);
    }
    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            closeOnSubmit: false,
            submitOnClose: false,
            submitOnChange: true,
            id: "pick-up-stix-item-config",
            template: `/modules/${PICK_UP_STIX_MODULE_NAME}/templates/container-config.html`,
            width: 900,
            title: `${getGame().user?.isGM ? 'Configure Loot Container' : 'Loot Container'}`,
            resizable: true,
            classes: ['pick-up-stix', 'container-config-sheet'],
            dragDrop: [{ dropSelector: null }]
        });
    }
    /**
     * @override
     */
    get isEditable() {
        return true;
    }
    get currencyEnabled() {
        return !getGame().settings.get(PICK_UP_STIX_MODULE_NAME, SettingKeys.disableCurrencyLoot);
    }
    get itemFlags() {
        return this.object.getFlag(PICK_UP_STIX_MODULE_NAME, PICK_UP_STIX_FLAG);
    }
    get tokenDatas() {
        const tokens = getLootToken({ itemId: this.object.id }).map(lt => lt.tokenData);
        return tokens;
    }
    get isToken() {
        return !!this.tokenDatas.length;
    }
    activateListeners(html) {
        log(` ContainerConfigApplication ${this.appId}  | activateListeners`);
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
        if (getGame().user?.isGM) {
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
            .find('.loot-all-button')
            .on('click', this._onLootAll);
        $(html)
            .find(`a.item-take`)
            .on('click', this._onTakeItem);
        $(html)
            .find(`input[type="text"]`)
            .prop('readonly', !getGame().user?.isGM);
        $(html)
            .find(`input[type="text"]`)
            .prop('disabled', !getGame().user?.isGM);
        $(html)
            .find('input#canCloseCheckbox')
            .prop('checked', this.itemFlags?.container?.canClose ?? true);
        if (!getGame().user?.isGM) {
            $(html)
                .find(`input[type="text"]`)
                .addClass('isNotGM');
        }
    }
    /**
     *
     * @param options
     */
    getData(options) {
        log(` ContainerConfigApplication ${this.appId} | getData:`);
        log([options]);
        this._sourceTokenId = this._sourceTokenId !== options?.renderData?.sourceToken
            ? options?.renderData?.sourceToken ?? this._sourceTokenId
            : this._sourceTokenId;
        const actionTokens = options?.renderData?.tokens ?? [];
        const quantityDataPath = getQuantityDataPath();
        const priceDataPath = getPriceDataPath();
        const loot = Object.entries(this.itemFlags?.container?.loot ?? {})
            .reduce((prev, [lootKey, lootItems]) => {
            const items = lootItems?.map(i => {
                if (!i.data.hasOwnProperty('quantity')) {
                    setProperty(i.data, quantityDataPath, 0);
                }
                return {
                    ...i,
                    price: +getProperty(i.data, quantityDataPath) * +parseFloat(getProperty(i.data, priceDataPath) ?? 0),
                    qty: +getProperty(i.data, quantityDataPath)
                };
            });
            if (items?.length > 0) {
                prev[lootKey] = items;
            }
            return prev;
        }, {});
        //@ts-ignore
        let description = this.itemFlags?.container?.description ?? this.object.data?.data?.description?.value ?? '';
        description = description.replace(/font-size:\s*\d*.*;/, 'font-size: 16px;');
        const currencyTypes = getCurrencyTypes();
        const tokens = getValidControlledTokens(this._sourceTokenId)
            .concat(actionTokens)
            .reduce((acc, next) => {
            if (!next || acc.map((t) => t.id).includes(next.id)) {
                return acc;
            }
            acc.push(next);
            return acc;
        }, [])
            .map(t => ({ token: t, class: this._selectedTokenId === t.id ? 'active' : '' }))
            .filter(t => !!t.token)
            .sort((a, b) => {
            if (a.token.name < b.token.name)
                return -1;
            if (a.token.name > b.token.name)
                return 1;
            return 0;
        });
        if (!this._selectedTokenId && tokens.length) {
            log(` ContainerConfigApplication ${this.appId} | getData | setting selected token '${tokens[0].token.id}'`);
            this._selectedTokenId = tokens[0].token.id;
            tokens[0].class = 'active';
        }
        const data = {
            currencyEnabled: this.currencyEnabled,
            currencyTypes: Object.entries(currencyTypes).map(([k, v]) => ({ short: k, long: v })),
            currency: this.itemFlags.container?.currency,
            showTakeCurrency: Object.values(this.itemFlags.container?.currency).some((amount) => amount > 0),
            lootTypes: Object.keys(loot),
            loot,
            showLootAll: Object.keys(loot).length > 0,
            profileImage: this.itemFlags.container?.imageOpenPath,
            description,
            //@ts-ignore
            object: this.object.data,
            width: this.itemFlags.tokenData.width ?? 1,
            height: this.itemFlags.tokenData.height ?? 1,
            user: getGame().user,
            quantityDataPath,
            hasToken: this.isToken,
            tokens
        };
        log(` ContainerConfigApplication ${this.appId} | getData | data to render:`);
        log([data]);
        return data;
    }
    /**
     * @override
     * @param e
     */
    async _onDrop(e) {
        log(` ContainerConfigApplication ${this.appId}  | _onDrop`);
        const dropData = await normalizeDropData(JSON.parse(e.dataTransfer.getData('text/plain')) ?? {});
        log(` ContainerConfigApplication ${this.appId}  | _onDrop | dropped data`);
        log([dropData]);
        this.addStopper();
        addItemToContainer({
            //@ts-ignore
            containerItemId: this.object.id,
            itemData: dropData.data
        }).then(() => {
            this._stopperElement.remove();
        });
        if (dropData.actor) {
            deleteOwnedItem(dropData.actor.id, dropData.data._id);
        }
    }
    /**
     * @override
     * @param e
     * @param formData
     */
    async _updateObject(e, formData) {
        log(` ContainerConfigApplication ${this.appId} | _updateObject called with args:`);
        log([e, duplicate(formData)]);
        const containerData = duplicate(this.itemFlags.container);
        formData = duplicate(formData);
        const token = getCanvas().tokens?.placeables.find(p => p.id === this._sourceTokenId);
        formData.img = token?.getFlag(PICK_UP_STIX_MODULE_NAME, PICK_UP_STIX_FLAG)?.isOpen
            ? containerData?.imageOpenPath
            : containerData?.imageClosePath;
        const tokenLoot = containerData?.loot;
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
                    setProperty(data.data, getQuantityDataPath(), $(e.currentTarget).hasClass('quantity-input') && e.currentTarget.dataset.lootType === itemData.type && e.currentTarget.dataset.lootId === itemData._id ?
                        +$(e.currentTarget).val() :
                        +getProperty(itemData.data, getQuantityDataPath()));
                    return data;
                }));
            });
        }
        if (this.currencyEnabled) {
            // when the user is a GM the currency is taken from the inputs on the form, but when the user NOT a GM, there are no inputs
            if (!getGame().user?.isGM) {
                if (containerData.currency) {
                    setProperty(formData, `container.currency`, { ...containerData.currency });
                }
            }
        }
        const expandedObject = expandObject(flattenObject(formData));
        log(` ContainerConfigApplication ${this.appId} | _updateObject | expanded 'formData' object:`);
        log(expandedObject);
        //@ts-ignore
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
    addStopper() {
        $(this._html).parents('#pick-up-stix-item-config').children().first().before(this._stopperElement);
    }
}

//# sourceMappingURL=../maps/module/container-config.js.map
