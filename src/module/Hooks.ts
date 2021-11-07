import { AnyDocumentData } from '@league-of-foundry-developers/foundry-vtt-types/src/foundry/common/abstract/data.mjs';
import EmbeddedCollection from '@league-of-foundry-developers/foundry-vtt-types/src/foundry/common/abstract/embedded-collection.mjs';
import { DocumentConstructor } from '@league-of-foundry-developers/foundry-vtt-types/src/types/helperTypes';
import { error, i18n, log, warn } from '../main.js';
import ContainerConfigApplication from './container-config.js';
// import documentSheetRegistrarInit, { getEntityTypes, getTypeLabels } from './documentSheetRegistrarInit.js';
import { CanvasPrototypeOnDropHandler, canvasReadyHook, dropCanvasHandler } from './hooks/canvas-ready-hook.js';
import { createActorHook } from './hooks/create-actor-hook.js';
import { createItemHook } from './hooks/create-item-hook.js';
import { deleteItemHook } from './hooks/delete-item-hook.js';
import { deleteTokenHook } from './hooks/delete-token-hook.js';
import { lootTokenCreatedHook } from './hooks/loot-token-created-hook.js';
import { preCreateItemHook } from './hooks/pre-create-item-hook.js';
import { preUpdateItemHook } from './hooks/pre-update-item-hook.js';
import { preUpdateTokenHook } from './hooks/pre-update-token-hook.js';
import { renderItemDirectoryHook } from './hooks/render-item-directory-hook.js';
import { onRenderLootHud } from './hooks/render-loot-hud-hook.js';
import { updateItemHook } from './hooks/update-item-hook.js';
import { LootHud } from './loot-hud-application.js';
import { ItemFlags, TokenFlags } from './loot-token.js';
import {
  addItemToContainer,
  createItem,
  createLootToken,
  createOwnedItem,
  createToken,
  deleteItem,
  deleteOwnedItem,
  deleteToken,
  dropItemOnToken,
  getLootToken,
  lootCurrency,
  lootItem,
  updateActor,
  updateItem,
  updateOwnedItem,
  updateToken,
} from './mainEntry';
import { ItemType, PickUpStixHooks, SocketMessage, SocketMessageType } from './models';
// import preDocumentSheetRegistrarInit from './preDocumentSheetRegistrarInit';
import { preloadTemplates } from './preloadTemplates';
import { ContainerItemApplicationSheet } from './sheet/ContainerItemApplicationSheet';

import {
  getCanvas,
  getGame,
  PICK_UP_STIX_FLAG,
  PICK_UP_STIX_MODULE_NAME,
  PICK_UP_STIX_SOCKET,
  registerSettings,
  SettingKeys,
} from './settings.js';

import { amIFirstGm, canSeeLootToken, versionDiff } from './utils.js';

export const getEntityTypes = function() {
  return {
      container: ContainerItemApplicationSheet
  };
}

export const  getTypeLabels = function() {
  return {
      container: "ITEM.TypeContainer",
  };
}

export const readyHooks = async () => {
  log(' ready once hook');

  // MOVED TO ContainerItemApplicationSheet
  /*
  if (getGame().system.id === 'dnd5e') {
    Hooks.on('renderItemSheet5e', (app, protoHtml, data) => {
      log(` renderItemSheet5e`);
      log([app, protoHtml, data]);

      const item: Item = app.object;

      // can't edit the size of owned items
      if (item.actor) return;

      let html = protoHtml;

      if (html[0].localName !== 'div') {
        html = $(html[0].parentElement.parentElement);
      }
      const flagValue = (<any>item.getFlag(PICK_UP_STIX_MODULE_NAME, PICK_UP_STIX_FLAG))?.tokenData;
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
			`;
      $(html).find('div.item-properties div.form-group').last().after(content);
    });
  }
  */

  if (amIFirstGm()) {
    await createDefaultFolders();
  }
  const scenes = getGame().scenes || [];
  for (const el of scenes) {
    // Scene.collection
    let scene = el as unknown as Scene;
    let tokens = <EmbeddedCollection<DocumentConstructor, AnyDocumentData>>scene.getEmbeddedCollection('Token');
    for (const token of tokens) {
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
    for (const token of tokens) {
      //const tokenFlags: TokenFlags = getProperty(token, 'flags.pick-up-stix.pick-up-stix');
      const tokenFlags: TokenFlags = token.getFlag(PICK_UP_STIX_MODULE_NAME, PICK_UP_STIX_FLAG);
      if (!tokenFlags) {
        continue;
      }

      const lootTokens = getLootToken({ itemId: tokenFlags?.itemId, tokenId: <string>token.id });
      for (const lt of lootTokens) {
        if (tokenFlags.isLocked) {
          lt.drawLock();
        }
        lt.activateListeners();
      }
    }
  }
  const items = <IterableIterator<Item>>getGame().items?.values();
  for (const item of items) {
    //if (getProperty(item, 'data.flags.pick-up-stix.pick-up-stix.itemType') === ItemType.CONTAINER) {
    if ((<ItemFlags>item.getFlag(PICK_UP_STIX_MODULE_NAME, PICK_UP_STIX_FLAG))?.itemType === ItemType.CONTAINER) {
      if(item.data.type != ItemType.CONTAINER){
        item.data.type = ItemType.CONTAINER;
      }
    }
  }

  getGame().socket?.on(PICK_UP_STIX_SOCKET, handleSocketMessage);

  Hooks.once('canvasReady', () => {
    //@ts-ignore
    getCanvas().hud.pickUpStixLootHud = new LootHud();
  });
  Hooks.on('canvasReady', canvasReadyHook);
  //Hooks.on('ready', readyHook);

  // item hooks
  // Impossibile to set a custom type itme
  // Hooks.on('preCreateItem', preCreateItemHook);
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

  // Replace with wrapper to check out
  // Hooks.off('dropCanvasData', dropCanvasHandler);
  // Hooks.on('dropCanvasData', dropCanvasHandler);
};

export const setupHooks = async () => {
  // setup all the hooks
  // game startup hooks

  // IT DOESN'T WORK, IT SHOULD CREATE  A NEW ITEM CONTAINER TYPE, BUT THE CREATION ALWAYS FAIL
  /*
  Hooks.on('preDocumentSheetRegistrarInit', (settings) => {
    // This will enable Item.registerSheet.
    preDocumentSheetRegistrarInit(settings);
  });

  Hooks.on('documentSheetRegistrarInit', (documentTypes) => {
    documentSheetRegistrarInit();
  });
  */
  // WHY THIS IS NOT WORK WITH custom type ???
  // GIVE UP
  /*
  const types = getEntityTypes();
  const labels = getTypeLabels();
  for (const [k, v] of Object.entries(labels)) {
    if(!getGame().system.entityTypes.Item.includes(k)){
      if (getGame().system.id === 'dnd5e') {
        Items.registerSheet(game.system.id, ContainerItemApplicationSheet, {
          // WHY THIS IS NOT WORK WITH custom type ???
          types: [k],
          makeDefault: false,
          label: i18n(v), // "DND5E.SheetClassItem"
        });
      }else {
        Items.registerSheet("core", ContainerItemApplicationSheet, {
          types: [k],
          makeDefault: false,
          label: i18n(v), //"Default Item Sheet"
        });
      }
    }
  }
  getGame().system.entityTypes.Item = getGame().system.entityTypes.Item.concat(Object.keys(types)).sort();
  CONFIG.Item.typeLabels = mergeObject((CONFIG.Item.typeLabels || {}), labels);
  
  // add the default sheet to the container Item type
  CONFIG.Item.sheetClasses[ItemType.CONTAINER] = {
    'pick-up-stix.ContainerConfigApplication': {
      label: 'pick-up-stix.ContainerConfigApplication',
      cls: ContainerConfigApplication,
      default: true,
      id: 'pick-up-stix.ContainerConfigApplication',
    },
  };
  */  

  //@ts-ignore
	Items.registerSheet(game.system.id, ContainerItemApplicationSheet, { makeDefault: false, types:["backpack"]});
};

export const initHooks = async () => {
  warn('Init Hooks processing');
  log('initHook');

  CONFIG.debug.hooks = true;
  // CONFIG.debug['pickUpStix'] = true;

  /*
  // const entries =
  //   getGame().items?.filter((e) => !!e.getFlag(PICK_UP_STIX_MODULE_NAME, 'id') && !e.getFlag('core', 'sheetClass')) ??
  //   [];

  // await Promise.all(
  //   entries.map((entry) =>
  //     entry.setFlag('core', 'sheetClass', `${PICK_UP_STIX_MODULE_NAME}.ContainerItemApplicationSheet`),
  //   ),
  // );
  */

  // Token.prototype.release = Token_tokenRelease(Token.prototype.release);

  //@ts-ignore
  libWrapper.register(PICK_UP_STIX_MODULE_NAME, 'Token.prototype.release', TokenPrototypeReleaseHandler, 'MIXED');
  //@ts-ignore
  libWrapper.register(PICK_UP_STIX_MODULE_NAME, 'Token.prototype.isVisible', TokenPrototypeIsVisibleHandler, 'MIXED');

  // if (getGame().system.id === 'dnd5e') {
  // 	info(`pick-up-stix | initHook | System is '${getGame().system.id}' enabling Token.isVisible override.`);

  // 	Object.defineProperty(Token.prototype, 'isVisible', {
  // 		get: Token_isVisible,
  // 		enumerable: true,
  // 		configurable: true
  // 	});
  // }

  // ADDED
  //@ts-ignore
  //libWrapper.register(PICK_UP_STIX_MODULE_NAME, 'Canvas.prototype._onDrop', CanvasPrototypeOnDropHandler, 'MIXED');
};

export const TokenPrototypeReleaseHandler = function (wrapped, ...args) {
  const [options] = args;
  log(` tokenRelease | called with args`);
  log(options);
  //origFn.call(this, options);
  //@ts-ignore
  if (getCanvas().hud.pickUpStixLootHud?.object === this) {
    //@ts-ignore
    getCanvas().hud.pickUpStixLootHud.clear();
  }
  return wrapped(...args);
};

export const TokenPrototypeIsVisibleHandler = function (wrapped, ...args) {
  log(` Token_isVisible | called with args`);
  warn(` Token_isVisible | This method overrides isVisible of Token`);
  let actualIsVisible: boolean;
  if (this.data.hidden) {
    const tokenFlags: TokenFlags = this.getFlag(PICK_UP_STIX_MODULE_NAME, PICK_UP_STIX_FLAG);
    actualIsVisible = getGame().user?.isGM || (tokenFlags && canSeeLootToken(this));
  } else if (!getCanvas().sight?.tokenVision) {
    actualIsVisible = true;
  } else if (this._controlled) {
    actualIsVisible = true;
  } else {
    const tolerance = Math.min(this.w, this.h) / 4;
    actualIsVisible = <boolean>getCanvas().sight?.testVisibility(this.center, { tolerance });
  }
  return wrapped(...args);
};

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
      type: 'Item',
    });
    parentFolderId = <string>folder.id;
    await getGame().settings.set(PICK_UP_STIX_MODULE_NAME, SettingKeys.parentItemFolderId, parentFolderId);
  } else {
    log(` createDefaultFolders | parent folder '${folder.name}' found`);
  }

  // check if the tokens folder exist and create it if not
  folder = <Folder>(
    getGame().folders?.get(<string>getGame().settings.get(PICK_UP_STIX_MODULE_NAME, SettingKeys.tokenFolderId))
  );
  //folder = Folder.collection.get(getGame().settings.get(PICK_UP_STIX_MODULE_NAME, SettingKeys.tokenFolderId));

  if (!folder) {
    log(` createDefaultFolders | couldn't find tokens folder, creating it now`);
    folder = <Folder>await Folder.create({
      color: '',
      name: 'Tokens',
      sorting: 'a',
      parent: <string>parentFolderId,
      type: 'Item',
    });
    await getGame().settings.set(PICK_UP_STIX_MODULE_NAME, SettingKeys.tokenFolderId, folder.id);
  } else {
    log(` createDefaultFolders | tokens folder '${folder.name}' found`);
  }

  // check if the items folder exists and create it if not
  folder = <Folder>(
    getGame().folders?.get(<string>getGame().settings.get(PICK_UP_STIX_MODULE_NAME, SettingKeys.itemFolderId))
  );
  //folder = Folder.collection.get(getGame().settings.get(PICK_UP_STIX_MODULE_NAME, SettingKeys.itemFolderId));

  if (!folder) {
    log(` createDefaultFolders | couldn't find items folder`);
    folder = <Folder>await Folder.create({
      color: '',
      name: 'Items',
      sorting: 'a',
      parent: <string>parentFolderId,
      type: 'Item',
    });
    await getGame().settings.set(PICK_UP_STIX_MODULE_NAME, SettingKeys.itemFolderId, folder.id);
  } else {
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
      log([msg]);
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
