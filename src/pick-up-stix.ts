import {
	initHook,
	readyHook,
	onCanvasReady,
	onPreCreateOwnedItem,
	onUpdateToken,
	onCreateToken,
	onPreUpdateToken,
	onDeleteToken
} from "./module/pick-up-stix/hooks";

Hooks.once('init', initHook);
Hooks.on('ready', readyHook);
Hooks.on('canvasReady', onCanvasReady);
Hooks.on('preCreateOwnedItem', onPreCreateOwnedItem);
Hooks.on('createToken', onCreateToken);
Hooks.on('updateToken', onUpdateToken);
Hooks.on('preUpdateToken', onPreUpdateToken);
Hooks.on('deleteToken', onDeleteToken);
