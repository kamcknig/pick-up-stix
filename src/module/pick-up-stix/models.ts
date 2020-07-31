export type ItemData = {
	id?: string;
	data: any;
	count: number;
};

export interface PickUpStixFlags {
	initialState?: ItemData;
	itemData?: ItemData[];
	isContainer?: boolean;
	imageContainerClosedPath?: string;
	imageContainerOpenPath?: string;
	isOpen?: boolean;
	canClose?: boolean;
	currency?: {
		pp?: number;
		gp?: number;
		ep?: number;
		sp?: number;
		cp?: number;
	};
	isLocked?: boolean;
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