import { deleteToken, getQuantityDataPath } from "../../utils";
import { createEntity, createOwnedItem, createToken, deleteEntity, deleteLootTokenData, getValidControlledTokens, itemCollected, saveLootTokenData, updateEntity } from "./main";
import { ItemType, PickUpStixFlags } from "./models";

export interface TokenData {
  name: string;
  disposition: number;
  x: number;
  y: number;
  img: string;
  id?: string;
}

export class LootToken {
  /**
   * Creates a new LootToken instance. A new Token instance may or may not be created
   * depending on the parameters passed
   *
   * @param tokenData The token data to use when creating a new Token instance. If an
   * id is provided in this data, then a new Token will not be created.
   * @param {PickUpStixFlags} lootData The loot data
   */
  static async create(tokenData: TokenData, lootData: PickUpStixFlags): Promise<LootToken> {
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

    const token = canvas.tokens.placeables.find(p => p.id === tokenId);

    if (!token) {
      ui.notifications.error(`Could not find or create Token '${tokenId} to create LootToken for`);
      return null;
    }

    const t = new LootToken(tokenId, lootData);
    t.save();
    t.activateListeners();
    return t;
  }

  get itemType(): ItemType {
    return this._lootData.itemType;
  }

  private _config: FormApplication;

  private _sceneId: string;
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
    private _tokenId: string,
    private _lootData?: PickUpStixFlags
  ) {
    this._sceneId = this.token.scene.id;
  }

  private deleteTokenHook = async (scene, token, options, userId) => {
    if (token._id !== this._tokenId) {
      return;
    }

    console.log(`pick-up-stix | LootToken | deleteTokenHook`);
    await this.remove();
  }

  private updateTokenHook = (token, data, userId) => {
    if (token._id !== this._tokenId) {
      return;
    }

    console.log(`pick-up-stix | LootToken | updateTokenHook`);
  }

  private saveLootTokenDataHook = (lootTokenData, sceneId, tokenId, data) => {
    console.log(`pick-up-stix | LootToken | saveLootTokenData hook:`);
    console.log([lootTokenData, sceneId, tokenId, data]);
    this._lootData = data;
  }

  /**
   * Save the token's current loot data to the settings db.
   *
   * Data is first keyed off of the scene ID the tokens belong
   * to and then keyed off of the token IDs within each scene
   * object
   */
  save = async () => {
    console.log(`pick-up-stix | LootToken | save`);
    await saveLootTokenData(this.sceneId, this.tokenId, this._lootData);
  }

  activateListeners() {
    Hooks.off('deleteToken', this.deleteTokenHook);
    Hooks.on('deleteToken', this.deleteTokenHook);

    Hooks.off('updateToken', this.updateTokenHook);
    Hooks.on('updateToken', this.updateTokenHook);

    Hooks.off('pick-up-stix.saveLootTokenData', this.saveLootTokenDataHook);
    Hooks.on('pick-up-stix.saveLootTokenData', this.saveLootTokenDataHook);

    this.token.mouseInteractionManager = this.setupMouseManager();
    this.token.activateListeners = this.setupMouseManager;
  }

  remove = async () => {
    console.log(`pick-up-stix | LootToken | removeToken`);
    Hooks.off('deleteToken', this.deleteTokenHook);
    Hooks.off('updateToken', this.updateTokenHook);
    Hooks.off('pick-up-stix.saveLootTokenData', this.saveLootTokenDataHook);
    deleteLootTokenData(this.sceneId, this.tokenId);
  }

  addItem = async (data: any, id: string): Promise<void> => {
    if (this.itemType !== ItemType.CONTAINER) {
      return;
    }

    console.log('pick-up-stix | LootToken | addItem');

    const existingItem: any = Object.values(this._lootData?.container?.loot?.[data.type] ?? [])?.find(i => (i as any)._id === id);
    if (existingItem) {
      console.log(`pick-up-stix | LootToken | addItem | found existing item for item '${id}`);
      const quantityDataPath = getQuantityDataPath();
      if(!getProperty(existingItem.data, quantityDataPath)) {
        setProperty(existingItem.data, quantityDataPath, 1);
      }
      else {
        setProperty(existingItem.data, quantityDataPath, getProperty(existingItem.data, quantityDataPath) + 1)
      }
    }
    else {
      if (!this._lootData.container.loot) {
        this._lootData.container.loot = {};
      }
      if (!this._lootData.container.loot[data.type]) {
        this._lootData.container.loot[data.type] = [];
      }
      this._lootData.container.loot[data.type].push(duplicate(data));
    }

    if (this._config) {
      await this._config.object.update({
        flags: {
          'pick-up-stix': {
            'pick-up-stix': duplicate(this._lootData)
          }
        }
      })
    }
    await this.save();
  }

  setupMouseManager = (): MouseInteractionManager => {
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
      clickLeft: this.handleClicked,
      clickLeft2: this.handleTokenItemConfig,
      clickRight: this.handleTokenRightClick,
      clickRight2: this.handleTokenItemConfig,
      dragLeftStart: this.token._onDragLeftStart,
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

  private handleClicked = (event) => {
    if (event.currentTarget.data.hidden) {
      console.log(`pick-up-stix | LootToken | handleClicked | token is hidden`);
      // if the loot token is hidden, pass the click on
      // to the token's normal left click method for Foundry
      // to handle
      this.token._onClickLeft(event);
      return;
    }

    // if the item isn't visible can't pick it up
    if (!this.token.isVisible) {
      console.log(`pick-up-stix | LootToken | handleClicked | token is not visible to user`);
      return;
    }

    let controlledTokens: Token[] = getValidControlledTokens(this.token);

    // gm special stuff
    if (game.user.isGM) {
      console.log(`pick-up-stix | LootToken | handleClicked | user is GM`);

      if (!controlledTokens.length) {
        console.log(`pick-up-stix | LootToken | handleClicked | no controlled tokens, handle normal click`);
        this.token._onClickLeft(event);
        return;
      }

      // if only controlling the item itself, handle a normal click
      if (controlledTokens.every(t => this.token === t)) {
        console.log(`pick-up-stix | LootToken | handleClicked | only controlling the item, handle normal click`);
        this.token._onClickLeft(event);
        return;
      }
    }

    // if there are no controlled tokens within reach, show an error
    if (!controlledTokens.length) {
      ui.notifications.error('You must control at least one token that is close enough in order to interact with this token.');
      return;
    }

    // if it's locked then it can't be opened
    if (this._lootData.isLocked) {
      console.log(`pick-up-stix | LootToken | handleClicked | item is locked`);
      var audio = new Audio(CONFIG.sounds.lock);
      audio.play();
      return;
    }

    // checking for double click, the double click handler clears this timeout
    this._clickTimeout = setTimeout(this.finalizeClickLeft, 250, event, controlledTokens);
  }

  private finalizeClickLeft = async (event, controlledTokens) => {
    console.log('pick-up-stix | LootToken | finalizeClickLeft');

    if (this._lootData.itemType === ItemType.CONTAINER) {
      console.log(`pick-up-stix | LootToken | finalizeClickLeft | item is a container`);

      // if it's a container and it's open and can't be closed then don't do anything
      if (this._lootData.container?.isOpen && !(this._lootData.container?.canClose ?? true)) {
        console.log(`pick-up-stix | LootToken | finalizeClickLeft | container is open and can't be closed`);
        return;
      }

      this._lootData.container.isOpen = !this._lootData.container?.isOpen;

      // if there are any container updates then update the container
      await new Promise(resolve => {
        setTimeout(async () => {
          await updateEntity(this.token, {
            img: this._lootData.container?.isOpen ? this._lootData.container.imageOpenPath : this._lootData.container.imageClosePath
          });
          const a = new Audio(
            this._lootData.container.isOpen ?
              this._lootData.container.soundOpenPath:
              this._lootData.container.soundClosePath
          );
          try {
            a.play();
          }
          catch (e) {
            // it's ok to error here
          }

          resolve();
        }, 200);
      });

      if (this._lootData.container?.isOpen) {
        this.openConfigSheet();
      }

      return;
    }

    // onto the section if the item is NOT a container

    console.log(`pick-up-stix | LootToken | finalizeClickLeft | token is an ItemType.ITEM`);

    // if the user controls one token use it, otherwise ask which token to use
    // TODO: calcluate proper valid tokens
    const controlledToken: Token = controlledTokens[0];

    if (!controlledToken) {
      console.log(`pick-up-stix | LootToken | finalizeClickLeft | no token selected from dialog`);
      ui.notifications.error('You must control at least one token that is close enough in order to interact with this token.');
      return;
    }

    // if it's just a single item, delete the map token and create an new item on the player
    itemCollected(controlledToken, { ...this._lootData.itemData });
    await createOwnedItem(controlledToken.actor, [{
      ...this._lootData.itemData
    }]);
    this.token.mouseInteractionManager?._deactivateDragEvents();
    await deleteToken(this.token);
  }

  private handleTokenItemConfig = async () => {
    console.log('pick-up-stix | LootToken | handleTokenItemConfig');
    clearTimeout(this._clickTimeout);
    this.openConfigSheet();
  }

  openConfigSheet = async (): Promise<void> => {
    console.log('pick-up-stix | LootToken | openLootTokenConfig');

    if (this._config) {
      this._config.render(false, { renderData: { tokenId: this.tokenId } });
      return;
    }

    const data = this.itemType === ItemType.CONTAINER
      ?  {
        type: ItemType.CONTAINER,
        name: this.token.name,
        img: this.token.data.img,
        flags: {
          'pick-up-stix': {
            'pick-up-stix': {
              ...duplicate(this._lootData),
              isTemplate: true
            }
          }
        }
      }
      : duplicate(this._lootData.itemData);

    const i = await createEntity(data, { submitOnChange: true });
    this._config = i.sheet.render(true, { renderData: { tokenId: this.tokenId } }) as FormApplication;

    const hook = Hooks.on('updateItem', async (item, data, options) => {
      if (data._id !== i.id) {
        return;
      }
      console.log('pick-up-stix | LootToken | openLootTokenConfig | updateItem hook');
      if (this.itemType === ItemType.CONTAINER) {
        this._lootData = duplicate(mergeObject(this._lootData, data.flags?.['pick-up-stix']?.['pick-up-stix'] ?? {}))
      }
      else {
        this._lootData.itemData = duplicate(item.data);
      }

      await this.save();
    });

    const sheetCloseHandler = async (sheet, html) => {
      if (sheet.appId !== this._config.appId) {
        return;
      }
      console.log('pick-up-stix | LootToken | openLootTokenConfig | closeItemSheet hook');
      await deleteEntity(i.uuid);
      this._config = null;
      Hooks.off('updateItem', hook as any);
      Hooks.off('closeItemSheet', sheetCloseHandler);
      Hooks.off('closeItemConfigApplication', sheetCloseHandler);
    }

    Hooks.once('closeItemConfigApplication', sheetCloseHandler);
    Hooks.once('closeItemSheet', sheetCloseHandler);
  }

  private _clickTimeout;
  private handleTokenRightClick = () => {
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
}
