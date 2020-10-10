import { deleteToken, dist } from "../../utils";
import ChooseTokenApplication from "./choose-token-application";
import { createOwnedItem, createToken, getLootTokenData, itemCollected, saveLootTokenData, updateEntity } from "./main";
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
  static async create(tokenData: TokenData, lootData): Promise<LootToken> {
    let tokenId: string;

    if (tokenData.id === undefined) {
      console.log('pick-up-stix | LootToken | create | creating new Token instance');
      tokenId = await createToken({
        ...tokenData
      });
    }
    else {
      console.log(`pick-up-stix | LootToken | create | token ID '${tokenId} provided, looking for pre-existing Token instance'`);
      tokenId = tokenData.id;
    }

    const token = canvas.tokens.placeables.find(p => p.id === tokenId);

    if (!token) {
      ui.notifications.error(`Could not find or create Token '${tokenId} to create LootToken for`);
      return null;
    }

    const t = new LootToken(tokenId, lootData);
    return t;
  }

  private _sceneId: string;
  get sceneId(): string {
    return this._sceneId;
  }

  get token(): any {
    return canvas.tokens.placeables.find(p => p.id === this._tokenId);
  }

  get tokenId(): string {
    return this._tokenId;
  }

  constructor(
    private _tokenId: string,
    private _lootData?: PickUpStixFlags
  ) {
    this._sceneId = this.token.scene.id;
    this.save();
    this.activateListeners();
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

  /**
   * Save the token's current loot data to the settings db.
   *
   * Data is first keyed off of the scene ID the tokens belong
   * to and then keyed off of the token IDs within each scene
   * object
   */
  save = async () => {
    console.log(`pick-up-stix | LootToken | save`);
    const lootTokenData = getLootTokenData();
    if (!lootTokenData[this.sceneId]) {
      console.log(`pick-up-stix | LootToken | save | no data found for scene '${this.sceneId}', create empty scene data`);
      lootTokenData[this.sceneId] = {};
    }
    const lootData = lootTokenData[this.sceneId][this._tokenId];
    if (isObjectEmpty(diffObject(lootData ?? {}, this._lootData))) {
      console.log('pick-up-stix | LootToken | save | identical token data from in scene, not saving');
      return;
    }
    lootTokenData[this.sceneId][this._tokenId] = { ...this._lootData };
    saveLootTokenData();
  }

  activateListeners() {
    Hooks.off('deleteToken', this.deleteTokenHook);
    Hooks.on('deleteToken', this.deleteTokenHook);

    Hooks.off('updateToken', this.updateTokenHook);
    Hooks.on('updateToken', this.updateTokenHook);

    this.token.mouseInteractionManager = this.setupMouseManager();
    this.token.activateListeners = this.setupMouseManager;
  }

  remove = async () => {
    console.log(`pick-up-stix | LootToken | removeToken`);
    Hooks.off('deleteToken', this.deleteTokenHook);
    Hooks.off('updateToken', this.updateTokenHook);
    const lootTokenData = getLootTokenData();
    delete lootTokenData[this.sceneId]?.[this._tokenId];
    saveLootTokenData();
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

    let controlledTokens: Token[] = [ ...canvas.tokens.controlled ];

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

    // get only the tokens that are within the right distance
    const maxDist = Math.hypot(canvas.grid.size, canvas.grid.size);
    controlledTokens = controlledTokens.filter(t => {
      const d = dist(t, this.token);
      return d < (maxDist + 20) && !getLootTokenData()[this.sceneId][t.id];
    });

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

    // if the user controls one token use it, otherwise ask which token to use
    const controlledToken: Token = controlledTokens.length === 1
      ? controlledTokens[0]
      : await new Promise(resolve => {
          const d = new ChooseTokenApplication(controlledTokens).render(true);
          Hooks.once('closeChooseTokenApplication', () => {
            resolve(d.getData().selectedToken);
          });
        });

    if (!controlledToken) {
      console.log(`pick-up-stix | LootToken | finalizeClickLeft | no token selected from dialog`);
      ui.notifications.error('You must control at least one token that is close enough in order to interact with this token.');
      return;
    }

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
            img: this._lootData.container?.isOpen ? this._lootData.container.imageOpenPath : this._lootData.container.imageClosePath,
            flags: {
              'pick-up-stix': {
                'pick-up-stix': {
                  ...this._lootData
                }
              }
            }
          });
          const a = new Audio(
            this._lootData.container.isOpen ?
              this.token.getFlag('pick-up-stix', 'pick-up-stix.container.soundOpenPath') :
              this.token.getFlag('pick-up-stix', 'pick-up-stix.container.soundClosePath')
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

      if (!this._lootData.container?.isOpen) {
        return;
      }

      // handleTokenItemConfig.bind(this)(event, controlledToken);
      return;
    }

    // onto the section if the item is NOT a container

    console.log(`pick-up-stix | LootToken | finalizeClickLeft | token is an ItemType.ITEM`);

    // if it's just a single item, delete the map token and create an new item on the player
    itemCollected(controlledToken, { ...this._lootData.itemData });
    await createOwnedItem(controlledToken.actor, [{
      ...this._lootData.itemData
    }]);
    this.token.mouseInteractionManager?._deactivateDragEvents();
    await deleteToken(this.token);
  }

  private handleTokenItemConfig = () => {

  }

  private _clickTimeout;
  private handleTokenRightClick = () => {
    clearTimeout(this._clickTimeout);

  }
}
