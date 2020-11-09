import { getQuantityDataPath } from "../../utils";
import {
	createItem,
	createOwnedItem,
	createToken,
	deleteToken,
	getValidControlledTokens,
	itemCollected,
	lootTokenCreated,
	lootTokens,
	updateEntity,
  updateToken
} from "./main";
import { ItemType } from "./models";
import { SettingKeys } from "./settings";

declare function fromUuid(uuid: string): Promise<any>;

/**
 * These are the flags stored on a Token instance.
 */
export interface TokenFlags {
	/**
	 * The UUID of the entity that this token represents.
	 */
	itemUuid?: string;
	isOpen?: boolean;
	isLocked?: boolean;
}

export interface ItemFlags {
	itemType: ItemType;

	tokenData: TokenData;

	container?: ContainerData
}

export interface OwnedItemFlags {
	owner: string;
	originalItemId: string;
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
				permission: {
					default: 2
				},
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

	private _sceneId: string;

	get itemFlags(): Promise<ItemFlags> {
		return new Promise(async (resolve) => {
			const item = await fromUuid(this._itemUuid);
			resolve(item?.data?.flags?.['pick-up-stix']?.['pick-up-stix']);
		});
	}

	get isOpen(): boolean {
		return this.tokenData?.flags?.['pick-up-stix']?.['pick-up-stix']?.isOpen ?? false;
	}

	get soundClosePath(): Promise<string> {
		return new Promise(async resolve => {
			const flags = await this.itemFlags;
			resolve(flags?.container?.soundClosePath);
		});
	}

	get soundOpenPath(): Promise<string> {
		return new Promise(async resolve => {
			const flags = await this.itemFlags;
			resolve(flags?.container?.soundOpenPath)
		});
	}

	get isLocked(): boolean {
		return this.tokenData?.flags?.['pick-up-stix']?.['pick-up-stix']?.isLocked ?? false;
	}

	get itemType(): Promise<ItemType> {
		return new Promise(async resolve => {
			const flags = await this.itemFlags;
			resolve(flags?.itemType)
		});
	}

	get canClose(): Promise<boolean> {
		return new Promise(async (resolve) => {
			const itemFlags = await this.itemFlags;
			resolve(itemFlags?.container?.canClose);
		});
	}

	get item(): Promise<Item> {
		return new Promise(async resolve => {
			const item = await fromUuid(this.itemUuid);
			resolve(item);
		})
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

	toggleLocked = async () => {
		console.log(`pick-up-stix | LootToken | toggleLocked`);
		const locked = this.tokenData?.flags?.['pick-up-stix']?.['pick-up-stix']?.isLocked ?? false;
    await updateToken(this.sceneId, {
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
		console.log('pick-up-stix | LootToken | toggleOpened');
		const itemFlags = await this.itemFlags;

		if (this.isOpen) {
			//TODO: what if loot is already opened
		}

		const open = !this.isOpen

    await updateToken(this.sceneId, {
      _id: this.tokenId,
			img: open ? itemFlags.container.imageOpenPath : itemFlags.container.imageClosePath,
			flags: {
				'pick-up-stix': {
					'pick-up-stix': {
						isOpen: open
					}
				}
			}
		});

		const a = new Audio(open ? itemFlags.container.soundOpenPath : itemFlags.container.soundClosePath);
		try {
			a.play();
		}
		catch (e) {
			// it's ok to error here
			console.error(e)
		}

		if (renderSheet && open) {
			await this.openConfigSheet(tokens);
		}
	}

	addItem = async (itemData: any): Promise<void> => {
		if (await this.itemType !== ItemType.CONTAINER) {
			return;
		}

		console.log('pick-up-stix | LootToken | addItem');

		const itemFlags = duplicate(await this.itemFlags);

		const existingItem: any =
			Object.values(itemFlags?.container?.loot?.[itemData?.type] ?? [])
				?.find(i => (i as any)._id === itemData._id);

		if (existingItem) {
			console.log(`pick-up-stix | LootToken | addItem | found existing item for item '${itemData._id}`);
			const quantityDataPath = getQuantityDataPath();
			if(!getProperty(existingItem.data, quantityDataPath)) {
				setProperty(existingItem.data, quantityDataPath, 1);
			}
			else {
				setProperty(existingItem.data, quantityDataPath, +getProperty(existingItem.data, quantityDataPath) + 1)
			}
		}
		else {
			if (!itemFlags.container.loot) {
				itemFlags.container.loot = {};
			}
			if (!itemFlags.container.loot[itemData.type]) {
				itemFlags.container.loot[itemData.type] = [];
			}
			itemFlags.container.loot[itemData.type].push(itemData);
		}

		await updateEntity(this.itemUuid, {
			flags: {
				'pick-up-stix': {
					'pick-up-stix': itemFlags
				}
			}
		})
	}

	collect = async (token: Token) => {
		const itemType = await this.itemType;

		if (itemType !== ItemType.ITEM) {
			return;
		}

		const item: Item = await this.item;

		await createOwnedItem(token.actor, [{
			...item.data
		}]);
		itemCollected(token, {
			...item.data
		});
		await deleteToken(this.tokenId, this.sceneId);
	}

	openConfigSheet = async (tokens: Token[] = [], options: any = {}): Promise<void> => {
    console.log('pick-up-stix | LootToken | openConfigSheet:');
		console.log([tokens, options]);

		const closeItemConfigApplicationHook = async (app, html) => {
      console.log(`pick-up-stix | LootToken | openConfigSheet | closeItemConfigApplicationHook:`);
			console.log([app, html]);

			if (app.appId !== appId) {
				return;
			}

			Hooks.off('closeItemConfigApplication', closeItemConfigApplicationHook);

			if (this.isOpen) {
				await this.toggleOpened();
			}
		}

		const item = await this.item;

		for (let item of game.items) {
			const i: Item = (item as any) as Item;

      const flags: ItemFlags = i.getFlag('pick-up-stix', 'pick-up-stix');

      if (this.itemUuid === i.uuid || flags === undefined) {
        continue;
      }

			for (let app of Object.values((i as any).apps)) {
				await (app as any).close();
			}
		}

    Hooks.once('closeItemConfigApplication', closeItemConfigApplicationHook);
		const appId = item.sheet.render(!item.sheet.rendered, { renderData: { tokens, sourceToken: this.tokenId } }).appId;
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

		// if it's locked then it can't be opened
		if (this.tokenData?.locked) {
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

		const itemFlags = await this.itemFlags;

		if (itemFlags.itemType === ItemType.ITEM) {
			console.log(`pick-up-stix | LootToken | finalizeClickLeft | token is an ItemType.ITEM`);

			await this.collect(tokens[0]);
			return;
		}

		if (itemFlags.itemType === ItemType.CONTAINER) {
			console.log(`pick-up-stix | LootToken | finalizeClickLeft | item is a container`);

			if (this.isOpen) {
				await this.openConfigSheet(tokens);
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

		this.openConfigSheet();

		// const item = await this.item;
		// item.sheet.render(true);
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
