import { SocketMessageType, PickUpStixSocketMessage, ItemType, PickUpStixFlags } from "../models";
import ItemConfigApplication from "../item-config-application";
import { SettingKeys } from "../settings";
import { getCurrencyTypes, versionDiff } from "../../../utils";

declare class EntitySheetConfig {
	static registerSheet(
    entityClass,
    scope,
    sheetClass,
    { types, makeDefault }?: { types?: string[], makeDefault?: boolean }
  );
}

async function migrate000To0110() {
	let oldFlags;
	let newFlags: PickUpStixFlags;

	// convert items in the items directory
	for (let item of game.items.entities) {
		oldFlags = item.getFlag('pick-up-stix', 'pick-up-stix');
		if (!oldFlags || item.getFlag('pick-up-stix', 'version') === '0.11.0') {
			continue;
		}

		const e = item as Entity;
		console.log(`pick-up-stix | migrate000To0110 | updating item ${e.id} from 0.0.0 to 0.11.0`);

		// remove the old flags
		await item.unsetFlag('pick-up-stix', 'pick-up-stix');

		// set the version flag
		await item.setFlag('pick-up-stix', 'version', '0.11.0');

		newFlags = {
			itemType: oldFlags.itemType.toLowerCase(),
			isLocked: oldFlags.isLocked
		};
		if (oldFlags.initialState?.itemData?.data) {
			newFlags.itemData = {
				...oldFlags.initialState?.itemData?.data ?? {}
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
					...oldFlags.containerLoot?.currency ?? Object.keys(getCurrencyTypes()).reduce((acc, shortName) => ({...acc, [shortName]: 0}), {}) ?? {}
				},
				loot: {
					...
						Object.entries<any[]>(oldFlags.containerLoot ?? {})
							.filter(([k,]) => k !== 'currency')
							.reduce((acc, [k, v]) => {
								acc[k] = [
									...v.map(lootItem => ({ ...lootItem, data: { ...lootItem.data, quantity: lootItem.qty } }))
								];
								return acc;
							}, {})
				}
			}
		}
		await item.setFlag('pick-up-stix', 'pick-up-stix', newFlags);
	}

	let scene: Scene;
	// convert any loot tokens
	for (scene of game.scenes.entities) {
		const updates = [];
		for (let tokenData of (scene.data as any)?.tokens) {
			oldFlags = getProperty(tokenData, 'flags.pick-up-stix.pick-up-stix');

			// if the token doesn't have flags or the version is already current
			if ((!oldFlags || getProperty(tokenData, 'flags.pick-up-stix.version') === '0.11.0') && !tokenData.actorData?.items) {
				continue;
			}

			let update: any;

			// if the token represents an actor but isn't linked to the actor, we'll have to update it
			if (tokenData.actorData?.items) {
				update = {
					_id: tokenData._id,
					actorData: {
						items: [
							...tokenData.actorData?.items.filter(i => getProperty(i, 'flags.pick-up-stix.version') !== '0.11.0').map(i => ({
								...i,
								flags: {
									'pick-up-stix': {
										version: '0.11.0',
										'pick-up-stix': {
											owner: tokenData.actorId
										}
									}
								}
							}))
						]
					}
				};
				updates.push(update);
				continue
			}

			update._id = tokenData._id;
			update.flags = {
				'pick-up-stix': {
					version: '0.11.0',
					'pick-up-stix': {
						itemType: oldFlags.itemType.toLowerCase(),
						itemData: {
							...oldFlags.initialState?.itemData?.data ?? {}
						}
					}
				}
			};

			if (oldFlags.itemType.toLowerCase() === ItemType.CONTAINER) {
				update.flags['pick-up-stix']['pick-up-stix'].isLocked = oldFlags.isLocked;
				update.flags['pick-up-stix']['pick-up-stix'].container = {
					soundClosePath: oldFlags.containerCloseSoundPath,
					soundOpenPath: oldFlags.containerOpenSoundPath,
					imageClosePath: oldFlags.imageContainerClosedPath,
					imageOpenPath: oldFlags.imageContainerOpenPath,
					canClose: oldFlags.canClose,
					isOpen: oldFlags.isOpen,
					currency: {
						...oldFlags.containerLoot?.currency ?? Object.keys(getCurrencyTypes()).reduce((acc, shortName) => ({...acc, [shortName]: 0}), {}) ?? {}
					},
					loot: {
						...
							Object.entries<any[]>(oldFlags.containerLoot ?? {})
								.filter(([k,]) => k !== 'currency')
								.reduce((acc, [k, v]) => {
									acc[k] = [
										...v.map(lootItem => ({ ...lootItem, data: { ...lootItem.data, quantity: lootItem.qty } }))
									];
									return acc;
								}, {})
					}
				}
			}

			updates.push(update);
		}

		await scene.updateEmbeddedEntity('Token', updates);
	}

	let actor: Actor;
	for(actor of game.actors.entities) {
		const updates = [];
		for(let itemData of actor.items.values()) {
			const oldFlags = getProperty(itemData, 'data.flags.pick-up-stix.pick-up-stix');

			if (!oldFlags || getProperty(itemData, 'data.flags.pick-up-stix.version') === '0.11.0' || !game.system.entityTypes.Item.includes(getProperty(itemData, 'data.type'))) {
				continue;
			}

			await itemData.unsetFlag('pick-up-stix', 'pick-up-stix');

			const update: any = {
				_id: itemData.id,
				flags: {
					'pick-up-stix': {
						version: '0.11.0',
						'pick-up-stix': {
							owner: actor.id
						}
					}
				}
			}

			updates.push(update);
		}
		actor.updateOwnedItem(updates);
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
				for (let i of a.items) {
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

	EntitySheetConfig.registerSheet(Item, 'pick-up-stix', ItemConfigApplication, { types: [ 'container' ], makeDefault: true });

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
						<p>It appears you are upgrading to a version that requires data migration.</p>
						<p>If you wish to continue with the migration please press 'yes'. Otherwise press 'no'.</p>
						<p>If you choose not to migrate data, you should downgrade back to version ${previousVersion}.</p>
						<p>Note that there is no guarantee that data migration will work; I have no way to test most things by myself.</p>
					`,
					title: 'Data Migration',
					yes: async () => {
						for (let fn of migrations.values()) {
							await fn();
						}
						await game.settings.set('pick-up-stix', SettingKeys.version, activeVersion);
						resolve();
					},
					no: () => resolve()
				});
			});
		}
	}
	else if (diff < 0) {
		console.log('pick-up-stix | readyHook | Version has been downgraded');
		await new Promise(resolve => {
			let e = new Dialog({
				buttons: {
					OK: {
						label: 'OK',
						callback: () => resolve()
					}
				},
				content: `
					<p>It's possible that you are downgrading from version ${previousVersion} to version ${activeVersion}.</p>
					<p>Be aware, if this is the case, any previous items created with Pick-Up-Stix could be invalidated and no longer function properly.</p>`,
				title: 'Downgrade Warning',
			}).render(true);
		});
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
		}
	});
};
