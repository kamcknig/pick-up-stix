import { deleteToken, getQuantityDataPath } from "../../utils";
import {
  createEntity,
  createOwnedItem,
  createToken,
  deleteEntity,
  getValidControlledTokens,
  itemCollected,
  saveLootTokenData,
  updateEntity
} from "./main";
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
    t.activateListeners();
    await t.save();
    return t;
  }

  private _itemId: string;
  private _config: FormApplication;
  private _sceneId: string;

  get isOpen(): boolean {
    return !!this._lootData?.container?.isOpen;
  }

  get soundClosePath(): string {
    return this._lootData?.container?.soundClosePath;
  }

  get soundOpenPath(): string {
    return this._lootData?.container?.soundOpenPath;
  }

  get isLocked(): boolean {
    return !!this._lootData?.isLocked;
  }

  get itemType(): ItemType {
    return this._lootData.itemType;
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
    private _tokenId: string,
    private _lootData?: PickUpStixFlags
  ) {
    console.log('pick-up-stix | LootToken | constructor:');
    console.log([this._tokenId, this._lootData]);
    this._sceneId = this.token.scene.id;
  }

  private deleteTokenHook = async (scene, tokenData, options, userId) => {
    if (scene.id !== this.sceneId || tokenData._id !== this.tokenId) {
      return;
    }

    console.log('pick-up-stix | LootToken | deleteTokenHook');
    console.log([scene, tokenData, options, userId]);

    this.deactivateListeners();
  }

  private updateItemHook =  async (item, data, options, userId) => {
    if (item.id !== this._itemId) {
      return;
    }

    console.log(`pick-up-stix | LootToken | updateItemHook:`);
    console.log([item, data, options, userId]);

    if (this.itemType === ItemType.CONTAINER) {
      this._lootData = duplicate(mergeObject(this._lootData, data.flags?.['pick-up-stix']?.['pick-up-stix'] ?? {}))
    }
    else {
      this._lootData.itemData = duplicate(item.data);
    }

    await this.save();
  }

  private saveLootTokenDataHook = (sceneId, tokenId, data) => {
    if (sceneId !== this.sceneId || this.tokenId !== tokenId) {
      return;
    }

    console.log(`pick-up-stix | LootToken | saveLootTokenData hook:`);
    console.log([sceneId, tokenId, data]);

    this._lootData = data;

    if (this._lootData.isLocked) {
      this.drawLock();
    }
    else {
      const lock = this.token?.getChildByName('pick-up-stix-lock');
      if (lock) {
        this.token.removeChild(lock);
        lock.destroy();
      }
    }
  }

  private async drawLock() {
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
  save = async () => {
    console.log(`pick-up-stix | LootToken | save`);
    await saveLootTokenData(this.sceneId, this.tokenId, this._lootData);
  }

  activateListeners() {
    Hooks.off('updateItem', this.updateItemHook);
    Hooks.on('updateItem', this.updateItemHook);

    Hooks.off('pick-up-stix.saveLootTokenData', this.saveLootTokenDataHook);
    Hooks.on('pick-up-stix.saveLootTokenData', this.saveLootTokenDataHook);

    Hooks.off('deleteToken', this.deleteTokenHook);
    Hooks.on('deleteToken', this.deleteTokenHook);

    this.token.mouseInteractionManager = this.setupMouseManager();
    this.token.activateListeners = this.setupMouseManager;
  }

  private deactivateListeners(): void {
    Hooks.off('pick-up-stix.saveLootTokenData', this.saveLootTokenDataHook);
    Hooks.off('deleteToken', this.deleteTokenHook);
    Hooks.off('updateItem', this.updateItemHook);

    if (this.token) {
      this.token.mouseInteractionManager?._deactivateDragEvents();
    }
  }

  remove = async () => {
    console.log(`pick-up-stix | LootToken | remove`);
    this.token.mouseInteractionManager?._deactivateDragEvents();
    await deleteToken(this.token);
  }

  toggleLocked = async () => {
    console.log(`pick-up-stix | LootToken | toggleLocked`);
    this._lootData.isLocked  = !this._lootData.isLocked;
    this.save();
  }

  toggleOpened = async (tokens: Token[]=[], renderSheet: boolean=true) => {
    console.log('pick-up-stix | LootToken | toggleOpened');
    this._lootData.container.isOpen = !this._lootData.container.isOpen;

    // if there are any container updates then update the container
    await new Promise(resolve => {
      setTimeout(async () => {
        await updateEntity(this.token, {
          img: this._lootData.container?.isOpen ? this._lootData.container.imageOpenPath : this._lootData.container.imageClosePath
        });
        const a = new Audio(this.isOpen ? this.soundOpenPath : this.soundClosePath);
        try {
          a.play();
        }
        catch (e) {
          // it's ok to error here
        }

        resolve();
      }, 200);
    });

    if (renderSheet && this._lootData.container?.isOpen) {
      this.openConfigSheet(tokens);
    }

    this.save();
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
        setProperty(existingItem.data, quantityDataPath, +getProperty(existingItem.data, quantityDataPath) + 1)
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

  collect = async (token) => {
    if (this._lootData.itemType !== ItemType.ITEM) {
      return;
    }

    const data = duplicate(this._lootData.itemData);

    console.log(`pick-up-stix | LootItem | collect | token ${token.id} is picking up token ${this.tokenId} on scene ${this.sceneId}`);
    await createOwnedItem(token.actor, [data]);
    itemCollected(token, data);
    await this.remove();
  }

  private handleClickLeft2 = (event) => {
    console.log('pick-up-stix | LootToken | handleClickLeft2');
    clearTimeout(this._clickTimeout);
    this.openConfigSheet();
  }

  private handleClickRight2 = (event) => {
    console.log('pick-up-stix | LootToken | handleClickRight2');
    clearTimeout(this._clickTimeout);
    this.openConfigSheet();
  }

  openConfigSheet = async (tokens: Token[]=[]): Promise<void> => {
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
    this._itemId = i.id;
    this._config = i.sheet.render(true, { renderData: { lootTokenId: this.tokenId, tokens } }) as FormApplication;

    const sheetCloseHandler = async (sheet, html) => {
      if (sheet.appId !== this._config.appId) {
        return;
      }
      console.log('pick-up-stix | LootToken | openLootTokenConfig | closeItemSheet hook');
      await deleteEntity(i.uuid);
      this._config = null;
      Hooks.off('closeItemSheet', sheetCloseHandler);
      Hooks.off('closeItemConfigApplication', sheetCloseHandler);
    }

    Hooks.once('closeItemConfigApplication', sheetCloseHandler);
    Hooks.once('closeItemSheet', sheetCloseHandler);
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

    /* let controlledTokens: Token[] = getValidControlledTokens(this.token);
    console.log('pick-up-stix | LootToken | handleClickLeft | controlled tokens:');
    console.log([controlledTokens]); */

    // gm special stuff
    if (game.user.isGM) {
      /* console.log(`pick-up-stix | LootToken | handleClickLeft | user is GM`); */

      /* if (!controlledTokens.length) {
        console.log(`pick-up-stix | LootToken | handleClickLeft | no controlled tokens, handle normal click`);
        this.token._onClickLeft(event);
        return;
      } */

      // if only controlling the item itself, handle a normal click
      /* if (controlledTokens.every(t => this.token === t)) {
        console.log(`pick-up-stix | LootToken | handleClickLeft | only controlling the item, handle normal click`);
        this.token._onClickLeft(event);
        return;
      } */
    }

    // if there are no controlled tokens within reach, show an error
    /* if (!controlledTokens.length) {
      ui.notifications.error('You must control at least one token that is close enough in order to interact with this token.');
      return;
    } */

    const allControlled = canvas.tokens.controlled;
    const tokens = getValidControlledTokens(this.token);

    // checking for double click, the double click handler clears this timeout
    this._clickTimeout = setTimeout(this.finalizeClickLeft, 250, event, allControlled, tokens);

    this.token._onClickLeft(event);
  }

  private finalizeClickLeft = async (event, allControlled, tokens) => {
    console.log('pick-up-stix | LootToken | finalizeClickLeft');

    for (let t of allControlled) {
      t.control({releaseOthers: false});
    }

    // if it's locked then it can't be opened
    if (this._lootData.isLocked) {
      console.log(`pick-up-stix | LootToken | finalizeClickLeft | item is locked`);
      var audio = new Audio(CONFIG.sounds.lock);
      audio.play();
      return;
    }

    if (!tokens.length) {
      ui.notifications.error(`Please ensure you have at least one token controlled that is close enough to the loot token.`);
      return;
    }

    if (this._lootData.itemType === ItemType.ITEM) {
      console.log(`pick-up-stix | LootToken | finalizeClickLeft | token is an ItemType.ITEM`);

      // TODO: add token selection
      await this.collect(tokens[0]);
    }

    if (this._lootData.itemType === ItemType.CONTAINER) {
      console.log(`pick-up-stix | LootToken | finalizeClickLeft | item is a container`);

      // if it's a container and it's open and can't be closed then don't do anything
      if (this._lootData.container?.isOpen && !(this._lootData.container?.canClose ?? true)) {
        console.log(`pick-up-stix | LootToken | finalizeClickLeft | container is open and can't be closed`);
        return;
      }

      await this.toggleOpened(tokens);
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
}
