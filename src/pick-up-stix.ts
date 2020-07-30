import {
	initHook,
	readyHook,
	onCanvasReady,
	onPreCreateOwnedItem,
	onRenderTokenHud,
	onUpdateToken,
	onCreateToken
} from "./module/pick-up-stix/hooks";

Hooks.once('init', initHook);
Hooks.on('ready', readyHook);
Hooks.on('canvasReady', onCanvasReady);
Hooks.on('preCreateOnwedItem', onPreCreateOwnedItem);
Hooks.on('renderTokenHUD', onRenderTokenHud);
Hooks.on('createToken', onCreateToken);
Hooks.on('updateToken', onUpdateToken);
