export const PickUpStixHooks = {
    itemAddedToContainer: 'pick-up-stix.itemAddedToContainer',
    currencyLooted: 'pick-up-stix.currencyLooted',
    itemCollected: 'pick-up-stix.itemCollected',
    lootTokenCreated: 'pick-up-stix.lootTokenCreated',
    itemDroppedOnToken: 'pick-up-stix.itemDroppedOnToken'
};
export var SocketMessageType;
(function (SocketMessageType) {
    SocketMessageType["deleteToken"] = "deleteToken";
    SocketMessageType["updateItem"] = "updateItem";
    SocketMessageType["updateActor"] = "updateActor";
    SocketMessageType["createOwnedItem"] = "createOwnedItem";
    SocketMessageType["createToken"] = "createToken";
    SocketMessageType["createItem"] = "createItem";
    SocketMessageType["deleteItem"] = "deleteItem";
    SocketMessageType["lootTokenCreated"] = "lootTokenCreated";
    SocketMessageType["updateOwnedItem"] = "updateOwnedItem";
    SocketMessageType["deleteOwnedItem"] = "deleteOwnedItem";
    SocketMessageType["updateToken"] = "updateToken";
    SocketMessageType["itemCollected"] = "itemCollected";
    SocketMessageType["collectItem"] = "collectItem";
    SocketMessageType["lootCurrency"] = "lootCurrency";
    SocketMessageType["currencyLooted"] = "currencyLooted";
    SocketMessageType["dropItemOnToken"] = "dropItemOnToken";
    SocketMessageType["addItemToContainer"] = "addItemToContainer";
    SocketMessageType["itemAddedToContainer"] = "itemAddedToContainer";
    SocketMessageType["itemDroppedOnToken"] = "itemDroppedOnToken";
})(SocketMessageType || (SocketMessageType = {}));
export var ItemType;
(function (ItemType) {
    ItemType["NONE"] = "none";
    ItemType["ITEM"] = "item";
    ItemType["CONTAINER"] = "container";
})(ItemType || (ItemType = {}));

//# sourceMappingURL=../../maps/module/pick-up-stix/models.js.map
