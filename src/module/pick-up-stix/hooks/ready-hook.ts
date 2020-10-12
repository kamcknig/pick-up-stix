import { SocketMessageType, PickUpStixSocketMessage, ItemType } from "../models";
import ItemConfigApplication from "../item-config-application";
import { SettingKeys } from "../settings";

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
	// const previousVersion = game.settings.get('pick-up-stix', SettingKeys.version);
	await game.settings.set('pick-up-stix', SettingKeys.version, activeVersion);

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
		}
	});
};
