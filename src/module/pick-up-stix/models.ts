export type ItemData = {
	id?: string;
	itemData: any;
	count: number;
};

/* export interface PickUpStixFlags {
	itemType: ItemType;
	initialState: ItemData;
	imageContainerClosedPath: string;
	imageContainerOpenPath: string;
	containerOpenSoundPath: string;
	containerCloseSoundPath: string;
	isOpen: boolean;
	isLocked: boolean;
	containerLoot: ContainerLoot;
	canClose?: boolean;
} */

export interface PickUpStixFlags {
	itemType: ItemType;
	itemData?: ItemData;
	isLocked?: boolean;
	itemId: string;
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
	updateToken,
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
	NONE = 'None',
	ITEM = 'Item',
	CONTAINER = 'Container'
}
