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
	saveLootTokenData,
	updateEntity
} from "./main";
import { ItemType, PickUpStixFlags } from "./models";
import { SettingKeys } from "./settings";

export interface TokenData {
	name?: string;
	disposition?: number;
	x?: number;
	y?: number;
	img?: string;
	id?: string;
}

export class LootToken {
	/**
	 * Creates a new LootToken instance. A new Token instance may or may not be created
	 * depending on the parameters passed
	 *
	 * @param tokenData The token data to use when creating a new Token instance. If an
	 * id is provided in this data, then a new Token will not be created.
	 * @param {PickUpStixFlags} data The loot data
	 */
  static async create(tokenData: TokenData, data: PickUpStixFlags): Promise<LootToken> {
    console.log(`pick-up-stix | LootToken | create:`);
    console.log([tokenData, data]);
		let tokenId: string;

		if (tokenData.id === undefined) {
			console.log('pick-up-stix | LootToken | create | creating new Token instance');
			tokenId = await createToken({
				...tokenData
			});
		}
		else {
			console.log(`pick-up-stix | LootToken | create | token ID '${tokenData.id}' provided, looking for pre-existing Token instance'`);
			tokenId = tokenData.id;
		}

		const t = new LootToken(tokenId);

		// we only need to save the token data if the token was actually created here rather than a current
		// Token instance being provided
		if (tokenData.id === undefined) {
      await t.save(data);
    }
    lootTokens.push(t);
    lootTokenCreated(tokenId, data);
		return t;
	}

  private _config: FormApplication;
  private _sceneId: string;

	get lootData(): PickUpStixFlags {
		return duplicate(game.settings.get('pick-up-stix', SettingKeys.lootTokenData)?.[this.sceneId]?.[this.tokenId] || {});
	}

	get isOpen(): boolean {
		return !!this.lootData?.container?.isOpen;
	}

	get soundClosePath(): string {
		return this.lootData?.container?.soundClosePath;
	}

	get soundOpenPath(): string {
		return this.lootData?.container?.soundOpenPath;
	}

	get isLocked(): boolean {
		return !!this.lootData?.isLocked;
	}

	get itemType(): ItemType {
		return this.lootData.itemType;
  }

  get canClose(): boolean {
    return this.lootData.container?.canClose;
  }

	/**
	 * The Scene ID that the Token this LootToken instance represents belongs to
	 */
	get sceneId(): string {
    return this._sceneId;
	}

	get token(): any {
		return canvas.tokens.placeables.find(p => p.id === this._tokenId);
	}

	/**
	 * The Token ID this LootToken instance represents.
	 */
	get tokenId(): string {
		return this._tokenId;
	}

	constructor(
		private _tokenId: string
	) {
		console.log('pick-up-stix | LootToken | constructor:');
    console.log([this._tokenId]);
    this._sceneId = canvas.tokens.placeables.find(p => p.id === this._tokenId)?.scene?.id;
	}

	activateListeners = () => {
		Hooks.off('pick-up-stix.lootTokenDataSaved', this.lootTokenDataSavedHook);
		Hooks.on('pick-up-stix.lootTokenDataSaved', this.lootTokenDataSavedHook);

		Hooks.off('deleteToken', this.deleteTokenHook);
		Hooks.on('deleteToken', this.deleteTokenHook);

		this.token.mouseInteractionManager = this.setupMouseManager();
		this.token.activateListeners = this.setupMouseManager;
	}

	private deactivateListeners = (): void => {
		Hooks.off('pick-up-stix.lootTokenDataSaved', this.lootTokenDataSavedHook);
		Hooks.off('deleteToken', this.deleteTokenHook);

		if (this.token) {
			this.token.mouseInteractionManager?._deactivateDragEvents();
		}
	}

	private deleteTokenHook = async (scene, tokenData, options, userId) => {
		if (scene.id !== this.sceneId || tokenData._id !== this.tokenId) {
			return;
		}

		console.log('pick-up-stix | LootToken | deleteTokenHook');
		console.log([scene, tokenData, options, userId]);

		this.deactivateListeners();
	}

	private lootTokenDataSavedHook = async (sceneId, tokenId, data: PickUpStixFlags) => {
		if (sceneId !== this.sceneId || this.tokenId !== tokenId) {
			return;
		}

		console.log(`pick-up-stix | LootToken | lootTokenDataSavedHook hook:`);
		console.log([sceneId, tokenId, data]);

		if (this.lootData.isLocked) {
			this.drawLock();
		}
		else {
			const lock = this.token?.getChildByName('pick-up-stix-lock');
			if (lock) {
				this.token.removeChild(lock);
				lock.destroy();
			}
    }

    if (data.itemType === ItemType.CONTAINER) {
      const img = data.container.isOpen
        ? data.container.imageOpenPath
        : data.container.imageClosePath;

      // TODO: might want to look at this. The hook is called for all players
      // so if there are multiple GMs then this will get called multiple times
      if (game.user.isGM) {
        await this.token.update({
          img,
          name: data.name,
          width: data.width,
          height: data.height
        });
      }
    }
	}

	private drawLock = async () => {
		console.log(`pick-up-stix | LootToken | drawLockIcon`);

		if (!game.user.isGM) {
			console.log(`pick-up-stix | LootToken | drawLockIcon | user is not GM, not drawing lock`);
			return;
		}

		const token = this.token;
		const lock = this.token?.getChildByName('pick-up-stix-lock');
		if (lock) {
			console.log(`pick-up-stix | LootToken | drawLock | found previous lock icon, removing it`)
			token.removeChild(lock);
			lock.destroy();
		}

		const tex = await loadTexture('icons/svg/padlock.svg');
		const icon = token.addChild(new PIXI.Sprite(tex));
		icon.name = 'pick-up-stix-lock';
		icon.width = icon.height = 40;
		icon.alpha = .5;
		icon.position.set(token.width * .5 - icon.width * .5, token.height * .5 - icon.height * .5);
	}

	/**
	 * Save the token's current loot data to the settings db.
	 *
	 * Data is first keyed off of the scene ID the tokens belong
	 * to and then keyed off of the token IDs within each scene
	 * object
	 */
	save = async (data) => {
		console.log(`pick-up-stix | LootToken | save`);
		await saveLootTokenData(this.sceneId, this.tokenId, data);
	}

	remove = async () => {
		console.log(`pick-up-stix | LootToken | remove`);
		this.token.mouseInteractionManager?._deactivateDragEvents();
		await deleteToken(this.token);
	}

	toggleLocked = async () => {
		console.log(`pick-up-stix | LootToken | toggleLocked`);
		const data = this.lootData;
		data.isLocked = !data.isLocked;
		this.save(data);
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
				await updateEntity(this.token, {
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

		await this.save(data);

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

		await this.save(data);
	}

	collect = async (token) => {
		const data = this.lootData;

		if (data.itemType !== ItemType.ITEM) {
			return;
		}

		const itemData = this.lootData.itemData;

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
        name: this.token.name,
        img: this.token.data.img,
        flags: {
          'pick-up-stix': {
            'pick-up-stix': {
              ...this.lootData,
              temporary: true,
              tokenId: this.tokenId,
              sceneId: this.sceneId
            }
          }
        }
      }
      : this.lootData.itemData;

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
      if (!options.configureOnly && this.lootData.container.canClose) {
        await this.toggleOpened();
      }
      Hooks.off('closeItemSheet', sheetCloseHandler);
      Hooks.off('closeItemConfigApplication', sheetCloseHandler);
    }

    Hooks.once('closeItemConfigApplication', sheetCloseHandler);
    Hooks.once('closeItemSheet', sheetCloseHandler);
	}



	/**************************
	 * MOUSE HANDLER METHODS
	 **************************/

	private setupMouseManager = (): MouseInteractionManager => {
		console.log(`pick-up-stix | setupMouseManager`);

		const permissions = {
			clickLeft: () => true,
			clickLeft2: () => game.user.isGM,
			clickRight: () => game.user.isGM,
			clickRight2: () => game.user.isGM,
			dragStart: this.token._canDrag
		};

		// Define callback functions for each workflow step
		const callbacks = {
			clickLeft: this.handleClickLeft,
			clickLeft2: this.handleClickLeft2,
			clickRight: this.handleClickRight,
			clickRight2: this.handleClickRight2,
			dragLeftStart: (e) => { clearTimeout(this._clickTimeout); this.token._onDragLeftStart(e); },
			dragLeftMove: this.token._onDragLeftMove,
			dragLeftDrop: this.token._onDragLeftDrop,
			dragLeftCancel: this.token._onDragLeftCancel
		};

		// Define options
		const options = {
			target: this.token.controlIcon ? "controlIcon" : null
		};

		// Create the interaction manager
		return new MouseInteractionManager(this.token, canvas.stage, permissions, callbacks, options).activate();
	}

	private handleClickLeft = (event) => {
		if (event.currentTarget.data.hidden) {
			console.log(`pick-up-stix | LootToken | handleClickLeft | token is hidden`);
			// if the loot token is hidden, pass the click on
			// to the token's normal left click method for Foundry
			// to handle
			this.token._onClickLeft(event);
			return;
		}

		// if the item isn't visible can't pick it up
		if (!this.token.isVisible) {
			console.log(`pick-up-stix | LootToken | handleClickLeft | token is not visible to user`);
			return;
		}

		const allControlled = canvas.tokens.controlled;
		const tokens = getValidControlledTokens(this.token);

		// checking for double click, the double click handler clears this timeout
		this._clickTimeout = setTimeout(this.finalizeClickLeft, 250, event, allControlled, tokens);
	}

	private finalizeClickLeft = async (event, allControlled: Token[], tokens: Token[]) => {
    console.log('pick-up-stix | LootToken | finalizeClickLeft');
    console.log([event, allControlled, tokens]);

    let i = game.items.entities.find(item => {
      return item.getFlag('pick-up-stix', 'pick-up-stix.tokenId') === this.tokenId;
    });

    if (i) {
      ui.notifications.error(`Another character is interacting with this item. Please wait your turn or ask them to close their loot sheet.`);
      return;
    }

		/* for (let t of allControlled) {
      t.control({ releaseOthers: false });
    } */

		// if it's locked then it can't be opened
		if (this.lootData.isLocked) {
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
        this.token._onClickLeft(event);
      }
      return;
    }

    this.token._onClickLeft(event);

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
		clearTimeout(this._clickTimeout);

		const hud = canvas.hud.pickUpStixLootHud;
		if (hud) {
			this.token?.control({releaseOthers: true});
			if (hud.object === this.token) {
				hud.clear();
			}
			else hud.bind(this.token);
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
