import { error, log } from "../main.js";
import { getPriceDataPath, getQuantityDataPath, getWeightDataPath } from "./utils.js";
import { getValidControlledTokens, lootItem, updateItem, updateToken } from "./mainEntry.js";
import { ItemType } from "./models.js";
import { getCanvas, getGame, PICK_UP_STIX_FLAG, PICK_UP_STIX_MODULE_NAME, PICK_UP_STIX_TOKEN_ID_FLAG, } from "./settings.js";
export class LootToken {
    constructor(_tokenId, _itemId) {
        this._tokenId = _tokenId;
        this._itemId = _itemId;
        this.activateListeners = () => {
            if (!getCanvas().tokens?.placeables.find((p) => p.id === this.tokenData._id)) {
                return;
            }
            log(` LootToken | activateListeners`);
            const token = this.token;
            this.deactivateListeners();
            Hooks.on('updateToken', this.updateTokenHook);
            //@ts-ignore
            token.activateListeners = this.setupMouseManager;
        };
        this.deactivateListeners = () => {
            log(` LootToken | deactivateListeners`);
            Hooks.off('updateToken', this.updateTokenHook);
            const token = this.token;
            token?.mouseInteractionManager?._deactivateDragEvents();
        };
        this.updateTokenHook = async (scene, tokenData, data, options, userId) => {
            if (this.tokenId !== tokenData._id || this.sceneId !== scene.id) {
                return;
            }
            const token = this.token;
            log(` LootToken | updateTokenHook`);
            log([scene, tokenData, data, options, userId]);
            if (tokenData.flags?.['pick-up-stix']?.['pick-up-stix']?.isLocked) {
                log(` LootToken | updateTokenHook | token is locked, draw lock icon`);
                this.drawLock();
            }
            else {
                const lock = token?.getChildByName('pick-up-stix-lock');
                if (lock) {
                    log(` LootToken | updateTokenHook | token is not locked, but found lock icon, remove it`);
                    token.removeChild(lock);
                    lock.destroy();
                }
            }
        };
        this.drawLock = async () => {
            log(` LootToken | drawLockIcon`);
            if (!getGame().user?.isGM) {
                log(` LootToken | drawLockIcon | user is not GM, not drawing lock`);
                return;
            }
            const token = this.token;
            const lock = token?.getChildByName('pick-up-stix-lock');
            if (lock) {
                log(` LootToken | drawLock | found previous lock icon, removing it`);
                token.removeChild(lock);
                lock.destroy();
            }
            const tex = await loadTexture('icons/svg/padlock.svg');
            const icon = token?.addChild(new PIXI.Sprite(tex));
            if (icon) {
                icon.name = 'pick-up-stix-lock';
                icon.width = icon.height = 40;
                icon.alpha = 0.5;
                icon.position.set(token.width * 0.5 - icon.width * 0.5, token.height * 0.5 - icon.height * 0.5);
            }
        };
        this.toggleLocked = async () => {
            log(` LootToken | toggleLocked`);
            const locked = this.tokenData?.flags?.['pick-up-stix']?.['pick-up-stix']?.isLocked ?? false;
            updateToken(this.sceneId, {
                _id: this.tokenId,
                flags: {
                    'pick-up-stix': {
                        'pick-up-stix': {
                            isLocked: !locked,
                        },
                    },
                },
            });
        };
        this.toggleOpened = async (tokens = [], renderSheet = true) => {
            log(' LootToken | toggleOpened');
            const itemFlags = this.itemFlags;
            const openTmp = !this.isOpen;
            updateToken(this.sceneId, {
                _id: this.tokenId,
                img: openTmp ? itemFlags.container?.imageOpenPath : itemFlags.container?.imageClosePath,
                flags: {
                    'pick-up-stix': {
                        'pick-up-stix': {
                            isOpen: openTmp,
                        },
                    },
                },
            });
            const audioPath = (openTmp && itemFlags.container?.soundOpenPath) ?? (!open && itemFlags.container?.soundClosePath);
            if (audioPath) {
                const a = new Audio(audioPath);
                try {
                    a.play();
                }
                catch (e) {
                    // it's ok to error here
                    error(e);
                }
            }
            if (renderSheet && openTmp) {
                this.openConfigSheet(tokens);
            }
        };
        this.addItem = async (itemData) => {
            if (this.itemType !== ItemType.CONTAINER) {
                return;
            }
            log('pick-up-stix | LootToken | addItem');
            const itemFlags = duplicate(this.itemFlags);
            const existingItem = Object.values(itemFlags?.container?.loot?.[itemData?.type] ?? [])?.find((i) => i.name?.toLowerCase() === itemData.name?.toLowerCase() &&
                i.img === itemData.img &&
                i.data?.description?.value?.toLowerCase() === itemData.data?.description?.value?.toLowerCase() &&
                getProperty(i.data, getPriceDataPath()) === getProperty(itemData.data, getPriceDataPath()) &&
                getProperty(i.data, getWeightDataPath()) === getProperty(itemData.data, getWeightDataPath()));
            if (existingItem) {
                log(` LootToken | addItem | found existing item for item '${itemData._id}`);
                const quantityDataPath = getQuantityDataPath();
                if (!getProperty(existingItem.data, quantityDataPath)) {
                    setProperty(existingItem.data, quantityDataPath, 1);
                }
                else {
                    setProperty(existingItem.data, quantityDataPath, +getProperty(existingItem.data, quantityDataPath) + 1);
                }
            }
            else {
                const containerData = itemFlags.container;
                if (!containerData?.loot) {
                    containerData.loot = {};
                }
                if (!containerData?.loot[itemData.type]) {
                    containerData.loot[itemData.type] = [];
                }
                containerData.loot[itemData.type].push(itemData);
                itemFlags.container = containerData;
            }
            updateItem(this.itemId, {
                flags: {
                    'pick-up-stix': {
                        'pick-up-stix': itemFlags,
                    },
                },
            });
        };
        this.collect = async (token) => {
            if (this.itemType !== ItemType.ITEM) {
                return;
            }
            //@ts-ignore
            lootItem({ looterTokenId: token.id, itemData: this.item.data, lootTokenTokenId: this.tokenId, takeAll: true });
        };
        this.openConfigSheet = async (tokens = [], options = {}) => {
            log(' LootToken | openConfigSheet:');
            log([tokens, options]);
            const closeContainerConfigApplicationHook = async (app, html) => {
                log(` LootToken | openConfigSheet | closeContainerConfigApplicationHook`);
                log([app, html]);
                if (app.appId !== appId) {
                    return;
                }
                Hooks.off('closeContainerConfigApplication', closeContainerConfigApplicationHook);
                if (this.isOpen) {
                    await this.toggleOpened();
                }
            };
            for (const itemTmp of getGame().items) {
                const i = itemTmp;
                const flags = i.getFlag(PICK_UP_STIX_MODULE_NAME, PICK_UP_STIX_FLAG);
                if (this.itemId === i.id || flags === undefined) {
                    continue;
                }
                for (const app of Object.values(i.apps)) {
                    app.close();
                }
            }
            Hooks.once('closeContainerConfigApplication', closeContainerConfigApplicationHook);
            const item = this.item;
            const appId = (item.sheet?.render(!item.sheet?.rendered, { renderData: { tokens, sourceToken: this.tokenId } })
                .appId);
        };
        /**************************
         * MOUSE HANDLER METHODS
         **************************/
        this.setupMouseManager = () => {
            log(` setupMouseManager`);
            const token = this.token;
            if (!token) {
                throw new Error("Can't create MouseInteractionManager without a Token");
            }
            const permissions = {
                clickLeft: () => true,
                clickLeft2: () => getGame().user?.isGM,
                clickRight: () => getGame().user?.isGM,
                clickRight2: () => getGame().user?.isGM,
                dragLeftStart: () => getGame().user?.isGM,
                hoverIn: () => true,
                hoverOut: () => true,
            };
            // Define callback functions for each workflow step
            const callbacks = {
                clickLeft: this.handleClickLeft,
                clickLeft2: this.handleClickLeft2,
                clickRight: this.handleClickRight,
                clickRight2: this.handleClickRight2,
                //@ts-ignore
                dragLeftStart: (e) => {
                    clearTimeout(this._clickTimeout);
                    //@ts-ignore
                    token._onDragLeftStart(e);
                },
                //@ts-ignore
                dragLeftMove: token._onDragLeftMove,
                //@ts-ignore
                dragLeftDrop: token._onDragLeftDrop,
                //@ts-ignore
                dragLeftCancel: token._onDragLeftCancel,
                //@ts-ignore
                hoverIn: () => token._onHoverIn,
                //@ts-ignore
                hoverOut: () => token._onHoverOut,
            };
            // Define options
            const options = {
                target: token.controlIcon ? 'controlIcon' : null,
            };
            // Create the interaction manager
            if (token) {
                return new MouseInteractionManager(token, getCanvas().stage, permissions, callbacks, options).activate();
            }
            else {
                return null;
            }
        };
        this.handleClickLeft = (event) => {
            const token = this.token;
            if (!token.isVisible) {
                log(` LootToken | handleClickLeft | token is hidden`);
                // if the loot token is hidden, pass the click on
                // to the token's normal left click method for Foundry
                // to handle
                //@ts-ignore
                token._onClickLeft(event);
                return;
            }
            const allControlled = getCanvas().tokens?.controlled;
            const tokens = getValidControlledTokens(token);
            // checking for double click, the double click handler clears this timeout
            this._clickTimeout = setTimeout(this.finalizeClickLeft, 250, event, allControlled, tokens);
        };
        this.finalizeClickLeft = async (event, allControlled, tokens) => {
            log(' LootToken | finalizeClickLeft');
            log([event, allControlled, tokens]);
            const token = this.token;
            // if it's locked then it can't be opened
            if (this.isLocked) {
                log(` LootToken | finalizeClickLeft | item is locked`);
                const audio = new Audio(CONFIG.sounds.lock);
                audio.play();
                return;
            }
            if (!tokens.length) {
                if (!getGame().user?.isGM) {
                    ui.notifications?.error(`Please ensure you have at least one token controlled that is close enough to the loot token.`);
                }
                else {
                    //@ts-ignore
                    token._onClickLeft(event);
                }
                return;
            }
            //@ts-ignore
            token._onClickLeft(event);
            for (const t of allControlled) {
                t.control({ releaseOthers: false });
            }
            if (this.itemFlags.itemType === ItemType.ITEM) {
                log(` LootToken | finalizeClickLeft | token is an ItemType.ITEM`);
                this.collect(tokens[0]);
                return;
            }
            if (this.itemFlags.itemType === ItemType.CONTAINER) {
                log(` LootToken | finalizeClickLeft | item is a container`);
                if (this.isOpen) {
                    this.openConfigSheet(tokens);
                }
                else {
                    this.toggleOpened(tokens);
                }
                return;
            }
        };
        this.handleClickRight = () => {
            log(` LootToken | handleClickRight`);
            clearTimeout(this._clickTimeout);
            getCanvas().tokens?.hud.clear();
            const token = this.token;
            //@ts-ignore
            const hud = getCanvas().hud.pickUpStixLootHud;
            if (hud) {
                token?.control({ releaseOthers: true });
                if (hud.object === token) {
                    hud.clear();
                }
                else
                    hud.bind(token);
            }
        };
        this.handleClickLeft2 = async (event) => {
            log(' LootToken | handleClickLeft2');
            clearTimeout(this._clickTimeout);
            this.openConfigSheet();
        };
        this.handleClickRight2 = async (event) => {
            log(' LootToken | handleClickRight2');
            clearTimeout(this._clickTimeout);
            const i = getGame().items?.contents.find((item) => {
                return item.getFlag(PICK_UP_STIX_MODULE_NAME, PICK_UP_STIX_TOKEN_ID_FLAG) === this.tokenId;
            });
            if (i) {
                ui.notifications?.error(`Another character is interacting with this item. Please wait your turn or ask them to close their loot sheet.`);
                return;
            }
            this.openConfigSheet([], { configureOnly: true });
        };
        log('pick-up-stix | LootToken | constructor:');
        log([this._tokenId, this._itemId]);
        for (const el of getGame().scenes) {
            const scene = el;
            const token = scene.getEmbeddedEntity('Token', this._tokenId);
            if (token) {
                this._sceneId = scene.id;
                log(` LootToken | constructor | scene id set to '${this._sceneId}'`);
            }
        }
    }
    get itemFlags() {
        return this.item.getFlag(PICK_UP_STIX_MODULE_NAME, PICK_UP_STIX_FLAG);
    }
    get isOpen() {
        return this.tokenData?.flags?.[PICK_UP_STIX_MODULE_NAME]?.[PICK_UP_STIX_FLAG]?.isOpen ?? false;
    }
    get soundClosePath() {
        return this.itemFlags?.container?.soundClosePath;
    }
    get soundOpenPath() {
        return this.itemFlags?.container?.soundOpenPath;
    }
    get isLocked() {
        return this.tokenData?.flags?.['pick-up-stix']?.['pick-up-stix']?.isLocked ?? false;
    }
    get itemType() {
        return this.itemFlags?.itemType;
    }
    get canClose() {
        return this.itemFlags?.container?.canClose;
    }
    get item() {
        return getGame().items?.get(this.itemId);
    }
    /**
     * The Scene ID that the Token this LootToken instance represents belongs to
     */
    get sceneId() {
        return this._sceneId;
    }
    get token() {
        return getCanvas().tokens?.placeables.find((p) => p.id === this.tokenId) ?? null;
    }
    get tokenData() {
        return getGame().scenes?.get(this._sceneId)?.getEmbeddedEntity('Token', this._tokenId);
    }
    /**
     * The Token ID this LootToken instance represents.
     */
    get tokenId() {
        return this._tokenId;
    }
    get itemId() {
        return this._itemId;
    }
}

//# sourceMappingURL=../maps/module/loot-token.js.map
