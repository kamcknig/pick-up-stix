import { error, log } from '../main';
import { getPriceDataPath, getQuantityDataPath, getWeightDataPath } from "./utils";
import {
	getValidControlledTokens,
	lootItem, updateItem,
	updateToken
} from "./mainEntry";
import { ItemType } from "./models";
import { getCanvas, getGame, PICK_UP_STIX_FLAG, PICK_UP_STIX_MODULE_NAME, PICK_UP_STIX_TOKEN_ID_FLAG } from './settings';

/**
 * These are the flags stored on a Token instance.
 */
export interface TokenFlags {
	/**
	 * The Item ID of the entity that this token represents.
	 */
	itemId?: string;
	isOpen?: boolean;
	isLocked?: boolean;
	minPerceiveValue: number;
}

export interface ItemFlags {
	itemType: ItemType;

	tokenData: TokenData;

	container?: ContainerData
}

export interface OwnedItemFlags {
	owner: string;
}

export interface ContainerData {
	canClose?: boolean;
	soundOpenPath: string;
	soundClosePath: string;
	imageClosePath: string;
	imageOpenPath: string;
	loot?: ContainerLoot;
	currency?: any;
	description?: string;
}

/**
 * Each key should be the Item.type and the value will be an Array whose elements are Item.data
 */
export interface ContainerLoot {
	[key: string]: ItemData[];
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
	disposition: number;
	x?: number;
	y?: number;
	id?: string;
	flags?: {
		'pick-up-stix': {
			'pick-up-stix': TokenFlags;
		}
	}
}

export interface ItemData {
	data: any;
	effects: any[];
	flags: {
		'pick-up-stix': {
			'pick-up-stix': ItemFlags
		}
	}
	folder?: string;
	img: string;
	name: string;
	permission: {
		'default': number;
		[userId: string]: number;
	};
	sort: number;
	type: string;
	_id: string;
	[key: string]: any;
}

export class LootToken {
	private _sceneId: string;

	get itemFlags(): ItemFlags {
		return <ItemFlags>this.item.getFlag(PICK_UP_STIX_MODULE_NAME, PICK_UP_STIX_FLAG);
	}

	get isOpen(): boolean {
		return this.tokenData?.flags?.[PICK_UP_STIX_MODULE_NAME]?.[PICK_UP_STIX_FLAG]?.isOpen ?? false;
	}

	get soundClosePath(): string {
		return <string>this.itemFlags?.container?.soundClosePath;
	}

	get soundOpenPath(): string {
		return <string>this.itemFlags?.container?.soundOpenPath;
	}

	get isLocked(): boolean {
		return this.tokenData?.flags?.['pick-up-stix']?.['pick-up-stix']?.isLocked ?? false;
	}

	get itemType(): ItemType {
		return this.itemFlags?.itemType;
	}

	get canClose(): boolean {
		return <boolean>this.itemFlags?.container?.canClose;
	}

	get item(): Item {
		return <Item>getGame().items?.get(this.itemId);
	}

	/**
	 * The Scene ID that the Token this LootToken instance represents belongs to
	 */
	get sceneId(): string {
		return this._sceneId;
	}

	get token(): Token {
		return <Token>getCanvas().tokens?.placeables.find(p => p.id === this.tokenId) ?? null;
	}

	get tokenData(): any {
		return getGame().scenes?.get(this. _sceneId)?.getEmbeddedEntity('Token', this._tokenId);
	}

	/**
	 * The Token ID this LootToken instance represents.
	 */
	get tokenId(): string {
		return this._tokenId;
	}

	get itemId(): string {
		return this._itemId;
	}

	constructor(
		private _tokenId: string,
		private _itemId: string
	) {
		log('pick-up-stix | LootToken | constructor:');
		log([this._tokenId, this._itemId]);
		for (let el of <Scenes>getGame().scenes) {
			const scene = (el as unknown) as Scene;
			const token = scene.getEmbeddedEntity('Token', this._tokenId);
			if (token) {
				this._sceneId = <string>scene.id;
				log(` LootToken | constructor | scene id set to '${this._sceneId}'`);
			}
		}
	}

	public activateListeners = (): void => {
		if (!getCanvas().tokens?.placeables.find(p => p.id === this.tokenData._id)) {
			return;
		}

		log(` LootToken | activateListeners`);

		const token = <Token>this.token;

		this.deactivateListeners();

		Hooks.on('updateToken', this.updateTokenHook);
		//@ts-ignore
		token.activateListeners = this.setupMouseManager;
	}

	public deactivateListeners = (): void => {
		log(` LootToken | deactivateListeners`);
		Hooks.off('updateToken', this.updateTokenHook);

		const token = this.token;
		(token?.mouseInteractionManager as any)?._deactivateDragEvents();
	}

	private updateTokenHook = async (scene, tokenData, data, options, userId) => {
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
	}

	public drawLock = async () => {
		log(` LootToken | drawLockIcon`);

		if (!getGame().user?.isGM) {
			log(` LootToken | drawLockIcon | user is not GM, not drawing lock`);
			return;
		}

		const token = this.token;
		const lock = token?.getChildByName('pick-up-stix-lock');
		if (lock) {
			log(` LootToken | drawLock | found previous lock icon, removing it`)
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

	toggleLocked = async () => {
		log(` LootToken | toggleLocked`);
		const locked = this.tokenData?.flags?.['pick-up-stix']?.['pick-up-stix']?.isLocked ?? false;
    updateToken(this.sceneId, {
      _id: this.tokenId,
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
		log('pick-up-stix | LootToken | toggleOpened');
		const itemFlags = this.itemFlags;

		const open = !this.isOpen

    updateToken(this.sceneId, {
      _id: this.tokenId,
			img: open ? itemFlags.container?.imageOpenPath : itemFlags.container?.imageClosePath,
			flags: {
				'pick-up-stix': {
					'pick-up-stix': {
						isOpen: open
					}
				}
			}
		});

		const audioPath = (open && itemFlags.container?.soundOpenPath) ?? (!open && itemFlags.container?.soundClosePath);

		if (audioPath) {
			const a = new Audio(audioPath);
			try {
				a.play();
			}
			catch (e) {
				// it's ok to error here
				error(e)
			}
		}
		if (renderSheet && open) {
			this.openConfigSheet(tokens);
		}
	}

	addItem = async (itemData: any): Promise<void> => {
		if (this.itemType !== ItemType.CONTAINER) {
			return;
		}

		log('pick-up-stix | LootToken | addItem');

		const itemFlags = duplicate(this.itemFlags);

		const existingItem = Object.values(itemFlags?.container?.loot?.[itemData?.type] ?? [])
			?.find(i =>
				i.name?.toLowerCase() === itemData.name?.toLowerCase()
				&& i.img === itemData.img
				&& i.data?.description?.value?.toLowerCase() === itemData.data?.description?.value?.toLowerCase()
				&& getProperty(i.data, getPriceDataPath()) === getProperty(itemData.data, getPriceDataPath())
				&& getProperty(i.data, getWeightDataPath()) === getProperty(itemData.data, getWeightDataPath())
			);

		if (existingItem) {
			log(` LootToken | addItem | found existing item for item '${itemData._id}`);
			const quantityDataPath = getQuantityDataPath();
			if(!getProperty(existingItem.data, quantityDataPath)) {
				setProperty(existingItem.data, quantityDataPath, 1);
			}
			else {
				setProperty(existingItem.data, quantityDataPath, +getProperty(existingItem.data, quantityDataPath) + 1)
			}
		}
		else {
			if (!itemFlags.container?.loot) {
				//@ts-ignore
				itemFlags.container?.loot = {};
			}
			if (!itemFlags.container?.loot[itemData.type]) {
				//@ts-ignore
				itemFlags.container?.loot[itemData.type] = [];
			}
			itemFlags.container?.loot[itemData.type].push(itemData);
		}

		updateItem(this.itemId, {
			flags: {
				'pick-up-stix': {
					'pick-up-stix': itemFlags
				}
			}
		})
	}

	collect = async (token: Token) => {
		if (this.itemType !== ItemType.ITEM) {
			return;
		}
		//@ts-ignore
		lootItem({ looterTokenId: token.id, itemData: this.item.data, lootTokenTokenId: this.tokenId, takeAll: true });
	}

	openConfigSheet = async (tokens: Token[] = [], options: any = {}): Promise<void> => {
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
		}

		for (let item of <Items>getGame().items) {
			const i: Item = (item as any) as Item;

      const flags: ItemFlags = <ItemFlags>i.getFlag(PICK_UP_STIX_MODULE_NAME, PICK_UP_STIX_FLAG);

      if (this.itemId === i.id || flags === undefined) {
        continue;
      }

			for (let app of Object.values((i as any).apps)) {
				(app as any).close();
			}
		}

		Hooks.once('closeContainerConfigApplication', closeContainerConfigApplicationHook);
		const item = <Item>this.item;
		const appId = <string>(<any>item.sheet?.render(!item.sheet?.rendered, { renderData: { tokens, sourceToken: <string>this.tokenId } })).appId;
	}



	/**************************
	 * MOUSE HANDLER METHODS
	 **************************/

	private setupMouseManager = (): MouseInteractionManager<PIXI.Container>|null => {
		log(` setupMouseManager`);

		const token =<Token>this.token;

		if (!token) {
			throw new Error('Can\'t create MouseInteractionManager without a Token');
		}

		const permissions:MouseInteractionManager['permissions'] = {
			clickLeft: () => true,
			clickLeft2: () => <boolean>getGame().user?.isGM,
			clickRight: () => <boolean>getGame().user?.isGM,
			clickRight2: () => <boolean>getGame().user?.isGM,
			dragLeftStart: () => <boolean>getGame().user?.isGM,
			hoverIn: () => true,
			hoverOut: () => true
		};

		// Define callback functions for each workflow step
		const callbacks = {
			clickLeft: this.handleClickLeft,
			clickLeft2: this.handleClickLeft2,
			clickRight: this.handleClickRight,
			clickRight2: this.handleClickRight2,
			//@ts-ignore
			dragLeftStart: (e) => { clearTimeout(this._clickTimeout); token._onDragLeftStart(e); },
			//@ts-ignore
			dragLeftMove: token._onDragLeftMove,
			//@ts-ignore
			dragLeftDrop: token._onDragLeftDrop,
			//@ts-ignore
			dragLeftCancel: token._onDragLeftCancel,
			//@ts-ignore
			hoverIn: () => token._onHoverIn,
			//@ts-ignore
			hoverOut: () => token._onHoverOut
		};

		// Define options
		const options = {
			target: token.controlIcon ? "controlIcon" : null
		};

		// Create the interaction manager
		if (token) {
			return new MouseInteractionManager(token, <PIXI.Container>getCanvas().stage, permissions, callbacks, options).activate();
		}else{
			return null;
		}
	}

	private handleClickLeft = (event) => {
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
	}

	private finalizeClickLeft = async (event, allControlled: Token[], tokens: Token[]) => {
		log(' LootToken | finalizeClickLeft');
		log([event, allControlled, tokens]);

		const token = this.token;

		// if it's locked then it can't be opened
		if (this.isLocked) {
			log(` LootToken | finalizeClickLeft | item is locked`);
			var audio = new Audio(CONFIG.sounds.lock);
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

		for (let t of allControlled) {
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
	}

	private _clickTimeout;
	private handleClickRight = () => {
		log(` LootToken | handleClickRight`);;
		clearTimeout(this._clickTimeout);

		getCanvas().tokens?.hud.clear();

		const token = this.token;
		//@ts-ignore
		const hud = getCanvas().hud?.pickUpStixLootHud;
		if (hud) {
			token?.control({releaseOthers: true});
			if (hud.object === token) {
				hud.clear();
			}
			else hud.bind(token);
		}
	}

	private handleClickLeft2 = async (event) => {
		log(' LootToken | handleClickLeft2');
		clearTimeout(this._clickTimeout);

		this.openConfigSheet();
	}

	private handleClickRight2 = async (event) => {
		log(' LootToken | handleClickRight2');
		clearTimeout(this._clickTimeout);
		let i = getGame().items?.contents.find(item => {
			return item.getFlag(PICK_UP_STIX_MODULE_NAME, PICK_UP_STIX_TOKEN_ID_FLAG) === this.tokenId;
		});

		if (i) {
			ui.notifications?.error(`Another character is interacting with this item. Please wait your turn or ask them to close their loot sheet.`);
			return;
		}
		this.openConfigSheet([], { configureOnly: true });
	}
}
