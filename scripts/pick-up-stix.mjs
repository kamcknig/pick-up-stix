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
import { createStateToggleButton, insertHeaderButton, createRowControl } from "./utils/domButtons.mjs";
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
    "pick-up-stix.config-fields": "modules/pick-up-stix/templates/partials/config-fields.hbs"
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

  getAdapter().registerItemSheetHooks({ injectHeaderControls: _injectItemSheetHeaderControls });

  getAdapter().registerContainerDropGate(_gateContainerDrop);

  getAdapter().registerContainerViewHooks({
    injectHeaderControls: _injectContainerSheetHeaderControls,
    maybeHideContents: _hideContainerSheetContents,
    installActorDropListener: _installContainerSheetActorDrop,
    injectItemRowControls: _injectContainerSheetRowControls,
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
 * Injects GM-only lock and configure header buttons into the dnd5e item sheet
 * rendered for an embedded item belonging to an interactive actor.
 *
 * @param {object} ctx
 * @param {Application} ctx.app - The rendered ItemSheet5e application.
 * @param {HTMLElement} ctx.html - The sheet's root element.
 */
function _injectItemSheetHeaderControls({ app, html }) {
  if (!game.user.isGM) return;
  const item = app.item;
  const actor = item?.actor;

  let configActor = null;
  if (isInteractiveActor(actor)) {
    configActor = actor;
  } else {
    const sourceActorId = getItemSourceActorId(item);
    if (sourceActorId) configActor = game.actors.get(sourceActorId);
  }
  if (!configActor) return;

  const header = html.querySelector(".window-header");
  if (!header) return;
  html.querySelector(".mode-slider")?.remove();
  const closeBtn = header.querySelector("button.close, [data-action='close']");

  header.querySelector(".ii-identify-toggle-btn")?.remove();
  const _adapter = getAdapter();
  const identCfg = _adapter.getIdentifyButtonConfig(configActor.system.isIdentified);
  const identifyToggle = createStateToggleButton({
    extraClass: "ii-identify-toggle-btn",
    active: configActor.system.isIdentified,
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
      await _adapter.performIdentifyToggle(embeddedItem);
    }
  });
  insertHeaderButton(header, identifyToggle, closeBtn);

  header.querySelector(".ii-lock-toggle-btn")?.remove();
  const lockToggle = createStateToggleButton({
    extraClass: "ii-lock-toggle-btn",
    active: configActor.system.isLocked,
    iconOn: "fa-lock",
    iconOff: "fa-lock-open",
    labelOnKey: "INTERACTIVE_ITEMS.Sheet.StateLocked",
    labelOffKey: "INTERACTIVE_ITEMS.Sheet.StateUnlocked",
    onClick: (ev) => {
      ev.preventDefault();
      toggleContainerLocked(configActor);
    }
  });
  insertHeaderButton(header, lockToggle, closeBtn);

  if (!header.querySelector(".ii-configure-btn")) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "header-control-button ii-configure-btn";
    btn.dataset.tooltip = game.i18n.localize("INTERACTIVE_ITEMS.Sheet.ConfigureHUD");
    btn.innerHTML = '<i class="fa-solid fa-gear"></i>';
    btn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      await app.close();
      configActor.sheet.renderConfig();
    });

    if (closeBtn) closeBtn.before(btn);
    else header.appendChild(btn);
  }
}

/**
 * Injects GM-only open/close, lock, and configure header buttons into the
 * dnd5e ContainerSheet rendered for an interactive container actor.
 *
 * @param {object} ctx
 * @param {Actor} ctx.actor - The interactive container actor owning the container item.
 * @param {Application} ctx.app - The rendered ContainerSheet application.
 * @param {HTMLElement} ctx.html - The sheet's root element.
 */
function _injectContainerSheetHeaderControls({ actor, app, html }) {
  if (isPlayerView()) return;
  if (!isInteractiveContainer(actor)) return;

  const header = html.querySelector(".window-header");
  if (!header) return;
  html.querySelector(".mode-slider")?.remove();
  const closeBtn = header.querySelector("button.close, [data-action='close']");

  // Remove existing to refresh state on re-render.
  header.querySelector(".ii-open-toggle-btn")?.remove();

  const openBtn = createStateToggleButton({
    extraClass: "ii-open-toggle-btn",
    active: actor.system.isOpen,
    iconOn: "fa-box-open",
    iconOff: "fa-box",
    labelOnKey: "INTERACTIVE_ITEMS.Sheet.StateOpened",
    labelOffKey: "INTERACTIVE_ITEMS.Sheet.StateClosed",
    onClick: async (ev) => {
      ev.preventDefault();
      await setContainerOpen(actor, !actor.system.isOpen);
    }
  });
  insertHeaderButton(header, openBtn, closeBtn);

  header.querySelector(".ii-lock-toggle-btn")?.remove();
  const lockBtn = createStateToggleButton({
    extraClass: "ii-lock-toggle-btn",
    active: actor.system.isLocked,
    iconOn: "fa-lock",
    iconOff: "fa-lock-open",
    labelOnKey: "INTERACTIVE_ITEMS.Sheet.StateLocked",
    labelOffKey: "INTERACTIVE_ITEMS.Sheet.StateUnlocked",
    onClick: (ev) => {
      ev.preventDefault();
      toggleContainerLocked(actor);
    }
  });
  insertHeaderButton(header, lockBtn, closeBtn);

  if (!header.querySelector(".ii-configure-btn")) {
    const cfgBtn = document.createElement("button");
    cfgBtn.type = "button";
    cfgBtn.className = "header-control-button ii-configure-btn";
    cfgBtn.dataset.tooltip = game.i18n.localize("INTERACTIVE_ITEMS.Sheet.ConfigureHUD");
    cfgBtn.innerHTML = '<i class="fa-solid fa-gear"></i>';
    cfgBtn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      await app.close();
      actor.sheet.renderConfig();
    });

    if (closeBtn) closeBtn.before(cfgBtn);
    else header.appendChild(cfgBtn);
  }
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

  const list = html.querySelector('section.inventory.tab[data-tab="contents"] .items-list');
  if (!list) return;

  const message = actor.system.isOpen
    ? game.i18n.localize("INTERACTIVE_ITEMS.Container.ContentsHidden")
    : game.i18n.localize("INTERACTIVE_ITEMS.Notify.ContainerClosed");

  list.replaceChildren();
  const placeholder = document.createElement("div");
  placeholder.className = "pick-up-stix-contents-hidden";
  placeholder.textContent = message;
  list.append(placeholder);
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
  if (!("isLocked" in sys) && !("isOpen" in sys)) {
    dbg("hook:updateActor:rerender", { name: actor.name }, "no isLocked/isOpen change, bail");
    return;
  }
  dbg("hook:updateActor:rerender", { name: actor.name, id: actor.id, isLocked: sys.isLocked, isOpen: sys.isOpen, sheetRendered: !!actor.system.embeddedItem?.sheet?.rendered });
  const item = actor.system.embeddedItem;
  if (item?.sheet?.rendered) item.sheet.render();
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
  for (const app of foundry.applications.instances.values()) {
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
