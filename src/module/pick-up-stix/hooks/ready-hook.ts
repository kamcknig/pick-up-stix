import { SocketMessageType, PickUpStixSocketMessage, ItemType, PickUpStixFlags } from "../models";
import ItemConfigApplication from "../item-config-application";
import { SettingKeys } from "../settings";
import { versionDiff } from "../../../utils";

async function migrate000To0110() {
	for (let item of game.items.entities) {
		const oldFlags = item.getFlag('pick-up-stix', 'pick-up-stix');
		if (!oldFlags || item.getFlag('pick-up-stix', 'version') === '0.11.0') {
			continue;
		}

		const e = item as Entity;
		console.log(`pick-up-stix | migrate000To0110 | updating item ${e.id} from 0.0.0 to 0.11.0`);

		// remove the old flags
		await item.unsetFlag('pick-up-stix', 'pick-up-stix');

		// set the version flag
		await item.setFlag('pick-up-stix', 'version', '0.11.0');

		const newFlags: PickUpStixFlags = {
			itemId: e.id,
			itemType: oldFlags.itemType.toLowerCase(),
			isLocked: oldFlags.isLocked
		};
		if (oldFlags.initialState?.itemData?.data) {
			newFlags.itemData = {
				...oldFlags.initialState?.itemData?.data
			}
		}
		if (oldFlags.itemType.toLowerCase() === ItemType.CONTAINER) {
			newFlags.container = {
				soundOpenPath: oldFlags.containerOpenSoundPath,
				soundClosePath: oldFlags.containerCloseSoundPath,
				imageClosePath: oldFlags.imageContainerClosedPath,
				imageOpenPath: oldFlags.imageContainerOpenPath,
				canClose: oldFlags.canClose,
				isOpen: oldFlags.isOpen,
				currency: {
					...oldFlags.containerLoot?.currency ?? {}
				},
				loot: {
					...Object.entries<any[]>(oldFlags.containerLoot ?? {}).filter(([k,]) => k !== 'currency').reduce((acc, [k, v]) => { acc[k] = [...v]; return acc; }, {})
				}
			}
		}
		await item.setFlag('pick-up-stix', 'pick-up-stix', newFlags);
		console.log(item);
		return;
	}
}

function dataMigrationNeeded(minVersion: string, maxVersion: string): Function[] {
	const migrations = [];

	if (!minVersion) {
		// if a min version isn't provided that means that version 0.11.0 has never been run
		// so in order to know if we need data migration in that case we check all tokens, items
		// and actor's items to see if there are any flags from the module on them.
		if (
			game.items.entities.some(i => !!getProperty(i, 'flags.pick-up-stix.pick-up-stix')) ||
			game.scenes.entities.some(s => (s.data as any).tokens.some(t => !!getProperty(t, 'flags.pick-up-stix.pick-up-stix'))) ||
			game.actors.entities.some(a => {
				for (let [k, i] of a.items.entries()) {
					if (!!getProperty(i, 'data.flags.pick-up-stix.pick-up-stix')) {
						return true;
					}
				}
				return false;
			})
		) {
			migrations.push(migrate000To0110);
		}

		return migrations;
	}

	if (versionDiff(minVersion, '0.10.2') < 1 && versionDiff(maxVersion, '0.10.9') > 1) {
		migrations.push(migrate000To0110);
	}

	return migrations;
}

/* ------------------------------------ */
export async function readyHook() {
	// Do anything once the module is ready
	console.log(`pick-up-stix | readyHook`);

	// this adds the 'container' type to the game system's entity type.
	game.system.entityTypes.Item.push('container');

	const activeVersion = game.modules.get('pick-up-stix').data.version;
	const previousVersion = game.settings.get('pick-up-stix', SettingKeys.version);
	const diff = versionDiff(activeVersion, previousVersion);

	if (!previousVersion || diff > 0) {
		console.log('pick-up-stix | readyHook | Active version is newer than previous version');
		const migrations = dataMigrationNeeded(previousVersion, activeVersion);
		if (migrations.length) {
			await new Promise(resolve => {
				const d = Dialog.confirm({
					content: `
						It appears you are upgrade to a version that requires data migration. If you wish to continue with the migration
						please press 'yes'. Otherwise press 'no'. If you choose not to migrate data, you should downgrade back to version
						${previousVersion}. Note that there is no guarantee that data migration will work; I have no way to test most things
						by myself.
					`,
					title: 'Data Migration',
					yes: async () => {
						for (let fn of migrations.values()) {
							await fn();
						}
					},
					no: () => resolve()
				});
			});
		}
	}
	else if (diff < 0) {
		console.log('pick-up-stix | readyHook | Version has been downgraded');
		await new Promise(resolve => {
			const d = Dialog.confirm({
				content: `It's possible that you are downgrading from version ${previousVersion} to version ${activeVersion}. Be aware, if this is the case, any previous items created with Pick-Up-Stix could be invalidated and no longer function properly.`,
				title: 'Downgrade Warning',
				yes: () => resolve(),
				no: () => resolve()
			});
		});
	}

	// TODO: add this back in, for now I want to keep getting other flow
	// game.settings.set('pick-up-stix', SettingKeys.version, activeVersion);

	for (let item of game.items.values()) {
		if (getProperty(item, 'data.flags.pick-up-stix.pick-up-stix.itemType') === ItemType.CONTAINER) {
			item.data.type = 'container';
		}
	}

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
