import { getQuantityDataPath } from "../../utils";
import {
	createItem,
	createOwnedItem,
	createToken,
	deleteEntity,
	deleteToken,
	getValidControlledTokens,
	itemCollected,
  lootTokenCreated,
  lootTokens,
	updateEntity
} from "./main";
import { ItemType, PickUpStixFlags } from "./models";
import { SettingKeys } from "./settings";

/**
 * These are the flags stored on a Token instance.
 */
export interface TokenFlags {
	/**
	 * The UUID of the entity that this token represents.
	 */
	itemUuid?: string;
	isOpen?: boolean;
	canClose?: boolean;
	isLocked?: boolean;
}

export interface ItemFlags {
	itemType: ItemType;

	tokenData: {
		width: number;
		height: number;
	}

  container?: ContainerData
}

export interface ContainerData {
	soundOpenPath: string;
	soundClosePath: string;
	imageClosePath: string;
	imageOpenPath: string;
	loot?: ContainerLoot;
	currency?: any;
	description?: string;
}

export interface ContainerLoot {
	[key: string]: any[];
}

/**
 * This represents the Token data that will represent the loot Item. It's used
 * when creating the token to represent its physical properties
 */
export interface TokenData {
	name: string;
	img: string;
  width: number;
	height: number;
	disposition?: number;
	x?: number;
	y?: number;
	id?: string;
	flags: {
		'pick-up-stix': {
			'pick-up-stix': TokenFlags;
		}
	}
}

/**
 * The Item data used when creating a LootToken.
 */
export interface ItemData {
	name: string;
	img: string,
	type: string,
	flags: {
		'pick-up-stix': {
			'pick-up-stix': ItemFlags
		}
	}
	[key: string]: any;
}

export class LootToken {
	/**
	 *
	 * @param {string} tokenId Loot token's Token ID
	 * @param {string} itemUuid Loot token's Item UUID
	 */
	static async create(tokenId: string, itemUuid: string): Promise<LootToken>;

	static async create(tokenData: TokenData, itemUuid: string): Promise<LootToken>;

	/**
	 * Creates a new LootToken instance. A new Token instance may or may not be created
	 * depending on the parameters passed
	 *
	 * @param {TokenData} tokenData The token data to use when creating a new Token instance. If an
	 * id is provided in this data, then a new Token will not be created.
	 * @param {ItemData} itemData The loot data
	 */
	static async create(tokenData: TokenData, itemData: ItemData): Promise<LootToken>;
	static async create(tokenData: any, itemData: any): Promise<LootToken> {
		console.log(`pick-up-stix | LootToken | create:`);
		console.log([tokenData, itemData]);

		let tokenId: string;
		let itemUuid: string;

		if (typeof itemData === "object") {
			console.log('pick-up-stix | LootToken | create | creating new item');
			const item = await createItem({
				...itemData,
				folder: game.settings.get('pick-up-stix', SettingKeys.tokenFolderId),
			});
			itemUuid = item.uuid;
		}
		else {
			itemUuid = itemData;
		}

		if (typeof tokenData === "object") {
			console.log('pick-up-stix | LootToken | create | creating new token');

			tokenId = await createToken({
				...tokenData,
				flags: {
					'pick-up-stix': {
						'pick-up-stix': {
							itemUuid
						}
					}
				}
			});
		}
		else {
			console.log(`pick-up-stix | LootToken | create | token ID '${tokenData}' provided, looking for pre-existing Token instance'`);
			tokenId = tokenData;
		}

		const t = new LootToken(tokenId, itemUuid);
		lootTokens.push(t);

		lootTokenCreated(tokenId);

		return t;
	}

  private _config: FormApplication;
  private _sceneId: string;

	get lootData(): PickUpStixFlags {
		return {} as PickUpStixFlags;
	}

	get isOpen(): boolean {
		return this.tokenData?.flags?.['pick-up-stix']?.['pick-up-stix']?.isOpen ?? false;
	}

	get soundClosePath(): string {
		return this.lootData?.container?.soundClosePath;
	}

	get soundOpenPath(): string {
		return this.lootData?.container?.soundOpenPath;
	}

	get isLocked(): boolean {
		return this.tokenData?.flags?.['pick-up-stix']?.['pick-up-stix']?.isLocked ?? false;
	}

	get itemType(): ItemType {
		return this.lootData.itemType;
  }

  get canClose(): boolean {
    return this.tokenData?.flags?.['pick-up-stix']?.['pick-up-stix']?.canClose ?? true;
  }

	/**
	 * The Scene ID that the Token this LootToken instance represents belongs to
	 */
	get sceneId(): string {
    return this._sceneId;
	}

	get token(): any {
		return canvas.tokens.placeables.find(p => p.id === this.tokenId) ?? null;
	}

	get tokenData(): any {
		return Scene.collection.get(this. _sceneId)?.getEmbeddedEntity('Token', this._tokenId);
	}

	/**
	 * The Token ID this LootToken instance represents.
	 */
	get tokenId(): string {
		return this._tokenId;
	}

	get itemUuid(): string {
		return this._itemUuid;
	}

	constructor(
		private _tokenId: string,
		private _itemUuid: string
	) {
		console.log('pick-up-stix | LootToken | constructor:');
		console.log([this._tokenId, this._itemUuid]);
		for (let el of Scene.collection) {
			const scene = (el as unknown) as Scene;
			const token = scene.getEmbeddedEntity('Token', this._tokenId);
			if (token) {
				this._sceneId = scene.id;
				console.log(`pick-up-stix | LootToken | constructor | scene id set to '${this._sceneId}'`);
			}
		}
	}

	public activateListeners = (): void => {
		if (!canvas.tokens.placeables.find(p => p.id === this.tokenData._id)) {
			return;
		}

		console.log(`pick-up-stix | LootToken | activateListeners`);

		const token = this.token;

		this.deactivateListeners();

		Hooks.on('updateToken', this.updateTokenHook);

		token.mouseInteractionManager = this.setupMouseManager();
		token.activateListeners = this.setupMouseManager;
	}

	public deactivateListeners = (): void => {
		console.log(`pick-up-stix | LootToken | deactivateListeners`);
		Hooks.off('updateToken', this.updateTokenHook);

		const token = this.token;
		(token?.mouseInteractionManager as any)?._deactivateDragEvents();
	}

	private updateTokenHook = async (scene, tokenData, data, options, userId) => {
		if (this.tokenId !== tokenData._id || this.sceneId !== scene.id) {
			return;
		}

		const token = this.token;

		console.log(`pick-up-stix | LootToken | updateTokenHook`);
		console.log([scene, tokenData, data, options, userId]);

		if (tokenData.flags?.['pick-up-stix']?.['pick-up-stix']?.isLocked) {
			await this.drawLock();
		}
		else {
			const lock = token?.getChildByName('pick-up-stix-lock');
			if (lock) {
				token.removeChild(lock);
				lock.destroy();
			}
		}
	}

	public drawLock = async () => {
		console.log(`pick-up-stix | LootToken | drawLockIcon`);

		if (!game.user.isGM) {
			console.log(`pick-up-stix | LootToken | drawLockIcon | user is not GM, not drawing lock`);
			return;
		}

		const token = this.token;
		const lock = token?.getChildByName('pick-up-stix-lock');
		if (lock) {
			console.log(`pick-up-stix | LootToken | drawLock | found previous lock icon, removing it`)
			token.removeChild(lock);
			lock.destroy();
		}

		const tex = await loadTexture('icons/svg/padlock.svg');
		const icon = token?.addChild(new PIXI.Sprite(tex));
		if (icon) {
			icon.name = 'pick-up-stix-lock';
			icon.width = icon.height = 40;
			icon.alpha = .5;
			icon.position.set(token.width * .5 - icon.width * .5, token.height * .5 - icon.height * .5);
		}
	}

	remove = async () => {
		console.log(`pick-up-stix | LootToken | remove`);
		this.tokenData.mouseInteractionManager?._deactivateDragEvents();
		const token = this.token;
		await deleteToken(token, this.sceneId);
	}

	toggleLocked = async () => {
		console.log(`pick-up-stix | LootToken | toggleLocked`);
		const token = this.token;
		const locked = this.tokenData?.flags?.['pick-up-stix']?.['pick-up-stix']?.isLocked ?? false;
		await updateEntity(token, {
			flags: {
				'pick-up-stix': {
					'pick-up-stix': {
						isLocked: !locked
					}
				}
			}
		});
	}

	toggleOpened = async (tokens: Token[]=[], renderSheet: boolean=true) => {
		console.log('pick-up-stix | LootToken | toggleOpened');
		const data = this.lootData;

    if (data.container.isOpen) {
      let i = game.items.entities.find(item => {
        return item.getFlag('pick-up-stix', 'pick-up-stix.tokenId') === this.tokenId;
      });

      if (i) {
        ui.notifications.error(`Another character is interacting with this item. Please wait your turn or ask them to close their loot sheet.`);
        return;
      }
    }

    data.container.isOpen = !data.container.isOpen;

		await new Promise(resolve => {
			setTimeout(async () => {
				await updateEntity(this.tokenData, {
					img: data.container?.isOpen ? data.container.imageOpenPath : data.container.imageClosePath
				});
				const a = new Audio(data.container.isOpen ? data.container.soundOpenPath : data.container.soundClosePath);
				try {
					a.play();
				}
				catch (e) {
          // it's ok to error here
          console.error(e)
				}

				resolve();
			}, 200);
		});

		if (renderSheet && data.container?.isOpen) {
			await this.openConfigSheet(tokens);
		}
	}

	addItem = async (itemData: any, id: string): Promise<void> => {
		if (this.itemType !== ItemType.CONTAINER) {
			return;
		}

		console.log('pick-up-stix | LootToken | addItem');

		const data = this.lootData;

		const existingItem: any = Object.values(data?.container?.loot?.[itemData.type] ?? [])?.find(i => (i as any)._id === id);
		if (existingItem) {
			console.log(`pick-up-stix | LootToken | addItem | found existing item for item '${id}`);
			const quantityDataPath = getQuantityDataPath();
			if(!getProperty(existingItem.data, quantityDataPath)) {
				setProperty(existingItem.data, quantityDataPath, 1);
			}
			else {
				setProperty(existingItem.data, quantityDataPath, +getProperty(existingItem.data, quantityDataPath) + 1)
			}
		}
		else {
			if (!data.container.loot) {
				data.container.loot = {};
			}
			if (!data.container.loot[itemData.type]) {
				data.container.loot[itemData.type] = [];
			}
			data.container.loot[itemData.type].push(duplicate(itemData));
		}
	}

	collect = async (token) => {
		const data = this.lootData;

		if (data.itemType !== ItemType.ITEM) {
			return;
		}

		// TODO
		const itemData = {}; // this.lootData.itemData;

		console.log(`pick-up-stix | LootItem | collect | token ${token.id} is picking up token ${this.tokenId} on scene ${this.sceneId}`);
		await createOwnedItem(token.actor, [itemData]);
		itemCollected(token, itemData);
		await this.remove();
	}

  openConfigSheet = async (tokens: Token[] = [], options: any = {}): Promise<void> => {
    console.log('pick-up-stix | LootToken | openLootTokenConfig:');
    console.log([tokens]);

		if (this._config) {
			console.log('pick-up-stix | LootToken | openConfigSheet | config already opened, render the sheet');
			this._config.render(true, { renderData: { tokens } });
			return;
		}

		let i = game.items.entities.find(item => {
			return item.getFlag('pick-up-stix', 'pick-up-stix.tokenId') === this.tokenId;
		});

    const data = this.itemType === ItemType.CONTAINER
      ? {
        type: ItemType.CONTAINER,
        name: this.tokenData.name,
        img: this.tokenData.img,
        flags: {
          'pick-up-stix': {
            'pick-up-stix': {
              ...this.lootData,
              tokenId: this.tokenId,
              sceneId: this.sceneId
            }
          }
        }
			}
			// TODO
      : {}; // this.lootData.itemData;

    data['permission'] = {
      default: 2
    }

		if (!i) {
			console.log('pick-up-stix | LootToken | openConfigSheet | no item template found, constructing new Item');
			i = await createItem(data, { submitOnChange: true });
		}

		this._config = i.sheet.render(true, { renderData: { tokens } }) as FormApplication;

    const sheetCloseHandler = async (sheet, html) => {
      if (sheet.appId !== this._config.appId) {
        return;
      }
      console.log('pick-up-stix | LootToken | openLootTokenConfig | closeItemSheet hook');
      console.log([i.apps]);
      await deleteEntity(i.uuid);
      this._config = null;
      if (!options.configureOnly && this.lootData.container?.canClose) {
        await this.toggleOpened();
      }

      Hooks.off('closeItemSheet', sheetCloseHandler);
      Hooks.off('closeItemConfigApplication', sheetCloseHandler);
      Hooks.off('updateItem', updateItemHook);
    }

    const updateItemHook = async (item, data, options, userId) => {
      console.log('pick-up-stix | LootToken | openLootTokenConfig | updateItem hook');
      console.log([item, data, options, userId]);
      const flags = item.getFlag('pick-up-stix', 'pick-up-stix');

      if (!flags) {
        return;
      }

      await this.tokenData.update({
        name: item.data.name,
        img: item.data.img,
        width: flags.width ?? 1,
        height: flags.height ?? 1
      });
    }

    Hooks.on('updateItem', updateItemHook);
    Hooks.once('closeItemConfigApplication', sheetCloseHandler);
    Hooks.once('closeItemSheet', sheetCloseHandler);
	}



	/**************************
	 * MOUSE HANDLER METHODS
	 **************************/

	private setupMouseManager = (): MouseInteractionManager => {
		console.log(`pick-up-stix | setupMouseManager`);

		const token = this.token;

		if (!token) {
			throw new Error('Can\'t create MouseInteractionManager without a Token');
		}

		const permissions = {
			clickLeft: () => true,
			clickLeft2: () => game.user.isGM,
			clickRight: () => game.user.isGM,
			clickRight2: () => game.user.isGM,
			dragStart: () => game.user.isGM
		};

		// Define callback functions for each workflow step
		const callbacks = {
			clickLeft: this.handleClickLeft,
			clickLeft2: this.handleClickLeft2,
			clickRight: this.handleClickRight,
			clickRight2: this.handleClickRight2,
			dragLeftStart: (e) => { clearTimeout(this._clickTimeout); token._onDragLeftStart(e); },
			dragLeftMove: token._onDragLeftMove,
			dragLeftDrop: token._onDragLeftDrop,
			dragLeftCancel: token._onDragLeftCancel
		};

		// Define options
		const options = {
			target: token.controlIcon ? "controlIcon" : null
		};

		// Create the interaction manager
		if (token) {
			return new MouseInteractionManager(token, canvas.stage, permissions, callbacks, options).activate();
		}
	}

	private handleClickLeft = (event) => {
		const token = this.token;

		if (event.currentTarget.data.hidden) {
			console.log(`pick-up-stix | LootToken | handleClickLeft | token is hidden`);
			// if the loot token is hidden, pass the click on
			// to the token's normal left click method for Foundry
			// to handle
			token._onClickLeft(event);
			return;
		}

		// if the item isn't visible can't pick it up
		if (!token.isVisible) {
			console.log(`pick-up-stix | LootToken | handleClickLeft | token is not visible to user`);
			return;
		}

		const allControlled = canvas.tokens.controlled;
		const tokens = getValidControlledTokens(token);

		// checking for double click, the double click handler clears this timeout
		this._clickTimeout = setTimeout(this.finalizeClickLeft, 250, event, allControlled, tokens);
	}

	private finalizeClickLeft = async (event, allControlled: Token[], tokens: Token[]) => {
    console.log('pick-up-stix | LootToken | finalizeClickLeft');
    console.log([event, allControlled, tokens]);

		const token = this.token;

    let i = game.items.entities.find(item => {
      return item.getFlag('pick-up-stix', 'pick-up-stix.tokenId') === this.tokenId;
    });

    if (i) {
      ui.notifications.error(`Another character is interacting with this item. Please wait your turn or ask them to close their loot sheet.`);
      return;
    }

		// if it's locked then it can't be opened
		if (this.tokenData.locked) {
			console.log(`pick-up-stix | LootToken | finalizeClickLeft | item is locked`);
			var audio = new Audio(CONFIG.sounds.lock);
			audio.play();
			return;
		}

    if (!tokens.length) {
      if (!game.user.isGM) {
        ui.notifications.error(`Please ensure you have at least one token controlled that is close enough to the loot token.`);
      }
      else {
        token._onClickLeft(event);
      }
      return;
    }

    token._onClickLeft(event);

    for (let t of allControlled) {
      t.control({ releaseOthers: false });
    }

		if (this.lootData.itemType === ItemType.ITEM) {
			console.log(`pick-up-stix | LootToken | finalizeClickLeft | token is an ItemType.ITEM`);

			// TODO: add token selection when multiple tokens are controlled
      await this.collect(tokens[0]);
      return;
		}

		if (this.lootData.itemType === ItemType.CONTAINER) {
			console.log(`pick-up-stix | LootToken | finalizeClickLeft | item is a container`);

      if (this.isOpen) {
        if (this.canClose) {
          await this.toggleOpened(tokens);
        }
        else {
          await this.openConfigSheet(tokens);
        }
      }
      else {
        await this.toggleOpened(tokens);
      }

			return;
		}
	}

	private _clickTimeout;
	private handleClickRight = () => {
		console.log(`pick-up-stix | LootToken | handleClickRight`);;
		clearTimeout(this._clickTimeout);

		canvas.tokens.hud.clear();

		const token = this.token;
		const hud = canvas.hud.pickUpStixLootHud;
		if (hud) {
			token?.control({releaseOthers: true});
			if (hud.object === token) {
				hud.clear();
			}
			else hud.bind(token);
		}
	}

	private handleClickLeft2 = async (event) => {
    console.log('pick-up-stix | LootToken | handleClickLeft2');
    clearTimeout(this._clickTimeout);
    let i = game.items.entities.find(item => {
      return item.getFlag('pick-up-stix', 'pick-up-stix.tokenId') === this.tokenId;
    });

    if (i) {
      ui.notifications.error(`Another character is interacting with this item. Please wait your turn or ask them to close their loot sheet.`);
      return;
    }
		await this.openConfigSheet([], { configureOnly: true });
	}

	private handleClickRight2 = async (event) => {
    console.log('pick-up-stix | LootToken | handleClickRight2');
    clearTimeout(this._clickTimeout);
    let i = game.items.entities.find(item => {
      return item.getFlag('pick-up-stix', 'pick-up-stix.tokenId') === this.tokenId;
    });

    if (i) {
      ui.notifications.error(`Another character is interacting with this item. Please wait your turn or ask them to close their loot sheet.`);
      return;
    }
    await this.openConfigSheet([], { configureOnly: true });
	}
}
