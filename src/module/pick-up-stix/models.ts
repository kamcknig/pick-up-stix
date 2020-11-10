export interface DropData {
	// If the item being dropped comes from an actor token, then the tokenId will be available
	tokenId?: string;

	// If the item being dropped comes from an actor token, then the sceneId that the token
	// is on will be included.
	sceneId?: string;

	// If the item being dropped comes from an actor sheet, then the actorId will be included
	actorId?: string,

	// If the item being droppped comes from a compendium then the pack name will be included
	pack?: string,

	// The ID of the item Entity being dropped
	id?: string,

	// The item Entity's data
	data?:any,

	// If the item Entity being dropped comes from an actor, this will be a reference
	// to the actor Entity it belongs to
	actor?: Actor;

	// x and y postion where the item was dropped, this would need to be converted into world coordinates
	x: number,
	y: number,

	// this is the type that comes from foundry. We'll test for this when dropping on the item config
	// application to ensure we are only accepting the "Item" types
	type?: string
}

export enum SocketMessageType {
	deleteToken = 'deleteToken',
	updateItem = 'updateItem',
	updateActor = 'updateActor',
	createOwnedEntity = 'createOwnedEntity',
	createItemToken = 'createItemToken',
	createEntity = 'createEntity',
	deleteItem = 'deleteItem',
	lootTokenCreated = 'lootTokenCreated',
	updateOwnedItem = "updateOwnedItem",
	deleteOwnedItem = "deleteOwnedItem",
	updateToken = "updateToken",
	itemCollected = 'itemCollected',
	collectItem = 'collectItem',
	lootCurrency = 'lootCurrency',
	currencyLooted = "currencyLooted",
	dropItemOnContainer = "dropItemOnContainer",
	itemDroppedOnContainer = "itemDroppedOnContainer"
}

export interface SocketMessage {
	// user ID of the sender
	sender: string;
	type: SocketMessageType;
	data?: any;
}

export enum ItemType {
	NONE = 'none',
	ITEM = 'item',
	CONTAINER = 'container'
}
