import { loadAdapter, getAdapter } from "./adapter/index.mjs";
import InteractiveItemModel from "./models/InteractiveItemModel.mjs";
import InteractiveItemSheet from "./sheets/InteractiveItemSheet.mjs";
import { registerTokenHUD } from "./hud/InteractiveTokenHUD.mjs";
import { registerPlacement, _handleTokenMoveWithOverlap } from "./canvas/placement.mjs";
import { registerSocket } from "./socket/SocketHandler.mjs";
import { pickupItem, setPlayerPositionOverride, toggleItemIdentification, buildInteractiveItemData, checkProximity, assignContainerParent, setContainerOpen, toggleContainerLocked, getPlayerCandidateTokens } from "./transfer/ItemTransfer.mjs";
import { INTERACTIVE_TYPES } from "./constants.mjs";
export { INTERACTIVE_TYPES } from "./constants.mjs";
import { isInteractiveActor, isInteractiveContainer } from "./utils/actorHelpers.mjs";
import { getItemIIFlags, getItemSourceActorId, isItemLocked, isItemIdentified } from "./utils/itemFlags.mjs";
import { dispatchGM } from "./utils/gmDispatch.mjs";
import { notifyItemAction } from "./utils/notify.mjs";
import { validateContainerAccess, validateItemAccess } from "./utils/containerAccess.mjs";
import { resolvePickupTarget } from "./utils/pickupFlow.mjs";
import { createAdapterHeaderButton, createRowControl } from "./utils/domButtons.mjs";
import { dbg } from "./utils/debugLog.mjs";
import { findCanvasDropTargets } from "./utils/canvasDropTargets.mjs";
import { isModuleGM, isPlayerView } from "./utils/playerView.mjs";
import { hasLevels, getTokenLevelId } from "./utils/levels.mjs";

const MODULE_ID = "pick-up-stix";
const DEFAULT_ICON = `modules/${MODULE_ID}/icons/interactive-item-icon.svg`;
const CHEST_CLOSED = `modules/${MODULE_ID}/icons/treasure-chest-closed.png`;
const CHEST_OPEN = `modules/${MODULE_ID}/icons/treasure-chest-open.png`;

Hooks.once("init", async () => {
  // Register the base data model first so it is in place before loadAdapter()
  // runs. The active system's adapter may overwrite this entry with a more
  // specific subclass (e.g. Pf2eInteractiveItemModel for pf2e) during its
  // constructor, which runs synchronously inside loadAdapter().
  Object.assign(CONFIG.Actor.dataModels, {
    "pick-up-stix.interactiveItem": InteractiveItemModel
  });

  // game.system is available from this point on; dynamically import only the
  // active system's adapter so pf2e users never fetch dnd5e code and vice versa.
  await loadAdapter();
  console.log(`${MODULE_ID} | Initializing Pick-Up-Stix module`);

  const originalGetDefaultArtwork = CONFIG.Actor.documentClass.getDefaultArtwork;
  CONFIG.Actor.documentClass.getDefaultArtwork = function(actorData) {
    if (isInteractiveActor(actorData)) {
      if (actorData?.flags?.[MODULE_ID]?.containerDefault) {
        const icon = game.settings.get?.(MODULE_ID, "defaultContainerImage") || CHEST_CLOSED;
        return { img: icon, texture: { src: icon } };
      }
      return { img: DEFAULT_ICON, texture: { src: DEFAULT_ICON } };
    }
    return originalGetDefaultArtwork.call(this, actorData);
  };

  foundry.documents.collections.Actors.registerSheet(MODULE_ID, InteractiveItemSheet, {
    types: ["pick-up-stix.interactiveItem"],
    makeDefault: true,
    label: "Interactive Object Sheet"
  });

  foundry.applications.handlebars.loadTemplates({
    "pick-up-stix.config-fields": "modules/pick-up-stix/templates/partials/config-fields.hbs",
    "pick-up-stix.config-fields-v1": "modules/pick-up-stix/templates/partials/config-fields-v1.hbs"
  });

  game.settings.register(MODULE_ID, "debugLogging", {
    name: "Debug Logging",
    hint: "Write detailed [PUS] debug logs to the browser console. Turn off for normal play.",
    scope: "client",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, "gmOverrideEnabled", {
    name: "INTERACTIVE_ITEMS.Settings.GMOverrideEnabled.Name",
    hint: "INTERACTIVE_ITEMS.Settings.GMOverrideEnabled.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => _onGMOverrideChanged()
  });

  game.settings.register(MODULE_ID, "actorFolder", {
    name: "INTERACTIVE_ITEMS.Settings.ActorFolder.Name",
    hint: "INTERACTIVE_ITEMS.Settings.ActorFolder.Hint",
    scope: "world",
    config: true,
    type: String,
    default: "",
    onChange: value => _onActorFolderChanged(value)
  });

  game.settings.register(MODULE_ID, "folderColor", {
    name: "INTERACTIVE_ITEMS.Settings.FolderColor.Name",
    hint: "INTERACTIVE_ITEMS.Settings.FolderColor.Hint",
    scope: "world",
    config: true,
    type: String,
    default: "",
    onChange: value => _onFolderColorChanged(value)
  });

  game.settings.register(MODULE_ID, "defaultContainerImage", {
    name: "INTERACTIVE_ITEMS.Settings.DefaultContainerImage.Name",
    hint: "INTERACTIVE_ITEMS.Settings.DefaultContainerImage.Hint",
    scope: "world",
    config: true,
    type: String,
    default: CHEST_CLOSED
  });

  game.settings.register(MODULE_ID, "defaultContainerOpenImage", {
    name: "INTERACTIVE_ITEMS.Settings.DefaultContainerOpenImage.Name",
    hint: "INTERACTIVE_ITEMS.Settings.DefaultContainerOpenImage.Hint",
    scope: "world",
    config: true,
    type: String,
    default: CHEST_OPEN
  });

  game.settings.register(MODULE_ID, "defaultInteractionRange", {
    name: "INTERACTIVE_ITEMS.Settings.DefaultInteractionRange.Name",
    hint: "INTERACTIVE_ITEMS.Settings.DefaultInteractionRange.Hint",
    scope: "world",
    config: true,
    type: Number,
    default: 1
  });

  game.settings.register(MODULE_ID, "defaultInspectionRange", {
    name: "INTERACTIVE_ITEMS.Settings.DefaultInspectionRange.Name",
    hint: "INTERACTIVE_ITEMS.Settings.DefaultInspectionRange.Hint",
    scope: "world",
    config: true,
    type: Number,
    default: 4
  });

  game.settings.register(MODULE_ID, "requireCtrlForDrag", {
    name: "INTERACTIVE_ITEMS.Settings.RequireCtrlForDrag.Name",
    hint: "INTERACTIVE_ITEMS.Settings.RequireCtrlForDrag.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, "ephemeralFolder", {
    // Not shown in config UI — managed programmatically.
    scope: "world",
    config: false,
    type: String,
    default: ""
  });

  game.settings.register(MODULE_ID, "ephemeralFolderVisible", {
    scope: "client",
    config: false,
    type: Boolean,
    default: false
  });

  getAdapter().registerItemContextMenu(_injectItemContextMenuEntries);

  getAdapter().registerActorInventoryHooks(_injectActorInventoryIdentifyToggles);

  // One unified header-controls decorator covers both item and container
  // sheets. Both callbacks point at the same function — it's idempotent on
  // re-render and on the container item sheet (where both hooks fire), it
  // produces identical DOM either time.
  getAdapter().registerItemSheetHooks({ injectHeaderControls: _injectInteractiveSheetHeaderControls });

  getAdapter().registerContainerDropGate(_gateContainerDrop);

  getAdapter().registerContainerViewHooks({
    injectHeaderControls: _injectInteractiveSheetHeaderControls,
    maybeHideContents: _hideContainerSheetContents,
    installActorDropListener: _installContainerSheetActorDrop,
    installItemDropListener: _installContainerSheetItemDrop,
    injectItemRowControls: _injectContainerSheetRowControls,
    injectContentsTab: _injectContainerContentsTab,
  });

  Hooks.on("dropActorSheetData", (actor, sheet, data) => {
    if (!game.user.isGM) return;
    if (isInteractiveActor(actor)) return;
    if (data?.type !== "Actor") return;

    // Fire async without awaiting — must return false synchronously.
    fromUuid(data.uuid).then(async (droppedActor) => {
      if (!droppedActor) return;
      if (!isInteractiveActor(droppedActor)) return;
      if (droppedActor.system.isContainer) {
        ui.notifications.warn(game.i18n.localize("INTERACTIVE_ITEMS.Notify.CannotGiveContainer"));
        return;
      }
      const itemData = buildInteractiveItemData(droppedActor);
      if (!itemData) {
        ui.notifications.warn(game.i18n.localize("INTERACTIVE_ITEMS.Notify.NotInitialized"));
        return;
      }
      await actor.createEmbeddedDocuments("Item", [itemData]);
      ui.notifications.info(game.i18n.format("INTERACTIVE_ITEMS.Notify.Deposited", { name: droppedActor.name }));
    }).catch(err => console.error(`${MODULE_ID} | player-sheet actor drop failed:`, err));

    return false;
  });

  registerTokenHUD();
  registerPlacement();
});

/**
 * Extends the dnd5e item context menu with pick-up-stix entries.
 * Adds a "Drop Item" option for non-interactive actors and a
 * "Reveal / Hide" identification toggle for GM users on interactive items.
 *
 * @param {Item} item - The item whose context menu is being built.
 * @param {object[]} menuItems - The mutable array of menu entries to extend.
 */
function _injectItemContextMenuEntries(item, menuItems) {
  if (!item.actor) return;

  if (!isInteractiveActor(item.actor)) {
    menuItems.push({
      name: "INTERACTIVE_ITEMS.Context.DropItem",
      icon: '<i class="fa-solid fa-arrow-down fa-fw"></i>',
      group: "action",
      condition: () => !!canvas.scene,
      callback: () => _dropItemOnCanvas(item)
    });
  }

  if (!game.user.isGM) return;
  const iiFlags = getItemIIFlags(item);
  if (!iiFlags?.sourceActorId) return;
  const sourceActorId = getItemSourceActorId(item);

  const isIdentified = isItemIdentified(item);
  menuItems.push({
    name: isIdentified
      ? "INTERACTIVE_ITEMS.Context.HideItem"
      : "INTERACTIVE_ITEMS.Context.RevealItem",
    icon: `<i class="fa-solid fa-wand-sparkles fa-fw"></i>`,
    group: "action",
    callback: () => toggleItemIdentification(item)
  });

  // Override dnd5e's "Edit" to open our config sheet instead.
  const editEntry = menuItems.find(e => e.name === "DND5E.ContextMenuActionEdit");
  if (editEntry) {
    editEntry.callback = () => {
      const sourceActor = game.actors.get(sourceActorId);
      if (sourceActor?.sheet?.renderConfig) sourceActor.sheet.renderConfig();
    };
  }
}

/**
 * Injects a wand-icon identification toggle into each inventory row on dnd5e
 * character/NPC sheets for items originating from interactive actors.
 *
 * dnd5e uses both `<img class="item-image">` (raster) and
 * `<dnd5e-icon class="item-image">` (SVG); both share the class so the
 * querySelector catches either.
 *
 * @param {ActorSheet} app - The rendered actor sheet application.
 * @param {HTMLElement|jQuery} html - The sheet's root element.
 */
function _injectActorInventoryIdentifyToggles(app, html) {
  if (!game.user.isGM) return;
  // pf2e (and other systems with hasNativeInventoryIdentify) already render
  // toggle-identified controls on every inventory row — skip ours to avoid
  // duplicating the control.
  if (getAdapter().capabilities.hasNativeInventoryIdentify) return;
  if (isInteractiveActor(app.actor)) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root) return;

  root.querySelectorAll("[data-item-id]").forEach(el => {
    const itemId = el.dataset.itemId;
    const item = app.actor.items.get(itemId);
    if (!item) return;
    const iiFlags = getItemIIFlags(item);
    if (!iiFlags?.sourceActorId) return;

    if (el.querySelector(".pick-up-stix-identify-toggle")) return;

    const isIdentified = isItemIdentified(item);
    const toggle = document.createElement("a");
    toggle.className = `pick-up-stix-identify-toggle ii-row-control${isIdentified ? " active" : ""}`;
    toggle.title = game.i18n.localize(isIdentified
      ? "INTERACTIVE_ITEMS.Context.HideItem"
      : "INTERACTIVE_ITEMS.Context.RevealItem");
    toggle.innerHTML = `<i class="fas fa-wand-sparkles"></i>`;
    toggle.addEventListener("click", async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      await toggleItemIdentification(item);
    });

    const itemRow = el.querySelector(".item-row");
    (itemRow ?? el).appendChild(toggle);
  });
}

/**
 * Resolve the interactive actor associated with a sheet's `app.item`. When
 * the item belongs directly to an interactive actor, that actor is the answer.
 * When the item lives in a player's inventory but was picked up from one,
 * resolve via the `sourceActorId` flag so configure/lock/identify still work
 * on inventory items.
 *
 * @param {Application} app
 * @returns {Actor|null}
 */
function _resolveInteractiveActor(app) {
  const item = app?.item;
  if (!item) return null;
  if (isInteractiveActor(item.actor)) return item.actor;
  const sourceActorId = getItemSourceActorId(item);
  return sourceActorId ? game.actors.get(sourceActorId) : null;
}

/**
 * Resolve the full window root element for a render-hook callback. Foundry V1
 * fires render hooks with the inner `.window-content` jQuery on re-render
 * (only the initial render passes the full window), so we fall back to
 * `app.element[0]` (V1) or `app.element` (V2) when `.window-header` isn't
 * reachable from the hook's html argument.
 *
 * @param {Application} app
 * @param {HTMLElement|null} html
 * @returns {HTMLElement|null}
 */
function _resolveSheetRoot(app, html) {
  if (html?.querySelector?.(".window-header")) return html;
  if (app?.element instanceof HTMLElement) return app.element;
  return app?.element?.[0] ?? null;
}

/**
 * Inject the module's header toggles — open/close (containers only), lock,
 * identify, configure — into a system's native item or container sheet header.
 *
 * Always emits the four buttons in canonical left-to-right order
 * (`open, lock, identify, configure`) regardless of which decorator callback
 * triggered the render. Existing module buttons are removed and re-created on
 * every call so the order stays stable across re-renders.
 *
 * Inserts the group immediately after `.window-title` so the buttons sit on
 * the *left* of any system-injected header buttons (Sheet, Prototype Token,
 * Close on pf2e; ellipsis menu, Close on dnd5e V2). The flex layout pushes
 * system buttons to the far right, leaving our buttons grouped just to the
 * right of the title.
 *
 * Idempotent — both `registerItemSheetHooks` and `registerContainerViewHooks`
 * route here, so on container item sheets where both fire the second call
 * produces the same DOM as the first.
 *
 * @param {object} ctx
 * @param {Actor} [ctx.actor] - Pre-resolved interactive actor (container hook supplies this).
 * @param {Application} ctx.app
 * @param {HTMLElement} ctx.html
 */
function _injectInteractiveSheetHeaderControls({ actor, app, html }) {
  if (!game.user.isGM) return;

  const configActor = isInteractiveActor(actor) ? actor : _resolveInteractiveActor(app);
  if (!configActor) return;

  const root = _resolveSheetRoot(app, html);
  const header = root?.querySelector?.(".window-header");
  if (!header) return;

  // dnd5e injects a `.mode-slider` edit-mode toggle into the header on AppV2
  // sheets — interactive object sheets shouldn't expose that to anyone.
  root.querySelector?.(".mode-slider")?.remove();

  // Remove any existing module toggles so the rebuild produces a stable order.
  // The native identify button (if any) is intentionally NOT in this list —
  // we relocate it into the canonical slot below rather than recreating it.
  header.querySelectorAll(".ii-open-toggle-btn, .ii-lock-toggle-btn, .ii-identify-toggle-btn, .ii-configure-btn")
    .forEach(el => el.remove());

  const adapter = getAdapter();
  const sys = configActor.system;

  // If the system already provides a header-level identify control (e.g.
  // dnd5e's `.toggle-identified` button) reuse it in our canonical slot
  // instead of injecting a duplicate. Moving the live element preserves
  // its event listeners.
  const nativeIdentifySelector = adapter.nativeIdentifyHeaderSelector;
  const nativeIdentifyBtn = nativeIdentifySelector
    ? header.querySelector(nativeIdentifySelector)
    : null;

  const orderedNodes = [];

  if (sys.isContainer) {
    orderedNodes.push(createAdapterHeaderButton({
      adapter,
      extraClass: "ii-open-toggle-btn",
      active: sys.isOpen,
      iconOn: "fa-box-open",
      iconOff: "fa-box",
      labelOnKey: "INTERACTIVE_ITEMS.Sheet.StateOpened",
      labelOffKey: "INTERACTIVE_ITEMS.Sheet.StateClosed",
      onClick: async (ev) => {
        ev.preventDefault();
        await setContainerOpen(configActor, !configActor.system.isOpen);
      }
    }));

  }

  orderedNodes.push(createAdapterHeaderButton({
    adapter,
    extraClass: "ii-lock-toggle-btn",
    active: sys.isLocked,
    iconOn: "fa-lock",
    iconOff: "fa-lock-open",
    labelOnKey: "INTERACTIVE_ITEMS.Sheet.StateLocked",
    labelOffKey: "INTERACTIVE_ITEMS.Sheet.StateUnlocked",
    onClick: (ev) => {
      ev.preventDefault();
      toggleContainerLocked(configActor);
    }
  }));

  if (nativeIdentifyBtn) {
    // Relocate the system's button into our canonical position.
    orderedNodes.push(nativeIdentifyBtn);
  } else {
    const identCfg = adapter.getIdentifyButtonConfig(sys.isIdentified);
    orderedNodes.push(createAdapterHeaderButton({
      adapter,
      extraClass: "ii-identify-toggle-btn",
      active: sys.isIdentified,
      iconOn: identCfg.iconOn,
      iconFamilyOn: identCfg.iconFamilyOn,
      iconOff: identCfg.iconOff,
      iconFamilyOff: identCfg.iconFamilyOff,
      labelOnKey: identCfg.labelOnKey,
      labelOffKey: identCfg.labelOffKey,
      onClick: async (ev) => {
        ev.preventDefault();
        const embeddedItem = configActor.system.embeddedItem;
        if (!embeddedItem) return;
        // Route through the adapter — pf2e opens a DC dialog for unidentified
        // items rather than flipping the flag directly.
        await adapter.performIdentifyToggle(embeddedItem);
      }
    }));
  }

  orderedNodes.push(createAdapterHeaderButton({
    adapter,
    kind: "config",
    extraClass: "ii-configure-btn",
    iconOn: "fa-gear",
    labelOnKey: "INTERACTIVE_ITEMS.Sheet.ConfigureHUD",
    onClick: async (ev) => {
      ev.preventDefault();
      await app.close();
      configActor.sheet.renderConfig();
    }
  }));

  // Insert immediately after the title so buttons sit left of system-injected
  // header controls (Sheet/Prototype Token/Close on pf2e; ellipsis/Close on
  // dnd5e V2). The header's flex layout pushes system buttons to the far right.
  // For the native identify button, `.after(...)` moves it from its previous
  // slot into the canonical position rather than cloning it.
  const title = header.querySelector(".window-title");
  if (title) title.after(...orderedNodes);
  else header.prepend(...orderedNodes);
}

/**
 * Injects pickup, lock, identify, and delete row controls into each item row
 * of the dnd5e ContainerSheet rendered for an interactive container actor.
 *
 * @param {object} ctx
 * @param {Actor} ctx.actor - The interactive container actor owning the container item.
 * @param {Application} ctx.app - The rendered ContainerSheet application.
 * @param {HTMLElement} ctx.html - The sheet's root element.
 */
function _injectContainerSheetRowControls({ actor, app, html }) {
  if (!isInteractiveContainer(actor)) return;

  html.querySelectorAll(".item-list [data-item-id]").forEach(row => {
    const itemId = row.dataset.itemId;
    if (row.querySelector(".ii-row-control, .ii-pickup-btn")) return;

    const item = actor.items.get(itemId);
    const itemRow = row.querySelector(".item-row");
    const target = itemRow || row;

    if (actor.token) {
      const pickupBtn = createRowControl({
        iconClass: "fa-solid fa-hand",
        titleKey: "INTERACTIVE_ITEMS.HUD.PickUp",
        extraClass: "ii-pickup-btn",
        onClick: async () => {
          // Check proximity before lock — distance is more actionable to players.
          if (!checkProximity(actor)) return;
          // Open is not checked: the row only renders while the container is open.
          if (!validateContainerAccess(actor, { checkOpen: false })) return;
          const currentItem = actor.items.get(itemId);
          if (!validateItemAccess(currentItem)) return;

          const targetActor = await resolvePickupTarget(actor);
          if (!targetActor) return;
          const tokenDoc = actor.token;
          if (!tokenDoc) return;
          const sceneId = tokenDoc.parent.id;
          const tokenId = tokenDoc.id;
          await dispatchGM(
            "pickupItem",
            { sceneId, tokenId, itemId, targetActorId: targetActor.id },
            async () => pickupItem(sceneId, tokenId, itemId, targetActor.id)
          );
          if (!game.user.isGM && item) notifyItemAction("PickedUp", item.name);
        }
      });
      target.appendChild(pickupBtn);
    }

    if (isModuleGM() && item) {
      const isInteractive = !!getItemSourceActorId(item);

      if (isInteractive) {
        const isLocked = isItemLocked(item);
        target.appendChild(createRowControl({
          iconClass: `fas ${isLocked ? "fa-lock" : "fa-lock-open"}`,
          titleKey: "INTERACTIVE_ITEMS.Sheet.ToggleLock",
          onClick: async () => {
            await item.update({
              "flags.pick-up-stix.tokenState.system.isLocked": !isLocked
            });
          }
        }));

        target.appendChild(createRowControl({
          iconClass: "fa-solid fa-wand-sparkles",
          titleKey: "INTERACTIVE_ITEMS.Sheet.ToggleIdentified",
          active: getAdapter().isItemIdentified(item),
          onClick: async () => { await toggleItemIdentification(item); }
        }));
      }

      // Delete applies to all items, not just interactive ones.
      target.appendChild(createRowControl({
        iconClass: "fa-solid fa-trash-can",
        titleKey: "INTERACTIVE_ITEMS.Sheet.DeleteItem",
        onClick: async () => { await item.delete({ deleteContents: true }); }
      }));
    }
  });
}

/**
 * Attaches a drop event listener to the dnd5e ContainerSheet that handles
 * Actor drops onto the container. dnd5e's native _onDrop only handles Item and
 * Folder types, so this listener handles the Actor case separately.
 *
 * @param {object} ctx
 * @param {Actor} ctx.actor - The actor owning the container item (may be null for world-level containers).
 * @param {Application} ctx.app - The rendered ContainerSheet application.
 * @param {HTMLElement} ctx.html - The sheet's root element.
 */
/**
 * Wire an Item drop listener onto the container item sheet so dragging a
 * physical item from anywhere (sidebar, character sheet, compendium) deposits
 * it into the interactive container.
 *
 * Skipped on systems that already fire a native item-drop hook on container
 * sheets (dnd5e fires `dnd5e.dropItemSheetData`, gated by `_gateContainerDrop`);
 * pf2e's `ContainerSheetPF2e` has no equivalent so we attach the listener
 * directly. Idempotent across re-renders via the `iiItemDropAttached` marker.
 *
 * Only non-container physical items are accepted — other types are rejected
 * with a notification. Player drops also need open / unlocked / proximity.
 *
 * @param {object} ctx
 * @param {Actor} ctx.actor - The interactive container actor.
 * @param {Application} ctx.app - The rendered container item sheet.
 * @param {HTMLElement} ctx.html - The sheet's root element.
 */
function _installContainerSheetItemDrop({ actor, app, html }) {
  const adapter = getAdapter();
  // dnd5e's own sheet drop hook handles this case; bail to avoid double-handling.
  if (adapter.capabilities.hasItemDropSheetHook) return;
  if (!isInteractiveContainer(actor)) return;

  const destContainerItem = app.item;
  if (!destContainerItem || !adapter.isContainerItem(destContainerItem)) return;

  if (html.dataset.iiItemDropAttached) return;
  html.dataset.iiItemDropAttached = "1";

  html.addEventListener("drop", async (event) => {
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    if (data?.type !== "Item") return;

    event.preventDefault();
    event.stopPropagation();

    const droppedItem = await fromUuid(data.uuid);
    if (!droppedItem) {
      dbg("place:_installContainerSheetItemDrop", "could not resolve dropped item", { uuid: data.uuid });
      return;
    }

    if (!adapter.isPhysicalItem(droppedItem)) {
      ui.notifications.warn(game.i18n.localize("INTERACTIVE_ITEMS.Notify.NotPhysical"));
      return;
    }
    if (adapter.isContainerItem(droppedItem)) {
      ui.notifications.warn(game.i18n.localize("INTERACTIVE_ITEMS.Notify.NoContainerInContainer"));
      return;
    }

    if (isPlayerView() && !validateContainerAccess(actor, { checkOpen: true })) return;

    // Only the GM can write to actors players don't own; route through the
    // socket on the player path so the active GM creates the embedded item.
    if (!game.user.isGM) {
      // Fallback: ask GM via socket. For now players can't deposit on the
      // sheet directly — this can be wired through gmDispatch later if needed.
      ui.notifications.warn(game.i18n.localize("INTERACTIVE_ITEMS.Notify.NotPhysical"));
      return;
    }

    const itemData = droppedItem.toObject();
    delete itemData._id;
    adapter.setItemContainerId(itemData, destContainerItem.id);

    try {
      await CONFIG.Item.documentClass.createDocuments([itemData], { parent: actor, keepId: false });
      // Move semantics — if the drag had a source actor, remove the original
      // so quantities don't double up. World items (no parent actor) and items
      // already on this container actor are left alone.
      if (droppedItem.actor && droppedItem.actor.id !== actor.id) {
        await droppedItem.delete();
      }
      ui.notifications.info(game.i18n.format("INTERACTIVE_ITEMS.Notify.Deposited", { name: itemData.name }));
    } catch (err) {
      console.error("pick-up-stix | failed to deposit item on container sheet:", err);
    }
  });
}

function _installContainerSheetActorDrop({ actor, app, html }) {
  const destContainerItem = app.item;
  // Delegate item-type check to the adapter so the literal "container" is not
  // hard-coded to the dnd5e vocabulary.
  if (!destContainerItem || !getAdapter().isContainerItem(destContainerItem)) return;

  if (html.dataset.iiActorDropAttached) return;
  html.dataset.iiActorDropAttached = "1";

  html.addEventListener("drop", async (event) => {
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    if (data?.type !== "Actor") return;

    const droppedActor = await fromUuid(data.uuid);
    if (!isInteractiveActor(droppedActor)) return;

    if (droppedActor.system.isContainer) {
      ui.notifications.warn(game.i18n.localize("INTERACTIVE_ITEMS.Notify.NoContainerInContainer"));
      return;
    }

    const destActor = destContainerItem.actor;
    const destIsInteractive = isInteractiveContainer(destActor);

    if (destIsInteractive && isPlayerView()) {
      if (!validateContainerAccess(destActor, { checkProximity: true })) return;
    }

    // Players can't see sidebar actors, but gate explicitly in case that ever changes.
    if (!destIsInteractive && isPlayerView()) return;

    const itemData = buildInteractiveItemData(droppedActor);
    if (!itemData) {
      ui.notifications.warn(game.i18n.localize("INTERACTIVE_ITEMS.Notify.NotInitialized"));
      return;
    }

    // Delegate container-parent field write to the adapter so the field path
    // is not hard-coded to dnd5e's `system.container`.
    getAdapter().setItemContainerId(itemData, destContainerItem.id);

    if (destActor) {
      await CONFIG.Item.documentClass.createDocuments([itemData], { parent: destActor, keepId: false });
    } else {
      await CONFIG.Item.documentClass.createDocuments([itemData], { keepId: false }); // world-level container
    }
    ui.notifications.info(game.i18n.format("INTERACTIVE_ITEMS.Notify.Deposited", { name: itemData.name }));
  });
}

/**
 * Hides the contents list in the dnd5e ContainerSheet when a non-GM viewer is
 * outside interaction range or the container is closed, replacing it with a
 * placeholder message.
 *
 * Targets the outer `.items-list` wrapper — replacing its children hides all
 * categories at once while preserving currency/search/encumbrance siblings and
 * the description tab.
 *
 * @param {object} ctx
 * @param {Actor} ctx.actor - The interactive container actor owning the container item.
 * @param {Application} ctx.app - The rendered ContainerSheet application.
 * @param {HTMLElement} ctx.html - The sheet's root element.
 */
function _hideContainerSheetContents({ actor, app, html }) {
  if (isModuleGM()) return;
  if (!isInteractiveContainer(actor)) return;

  if (actor.system.isOpen && checkProximity(actor, { silent: true, range: "interaction" })) return;

  const tab = html.querySelector('section.inventory.tab[data-tab="contents"]');
  if (!tab) return;

  const message = actor.system.isOpen
    ? game.i18n.localize("INTERACTIVE_ITEMS.Container.ContentsHidden")
    : game.i18n.localize("INTERACTIVE_ITEMS.Notify.ContainerClosed");

  // dnd5e contents tab also exposes a treasure/currency row and a
  // search/filter/sort bar above the items list — both leak inventory
  // information when the player is out of interaction range, so hide them
  // alongside the items grid.
  tab.querySelector('section.currency')?.remove();
  tab.querySelector('.middle')?.remove();

  const list = tab.querySelector('.items-list');
  if (!list) return;

  list.replaceChildren();
  const placeholder = document.createElement("div");
  placeholder.className = "pick-up-stix-contents-hidden";
  placeholder.textContent = message;
  list.append(placeholder);
}

/**
 * Per-app tracking for whether the user is currently viewing the injected
 * Contents tab. Needed because Foundry V1's `_activateCoreListeners` calls
 * `Tabs.bind()` *before* our render-hook decorator runs, so `Tabs.activate`
 * can't see our injected nav link and falls back to the first tab —
 * silently corrupting `Tabs.active` to `"description"`. We restore the
 * user's intent post-injection by checking this map.
 *
 * Keyed by the app instance (WeakMap so entries clear when sheets close).
 *
 * @type {WeakMap<Application, boolean>}
 */
const _activeContentsTabByApp = new WeakMap();

/**
 * Inject a "Contents" tab into the system's container item-sheet between the
 * native Description and Details tabs, then render deposited inventory rows
 * inside it. Targets pf2e's tab markup (`<nav class="sheet-tabs">
 * <div class="tabs" data-tab-container="primary">`); the function no-ops on
 * dnd5e (which has no matching selector) so the native dnd5e contents grid is
 * untouched.
 *
 * Re-activates the Contents tab after injection when the user was previously
 * viewing it — see `_activeContentsTabByApp` for the rationale.
 *
 * @param {object} ctx
 * @param {Actor} ctx.actor - The interactive container actor owning the container item.
 * @param {Application} ctx.app - The rendered container item sheet application.
 * @param {HTMLElement} ctx.html - The sheet's root element (or inner content on V1 re-render).
 */
function _injectContainerContentsTab({ actor, app, html }) {
  if (!isInteractiveContainer(actor)) return;

  const root = _resolveSheetRoot(app, html);
  if (!root) return;

  // Locate pf2e's primary tabs container. dnd5e's ContainerSheet uses a
  // different markup, so this selector failing means we're on a non-pf2e
  // container view and we silently no-op.
  const tabsNav = root.querySelector('.sheet-tabs .tabs[data-tab-container="primary"]');
  if (!tabsNav) return;

  const descriptionLink = tabsNav.querySelector('a[data-tab="description"]');
  if (!descriptionLink) return;

  // Inject the nav link if it isn't already present (idempotent across re-renders).
  if (!tabsNav.querySelector('a[data-tab="ii-contents"]')) {
    const link = document.createElement("a");
    link.className = "list-row";
    link.dataset.tab = "ii-contents";
    link.textContent = game.i18n.localize("INTERACTIVE_ITEMS.Sheet.Tab.Contents");
    descriptionLink.after(link);
  }

  const sheetBody = root.querySelector('.sheet-body');
  if (!sheetBody) return;

  // Reuse the section element across re-renders so Foundry's Tabs controller
  // keeps tracking `.active` on it; only the inner row list is rebuilt.
  let section = sheetBody.querySelector('section.tab[data-tab="ii-contents"]');
  if (!section) {
    const descriptionSection = sheetBody.querySelector('section.tab[data-tab="description"]');
    section = document.createElement("section");
    section.className = "tab ii-contents";
    section.dataset.tab = "ii-contents";
    descriptionSection?.after(section);
  }

  _renderContainerContents(section, actor, app.item);

  // Track which tab the user is on. The nav was rebuilt by V1's _replaceHTML,
  // so we (re)attach a delegated click handler each render. The previous nav
  // (and its handler) was discarded with the old DOM, so no leak.
  tabsNav.addEventListener("click", (event) => {
    const tab = event.target.closest("a[data-tab]");
    if (!tab) return;
    if (tab.dataset.tab === "ii-contents") {
      _activeContentsTabByApp.set(app, true);
    } else {
      _activeContentsTabByApp.delete(app);
    }
  });

  // Restore Contents activation when the user was viewing it before re-render.
  // pf2e's Tabs.bind() ran before us with our nav link absent, so it activated
  // "description" as a fallback. Now that our nav link exists, switch back.
  if (_activeContentsTabByApp.get(app)) {
    const primaryTabs = app._tabs?.[0];
    if (primaryTabs) {
      primaryTabs.activate("ii-contents");
    } else {
      tabsNav.querySelectorAll('a[data-tab]').forEach(a =>
        a.classList.toggle("active", a.dataset.tab === "ii-contents")
      );
      sheetBody.querySelectorAll('section.tab[data-tab]').forEach(s =>
        s.classList.toggle("active", s.dataset.tab === "ii-contents")
      );
    }
  }
}

/**
 * Build (or rebuild) the deposited-items list inside the Contents tab. Reads
 * the live actor inventory and emits one row per child item whose
 * `containerId` matches the wrapped container item.
 *
 * Row layout mirrors the pf2e inventory line: image, name, quantity, bulk,
 * lock / identify / configure / delete controls. Controls have no behaviour
 * yet — they're rendered for visual parity only.
 *
 * @param {HTMLElement} section - The `<section data-tab="ii-contents">` to fill.
 * @param {Actor} actor - The interactive container actor.
 * @param {Item} containerItem - The embedded backpack item whose id is the parent pointer.
 */
function _renderContainerContents(section, actor, containerItem) {
  const adapter = getAdapter();
  section.replaceChildren();

  // Mirror the dnd5e contents-hiding gate (`_hideContainerSheetContents`):
  // non-GM viewers see a placeholder when the container is closed/locked OR
  // when they're outside interaction range. The sheet remains accessible
  // for description/details viewing as long as they're within inspection range.
  if (!isModuleGM()) {
    const open = actor.system.isOpen;
    const inRange = checkProximity(actor, { silent: true, range: "interaction" });
    if (!open || !inRange) {
      const placeholder = document.createElement("div");
      placeholder.className = "pick-up-stix-contents-hidden";
      placeholder.textContent = open
        ? game.i18n.localize("INTERACTIVE_ITEMS.Container.ContentsHidden")
        : game.i18n.localize("INTERACTIVE_ITEMS.Notify.ContainerClosed");
      section.append(placeholder);
      return;
    }
  }

  const containedItems = actor.items.filter(i => {
    if (i.id === containerItem.id) return false;
    return adapter.getItemContainerId(i) === containerItem.id;
  });

  // Pickup is only meaningful on placed-token sheets — the hand glyph is
  // rendered on rows when the wrapping actor is synthetic. The base-actor
  // sheet in the sidebar holds the *template* of a container, so picking up
  // a row from there has no game-world meaning. The header's controls-spacer
  // width also depends on this so the columns line up with the data rows.
  const isTokenActor = !!(actor.isToken ?? actor.token ?? (actor.parent?.documentName === "Token"));

  // Column headers above the list. Image and controls columns get blank
  // spacers so the header text aligns with the data rows below.
  section.append(_buildContainerContentsHeader({ isTokenActor }));

  const list = document.createElement("ol");
  list.className = "ii-contents-list";

  if (containedItems.length === 0) {
    const empty = document.createElement("li");
    empty.className = "ii-contents-empty";
    empty.textContent = game.i18n.localize("INTERACTIVE_ITEMS.Container.Empty");
    list.append(empty);
    section.append(list);
    return;
  }

  for (const item of containedItems) {
    list.append(_buildContainerContentRow(item, adapter, { isTokenActor }));
  }
  section.append(list);
}

/**
 * Build the column-header row that sits above the contents list. Reuses the
 * row's flex layout so columns line up — empty spacers fill the image and
 * controls columns. The controls spacer's width is selected via the modifier
 * class `.is-token` (4 icons) vs default (3 icons) so the data columns
 * remain aligned across token-sheet vs actor-sheet renders.
 *
 * @param {object} [options]
 * @param {boolean} [options.isTokenActor=false]
 * @returns {HTMLDivElement}
 */
function _buildContainerContentsHeader({ isTokenActor = false } = {}) {
  const header = document.createElement("div");
  header.className = "ii-contents-row ii-contents-header";

  const imgSpacer = document.createElement("span");
  imgSpacer.className = "ii-contents-img-spacer";
  header.append(imgSpacer);

  const name = document.createElement("span");
  name.className = "ii-contents-name";
  name.textContent = game.i18n.localize("INTERACTIVE_ITEMS.Sheet.Name");
  header.append(name);

  const bulk = document.createElement("span");
  bulk.className = "ii-contents-bulk";
  bulk.textContent = game.i18n.localize("INTERACTIVE_ITEMS.Sheet.Bulk");
  header.append(bulk);

  const controlsSpacer = document.createElement("span");
  controlsSpacer.className = `ii-contents-controls-spacer${isTokenActor ? " is-token" : ""}`;
  header.append(controlsSpacer);

  return header;
}

/**
 * Build one inventory-style row representing an item inside the container.
 * Icons (lock / identify / configure / delete) are decorative for now — the
 * caller wires no click handlers per the current spec.
 *
 * @param {Item} item
 * @param {SystemAdapter} adapter
 * @returns {HTMLLIElement}
 */
function _buildContainerContentRow(item, adapter, { isTokenActor = false } = {}) {
  const row = document.createElement("li");
  row.className = "ii-contents-row";
  row.dataset.itemId = item.id;
  row.dataset.itemUuid = item.uuid;

  // Native Foundry drag payload — destinations (canvas, character sheets,
  // other containers) consume `{type:"Item", uuid}` and either move the item
  // (sheet drops) or hand off to our `dropCanvasData` placement flow, which
  // already deletes the source item from its actor after placement.
  row.draggable = true;
  row.addEventListener("dragstart", (event) => {
    const payload = { type: "Item", uuid: item.uuid };
    event.dataTransfer.setData("text/plain", JSON.stringify(payload));
    event.dataTransfer.effectAllowed = "all";
    dbg("contents:dragstart", { itemName: item.name, itemId: item.id, uuid: item.uuid });
  });

  const img = document.createElement("img");
  img.className = "ii-contents-img";
  img.src = item.img;
  img.alt = item.name;
  row.append(img);

  const name = document.createElement("span");
  name.className = "ii-contents-name";
  name.textContent = item.name;
  row.append(name);

  const bulk = document.createElement("span");
  bulk.className = "ii-contents-bulk";
  bulk.textContent = _formatItemBulk(item);
  row.append(bulk);

  const controls = document.createElement("span");
  controls.className = "ii-contents-controls";

  // Pickup glyph — token-only. Sits left of the lock icon. Mirrors the
  // pickup flow used by the dnd5e ContainerSheet row controls: proximity →
  // container access (open/lock) → per-item lock → resolve the recipient
  // (controlled token / assigned character) → route through the GM via
  // socket if the clicker is a player.
  if (isTokenActor) {
    const containerActor = item.actor;
    controls.append(_buildContentRowControl(
      "fa-hand",
      "INTERACTIVE_ITEMS.HUD.PickUp",
      "fa-solid",
      async () => {
        // Distance is the most actionable failure for players to understand,
        // so check it first.
        if (!checkProximity(containerActor)) return;
        // Container open is implied (the row only shows when the sheet is
        // open) but the lock state still needs gating.
        if (!validateContainerAccess(containerActor, { checkOpen: false })) return;
        const currentItem = containerActor.items.get(item.id);
        if (!validateItemAccess(currentItem)) return;

        const targetActor = await resolvePickupTarget(containerActor);
        if (!targetActor) return;
        const tokenDoc = containerActor.token;
        if (!tokenDoc) return;
        const sceneId = tokenDoc.parent.id;
        const tokenId = tokenDoc.id;
        dbg("contents:pickupRow", { itemName: item.name, itemId: item.id, sceneId, tokenId, targetActorId: targetActor.id });
        await dispatchGM(
          "pickupItem",
          { sceneId, tokenId, itemId: item.id, targetActorId: targetActor.id },
          async () => pickupItem(sceneId, tokenId, item.id, targetActor.id)
        );
        if (!game.user.isGM) notifyItemAction("PickedUp", item.name);
      }
    ));
  }

  // Lock / identify / delete — Lock and identify reflect the live state on
  // the item; delete is wired below.
  const isLocked = !!item.flags?.["pick-up-stix"]?.tokenState?.system?.isLocked;
  controls.append(_buildContentRowControl(
    isLocked ? "fa-lock" : "fa-lock-open",
    "INTERACTIVE_ITEMS.Sheet." + (isLocked ? "StateLocked" : "StateUnlocked"),
    "fa-solid",
    async () => {
      if (!game.user.isGM) return;
      dbg("contents:lockRow", { itemName: item.name, itemId: item.id, currentlyLocked: isLocked });
      // Lock state lives in the same flag the dnd5e ContainerSheet row controls
      // use, keeping the per-item lock semantics consistent across systems.
      await item.update({ "flags.pick-up-stix.tokenState.system.isLocked": !isLocked });
    }
  ));

  const isIdentified = adapter.isItemIdentified(item);
  const identCfg = adapter.getIdentifyButtonConfig(isIdentified);
  const identIcon = isIdentified ? identCfg.iconOn : identCfg.iconOff;
  const identFamily = isIdentified
    ? (identCfg.iconFamilyOn ?? "fa-solid")
    : (identCfg.iconFamilyOff ?? "fa-solid");
  controls.append(_buildContentRowControl(
    identIcon,
    isIdentified ? identCfg.labelOnKey : identCfg.labelOffKey,
    identFamily,
    async () => {
      if (!game.user.isGM) return;
      dbg("contents:identifyRow", { itemName: item.name, itemId: item.id, currentlyIdentified: isIdentified });
      // Adapter routing handles pf2e's mystify-popup vs direct setIdentified
      // distinction; the updateItem hook re-renders the container sheet so
      // the row's icon and tooltip refresh with the new state.
      await adapter.performIdentifyToggle(item);
    }
  ));

  // Delete is the only currently-active control on contents rows. GM-only —
  // players see the icon but the click no-ops for them. The deleteItem hook
  // re-renders the container sheet automatically, so the row disappears.
  controls.append(_buildContentRowControl(
    "fa-trash",
    "INTERACTIVE_ITEMS.Sheet.DeleteItem",
    "fa-solid",
    async () => {
      if (!game.user.isGM) return;
      dbg("contents:deleteRow", { itemName: item.name, itemId: item.id, actorName: item.actor?.name });
      await item.delete();
    }
  ));

  row.append(controls);
  return row;
}

/**
 * Build a single inventory-row control glyph (anchor with FontAwesome icon).
 *
 * @param {string} icon - FontAwesome icon class (e.g. `fa-lock`).
 * @param {string} tooltipKey - i18n key for the hover tooltip.
 * @param {string} [family="fa-solid"] - FontAwesome family class.
 * @param {((event: MouseEvent) => void)|null} [onClick=null] - Optional click handler.
 *   When provided, the click event has `preventDefault` + `stopPropagation` called
 *   on it before invocation so it doesn't bubble to pf2e's row-level handlers.
 * @returns {HTMLAnchorElement}
 */
function _buildContentRowControl(icon, tooltipKey, family = "fa-solid", onClick = null) {
  const a = document.createElement("a");
  a.className = "ii-contents-control";
  const tooltip = game.i18n.localize(tooltipKey);
  a.dataset.tooltip = tooltip;
  a.setAttribute("aria-label", tooltip);
  a.innerHTML = `<i class="${family} ${icon}"></i>`;
  if (onClick) {
    a.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      return onClick(event);
    });
  }
  return a;
}

/**
 * Format an item's bulk for display. pf2e uses `system.bulk.value` where 0
 * means negligible and 0.1 means light ("L" in the rules). Numbers >= 1 are
 * displayed as integers.
 *
 * @param {Item} item
 * @returns {string}
 */
function _formatItemBulk(item) {
  const v = item.system?.bulk?.value;
  if (v == null) return "—";
  if (v === 0) return "—";
  if (v < 1) return "L";
  return String(v);
}

/**
 * Handles dnd5e's container-drop gate. Called when an item is dropped onto a
 * ContainerSheet; routes player deposits through the socket and cancels dnd5e's
 * native handling for player users.
 *
 * @param {object} ctx
 * @param {Actor} ctx.actor - The actor owning the container item.
 * @param {Item} ctx.item - The container item receiving the drop.
 * @param {Application} ctx.sheet - The ContainerSheet application.
 * @param {object} ctx.data - The drag event data payload.
 * @returns {false|undefined} Returns `false` to cancel dnd5e's native drop handling for players.
 */
function _gateContainerDrop({ actor, item, sheet, data }) {
  if (!isInteractiveContainer(actor)) return;

  if (isPlayerView()) {
    if (!validateContainerAccess(actor, { checkProximity: true })) return false;

    // Players can't create items on OBSERVER-level actors — route through socket.
    // Fire async then return false synchronously to cancel dnd5e's native handling.
    (async () => {
      const droppedItem = await fromUuid(data.uuid);
      if (!droppedItem) return;
      const sourceActor = droppedItem.actor;
      if (!sourceActor) return;
      const tokenDoc = actor.token;
      if (!tokenDoc) return;
      dispatchGM(
        "depositItem",
        { sourceActorId: sourceActor.id, itemId: droppedItem.id, sceneId: tokenDoc.parent.id, tokenId: tokenDoc.id },
        () => {} // unreachable: isGM is false in this branch
      );
      notifyItemAction("Deposited", droppedItem.name);
    })();
    return false;
  }
}

Hooks.on("renderSettingsConfig", (app, html) => {
  const input = html.querySelector(`[name="${MODULE_ID}.actorFolder"]`);
  if (!input) return;

  const currentValue = input.value;
  const currentFolder = currentValue ? game.folders.get(currentValue) : null;

  const wrapper = document.createElement("div");
  wrapper.classList.add("ii-settings-folder-picker");

  const textInput = document.createElement("input");
  textInput.type = "text";
  textInput.placeholder = game.i18n.localize("INTERACTIVE_ITEMS.Settings.ActorFolder.Placeholder");
  textInput.classList.add("ii-settings-folder-field");

  const select = document.createElement("select");
  select.classList.add("ii-settings-folder-field");

  const emptyOpt = document.createElement("option");
  emptyOpt.value = "";
  emptyOpt.textContent = `\u2014 ${game.i18n.localize("INTERACTIVE_ITEMS.Settings.ActorFolder.Existing")} \u2014`;
  select.appendChild(emptyOpt);

  for (const folder of game.folders.filter(f => f.type === "Actor").sort((a, b) => a.name.localeCompare(b.name))) {
    const opt = document.createElement("option");
    opt.value = folder.id;
    opt.textContent = folder.name;
    if (folder.id === currentValue) opt.selected = true;
    select.appendChild(opt);
  }

  const hidden = document.createElement("input");
  hidden.type = "hidden";
  hidden.name = input.name;
  hidden.value = currentValue;

  if (currentFolder) textInput.value = currentFolder.name;

  select.addEventListener("change", () => {
    if (select.value) {
      const folder = game.folders.get(select.value);
      textInput.value = folder?.name ?? "";
      hidden.value = select.value;
    }
  });

  textInput.addEventListener("input", () => {
    select.value = "";
    hidden.value = textInput.value;
  });

  wrapper.appendChild(textInput);
  wrapper.appendChild(select);
  input.replaceWith(wrapper);
  wrapper.parentNode.insertBefore(hidden, wrapper.nextSibling);

  for (const key of ["defaultContainerImage", "defaultContainerOpenImage"]) {
    const imgInput = html.querySelector(`[name="${MODULE_ID}.${key}"]`);
    if (!imgInput) continue;
    const fp = document.createElement("file-picker");
    fp.setAttribute("name", imgInput.name);
    fp.setAttribute("type", "image");
    fp.setAttribute("value", imgInput.value);
    imgInput.replaceWith(fp);
  }

  const colorInput = html.querySelector(`[name="${MODULE_ID}.folderColor"]`);
  if (colorInput) {
    const picker = document.createElement("input");
    picker.type = "color";
    picker.name = colorInput.name;
    picker.value = colorInput.value || "#000000";
    picker.classList.add("ii-settings-color-picker");
    colorInput.replaceWith(picker);
  }
});

Hooks.on("preCreateToken", (tokenDoc, data, options, userId) => {
  dbg("hook:preCreateToken", { actorId: data.actorId, actorLink: data.actorLink });
  const actor = game.actors.get(data.actorId);
  if (!isInteractiveActor(actor)) {
    dbg("hook:preCreateToken", "not interactive, bail");
    return;
  }
  if (data.actorLink) {
    dbg("hook:preCreateToken", "actorLink=true, bail");
    return;
  }
  if (!actor.system.isContainer && actor.items.size === 0) {
    dbg("hook:preCreateToken", "item-type actor with no items, blocking placement", { actorName: actor.name });
    ui.notifications.warn(game.i18n.localize("INTERACTIVE_ITEMS.Notify.NotInitialized"));
    return false;
  }
  const savedState = data.flags?.["pick-up-stix"]?.savedState;
  dbg("hook:preCreateToken", {
    actorName: actor.name,
    actorId: actor.id,
    isContainer: actor.system.isContainer,
    hasSavedState: !!savedState,
    itemCount: actor.items.size,
    actorImg: actor.img
  });
  const source = savedState ?? { name: actor.name, img: actor.img, system: actor.toObject().system };
  const delta = {
    name: source.name,
    img: source.img,
    system: source.system
  };
  if (actor.items.size > 0) {
    delta.items = actor.items.map(i => i.toObject());
  }
  const updates = {
    delta,
    flags: {
      "pick-up-stix": {
        snapshotItemIds: Array.from(actor.items.keys())
      }
    }
  };
  if (savedState) {
    updates.name = source.name;
  }
  const system = source.system;
  const isContainer = actor.system.isContainer;
  if (isContainer && system.isOpen && system.openImage) {
    updates.texture = { src: system.openImage };
  }
  // actor.system.isIdentified is a getter — not present on toObject()'s plain object.
  if (!isContainer && !actor.system.isIdentified && system.unidentifiedImage) {
    updates.texture = { src: system.unidentifiedImage };
  }
  updates.sort = -1;
  tokenDoc.updateSource(updates);
});

Hooks.on("preUpdateToken", (tokenDoc, changes, options, userId) => {
  if (!("x" in changes || "y" in changes)) return;
  if (userId !== game.user.id) return;
  if (!game.user.isGM) return;
  if (options.interactiveItems?.bypassOverlapCheck) return; // our own re-apply via _handleTokenMoveWithOverlap

  const actor = tokenDoc.actor;
  if (!actor || !isInteractiveActor(actor)) return;
  if (isInteractiveContainer(actor)) return; // containers move freely

  const newX = changes.x ?? tokenDoc.x;
  const newY = changes.y ?? tokenDoc.y;
  // v14: a token can only overlap deposit targets on the same level it's moving to.
  // Use the destination level from `changes.level` if present, else the token's current level.
  const newLevel = hasLevels() ? (changes.level ?? getTokenLevelId(tokenDoc)) : null;
  const overlapTargets = findCanvasDropTargets(newX, newY, { sourceActorId: actor.id, level: newLevel });

  if (!overlapTargets.length) {
    dbg("hook:preUpdateToken", "no overlap targets, allow move");
    return;
  }

  dbg("hook:preUpdateToken", "overlap found, cancelling move, prompting user",
    { actorName: actor.name, count: overlapTargets.length });
  _handleTokenMoveWithOverlap(tokenDoc, changes, overlapTargets)
    .catch(err => console.error(`${MODULE_ID} | Token move-overlap flow failed:`, err));
  return false; // cancel the update
});

Hooks.on("deleteToken", async (tokenDoc, options, userId) => {
  if (!game.user.isGM) return;
  const actor = game.actors.get(tokenDoc.actorId);
  if (!actor) return;
  if (!actor.getFlag("pick-up-stix", "ephemeral")) return;

  const hasOtherTokens = game.scenes.some(scene =>
    scene.tokens.some(t => t.id !== tokenDoc.id && t.actorId === actor.id)
  );
  if (hasOtherTokens) {
    console.log(`${MODULE_ID} | deleteToken: ephemeral actor "${actor.name}" (${actor.id}) still referenced by other tokens — skipping cleanup`);
    return;
  }

  console.log(`${MODULE_ID} | deleteToken: deleting ephemeral actor "${actor.name}" (${actor.id})`);
  await actor.delete();
  console.log(`${MODULE_ID} | deleteToken: ephemeral actor deleted`);
});

Hooks.on("preCreateActor", (actor, data, options, userId) => {
  dbg("hook:preCreateActor", { name: data.name, type: data.type, userId });
  if (!isInteractiveActor(actor)) {
    dbg("hook:preCreateActor", "not interactive, bail");
    return;
  }
  dbg("hook:preCreateActor", "applying defaults", {
    containerDefault: !!data.flags?.[MODULE_ID]?.containerDefault,
    ephemeral: !!data.flags?.[MODULE_ID]?.ephemeral,
    existingInteractionRange: foundry.utils.getProperty(data, "system.interactionRange"),
    existingInspectionRange: foundry.utils.getProperty(data, "system.inspectionRange")
  });

  const updates = {
    "ownership.default": CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER,
    "prototypeToken.sight.enabled": false,
    "prototypeToken.disposition": CONST.TOKEN_DISPOSITIONS.NEUTRAL,
    "prototypeToken.displayBars": CONST.TOKEN_DISPLAY_MODES.NONE,
    "prototypeToken.displayName": CONST.TOKEN_DISPLAY_MODES.HOVER,
    "prototypeToken.actorLink": false,
    "prototypeToken.sort": -1
  };

  if (data.flags?.[MODULE_ID]?.containerDefault) {
    const openImg = game.settings.get(MODULE_ID, "defaultContainerOpenImage") || CHEST_OPEN;
    if (!data.system?.openImage) {
      updates["system.openImage"] = openImg;
    }
  }

  if (!actor.folder) {
    const isEphemeral = !!data.flags?.[MODULE_ID]?.ephemeral;
    const targetFolderId = isEphemeral
      ? game.settings.get(MODULE_ID, "ephemeralFolder")
      : game.settings.get(MODULE_ID, "actorFolder");
    if (targetFolderId && game.folders.get(targetFolderId)) {
      updates.folder = targetFolderId;
    }
  }

  const existingInteraction = foundry.utils.getProperty(data, "system.interactionRange");
  if (existingInteraction === undefined) {
    updates["system.interactionRange"] = game.settings.get(MODULE_ID, "defaultInteractionRange");
  }

  const existingInspection = foundry.utils.getProperty(data, "system.inspectionRange");
  if (existingInspection === undefined) {
    updates["system.inspectionRange"] = game.settings.get(MODULE_ID, "defaultInspectionRange");
  }

  const finalInteraction = updates["system.interactionRange"] ?? data.system?.interactionRange;
  const finalInspection = updates["system.inspectionRange"] ?? data.system?.inspectionRange;
  if (finalInteraction != null && finalInspection != null && finalInteraction > finalInspection) {
    updates["system.interactionRange"] = finalInspection;
  }

  actor.updateSource(updates);
});

Hooks.on("preUpdateActor", (actor, changes, options, userId) => {
  dbg("hook:preUpdateActor", { name: actor.name, id: actor.id, systemChangeKeys: Object.keys(changes.system ?? {}) });
  if (!isInteractiveActor(actor)) {
    dbg("hook:preUpdateActor", "not interactive, bail");
    return;
  }
  const sys = changes.system;
  if (!sys || (!("interactionRange" in sys) && !("inspectionRange" in sys))) {
    dbg("hook:preUpdateActor", "no range fields in changes, bail");
    return;
  }

  const nextInteraction = "interactionRange" in sys ? sys.interactionRange : actor.system.interactionRange;
  const nextInspection = "inspectionRange" in sys ? sys.inspectionRange : actor.system.inspectionRange;

  if (nextInteraction > nextInspection) {
    foundry.utils.setProperty(changes, "system.interactionRange", nextInspection);
  }
});

Hooks.on("createActor", async (actor, options, userId) => {
  dbg("hook:createActor", { name: actor.name, id: actor.id, userId, isGM: game.user.isGM });
  if (!game.user.isGM) {
    dbg("hook:createActor", "not GM, bail");
    return;
  }
  if (!isInteractiveActor(actor)) {
    dbg("hook:createActor", "not interactive, bail");
    return;
  }
  dbg("hook:createActor", "processing interactive actor", {
    containerDefault: !!actor.getFlag(MODULE_ID, "containerDefault"),
    ephemeral: !!actor.getFlag(MODULE_ID, "ephemeral"),
    createKindConfirmed: !!actor.getFlag(MODULE_ID, "createKindConfirmed"),
    sourceItemUuid: actor.system.sourceItemUuid,
    itemsSize: actor.items.size
  });

  if (actor.getFlag(MODULE_ID, "containerDefault")) {
    if (!actor.items.some(i => getAdapter().isContainerItem(i))) {
      // Use the adapter for both item type and identification field so neither
      // is hard-coded to the dnd5e vocabulary or `system.identified` boolean.
      const containerData = { name: actor.name, type: getAdapter().containerItemType, img: actor.img };
      getAdapter().stampNewItemIdentified(containerData, true);
      await actor.createEmbeddedDocuments("Item", [containerData]);
    }
    return;
  }

  if (actor.items.size > 0) return;
  if (actor.getFlag(MODULE_ID, "ephemeral")) return;
  if (actor.getFlag(MODULE_ID, "createKindConfirmed")) return;
  if (actor.system.sourceItemUuid) return;

  // Foundry's Create Actor dialog auto-renders the sheet after create — suppress
  // while the picker is open to avoid the empty-sheet flash.
  InteractiveItemSheet.pendingPicker.add(actor.id);
  if (actor.sheet?.rendered) await actor.sheet.close();

  let result;
  try {
    result = await _promptCreateKind(_sidebarAnchoredPosition());
  } finally {
    InteractiveItemSheet.pendingPicker.delete(actor.id);
  }

  if (result === "container") {
    const closedImg = game.settings.get(MODULE_ID, "defaultContainerImage") || CHEST_CLOSED;
    const openImg = game.settings.get(MODULE_ID, "defaultContainerOpenImage") || CHEST_OPEN;
    await actor.update({
      img: closedImg,
      "prototypeToken.texture.src": closedImg,
      "system.openImage": openImg,
      [`flags.${MODULE_ID}.containerDefault`]: true
    });
    // Use the adapter for both item type and identification field so neither
    // is hard-coded to the dnd5e vocabulary or `system.identified` boolean.
    const containerData = { name: actor.name, type: getAdapter().containerItemType, img: closedImg };
    getAdapter().stampNewItemIdentified(containerData, true);
    await actor.createEmbeddedDocuments("Item", [containerData]);
    actor.sheet?.render({ force: true });
  } else if (result === "item") {
    await actor.setFlag(MODULE_ID, "createKindConfirmed", true);
    actor.sheet?.render({ force: true });
  } else {
    // Dialog closed without selection — remove the blank actor
    await actor.delete();
  }
});

function _sidebarAnchoredPosition() {
  const width = 260;
  const sidebar = document.querySelector("#sidebar");
  if (!sidebar) return { width };
  const rect = sidebar.getBoundingClientRect();
  return {
    width,
    left: Math.max(8, Math.round(rect.left - width - 4)),
    top: Math.round(rect.top + 40)
  };
}

async function _promptCreateKind(position) {
  return foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.localize("INTERACTIVE_ITEMS.CreatePickerTitle") },
    position: position ?? { width: 260 },
    content: "",
    buttons: [
      {
        action: "item",
        label: game.i18n.localize("INTERACTIVE_ITEMS.CreateInteractiveItem"),
        icon: "fa-solid fa-cube"
      },
      {
        action: "container",
        label: game.i18n.localize("INTERACTIVE_ITEMS.CreateInteractiveContainer"),
        icon: "fa-solid fa-box-open"
      }
    ],
    rejectClose: false
  });
}

Hooks.on("updateActor", async (actor, changes, options, userId) => {
  dbg("hook:updateActor", {
    name: actor.name,
    id: actor.id,
    isSynthetic: !!actor.token,
    img: actor.img,
    isIdentified: actor.system?.isIdentified,
    imgChanged: "img" in changes,
    systemChangeKeys: Object.keys(changes.system ?? {})
  });
  if (!isInteractiveActor(actor)) {
    dbg("hook:updateActor", "not interactive, bail");
    return;
  }
  if (!game.user.isGM) {
    dbg("hook:updateActor", "not GM, bail");
    return;
  }

  const systemChanges = changes.system ?? {};
  const isSynthetic = !!actor.token;

  {
    const identifiedChanged = "isIdentified" in systemChanges;
    const unidentifiedNameChanged = "unidentifiedName" in systemChanges;
    const descChanged = "description" in systemChanges;
    const unidentifiedDescChanged = "unidentifiedDescription" in systemChanges;
    const nameChanged = "name" in changes;
    const isOpenChanged = "isOpen" in systemChanges;

    const isContainerType = actor.system.isContainer;
    const embeddedItem = isContainerType
      ? actor.system.containerItem
      : actor.items.contents[0];

    dbg("hook:updateActor", "field sync check", {
      identifiedChanged, unidentifiedNameChanged, descChanged,
      unidentifiedDescChanged, nameChanged, isOpenChanged,
      isContainerType, embeddedItemId: embeddedItem?.id, embeddedItemImg: embeddedItem?.img
    });

    if (embeddedItem && (identifiedChanged || unidentifiedNameChanged || descChanged || unidentifiedDescChanged || nameChanged)) {
      // Build the system-specific update payload via the adapter so the field
      // paths are not hard-coded to dnd5e's `system.identified` / `system.unidentified.*`.
      const itemUpdates = getAdapter().buildItemIdentificationUpdate(actor, systemChanges);
      if (nameChanged) {
        itemUpdates.name = actor.name;
      }

      if (Object.keys(itemUpdates).length > 0) {
        dbg("hook:updateActor", "updating embeddedItem fields", { embeddedItemId: embeddedItem.id, itemUpdates });
        await embeddedItem.update(itemUpdates);
        if (embeddedItem.sheet?.rendered) embeddedItem.sheet.render();
      } else {
        dbg("hook:updateActor", "no item field changes needed");
      }
    } else if (!embeddedItem) {
      dbg("hook:updateActor", "no embeddedItem found, skipping field sync");
    } else {
      dbg("hook:updateActor", "no relevant field changes for item sync, skipping");
    }

    const imgChanged = "img" in changes;
    if (isContainerType && (isOpenChanged || imgChanged) && embeddedItem) {
      const openImage = actor.system.openImage;
      const newImg = (actor.system.isOpen && openImage) ? openImage : actor.img;
      dbg("hook:updateActor", "container image sync", {
        isOpenChanged, imgChanged, isOpen: actor.system.isOpen, openImage, actorImg: actor.img, computedNewImg: newImg, embeddedItemCurrentImg: embeddedItem.img, needsUpdate: embeddedItem.img !== newImg
      });
      if (embeddedItem.img !== newImg) {
        dbg("hook:updateActor", "updating container embeddedItem.img", { from: embeddedItem.img, to: newImg });
        await embeddedItem.update({ img: newImg });
        if (embeddedItem.sheet?.rendered) embeddedItem.sheet.render();
      } else {
        dbg("hook:updateActor", "container embeddedItem.img already matches, no update needed");
      }
    } else if (isContainerType && !embeddedItem) {
      dbg("hook:updateActor", "container type but no embeddedItem, skipping image sync");
    }

    // ItemSheet5e shows embeddedItem.img directly — it must track resolveImage() or
    // the header stays on the original dnd5e item image after the GM sets a custom one.
    const unidentifiedImageChanged = "unidentifiedImage" in systemChanges;
    if (!isContainerType && (imgChanged || unidentifiedImageChanged) && embeddedItem) {
      const newImg = actor.system.resolveImage();
      dbg("hook:updateActor", "item image sync", {
        imgChanged, unidentifiedImageChanged, actorImg: actor.img, unidentifiedImage: actor.system.unidentifiedImage, isIdentified: actor.system.isIdentified, computedNewImg: newImg, embeddedItemCurrentImg: embeddedItem.img, needsUpdate: embeddedItem.img !== newImg
      });
      if (embeddedItem.img !== newImg) {
        dbg("hook:updateActor", "updating item embeddedItem.img", { from: embeddedItem.img, to: newImg });
        await embeddedItem.update({ img: newImg });
        if (embeddedItem.sheet?.rendered) embeddedItem.sheet.render();
      } else {
        dbg("hook:updateActor", "item embeddedItem.img already matches, no update needed");
      }
    } else if (!isContainerType && !embeddedItem) {
      dbg("hook:updateActor", "item type but no embeddedItem, skipping image sync");
    }
  }

  if (isSynthetic) {
    dbg("hook:updateActor", "synthetic actor, skipping prototype-token name sync");
    return;
  }

  const unidentifiedNameChanged = "unidentifiedName" in systemChanges;
  const nameChanged = "name" in changes;
  if (!unidentifiedNameChanged && !nameChanged) return;

  const system = actor.system;
  const protoName = system.resolveTokenName();
  const protoUpdates = { "prototypeToken.name": protoName };

  await actor.update(protoUpdates, { noHook: true });

  // Each token may have its own identification state via delta.
  const tokens = canvas.scene?.tokens.filter(t => t.actorId === actor.id) ?? [];
  for (const token of tokens) {
    const tokenSystem = token.actor?.system;
    if (!tokenSystem) continue;
    const tokenName = tokenSystem.resolveTokenName();
    await token.update({ name: tokenName });
  }
});

Hooks.on("updateActor", (actor, changes) => {
  if (!isInteractiveActor(actor)) return;
  if (!actor.system.isContainer) return;
  if (!foundry.utils.hasProperty(changes, "system.isOpen")) return;
  dbg("hook:updateActor:limitedDialog", { name: actor.name, id: actor.id, isOpen: actor.system.isOpen });
  InteractiveItemSheet.refreshLimitedDialog(actor);
});

// Neither dnd5e sheet auto-reacts to parent-actor changes — without this re-render,
// injected lock/open toggles keep stale icons and a second click silently reverts.
Hooks.on("updateActor", (actor, changes) => {
  if (!isInteractiveActor(actor)) return;
  const sys = changes.system ?? {};
  // isIdentified must be in this set too — pf2e item/container sheets and our
  // own config sheet inject identify toggles whose icon and tooltip have to
  // refresh after a Mystify/Identify action; otherwise the visual stays stale
  // even though the underlying data updated correctly.
  if (!("isLocked" in sys) && !("isOpen" in sys) && !("isIdentified" in sys)) {
    dbg("hook:updateActor:rerender", { name: actor.name }, "no isLocked/isOpen/isIdentified change, bail");
    return;
  }
  dbg("hook:updateActor:rerender", { name: actor.name, id: actor.id, isLocked: sys.isLocked, isOpen: sys.isOpen, isIdentified: sys.isIdentified, sheetRendered: !!actor.system.embeddedItem?.sheet?.rendered });

  // Re-render the embedded item's native sheet (dnd5e ContainerSheet / pf2e item sheets).
  const item = actor.system.embeddedItem;
  if (item?.sheet?.rendered) item.sheet.render();

  // Also re-render any open apps (AppV1 via ui.windows, AppV2 via foundry.applications.instances)
  // that own this actor (actor-document match) or whose item belongs to this actor
  // (item-sheet match, e.g. pf2e ContainerSheetPF2e) so header toggles stay in sync.
  for (const app of Object.values(ui.windows)) {
    if (!app.rendered) continue;
    const matchesActor = app.document?.id === actor.id || app.item?.actor?.id === actor.id;
    if (!matchesActor) continue;
    if (app === item?.sheet) continue;
    dbg("hook:updateActor:rerender", "re-rendering AppV1 app", { appId: app.appId, actorName: actor.name });
    app.render(true);
  }
  for (const app of foundry.applications.instances.values()) {
    if (!app.rendered) continue;
    const matchesActor = app.document?.id === actor.id || app.item?.actor?.id === actor.id;
    if (!matchesActor) continue;
    if (app === item?.sheet) continue;
    dbg("hook:updateActor:rerender", "re-rendering AppV2 app", { appId: app.id, actorName: actor.name });
    app.render();
  }
});

// Re-render any open container views (AppV1 or AppV2) whose document or item's
// actor matches the given actor. AppV1 apps live in ui.windows; AppV2 in
// foundry.applications.instances. Item sheets (e.g. pf2e ContainerSheetPF2e)
// are found via app.item?.actor rather than app.document.
function _rerenderContainerViews(actor) {
  if (!isInteractiveActor(actor) || !actor.system?.isContainer) return;
  for (const app of Object.values(ui.windows)) {
    if (!app.rendered) continue;
    const matchesActor = app.document?.id === actor.id || app.item?.actor?.id === actor.id;
    if (!matchesActor) continue;
    dbg("hook:createDeleteItem:rerender", { appId: app.appId, actorName: actor.name });
    app.render(true);
  }
  for (const app of foundry.applications.instances.values()) {
    if (!app.rendered) continue;
    const matchesActor = app.document?.id === actor.id || app.item?.actor?.id === actor.id;
    if (!matchesActor) continue;
    dbg("hook:createDeleteItem:rerender", { appId: app.id, actorName: actor.name });
    app.render();
  }
}

Hooks.on("createItem", (item) => {
  const actor = item.parent;
  if (actor) _rerenderContainerViews(actor);
});

Hooks.on("deleteItem", (item) => {
  const actor = item.parent;
  if (actor) _rerenderContainerViews(actor);
});

// Re-render container views when a deposited item's lock flag flips so the
// Contents-tab row icon and tooltip refresh. Scoped narrowly: deposited items
// (i.e. *not* the wrapping container's embedded backpack) on interactive
// container actors. The main updateItem hook below handles identification
// changes for the wrapped item.
Hooks.on("updateItem", (item, changes) => {
  const actor = item.parent;
  if (!isInteractiveActor(actor) || !actor.system?.isContainer) return;
  if (item.id === actor.system.embeddedItem?.id) return;
  if (!foundry.utils.hasProperty(changes, "flags.pick-up-stix.tokenState.system.isLocked")) return;
  dbg("hook:updateItem:lockRowRerender", { itemName: item.name, itemId: item.id });
  _rerenderContainerViews(actor);
});

Hooks.on("updateItem", async (item, changes, options, userId) => {
  dbg("hook:updateItem", {
    itemName: item.name,
    itemId: item.id,
    itemImg: item.img,
    actorName: item.actor?.name,
    isIdentificationChange: getAdapter().isIdentificationChange(item, changes),
    systemChangeKeys: Object.keys(changes.system ?? {})
  });
  if (!game.user.isGM) {
    dbg("hook:updateItem", "not GM, bail");
    return;
  }
  const actor = item.actor;
  if (!isInteractiveActor(actor)) {
    dbg("hook:updateItem", "actor is not interactive, bail", { actorName: actor?.name });
    return;
  }
  if (!getAdapter().isIdentificationChange(item, changes)) {
    dbg("hook:updateItem", "not an identification change, bail");
    return;
  }

  // The rest of this handler is dedicated to the *wrapped* item — the one
  // whose identification mirrors the actor's `system.isIdentified`. For
  // *deposited* items (children of a container actor whose containerId
  // points at the wrapped backpack), just refresh open container views so
  // the row's identify icon / tooltip update; do not touch the wrapping
  // actor's identification state.
  const embeddedItemId = actor.system.embeddedItem?.id;
  if (embeddedItemId && item.id !== embeddedItemId) {
    dbg("hook:updateItem", "deposited-item identify change, just re-render container views");
    _rerenderContainerViews(actor);
    return;
  }

  // Read identification state through the adapter so the field path is not
  // hard-coded to dnd5e's `system.identified` boolean.
  const newIdentified = getAdapter().isItemIdentified(item);
  const isContainer = actor.system.isContainer;

  dbg("hook:updateItem", "processing identification change", {
    actorName: actor.name, actorId: actor.id, actorImg: actor.img,
    isContainer, newIdentified, itemImg: item.img,
    isSynthetic: !!actor.token
  });

  // Items deposited via buildInteractiveItemData carry their own flag-based
  // identifiedData/unidentifiedData — sync from those rather than actor fields.
  const iiFlags = getItemIIFlags(item);
  if (isContainer && iiFlags?.sourceActorId) {
    dbg("hook:updateItem", "container item with interactive flags, syncing from flag data", {
      sourceActorId: iiFlags.sourceActorId, newIdentified
    });
    const data = newIdentified ? iiFlags.identifiedData : iiFlags.unidentifiedData;
    if (data) {
      const updates = {};
      if (item.img !== data.img) updates.img = data.img;
      if (item.name !== data.name) updates.name = data.name;
      if (data.description && item.system?.description?.value !== data.description) {
        updates["system.description.value"] = data.description;
      }
      updates["flags.pick-up-stix.tokenState.system.isIdentified"] = newIdentified;
      dbg("hook:updateItem", "container item flag-sync updates", { updates, flagData: data });
      if (Object.keys(updates).length > 0) await item.update(updates);
    } else {
      dbg("hook:updateItem", "no flag data found for container item identification sync");
    }
    return;
  }

  if (actor.system.isIdentified !== newIdentified) {
    dbg("hook:updateItem", "syncing actor.system.isIdentified", { from: actor.system.isIdentified, to: newIdentified });
    await actor.update({ "system.isIdentified": newIdentified }, { noHook: true });
  }

  // Some systems (pf2e) bind sheet inputs to `item._source.name`, which
  // setIdentificationStatus doesn't touch. Ask the adapter for any
  // source-level updates needed so the in-sheet name field reflects the new
  // identification state. dnd5e's adapter returns {} (no-op).
  const sourceUpdate = getAdapter().buildEmbeddedItemSourceUpdate(actor, newIdentified);
  dbg("hook:updateItem", "embedded item source update probe", {
    actorName: actor.name,
    actorUnidentifiedName: actor.system.unidentifiedName,
    itemSourceName: item._source?.name,
    itemLiveName: item.name,
    newIdentified,
    sourceUpdate
  });
  if (Object.keys(sourceUpdate).length > 0) {
    dbg("hook:updateItem", "applying embedded item source update", { sourceUpdate });
    await item.update(sourceUpdate);
  }

  if (!isContainer) {
    const newImg = actor.system.resolveImage(newIdentified);
    dbg("hook:updateItem", "item image sync", {
      currentItemImg: item.img, resolvedImg: newImg, unidentifiedImage: actor.system.unidentifiedImage, actorImg: actor.img, needsUpdate: item.img !== newImg
    });
    if (item.img !== newImg) {
      dbg("hook:updateItem", "updating item.img", { from: item.img, to: newImg });
      await item.update({ img: newImg });
    } else {
      dbg("hook:updateItem", "item.img already matches resolved image, no update needed");
    }
  }

  const tokenDoc = actor.token;
  if (tokenDoc) {
    const tokenUpdates = {};
    const tokenName = actor.system.resolveTokenName(newIdentified);
    if (tokenDoc.name !== tokenName) tokenUpdates.name = tokenName;
    if (!isContainer && actor.system.unidentifiedImage) {
      const newSrc = actor.system.resolveImage(newIdentified);
      if (tokenDoc.texture.src !== newSrc) tokenUpdates["texture.src"] = newSrc;
    }
    dbg("hook:updateItem", "token sync (synthetic)", {
      tokenId: tokenDoc.id, tokenName: tokenDoc.name, tokenTextureSrc: tokenDoc.texture.src, tokenUpdates
    });
    if (Object.keys(tokenUpdates).length > 0) {
      await tokenDoc.update(tokenUpdates);
      // Force the placeable to re-derive its nameplate text from the updated
      // document; without this the on-canvas hover label can keep the prior
      // text for unlinked synthetic tokens.
      tokenDoc.object?.renderFlags.set({ refreshNameplate: true });
    } else {
      dbg("hook:updateItem", "no token updates needed for synthetic actor");
    }
  } else {
    // Already-placed tokens have their own delta — identification changes on the
    // base template must not propagate to them.
    const protoName = actor.system.resolveTokenName(newIdentified);
    const protoUpdates = { "prototypeToken.name": protoName };
    if (!isContainer && actor.system.unidentifiedImage) {
      const newSrc = actor.system.resolveImage(newIdentified);
      protoUpdates["prototypeToken.texture.src"] = newSrc;
    }
    dbg("hook:updateItem", "base actor prototype token sync", { protoUpdates });
    await actor.update(protoUpdates, { noHook: true });
  }

  if (actor.sheet?.rendered) actor.sheet.render();
});

Hooks.on("renderActorDirectory", (app, html, context, options) => {
  const ephemeralFolderId = game.settings.get(MODULE_ID, "ephemeralFolder");
  const ephemeralVisible = game.settings.get(MODULE_ID, "ephemeralFolderVisible");
  const hideEphemeralFolder = !game.user.isGM || !ephemeralVisible;

  if (ephemeralFolderId && hideEphemeralFolder) {
    const folderEl = html.querySelector(`.folder[data-folder-id="${ephemeralFolderId}"]`);
    folderEl?.remove();
  }

  html.querySelectorAll('.directory-item').forEach(el => {
    const actorId = el.dataset.entryId;
    const actor = game.actors.get(actorId);
    if (!isInteractiveActor(actor)) return;
    const isEphemeral = !!actor.getFlag(MODULE_ID, "ephemeral");
    if (!game.user.isGM || (isEphemeral && hideEphemeralFolder)) {
      el.remove();
    }
  });

  if (!game.user.isGM) return;

  // Ephemeral actors are created programmatically — block manual creation.
  if (ephemeralFolderId && !hideEphemeralFolder) {
    const ephemeralFolderEl = html.querySelector(`.folder[data-folder-id="${ephemeralFolderId}"]`);
    ephemeralFolderEl?.querySelector("button[data-action='createEntry']")?.remove();
  }

  _injectFolderTrashButton(html);
  _injectEphemeralVisibilityToggle(html);
});

// Interactive actors default to OBSERVER for all players, so without this filter
// every placed item/container appears as a selectable "Player Character" in UserConfig.
Hooks.on("renderUserConfig", (app, html) => {
  const select = html.querySelector("select[name='character']");
  if (!select) {
    dbg("userConfig:filterInteractive", { bail: "no select" });
    return;
  }

  let removed = 0;
  for (const option of [...select.querySelectorAll("option")]) {
    if (!option.value) continue;
    const actor = game.actors.get(option.value);
    if (!isInteractiveActor(actor)) continue;
    option.remove();
    removed++;
  }

  for (const group of [...select.querySelectorAll("optgroup")]) {
    if (!group.querySelector("option")) group.remove();
  }

  dbg("userConfig:filterInteractive", {
    user: app.document?.id,
    removed
  });
});

Hooks.on("renderActorDirectory", (app, element) => {
  if (!game.user.isGM) return;
  if (element.dataset.iiCreatePickerAttached) return;
  element.dataset.iiCreatePickerAttached = "1";

  element.addEventListener("click", async (event) => {
    const btn = event.target.closest("button[data-action='createEntry']");
    if (!btn) return;

    const folderItem = btn.closest(".folder.directory-item");
    if (!folderItem) return;

    const interactiveFolderId = game.settings.get(MODULE_ID, "actorFolder");
    if (folderItem.dataset.folderId !== interactiveFolderId) return;

    event.stopImmediatePropagation();
    event.preventDefault();

    const sidebarRect = element.getBoundingClientRect();
    const rect = btn.getBoundingClientRect();
    const dialogWidth = 260;
    const left = sidebarRect.left - dialogWidth;
    const top = Math.min(rect.top, window.innerHeight - 120);

    const result = await _promptCreateKind({ width: dialogWidth, left, top });

    if (!result) return; // dialog was closed without selection

    const isContainerChoice = result === "container";
    const defaultName = isContainerChoice
      ? game.i18n.localize("INTERACTIVE_ITEMS.DefaultContainerName")
      : game.i18n.localize("INTERACTIVE_ITEMS.DefaultItemName");

    // Flags tell the createActor hook which path to take; without them the hook
    // re-prompts for a picker on an actor we already know the kind of.
    const actor = await CONFIG.Actor.documentClass.create({
      name: defaultName,
      type: "pick-up-stix.interactiveItem",
      folder: interactiveFolderId,
      flags: {
        [MODULE_ID]: isContainerChoice
          ? { containerDefault: true }
          : { createKindConfirmed: true }
      }
    });

    if (actor) actor.sheet?.render({ force: true });
  }, true); // capture phase: fires before Foundry's bubble-phase handler
});

function _injectFolderTrashButton(html) {
  const folderId = game.settings.get(MODULE_ID, "actorFolder");
  if (!folderId) return;

  const folderEl = html.querySelector(`.folder[data-folder-id="${folderId}"]`);
  if (!folderEl) return;

  const header = folderEl.querySelector(".folder-header");
  if (!header || header.querySelector(".pick-up-stix-trash")) return;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "unbutton pick-up-stix-trash";
  btn.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
  btn.dataset.tooltip = "Delete Interactive Actors";
  btn.setAttribute("aria-label", "Delete Interactive Actors");

  btn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    _openDeleteDialog(event, folderId);
  });

  header.appendChild(btn);
}

function _injectEphemeralVisibilityToggle(html) {
  const folderId = game.settings.get(MODULE_ID, "actorFolder");
  if (!folderId) return;

  const folderEl = html.querySelector(`.folder[data-folder-id="${folderId}"]`);
  if (!folderEl) return;

  const header = folderEl.querySelector(".folder-header");
  if (!header || header.querySelector(".pick-up-stix-toggle-ephemeral")) return;

  const visible = game.settings.get(MODULE_ID, "ephemeralFolderVisible");
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "unbutton pick-up-stix-toggle-ephemeral";
  btn.innerHTML = visible
    ? '<i class="fa-solid fa-eye"></i>'
    : '<i class="fa-solid fa-eye-slash"></i>';
  const label = game.i18n.localize(visible
    ? "INTERACTIVE_ITEMS.FolderToggle.Hide"
    : "INTERACTIVE_ITEMS.FolderToggle.Show");
  btn.dataset.tooltip = label;
  btn.setAttribute("aria-label", label);

  btn.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const next = !game.settings.get(MODULE_ID, "ephemeralFolderVisible");
    await game.settings.set(MODULE_ID, "ephemeralFolderVisible", next);
    ui.actors.render();
  });

  // Insert before the trash button so order reads: [toggle] [trash]
  const trashBtn = header.querySelector(".pick-up-stix-trash");
  if (trashBtn) trashBtn.before(btn);
  else header.appendChild(btn);
}

async function _openDeleteDialog(event, folderId) {
  const rect = event.currentTarget.closest(".folder-header").getBoundingClientRect();

  const dialog = new foundry.applications.api.DialogV2({
    window: { title: "Delete Interactive Actors", minimizable: false },
    content: `
      <p>Choose which actors to delete from the Interactive Objects folder.</p>
      <p><strong>Delete Ephemeral</strong>: removes only temporary one-use actors.</p>
      <p><strong>Delete All</strong>: removes all interactive actors (cannot be undone).</p>
    `,
    buttons: [
      {
        label: "Delete Ephemeral",
        icon: "fa-solid fa-ghost",
        action: "ephemeral",
        className: "dialog-button",
        callback: () => _deleteInteractiveActors(folderId, { ephemeralOnly: true })
      },
      {
        label: "Delete All",
        icon: "fa-solid fa-trash-can",
        action: "all",
        className: "dialog-button destructive",
        callback: () => _deleteInteractiveActors(folderId, { ephemeralOnly: false })
      }
    ],
  });

  // Render first so the element exists, then reposition so the dialog's
  // right edge sits just to the left of the sidebar.
  await dialog.render({ force: true });

  const sidebarRect = document.querySelector("#sidebar").getBoundingClientRect();
  const dialogEl = dialog.element;
  const dialogWidth = dialogEl.offsetWidth || 420;
  dialog.setPosition({
    top: Math.round(rect.top),
    left: Math.round(sidebarRect.left - dialogWidth - 4)
  });
}

async function _deleteInteractiveActors(folderId, { ephemeralOnly = false } = {}) {
  const ephemeralFolderId = game.settings.get(MODULE_ID, "ephemeralFolder");
  const validFolderIds = new Set([folderId, ephemeralFolderId].filter(Boolean));

  const toDelete = game.actors.filter(a => {
    if (!isInteractiveActor(a)) return false;
    if (!validFolderIds.has(a.folder?.id)) return false;
    if (ephemeralOnly && !a.getFlag("pick-up-stix", "ephemeral")) return false;
    return true;
  });

  if (!toDelete.length) {
    ui.notifications.info("No matching interactive actors to delete.");
    return;
  }

  const ids = toDelete.map(a => a.id);
  await CONFIG.Actor.documentClass.deleteDocuments(ids);

  ui.notifications.info(
    `Deleted ${ids.length} interactive actor${ids.length === 1 ? "" : "s"}.`
  );
}

function _reevaluateInteractiveProximity() {
  // Walk both registries so V1 sheets (pf2e ContainerSheetPF2e, native item
  // sheets) close and re-render alongside V2 sheets (dnd5e ContainerSheet).
  // Item-document sheets resolve their interactive actor via app.item?.actor.
  const apps = [
    ...Object.values(ui.windows ?? {}),
    ...foundry.applications.instances.values()
  ];
  for (const app of apps) {
    if (!app.rendered) continue;
    const interactiveActor = app.actor ?? app.item?.actor ?? app.document?.actor;
    if (!isInteractiveActor(interactiveActor)) continue;
    if (!checkProximity(interactiveActor, { silent: true, range: "inspection" })) {
      app.close();
      continue;
    }
    // Still within inspection — re-render interactive container sheets so the
    // contents-hiding hook reflects the player's current interaction-range state.
    if (interactiveActor.system.isContainer) app.render();
  }

  InteractiveItemSheet.promoteLimitedDialogsInRange();

  for (const token of canvas.tokens?.placeables ?? []) {
    if (isInteractiveActor(token.actor)) {
      token.renderFlags.set({ refreshState: true });
    }
  }
}

// InteractiveItemSheet is never actually rendered when delegating to dnd5e sheets,
// so we identify stale apps by parent actor rather than instanceof.
Hooks.on("updateToken", (tokenDoc, changes, options, userId) => {
  if (isModuleGM()) return;
  // Trigger on x, y, OR level changes — level is a movement field in v14
  // and a pure level transition can change proximity outcomes without a coord change.
  if (!("x" in changes || "y" in changes || "level" in changes)) {
    dbg("hook:updateToken", "no x/y/level in changes, bail", { tokenId: tokenDoc.id });
    return;
  }

  const candidates = getPlayerCandidateTokens();
  if (!candidates.some(t => t.document.id === tokenDoc.id)) {
    dbg("hook:updateToken", "not a candidate token, bail", { tokenId: tokenDoc.id });
    return;
  }

  // Record the definitive final position for this specific token. Foundry's
  // animation interpolates document.x/y mid-flight so the `changes` payload
  // is the only reliable source of the final coordinates. Also capture level
  // on v14 so cross-level proximity checks use animation-safe data.
  const newPos = { x: changes.x ?? tokenDoc.x, y: changes.y ?? tokenDoc.y, width: tokenDoc.width, height: tokenDoc.height };
  if (hasLevels()) {
    newPos.level = changes.level ?? getTokenLevelId(tokenDoc);
  }
  dbg("hook:updateToken", "candidate token moved, recording position override", { tokenId: tokenDoc.id, newPos });
  setPlayerPositionOverride(tokenDoc.id, newPos);

  _reevaluateInteractiveProximity();
});

// A newly-controlled token may change inspection range even though nothing moved.
Hooks.on("controlToken", (token, controlled) => {
  if (isModuleGM()) return;
  const tokenDoc = token?.document;
  if (!tokenDoc) return;
  if (isInteractiveActor(token.actor)) {
    dbg("hook:controlToken", "interactive token clicked, skipping candidate check", { tokenId: tokenDoc.id });
    return; // Clicking an interactive token is not a candidate change.
  }

  dbg("hook:controlToken", { tokenId: tokenDoc.id, actorName: token.actor?.name, controlled });

  // When newly controlled, seed its position override so checkProximity uses
  // fresh coords immediately (rather than waiting for its next updateToken).
  // Also capture level on v14 so cross-level proximity checks are correct
  // from the moment of selection.
  if (controlled) {
    const pos = { x: tokenDoc.x, y: tokenDoc.y, width: tokenDoc.width, height: tokenDoc.height };
    if (hasLevels()) {
      pos.level = getTokenLevelId(tokenDoc);
    }
    dbg("hook:controlToken", "seeding position override for newly controlled token", { tokenId: tokenDoc.id, pos });
    setPlayerPositionOverride(tokenDoc.id, pos);
  }
  // Deselection does not clear the override: if the user's assigned character
  // falls back in as the sole candidate, its override stays valid for its
  // next proximity check. Stale entries are harmless (only read when their
  // token is in the candidate set).

  _reevaluateInteractiveProximity();
});

// Suppress interactive objects from combat tracker
Hooks.on("preCreateCombatant", (combatant, data, options, userId) => {
  if (isInteractiveActor(combatant.actor)) {
    return false;
  }
});

Hooks.once("ready", async () => {
  console.log(`${MODULE_ID} | Pick-Up-Stix module ready`);
  registerSocket();

  if (game.user.isGM) {
    const parent = await _ensureActorFolder();
    _previousActorFolderId = parent?.id ?? null;
    await _ensureEphemeralFolder(parent);
  }
});

const DEFAULT_FOLDER_NAME = "Interactive Objects";
const EPHEMERAL_FOLDER_NAME = "Ephemeral";

async function _ensureActorFolder() {
  const setting = game.settings.get(MODULE_ID, "actorFolder");

  // If the setting is a valid folder ID, verify it still exists
  if (setting) {
    const existing = game.folders.get(setting);
    if (existing) return existing;
  }

  // Setting is empty or a stale ID — create default folder
  let folder = game.folders.find(f => f.type === "Actor" && f.name === DEFAULT_FOLDER_NAME);
  if (!folder) {
    const color = game.settings.get(MODULE_ID, "folderColor") || undefined;
    folder = await Folder.create({ name: DEFAULT_FOLDER_NAME, type: "Actor", color });
    dbg("ensure:actorFolder", "created parent folder", folder.id);
  }
  // Without this guard, onChange fires synchronously inside settings.set and races
  // the explicit _ensureEphemeralFolder call in the ready hook, producing duplicates.
  _folderChangeInProgress = true;
  await game.settings.set(MODULE_ID, "actorFolder", folder.id);
  _folderChangeInProgress = false;
  return folder;
}

function _darkenColor(hex, factor = 0.6) {
  if (!hex) return null;
  hex = hex.toString();
  const r = Math.round(parseInt(hex.slice(1, 3), 16) * factor).toString(16).padStart(2, "0");
  const g = Math.round(parseInt(hex.slice(3, 5), 16) * factor).toString(16).padStart(2, "0");
  const b = Math.round(parseInt(hex.slice(5, 7), 16) * factor).toString(16).padStart(2, "0");
  return `#${r}${g}${b}`;
}

async function _ensureEphemeralFolder(parent) {
  if (!parent) return null;

  const setting = game.settings.get(MODULE_ID, "ephemeralFolder");
  let folder = setting ? game.folders.get(setting) : null;

  // Validate that the stored folder still exists AND is parented to the current main folder
  if (folder && folder.folder?.id !== parent.id) folder = null;

  if (!folder) {
    // Use filter (not find) to detect and delete duplicates from a prior race condition.
    const matches = game.folders.filter(f =>
      f.type === "Actor" && f.name === EPHEMERAL_FOLDER_NAME && f.folder?.id === parent.id
    );
    folder = matches[0] ?? null;
    for (const dup of matches.slice(1)) {
      dbg("ensure:ephemeralFolder", "deleting duplicate ephemeral folder", dup.id);
      await dup.delete();
    }
  }

  if (!folder) {
    folder = await Folder.create({
      name: EPHEMERAL_FOLDER_NAME,
      type: "Actor",
      folder: parent.id,
      color: _darkenColor(parent.color) || undefined
    });
    dbg("ensure:ephemeralFolder", "created ephemeral folder", folder.id);
  }

  if (game.settings.get(MODULE_ID, "ephemeralFolder") !== folder.id) {
    await game.settings.set(MODULE_ID, "ephemeralFolder", folder.id);
    // Folder.create triggered a render before the setting was saved — re-render
    // so the hide logic sees the current ID.
    ui.actors?.render();
  }

  return folder;
}

function _onGMOverrideChanged() {
  dbg("settings:gmOverrideChanged", { value: game.settings.get(MODULE_ID, "gmOverrideEnabled") });
  // reset:true forces #prepareControls() to re-run; plain render() skips it and leaves active stale.
  ui.controls?.render({ reset: true });
  foundry.applications.instances.get("settings-config")?.render();
  ui.actors?.render();
  if (canvas?.ready) {
    for (const token of canvas.tokens.placeables) token.renderFlags.set({ refreshState: true });
  }
  canvas?.hud?.token?.render();
  for (const app of Object.values(ui.windows ?? {})) {
    if (app?.actor && isInteractiveActor?.(app.actor)) app.render();
  }
}

async function _onFolderColorChanged(color) {
  if (!game.user.isGM) return;
  const folderId = game.settings.get(MODULE_ID, "actorFolder");
  if (!folderId) return;
  const folder = game.folders.get(folderId);
  if (!folder) return;
  await folder.update({ color: color || null });

  const ephemeralId = game.settings.get(MODULE_ID, "ephemeralFolder");
  const ephemeralFolder = ephemeralId ? game.folders.get(ephemeralId) : null;
  if (ephemeralFolder) await ephemeralFolder.update({ color: _darkenColor(color) || null });
}

let _folderChangeInProgress = false;
// Cached to identify the old folder in _onActorFolderChanged regardless of actor collection state.
let _previousActorFolderId = null;

async function _onActorFolderChanged(value) {
  if (!game.user.isGM || _folderChangeInProgress) return;
  _folderChangeInProgress = true;

  try {
    const oldFolderId = _previousActorFolderId;
    const actors = game.actors.filter(a => isInteractiveActor(a));

    let newFolder;
    if (!value) {
      newFolder = game.folders.find(f => f.type === "Actor" && f.name === DEFAULT_FOLDER_NAME);
      if (!newFolder) {
        const color = game.settings.get(MODULE_ID, "folderColor") || undefined;
        newFolder = await Folder.create({ name: DEFAULT_FOLDER_NAME, type: "Actor", color });
      }
      await game.settings.set(MODULE_ID, "actorFolder", newFolder.id);
    } else if (game.folders.get(value)) {
      newFolder = game.folders.get(value);
    } else {
      newFolder = game.folders.find(f => f.type === "Actor" && f.name === value);
      if (!newFolder) {
        const color = game.settings.get(MODULE_ID, "folderColor") || undefined;
        newFolder = await Folder.create({ name: value, type: "Actor", color });
      }
      // Normalise: store the resolved folder ID, not the typed name.
      await game.settings.set(MODULE_ID, "actorFolder", newFolder.id);
    }

    const ephemeralId = game.settings.get(MODULE_ID, "ephemeralFolder");
    const ephemeralFolder = ephemeralId ? game.folders.get(ephemeralId) : null;
    if (ephemeralFolder && newFolder && ephemeralFolder.folder?.id !== newFolder.id) {
      await ephemeralFolder.update({ folder: newFolder.id });
    }
    if (!ephemeralFolder && newFolder) {
      await _ensureEphemeralFolder(newFolder);
    }

    if (newFolder && actors.length > 0) {
      const updates = actors
        .filter(a => a.folder?.id !== newFolder.id)
        .map(a => ({ _id: a.id, folder: newFolder.id }));
      if (updates.length > 0) {
        await CONFIG.Actor.documentClass.updateDocuments(updates);
      }
    }

    if (oldFolderId && oldFolderId !== newFolder?.id) {
      const oldFolder = game.folders.get(oldFolderId);
      if (oldFolder) await oldFolder.delete();
    }
  } finally {
    _folderChangeInProgress = false;
    _previousActorFolderId = game.settings.get(MODULE_ID, "actorFolder");
  }
}

/**
 * Drops an item from the dnd5e context menu "Drop Item" entry onto the canvas
 * at the dropping actor's current token position. On v14, also forwards the
 * actor's current level so the placed token lands on the correct floor.
 *
 * @param {Item} item - The item to drop from the actor's inventory.
 */
async function _dropItemOnCanvas(item) {
  const actor = item.actor;
  if (!actor) return;

  const token = canvas.tokens.placeables.find(t => t.actor?.id === actor.id);
  if (!token) {
    dbg("place:_dropItemOnCanvas", "no canvas token for actor, bail", { actorName: actor?.name });
    ui.notifications.warn(game.i18n.localize("INTERACTIVE_ITEMS.Notify.NoToken"));
    return;
  }

  const tokenDoc = token.document;
  dbg("place:_dropItemOnCanvas", {
    itemName: item.name, x: tokenDoc.x, y: tokenDoc.y, level: getTokenLevelId(tokenDoc)
  });

  const { handleItemDrop } = await import("./canvas/placement.mjs");
  await handleItemDrop({
    uuid: item.uuid,
    x: tokenDoc.x,
    y: tokenDoc.y,
    level: getTokenLevelId(tokenDoc)    // v14: forward the dropping actor's level
  });
}
