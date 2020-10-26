import { SocketMessageType, PickUpStixSocketMessage, ItemType } from "../models";
import ItemConfigApplication from "../item-config-application";
import { SettingKeys } from "../settings";
import { versionDiff } from "../../../utils";
import { createItem, createOwnedItem, createToken, deleteEntity, deleteLootTokenData, deleteToken, saveLootTokenData, updateActor, updateEntity } from "../main";

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

	for (let item of game.items.values()) {
		if (getProperty(item, 'data.flags.pick-up-stix.pick-up-stix.itemType') === ItemType.CONTAINER) {
			item.data.type = ItemType.CONTAINER;
		}
	}

	// add the default sheet to the container Item type
	CONFIG.Item.sheetClasses[ItemType.CONTAINER] = {
		'pick-up-stix.ItemConfigApplication': {
			cls: ItemConfigApplication,
			default: true,
			id: 'pick-up-stix.ItemConfigApplication'
		}
	};

	const activeVersion = game.modules.get('pick-up-stix').data.version;
	const previousVersion = game.settings.get('pick-up-stix', SettingKeys.version);

	if (game.user.isGM) {
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

	// one-time notification
	if (!game.settings.get('pick-up-stix', SettingKeys.version_0_12_data_notification)) {
		new Dialog({
			title: `Pick-Up-Six`,
			content: `<p>If you are upgrading from a previous version to this release, then any current loot that you may have
			created will need to be recreated. I am hopeful that any releases in the future will have better migration scripts to help
			with moving data from one format to another when needed.</p>
			<p>I apologize for the inconvenience.</p>
			<p>This message will not display again.</p>`,
			buttons: {
				ok: {
					label: 'OK',
					callback: () => game.settings.set('pick-up-stix', SettingKeys.version_0_12_data_notification, true)
				}
			},
			default: 'ok'
		}).render(true);
	}

socket = game.socket;
	socket.on('module.pick-up-stix', async (msg: PickUpStixSocketMessage) => {
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
			case SocketMessageType.updateActor:
				actor = game.actors.get(msg.data.actorId);
				await updateActor(actor, msg.data.updates);
				break;
			case SocketMessageType.deleteToken:
				token = canvas.tokens.placeables.find(p => p.id === msg.data);
				if (token) {
					await deleteToken(token);
				}
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
				await saveLootTokenData(msg.data.sceneId, msg.data.tokenId, msg.data.lootData);
				break;
			case SocketMessageType.deleteLootTokenData:
				await deleteLootTokenData(msg.data.sceneId, msg.data.tokenId);
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

const handleNonGMMessage = (msg: PickUpStixSocketMessage): boolean => {
  let handled = false;

  switch (msg.type) {
    case SocketMessageType.lootTokenDataSaved:
      Hooks.callAll('pick-up-stix.lootTokenDataSaved', msg.data.sceneId, msg.data.tokenId, msg.data.lootData);
      handled = true;
      break;
    case SocketMessageType.lootTokenCreated:
      Hooks.callAll('pick-up-stix.lootTokenCreated', msg.data.tokenId, msg.data.data);
      handled = true;
      break;
  }

  return handled;
}
