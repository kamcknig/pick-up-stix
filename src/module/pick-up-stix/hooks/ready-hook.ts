import { SocketMessageType, PickUpStixSocketMessage, ItemType } from "../models";
import ItemConfigApplication from "../item-config-application";
import { SetttingKeys } from "../settings";
import { versionDiff } from "../../../utils";

/* ------------------------------------ */
export function readyHook() {
	// Do anything once the module is ready
	console.log(`pick-up-stix | readyHook`);

	const activeVersion = game.modules.get('pick-up-stix').data.version;
	const previousVersion = game.settings.get('pick-up-stix', SetttingKeys.version);
	const diff = versionDiff(activeVersion, previousVersion);

	for (let item of game.items.values()) {
		if (getProperty(item, 'data.flags.pick-up-stix.pick-up-stix.itemType') === ItemType.CONTAINER) {
			item.data.type = 'container';
		}
	}

	// this adds the 'container' type to the game system's entity type.
	game.system.entityTypes.Item.push('container');

	// add the default sheet to the container Item type
	CONFIG.Item.sheetClasses['container'] = {
		'pick-up-stix.ItemConfigApplication': {
			cls: ItemConfigApplication,
			default: true,
			id: 'pick-up-stix.ItemConfigApplication'
		}
	};
	EntitySheetConfig.registerSheet(Item, 'pick-up-stix', ItemConfigApplication, { types: [ 'container' ], makeDefault: true });

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
			case SocketMessageType.updateToken:
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
