import { SocketMessageType, PickUpStixSocketMessage, ItemType } from "../models";
import ItemConfigApplication from "../item-config-application";
import { SettingKeys } from "../settings";
import { versionDiff } from "../../../utils";
import { createEntity, deleteEntity, deleteLootTokenData, saveLootTokenData } from "../main";

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

	//EntitySheetConfig.registerSheet(Item, 'pick-up-stix', ItemConfigApplication, { types: [ 'container' ], makeDefault: true });

	if (!game.settings.get('pick-up-stix', 'notify-db-issue')) {
		await new Promise(resolve => {
			new Dialog({
				title: 'Pick-Up-Stix WARNING!',
				content: `
					<p>
					It has been bought to my attention that while my module is enabled, eventually it is possible
					that some of the data files used by Foundry can become quite large. This issue is caused by a combination
					of how the database works and how this module stores data.
					</p>
					<p>
					I am working on a release that will alleviate this issue and I appreciate your patience and support.
					</p>
				`,
				buttons: {
					ok: {
						label: 'OK',
						callback: () => resolve()
					},
					dismiss: {
						label: `DON'T SHOW AGAIN`,
						callback: () => {
							game.settings.set('pick-up-stix', 'notify-db-issue', true);
							resolve();
						}
					}
				},
				default: 'ok'
			}).render(true);
		});
	}

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
		console.log(msg);

		if (msg.sender === game.user.id) {
			console.log(`pick-up-stix | socket.on | i sent this, ignoring`);
			return;
		}

		const firstGm = game.users.find((u) => u.isGM && u.active);
		if (firstGm && game.user !== firstGm) {
   		return;
		}

		let actor;
		let token;

		switch (msg.type) {
			case SocketMessageType.updateActor:
				actor = game.actors.get(msg.data.actorId);
				await actor.update(msg.data.updates);
				break;
			case SocketMessageType.deleteToken:
				await canvas.scene.deleteEmbeddedEntity('Token', msg.data);
				break;
			case SocketMessageType.updateEntity:
				token = canvas.tokens.get(msg.data.tokenId);
				await token.update(msg.data.updates);
				break;
			case SocketMessageType.createOwnedEntity:
				actor = game.actors.get(msg.data.actorId);
				await actor.createOwnedItem(msg.data.items);
				break;
			case SocketMessageType.createItemToken:
				await Token.create(msg.data);
				break;
			case SocketMessageType.saveLootTokenData:
				saveLootTokenData(msg.data.sceneId, msg.data.tokenid, msg.data.lootData);
				break;
			case SocketMessageType.deleteLootTokenData:
				deleteLootTokenData(msg.data.sceneId, msg.data.tokenId);
				break;
			case SocketMessageType.createEntity:
				createEntity(msg.data.data, msg.data.options);
				break;
			case SocketMessageType.deleteEntity:
				deleteEntity(msg.data.uuid);
				break;
			case SocketMessageType.lootTokenDataSaved:
				Hooks.callAll('pick-up-stix.lootTokenDataSaved', msg.data.sceneId, msg.data.tokenId, msg.data.lootData);
				break;
		}
	});
};
