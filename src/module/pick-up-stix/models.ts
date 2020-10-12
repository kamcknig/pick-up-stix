export interface DropData {
	// In Foundry version 0.7.0 and above, this will be included in the dropCanvasData hook.
	// If the item being dropped comes from an actor token, then the tokenId will be available
	tokenId?: string;

	// In Foundry version 0.7.0 and above, this will be included in the dropCanvasData hook.
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

export interface PickUpStixFlags {
	// when creating a new Item Entity to configure for tokens, it's marked as a template
	// these are dummy items that shouldn't live after the token is gone.
	isTemplate?: boolean;

	itemType: ItemType;

	// if the item becomes an owned item, then we need to know who the owner is
	owner?: string;

	// if the item becomes an owned item, then we need to konw the original item ID
	// because it gets removed when it becomes an owned item and new ID is
	// given to the owned item. We need this original ID to determine if the item
	// matches other items such as in containers so that we can stack them properly
	originalItemId?: string;

	// itemId is used when an Item is added to an Actor's inventory. When an Item in
	// Foundry is added to an Actor's inventory, then it ceases to be an Item and
	// becomes an OwnedItem and loses it's original id, the OwnedItem then has a new
	// id. So this keeps track of what the original Item id was so that it can be
	// used elsewhere
	itemId?: string;

	// used to store information about an item while it is represented by a token
	// should only exist on token instances
	itemData?: any;

	isLocked?: boolean;
	container?: {
		soundOpenPath: string;
		soundClosePath: string;
		imageClosePath: string;
		imageOpenPath: string;
		canClose: boolean;
		isOpen: boolean;
		loot?: ContainerLoot;
		currency?: any;
		description?: string;
	}
}

export interface ContainerLoot {
	[key: string]: any[];
}

export enum SocketMessageType {
	deleteToken,
	updateEntity,
	updateActor,
	createOwnedEntity,
	createItemToken
}

export interface PickUpStixSocketMessage {
	// user ID of the sender
	sender: string;
	type: SocketMessageType;
	data: any;
}

export enum ItemType {
	NONE = 'none',
	ITEM = 'item',
	CONTAINER = 'container'
}
