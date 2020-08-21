import {
	initHook,
	readyHook,
	onCanvasReady,
	onPreCreateOwnedItem,
	onUpdateToken,
	onCreateToken,
	onDeleteToken,
	setupHook,
	onRenderDialog,
	onPreCreateItem,
	onCreateItem,
	onCreateActor
} from "./module/pick-up-stix/hooks";
import { processHtml } from "./module/pick-up-stix/settings";

Hooks.once('init', initHook);
Hooks.once('setup', setupHook);
Hooks.on('renderDialog', onRenderDialog);
Hooks.on('canvasReady', onCanvasReady);
Hooks.on('ready', readyHook);
Hooks.on('preCreateItem', onPreCreateItem);
Hooks.on('createItem', onCreateItem);
Hooks.on('createActor', onCreateActor);
Hooks.on('preCreateOwnedItem', onPreCreateOwnedItem);
Hooks.on('createToken', onCreateToken);
Hooks.on('updateToken', onUpdateToken);
Hooks.on("renderSettingsConfig", (app, html, user) => {
  processHtml(html);
});
Hooks.on('deleteToken', onDeleteToken);
