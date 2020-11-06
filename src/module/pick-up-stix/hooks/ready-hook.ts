import { SocketMessageType, PickUpStixSocketMessage, ItemType } from "../models";
import ItemConfigApplication from "../item-config-application";
import { SettingKeys } from "../settings";
import { versionDiff } from "../../../utils";
import { createItem, createOwnedItem, createToken, deleteEmbeddedEntity, deleteEntity, deleteOwnedItem, deleteToken, getLootToken, updateActor, updateEmbeddedEntity, updateEntity } from "../main";
import { LootToken, TokenFlags } from "../loot-token";

declare class EntitySheetConfig {
	static registerSheet(
    entityClass,
    scope,
    sheetClass,
    { types, makeDefault }?: { types?: string[], makeDefault?: boolean }
  );
}

/* ------------------------------------ */
export async function readyHook() {
	// Do anything once the module is ready
	console.log(`pick-up-stix | readyHook`);

	// this adds the 'container' type to the game system's entity types.
	game.system.entityTypes.Item.push(ItemType.CONTAINER);

	// add the default sheet to the container Item type
	CONFIG.Item.sheetClasses[ItemType.CONTAINER] = {
			'pick-up-stix.ItemConfigApplication': {
				cls: ItemConfigApplication,
			default: true,
			id: 'pick-up-stix.ItemConfigApplication'
		}
	};

	await createDefaultFolders();

	for (let el of Scene.collection) {
		const scene = (el as unknown) as Scene;

		const tokens = scene.getEmbeddedCollection('Token');
		for (let token of tokens) {
			const tokenFlags: TokenFlags = getProperty(token, 'flags.pick-up-stix.pick-up-stix');

			let lootToken = getLootToken({ uuid: tokenFlags?.itemUuid, tokenId: token._id })?.[0];

			if (tokenFlags?.itemUuid && !lootToken) {
				console.log(`pick-up-stix | readyHook | Creating new LootToken for token '${token._id}' and item uuid '${tokenFlags.itemUuid}'`);
				lootToken = await LootToken.create(token._id, tokenFlags.itemUuid);
			}
		}
	}

	for (let item of game.items.values()) {
		if (getProperty(item, 'data.flags.pick-up-stix.pick-up-stix.itemType') === ItemType.CONTAINER) {
			item.data.type = ItemType.CONTAINER;
		}
	}

	const activeVersion = game.modules.get('pick-up-stix').data.version;
	const previousVersion = game.settings.get('pick-up-stix', SettingKeys.version);

	if (game.user.isGM && activeVersion !== previousVersion) {
		await game.settings.set('pick-up-stix', SettingKeys.version, activeVersion);
	}

	const diff = versionDiff(activeVersion, previousVersion);
	if (diff < 0) {
		console.log(`pick-up-stix | readyHook | current version ${activeVersion} is lower than previous version ${previousVersion}`);
	}
	else if (diff > 0) {
		console.log(`pick-up-stix | readyHook | current version ${activeVersion} is greater than previous version ${previousVersion}`);
	}
	else {
		console.log(`pick-up-stix | readyHook | current version ${activeVersion} the same as the previous version ${previousVersion}`);
	}

	game.socket.on('module.pick-up-stix', async (msg: PickUpStixSocketMessage) => {
		console.log(`pick-up-stix | socket.on | received socket message with args:`);
		console.log([msg]);

    if (handleNonGMMessage(msg)) {
      return;
    }

		if (msg.sender === game.user.id) {
			console.log(`pick-up-stix | socket.on | i sent this, ignoring`);
			return;
		}

		const firstGm = game.users.find((u) => u.isGM && u.active);
		if (firstGm && game.user !== firstGm) {
   		return;
		}

		let actor;
		let token: Token;

		switch (msg.type) {
			case SocketMessageType.deleteOwnedItem:
				await deleteOwnedItem(msg.data.actorId, msg.data.itemId);
				break;
			case SocketMessageType.updateEmbeddedEntity:
				await updateEmbeddedEntity(msg.data.parentUuid, msg.data.entityType, msg.data.data);
				break;
			case SocketMessageType.deleteEmbeddedEntity:
				await deleteEmbeddedEntity(msg.data.parentUuid, msg.data.entityType, msg.data.entityId);
				break;
			case SocketMessageType.updateActor:
				actor = game.actors.get(msg.data.actorId);
				await updateActor(actor, msg.data.updates);
				break;
			case SocketMessageType.deleteToken:
				await deleteToken(msg.data.tokenId, msg.data.sceneId);
				break;
			case SocketMessageType.updateEntity:
				token = canvas.tokens.get(msg.data.tokenId);
				if (token) {
					await updateEntity(token, msg.data.updates);
				}
				break;
			case SocketMessageType.createOwnedEntity:
				actor = game.actors.get(msg.data.actorId);
				await createOwnedItem(actor, msg.data.items);
				break;
			case SocketMessageType.createItemToken:
				await createToken(msg.data);
				break;
			case SocketMessageType.saveLootTokenData:
				// await saveLootTokenData(msg.data.sceneId, msg.data.tokenId, msg.data.lootData);
				break;
			case SocketMessageType.deleteLootTokenData:
				// await deleteLootTokenData(msg.data.sceneId, msg.data.tokenId);
				break;
			case SocketMessageType.createEntity:
				await createItem(msg.data.data, msg.data.options);
				break;
			case SocketMessageType.deleteEntity:
				await deleteEntity(msg.data.uuid);
				break;
			default:
				console.error(`pick-up-stix | readyHook | No valid socket message handler for '${msg.type}' with arg:`);
				console.log([msg])
		}
	});
};

const createDefaultFolders = async () => {
	console.log(`pick-up-stix | createDefaultFolders`);

	// check if the parent folder exists and create it if not
	let parentFolderId = game.settings.get('pick-up-stix', SettingKeys.parentItemFolderId);
	let folder = Folder.collection.get(parentFolderId);

	if (!folder) {
		console.log(`pick-up-stix | createDefaultFolders | couldn't parent folder creating it now`);
		folder = await Folder.create({
			color: '',
			name: 'Pick-Up-Stix',
			sorting: 'a',
			parent: null,
			type: 'Item'
		});
		parentFolderId = folder.id;
		await game.settings.set('pick-up-stix', SettingKeys.parentItemFolderId, parentFolderId);
	}
	else {
		console.log(`pick-up-stix | createDefaultFolders | parent folder '${folder.name}' found`);
	}

	// check if the tokens folder exist and create it if not
	folder = Folder.collection.get(game.settings.get('pick-up-stix', SettingKeys.tokenFolderId));

	if (!folder) {
		console.log(`pick-up-stix | createDefaultFolders | couldn't find tokens folder, creating it now`);
		folder = await Folder.create({
			color: '',
			name: 'Tokens',
			sorting: 'a',
			parent: parentFolderId,
			type: 'Item'
		});
		await game.settings.set('pick-up-stix', SettingKeys.tokenFolderId, folder.id);
	}
	else {
		console.log(`pick-up-stix | createDefaultFolders | tokens folder '${folder.name}' found`);
	}

	// check if the items folder exists and create it if not
	folder = Folder.collection.get(game.settings.get('pick-up-stix', SettingKeys.itemFolderId));

	if (!folder) {
		console.log(`pick-up-stix | createDefaultFolders | couldn't find items folder`);
		folder = await Folder.create({
			color: '',
			name: 'Items',
			sorting: 'a',
			parent: parentFolderId,
			type: 'Item'
		});
		await game.settings.set('pick-up-stix', SettingKeys.itemFolderId, folder.id);
	}
	else {
		console.log(`pick-up-stix | createDefaultFolders | items folder '${folder.name}' found`);
	}
};

const handleNonGMMessage = (msg: PickUpStixSocketMessage): boolean => {
  let handled = false;

  switch (msg.type) {
    case SocketMessageType.lootTokenCreated:
      Hooks.callAll('pick-up-stix.lootTokenCreated', msg.data.tokenId);
      handled = true;
      break;
  }

  return handled;
};
