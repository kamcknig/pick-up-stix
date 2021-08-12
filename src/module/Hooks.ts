//@ts-ignore
import * as Module from "module";
//@ts-ignore
import { DND5E } from "../../../systems/dnd5e/module/config.js";
import { error, log, warn } from "../pick-up-stix-main.js";
import ContainerConfigApplication from "./container-config.js";
import { canvasReadyHook } from "./hooks/canvas-ready-hook.js";
import { createActorHook } from "./hooks/create-actor-hook.js";
import { createItemHook } from "./hooks/create-item-hook.js";
import { deleteItemHook } from "./hooks/delete-item-hook.js";
import { deleteTokenHook } from "./hooks/delete-token-hook.js";
import { lootTokenCreatedHook } from "./hooks/loot-token-created-hook.js";
import { preCreateItemHook } from "./hooks/pre-create-item-hook.js";
import { preUpdateItemHook } from "./hooks/pre-update-item-hook.js";
import { preUpdateTokenHook } from "./hooks/pre-update-token-hook.js";
import { renderItemDirectoryHook } from "./hooks/render-item-directory-hook.js";
import { onRenderLootHud } from "./hooks/render-loot-hud-hook.js";
import { updateItemHook } from "./hooks/update-item-hook.js";
import { LootHud } from "./loot-hud-application.js";
import { TokenFlags } from "./loot-token.js";
import { addItemToContainer, createItem, createLootToken, createOwnedItem, createToken, deleteItem, deleteOwnedItem, deleteToken, dropItemOnToken, getLootToken, lootCurrency, lootItem, updateActor, updateItem, updateOwnedItem, updateToken } from "./mainEntry.js";
import { ItemType, PickUpStixHooks, SocketMessage, SocketMessageType } from "./models.js";
import { preloadTemplates } from "./preloadTemplates.js";
import { getCanvas, getGame, PICK_UP_STIX_FLAG, PICK_UP_STIX_MODULE_NAME, PICK_UP_STIX_SOCKET, registerSettings, SettingKeys } from "./settings.js";
import { amIFirstGm, canSeeLootToken, versionDiff } from "./utils.js";

export let readyHooks = async () => {

	log('pick-up-stix | ready once hook');

	if (getGame().system.id === 'dnd5e') {
		Hooks.on('renderItemSheet5e', (app, protoHtml, data) => {
		log(` renderItemSheet5e`);
		log([app, protoHtml, data]);

		const item: Item = app.object;

		// can't edit the size of owned items
		if (item.actor) return;

		let html = protoHtml;

		if (html[0].localName !== "div") {
			html = $(html[0].parentElement.parentElement);
		}
		const flagValue = (<any>item.getFlag(PICK_UP_STIX_MODULE_NAME,PICK_UP_STIX_FLAG))?.tokenData;
		const widthValue = flagValue?.width ?? 1; // ${item.data.flags?.['pick-up-stix']?.['pick-up-stix']?.tokenData?.width ?? 1}
		const heightValue = flagValue?.height ?? 1; // ${item.data.flags?.['pick-up-stix']?.['pick-up-stix']?.tokenData?.height ?? 1}
		const content = `
		<div class="form-group">
			<label>Width</label>
			<input type="text" name="flags.pick-up-stix.pick-up-stix.tokenData.width" value="${widthValue}" data-dtype="Number">
		</div>

		<div class="form-group">
			<label>Height</label>
			<input type="text" name="flags.pick-up-stix.pick-up-stix.tokenData.height" value="${heightValue}" data-dtype="Number">
		</div>
		`
		$(html)
			.find('div.item-properties div.form-group')
			.last()
			.after(content);
		});
	}
	if (getGame().user?.isGM) {
		//@ts-ignore
		getGame().modules?.get(PICK_UP_STIX_MODULE_NAME).apis = {};
		//@ts-ignore
		getGame().modules?.get(PICK_UP_STIX_MODULE_NAME).apis.v = 1;
		//@ts-ignore
		getGame().modules?.get(PICK_UP_STIX_MODULE_NAME).apis.makeContainer = makeContainerApi;
	}

	// this adds the 'container' type to the game system's entity types.
	getGame().system.entityTypes.Item.push(ItemType.CONTAINER);

	// add the default sheet to the container Item type
	CONFIG.Item.sheetClasses[ItemType.CONTAINER] = {
		'pick-up-stix.ContainerConfigApplication': {
			label: 'pick-up-stix.ContainerConfigApplication',
			cls: ContainerConfigApplication,
			default: true,
			id: 'pick-up-stix.ContainerConfigApplication'
		}
	};

	if (amIFirstGm()) {
		await createDefaultFolders();
	}
	let scenes = getGame().scenes || [];
	for (let el of scenes) { // Scene.collection
		let scene = (el as unknown) as Scene;
		let tokens = scene.getEmbeddedCollection('Token');
		for (let token of tokens) {
			//const tokenFlags: TokenFlags = getProperty(token, 'flags.pick-up-stix.pick-up-stix');
			const tokenFlags: TokenFlags = token.getFlag(PICK_UP_STIX_MODULE_NAME, PICK_UP_STIX_FLAG);
			if (!tokenFlags) {
				continue;
			}

			let lootToken = getLootToken({ itemId: tokenFlags?.itemId, tokenId: <string>token.id })?.[0];

			if (tokenFlags?.itemId && !lootToken) {
				log(` readyHook | Creating new LootToken for Token '${token.id}' and Item '${tokenFlags.itemId}'`);
				lootToken = await createLootToken(<string>token.id, tokenFlags.itemId, false);
			}
		}

		scene = <Scene>getGame().scenes?.active;
		tokens = scene.getEmbeddedCollection('Token');
		for (let token of tokens) {
			const tokenFlags: TokenFlags = getProperty(token, 'flags.pick-up-stix.pick-up-stix');
			if (!tokenFlags) {
				continue;
			}

			let lootTokens = getLootToken({ itemId: tokenFlags?.itemId, tokenId: <string>token.id });
			for(let lt of lootTokens) {
				if (tokenFlags.isLocked) {
					lt.drawLock();
				}
				lt.activateListeners();
			}
		}
	}
	const items = <IterableIterator<Item>>getGame().items?.values();
	for (let item of items) {
		//if (getProperty(item, 'data.flags.pick-up-stix.pick-up-stix.itemType') === ItemType.CONTAINER) {
		if ((<any>item.getFlag(PICK_UP_STIX_MODULE_NAME,PICK_UP_STIX_FLAG)).itemType === ItemType.CONTAINER) {
			item.data.type = ItemType.CONTAINER;
		}
	}

	const activeVersion = <string>getGame().modules?.get(PICK_UP_STIX_MODULE_NAME)?.data.version;
	const previousVersion = <string>getGame().settings.get(PICK_UP_STIX_MODULE_NAME, SettingKeys.version);

	if (amIFirstGm() && activeVersion !== previousVersion) {
		await getGame().settings.set('pick-up-stix', SettingKeys.version, activeVersion);
	}

	const diff = versionDiff(activeVersion, previousVersion);
	if (diff < 0) {
		log(` readyHook | current version ${activeVersion} is lower than previous version ${previousVersion}`);
	}
	else if (diff > 0) {
		log(` readyHook | current version ${activeVersion} is greater than previous version ${previousVersion}`);
	}
	else {
		log(` readyHook | current version ${activeVersion} the same as the previous version ${previousVersion}`);
	}

	const el = document.createElement('div');
	el.innerHTML = `<p>I have made some improvements that should hopefully speed up the module but want to point out a few changes</p>
	<p>First off you'll notice new Item folders have been created. A parent folder named <strong>Pick-Up-Stix</strong>
	and two folders within there named <strong>Items</strong>, and <strong>Tokens</strong>. Once these folders have been created, you
	are free to move them around however, if you delete them as of now there is no way to recover any previous contents,
	though the folder should be recreated on the next startup. These folders can not be seen by players that are not GMs.</p>
	<p>The <strong>Tokens</strong> folder contains Items that represent any loot token instances that are in a scene. If you edit one of them
	from the Items directory, then you will edit all loot token instances attached to it. If you want to create another instance,
	simply drag one of the Items from the <strong>Tokens</strong> Item folder and you'll have a copy of that Item that will
	update when it updates. If you delete an Item from the <strong>Tokens</strong> folder, then all loot token instances will
	be removed from all scenes. If you delete all loot token instances from all scenes, the Item associated with it in the
	<strong>Tokens</strong> folder will also be deleted</p>
	<p>The <strong>Items</strong> folder is a template folder. When you create an Item and choose the 'container' type, you'll get
	an Item created in the <strong>Items</strong> folder. If you drag one of these onto the canvas, you'll create a new loot token
	based on the properties of that Item, but you'll notice that a new Item is created in the <strong>Tokens</strong> folder. You can
	updated this new loot token by either updating it's new corresponding Item or through the token's config menu. You can
	also update that token and then drag a copy of it from the <strong>Tokens</strong> folder NOT the <strong>Items</strong> folder to
	create a new loot token with the udpated properties. Items in the <strong>Items</strong> folder are not deleted when any
	loot tokens created from them are deleted, nor are any loot tokens deleted when any Items in the <strong>Items</strong> directory
	are removed. Currently, only container-type Items are treated as templates since item-type Items are already their own templates.</p>`;

	if (amIFirstGm() && !getGame().settings.get('pick-up-stix', SettingKeys.version13updatemessage)) {
	new Dialog({
	title: 'Pick-Up-Stix - Update notification',
	buttons: {
		'OK': {
		label: 'OK'
		}
	},
	default: 'OK',
	content: el.innerHTML
	}, {
		width: 750,
	height: 'auto'
	}).render(true);
	await getGame().settings.set(PICK_UP_STIX_MODULE_NAME, SettingKeys.version13updatemessage, true);
	}

	getGame().socket?.on(PICK_UP_STIX_SOCKET, handleSocketMessage);

	Hooks.once('canvasReady', () => {
		//@ts-ignore
		getCanvas().hud?.pickUpStixLootHud = new LootHud();
	});
	Hooks.on('canvasReady', canvasReadyHook);
	//Hooks.on('ready', readyHook);

	// item hooks
	Hooks.on('preCreateItem', preCreateItemHook);
	Hooks.on('createItem', createItemHook);
	Hooks.on('preUpdateItem', preUpdateItemHook);
	Hooks.on('updateItem', updateItemHook);
	Hooks.on('deleteItem', deleteItemHook);

	// directory hooks
	Hooks.on('renderItemDirectory', renderItemDirectoryHook);

	// actor hooks
	Hooks.on('createActor', createActorHook);

	// token hooks
	Hooks.on('deleteToken', deleteTokenHook);
	Hooks.on('preUpdateToken', preUpdateTokenHook);


	// render hooks
	// Hooks.on("renderSettingsConfig", (app, html, user) => {
	// 	processHtml(html);
	// });
	Hooks.on('renderLootHud', onRenderLootHud);

	Hooks.on(PickUpStixHooks.lootTokenCreated, lootTokenCreatedHook);	
}

export const setupHooks = async () => {

  	// setup all the hooks
	// game startup hooks
	
	
}

export const initHooks = async () => {
  	warn("Init Hooks processing");
  	log('initHook');

	//Hooks.once('init', initHook);

	// CONFIG.debug.hooks = true;
	// CONFIG.debug['pickUpStix'] = true;

	// Assign custom classes and constants here

	// Register custom module settings
	registerSettings();

	// Preload Handlebars templates
	await preloadTemplates();

	// Token.prototype.release = Token_tokenRelease(Token.prototype.release);

	//@ts-ignore
	libWrapper.register(PICK_UP_STIX_MODULE_NAME,"Token.prototype.release", TokenPrototypeReleaseHandler, "MIXED");
	//@ts-ignore
	libWrapper.register(PICK_UP_STIX_MODULE_NAME,"Token.prototype.isVisible", TokenPrototypeIsVisibleHandler, "MIXED");

	// if (getGame().system.id === 'dnd5e') {
	// 	info(`pick-up-stix | initHook | System is '${getGame().system.id}' enabling Token.isVisible override.`);

	// 	Object.defineProperty(Token.prototype, 'isVisible', {
	// 		get: Token_isVisible,
	// 		enumerable: true,
	// 		configurable: true
	// 	});
	// }
	
}


export const TokenPrototypeReleaseHandler = function (wrapped, ...args) {
	const [ options ] = args;
	log(` tokenRelease | called with args`);
	log(options);
	//origFn.call(this, options);
	//@ts-ignore
	if (getCanvas().hud?.pickUpStixLootHud?.object === this) {
		//@ts-ignore
		getCanvas().hud?.pickUpStixLootHud.clear();
	}
	return wrapped(...args);	
}

export const TokenPrototypeIsVisibleHandler = function (wrapped, ...args) {
	log(` Token_isVisible | called with args`);
	warn(` Token_isVisible | This method overrides isVisible of Token`);
	let actualIsVisible: boolean;
	if ( this.data.hidden ) {
		const tokenFlags: TokenFlags = this.getFlag(PICK_UP_STIX_MODULE_NAME, PICK_UP_STIX_FLAG);
		actualIsVisible = getGame().user?.isGM || (tokenFlags && canSeeLootToken(this))
	}
	else if (!getCanvas().sight?.tokenVision) {
		actualIsVisible = true;
	}
	else if ( this._controlled ) {
		actualIsVisible = true;
	}
	else {
		const tolerance = Math.min(this.w, this.h) / 4;
		actualIsVisible = <boolean>getCanvas().sight?.testVisibility(this.center, {tolerance});
	}
	return wrapped(...args);
}

const createDefaultFolders = async () => {
	log(` createDefaultFolders`);

	// check if the parent folder exists and create it if not
	let parentFolderId = <string>getGame().settings.get(PICK_UP_STIX_MODULE_NAME, SettingKeys.parentItemFolderId);
	let folder = <Folder>getGame().folders?.get(parentFolderId);
	//let folder = Folder.collection.get(parentFolderId);

	if (!folder) {
		log(` createDefaultFolders | couldn't parent folder creating it now`);
		folder = <Folder>await Folder.create({
			color: '',
			name: 'Pick-Up-Stix',
			sorting: 'a',
			parent: null,
			type: 'Item'
		});
		parentFolderId = <string>folder.id;
		await getGame().settings.set(PICK_UP_STIX_MODULE_NAME, SettingKeys.parentItemFolderId, parentFolderId);
	}
	else {
		log(` createDefaultFolders | parent folder '${folder.name}' found`);
	}

	// check if the tokens folder exist and create it if not
	folder = <Folder>getGame().folders?.get(<string>getGame().settings.get(PICK_UP_STIX_MODULE_NAME, SettingKeys.tokenFolderId));
	//folder = Folder.collection.get(getGame().settings.get(PICK_UP_STIX_MODULE_NAME, SettingKeys.tokenFolderId));

	if (!folder) {
		log(` createDefaultFolders | couldn't find tokens folder, creating it now`);
		folder = <Folder>await Folder.create({
			color: '',
			name: 'Tokens',
			sorting: 'a',
			parent: <string>parentFolderId,
			type: 'Item'
		});
		await getGame().settings.set(PICK_UP_STIX_MODULE_NAME, SettingKeys.tokenFolderId, folder.id);
	}
	else {
		log(` createDefaultFolders | tokens folder '${folder.name}' found`);
	}

	// check if the items folder exists and create it if not
	folder = <Folder>getGame().folders?.get(<string>getGame().settings.get(PICK_UP_STIX_MODULE_NAME, SettingKeys.itemFolderId));
	//folder = Folder.collection.get(getGame().settings.get(PICK_UP_STIX_MODULE_NAME, SettingKeys.itemFolderId));

	if (!folder) {
		log(` createDefaultFolders | couldn't find items folder`);
		folder = <Folder>await Folder.create({
			color: '',
			name: 'Items',
			sorting: 'a',
			parent: <string>parentFolderId,
			type: 'Item'
		});
		await getGame().settings.set('pick-up-stix', SettingKeys.itemFolderId, folder.id);
	}
	else {
		log(` createDefaultFolders | items folder '${folder.name}' found`);
	}
};

export const handleSocketMessage = async (msg: SocketMessage) => {
	log(` handleSocketMessage | received socket message with args:`);
	log([msg]);

	if (handleNonGMMessage(msg)) {
		return;
	}

	/* if (msg.sender === getGame().user.id) {
		log(` handleSocketMessage | i sent this, ignoring`);
		return;
	} */

	if (!amIFirstGm()) {
		 return;
	}

	switch (msg.type) {
		case SocketMessageType.deleteOwnedItem:
			await deleteOwnedItem(msg.data.actorId, msg.data.itemId);
			break;
		case SocketMessageType.updateOwnedItem:
			await updateOwnedItem(msg.data.actorId, msg.data.data);
			break;
		case SocketMessageType.updateActor:
			await updateActor(<Actor>getGame().actors?.get(msg.data.actorId), msg.data.updates);
			break;
		case SocketMessageType.deleteToken:
			await deleteToken(msg.data.tokenId, msg.data.sceneId);
			break;
		case SocketMessageType.updateItem:
			await updateItem(msg.data.id, msg.data.updates);
			break;
		case SocketMessageType.updateToken:
			await updateToken(msg.data.sceneId, msg.data.updates);
			break;
		case SocketMessageType.createOwnedItem:
			await createOwnedItem(msg.data.actorId, msg.data.items);
			break;
		case SocketMessageType.createToken:
			await createToken(msg.data);
			break;
		case SocketMessageType.createItem:
			await createItem(msg.data.data, msg.data.options);
			break;
		case SocketMessageType.deleteItem:
			await deleteItem(msg.data.id);
			break;
		case SocketMessageType.collectItem:
			await lootItem(msg.data);
			break;
		case SocketMessageType.lootCurrency:
			await lootCurrency(msg.data);
			break;
		case SocketMessageType.addItemToContainer:
			await addItemToContainer(msg.data);
			break;
		case SocketMessageType.dropItemOnToken:
			await dropItemOnToken(msg.data);
			break;
		default:
			error(` handleSocketMessage | No valid socket message handler for '${msg.type}' with arg:`);
			log([msg])
	}
};

const handleNonGMMessage = (msg: SocketMessage): boolean => {
  let handled = false;

  switch (msg.type) {
    case SocketMessageType.lootTokenCreated:
      Hooks.callAll(PickUpStixHooks.lootTokenCreated, msg.data.tokenId);
      handled = true;
			break;
		case SocketMessageType.itemCollected:
      Hooks.callAll(PickUpStixHooks.itemCollected, msg.data);
      handled = true;
			break;
		case SocketMessageType.currencyLooted:
      Hooks.callAll(PickUpStixHooks.currencyLooted, msg.data);
      handled = true;
			break;
		case SocketMessageType.itemAddedToContainer:
      Hooks.callAll(PickUpStixHooks.itemAddedToContainer, msg.data);
      handled = true;
			break;
  }

  return handled;
};