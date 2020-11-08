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

  if (game.user.isGM && !game.settings.get('pick-up-stix', SettingKeys.version13updatemessage)) {
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
    await game.settings.set('pick-up-stix', SettingKeys.version13updatemessage, true);
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
				await updateEntity(msg.data.uuid, msg.data.updates);
        break;
      case SocketMessageType.updateToken:
        await updateEntity(msg.data.sceneId, msg.data.updates);
        break;
			case SocketMessageType.createOwnedEntity:
				actor = game.actors.get(msg.data.actorId);
				await createOwnedItem(actor, msg.data.items);
				break;
			case SocketMessageType.createItemToken:
				await createToken(msg.data);
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
