export type ItemData = {
	id?: string;
	itemData: any;
	count: number;
};

export interface PickUpStixFlags {
	itemType: ItemType;
	initialState: ItemData;
	imageContainerClosedPath: string;
	imageContainerOpenPath: string;
	isOpen: boolean;
	isLocked: boolean;
	containerLoot: {
		currency: {};
		[key: string]: any[] | {};
	}
	canClose?: boolean;
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
	ITEM = 'Item',
	CONTAINER = 'Container'
}
