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
	onCreateActor,
	onRenderLootHud
} from "./module/pick-up-stix/hooks";
import { processHtml } from "./module/pick-up-stix/settings";

// game startup hooks
Hooks.once('init', initHook);
Hooks.once('setup', setupHook);
Hooks.on('canvasReady', onCanvasReady);
Hooks.on('ready', readyHook);

// item hooks
Hooks.on('preCreateItem', onPreCreateItem);
Hooks.on('createItem', onCreateItem);

// actor hooks
Hooks.on('createActor', onCreateActor);
Hooks.on('preCreateOwnedItem', onPreCreateOwnedItem);

// token hooks
Hooks.on('createToken', onCreateToken);
Hooks.on('updateToken', onUpdateToken);
Hooks.on('deleteToken', onDeleteToken);

// render hooks
Hooks.on("renderSettingsConfig", (app, html, user) => {
  processHtml(html);
});
Hooks.on('renderLootHud', onRenderLootHud);
Hooks.on('renderDialog', onRenderDialog);
