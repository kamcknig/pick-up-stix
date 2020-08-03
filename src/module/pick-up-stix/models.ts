export type ItemData = {
	id?: string;
	itemData: any;
	count: number;
};

export interface PickUpStixFlags {
	itemType: ItemType;
	initialState: ItemData;
	imageOriginalPath: string;
	imageContainerClosedPath: string;
	imageContainerOpenPath: string;
	isOpen: boolean;
	isLocked: boolean;
	containerLoot: {
		[key: string]: any[];
	}





	itemData?: ItemData[];
	canClose?: boolean;
	currency?: {
		pp?: number;
		gp?: number;
		ep?: number;
		sp?: number;
		cp?: number;
	};
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
