// import { lootTokens } from "../main";

// TODO: is this needed?
export function onDeleteToken(scene: Scene, tokenData: any, data: any, userId: string) {
	console.log(`pick-up-stix | onDeleteToken | called with args:`);
	console.log([scene, tokenData, data, userId]);
	//lootTokens.findSplice(t => t === tokenData._id);
}
