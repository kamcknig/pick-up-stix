import { error, log } from "../../../log.js";
import { amIFirstGm, versionDiff } from "../../../utils.js";
import ContainerConfigApplication from "../container-config.js";
import { createItem, createOwnedItem, createToken, deleteItem, deleteOwnedItem, deleteToken, getLootToken, updateActor, updateOwnedItem, updateItem, updateToken, createLootToken, lootItem, lootCurrency, addItemToContainer, dropItemOnToken } from "../main.js";
import { ItemType, PickUpStixHooks, SocketMessageType } from "../models.js";
import { SettingKeys } from "../settings.js";
/* ------------------------------------ */
export async function readyHook() {
    // Do anything once the module is ready
    log(`pick-up-stix | readyHook`);
    // this adds the 'container' type to the game system's entity types.
    game.system.entityTypes.Item.push(ItemType.CONTAINER);
    // add the default sheet to the container Item type
    CONFIG.Item.sheetClasses[ItemType.CONTAINER] = {
        'pick-up-stix.ContainerConfigApplication': {
            //@ts-ignore
            cls: ContainerConfigApplication,
            default: true,
            id: 'pick-up-stix.ContainerConfigApplication'
        }
    };
    if (amIFirstGm()) {
        await createDefaultFolders();
    }
    for (let el of Scene.collection) {
        let scene = el;
        let tokens = scene.getEmbeddedCollection('Token');
        for (let token of tokens) {
            const tokenFlags = getProperty(token, 'flags.pick-up-stix.pick-up-stix');
            if (!tokenFlags) {
                continue;
            }
            let lootToken = getLootToken({ itemId: tokenFlags?.itemId, tokenId: token._id })?.[0];
            if (tokenFlags?.itemId && !lootToken) {
                log(`pick-up-stix | readyHook | Creating new LootToken for Token '${token._id}' and Item '${tokenFlags.itemId}'`);
                lootToken = await createLootToken(token._id, tokenFlags.itemId, false);
            }
        }
        scene = game.scenes.active;
        tokens = scene.getEmbeddedCollection('Token');
        for (let token of tokens) {
            const tokenFlags = getProperty(token, 'flags.pick-up-stix.pick-up-stix');
            if (!tokenFlags) {
                continue;
            }
            let lootTokens = getLootToken({ itemId: tokenFlags?.itemId, tokenId: token._id });
            for (let lt of lootTokens) {
                if (tokenFlags.isLocked) {
                    lt.drawLock();
                }
                lt.activateListeners();
            }
        }
    }
    for (let item of game.items.values()) {
        if (getProperty(item, 'data.flags.pick-up-stix.pick-up-stix.itemType') === ItemType.CONTAINER) {
            item.data.type = ItemType.CONTAINER;
        }
    }
    //@ts-ignore
    const activeVersion = game.modules.get('pick-up-stix').data.version;
    const previousVersion = game.settings.get('pick-up-stix', SettingKeys.version);
    if (amIFirstGm() && activeVersion !== previousVersion) {
        await game.settings.set('pick-up-stix', SettingKeys.version, activeVersion);
    }
    const diff = versionDiff(activeVersion, previousVersion);
    if (diff < 0) {
        log(`pick-up-stix | readyHook | current version ${activeVersion} is lower than previous version ${previousVersion}`);
    }
    else if (diff > 0) {
        log(`pick-up-stix | readyHook | current version ${activeVersion} is greater than previous version ${previousVersion}`);
    }
    else {
        log(`pick-up-stix | readyHook | current version ${activeVersion} the same as the previous version ${previousVersion}`);
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
    if (amIFirstGm() && !game.settings.get('pick-up-stix', SettingKeys.version13updatemessage)) {
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
    game.socket.on('module.pick-up-stix', handleSocketMessage);
}
;
const createDefaultFolders = async () => {
    log(`pick-up-stix | createDefaultFolders`);
    // check if the parent folder exists and create it if not
    let parentFolderId = game.settings.get('pick-up-stix', SettingKeys.parentItemFolderId);
    let folder = Folder.collection.get(parentFolderId);
    if (!folder) {
        log(`pick-up-stix | createDefaultFolders | couldn't parent folder creating it now`);
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
        log(`pick-up-stix | createDefaultFolders | parent folder '${folder.name}' found`);
    }
    // check if the tokens folder exist and create it if not
    folder = Folder.collection.get(game.settings.get('pick-up-stix', SettingKeys.tokenFolderId));
    if (!folder) {
        log(`pick-up-stix | createDefaultFolders | couldn't find tokens folder, creating it now`);
        //@ts-ignore
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
        log(`pick-up-stix | createDefaultFolders | tokens folder '${folder.name}' found`);
    }
    // check if the items folder exists and create it if not
    folder = Folder.collection.get(game.settings.get('pick-up-stix', SettingKeys.itemFolderId));
    if (!folder) {
        log(`pick-up-stix | createDefaultFolders | couldn't find items folder`);
        //@ts-ignore
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
        log(`pick-up-stix | createDefaultFolders | items folder '${folder.name}' found`);
    }
};
export const handleSocketMessage = async (msg) => {
    log(`pick-up-stix | handleSocketMessage | received socket message with args:`);
    log([msg]);
    if (handleNonGMMessage(msg)) {
        return;
    }
    /* if (msg.sender === game.user.id) {
        log(`pick-up-stix | handleSocketMessage | i sent this, ignoring`);
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
            await updateActor(game.actors.get(msg.data.actorId), msg.data.updates);
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
            error(`pick-up-stix | handleSocketMessage | No valid socket message handler for '${msg.type}' with arg:`);
            log([msg]);
    }
};
const handleNonGMMessage = (msg) => {
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

//# sourceMappingURL=../../../maps/module/pick-up-stix/hooks/ready-hook.js.map
