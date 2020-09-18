export interface PickUpStixFlags {
	itemType: ItemType;
	itemId: string;

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
