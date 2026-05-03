import { pickupItem, checkProximity, setContainerOpen, toggleContainerLocked } from "../transfer/ItemTransfer.mjs";
import { isInteractiveActor } from "../utils/actorHelpers.mjs";
import { dispatchGM } from "../utils/gmDispatch.mjs";
import { notifyItemAction } from "../utils/notify.mjs";
import { validateContainerAccess } from "../utils/containerAccess.mjs";
import { resolvePickupTarget } from "../utils/pickupFlow.mjs";
import { dbg } from "../utils/debugLog.mjs";
import { isModuleGM, isPlayerView } from "../utils/playerView.mjs";

const MODULE_ID = "pick-up-stix";

export function registerTokenHUD() {
  Hooks.on("renderTokenHUD", onRenderTokenHUD);
  _patchCanHUD();
  _patchRefreshState();
  _patchClickRight();
}

function _patchCanHUD() {
  libWrapper.register(MODULE_ID, "foundry.canvas.placeables.Token.prototype._canHUD", function(wrapped, user, event) {
    if (isInteractiveActor(this.actor)) {
      dbg("hud:_canHUD", { actorName: this.actor?.name, isDragged: !!this.layer._draggedToken, layerActive: this.layer.active, isPreview: this.isPreview });
      if (this.layer._draggedToken || !this.layer.active || this.isPreview) return false;
      return this.actor.testUserPermission(user, "OBSERVER");
    }
    return wrapped(user, event);
  }, "MIXED");
}

function _patchRefreshState() {
  libWrapper.register(MODULE_ID, "foundry.canvas.placeables.Token.prototype._refreshState", function(wrapped, ...args) {
    const result = wrapped(...args);
    if (isInteractiveActor(this.actor)) {
      if (this.border) {
        this.border.visible = !this.document.isSecret && isModuleGM() && this.controlled;
      }
      if (this.nameplate && !checkProximity(this.actor, { silent: true, range: "inspection" })) {
        this.nameplate.visible = false;
      }
    }
    return result;
  }, "WRAPPER");
}

function _patchClickRight() {
  libWrapper.register(MODULE_ID, "foundry.canvas.placeables.Token.prototype._onClickRight", function(wrapped, event) {
    if (!isInteractiveActor(this.actor)) return wrapped(event);

    dbg("hud:_onClickRight", { actorName: this.actor?.name, hasActiveHUD: this.hasActiveHUD, playerView: isPlayerView() });
    if (this.layer.hud) {
      // In player-view mode skip control() so the interactive token is never
      // added to canvas.tokens.controlled — otherwise a GM moving a PC token
      // would drag both tokens together.
      if (isModuleGM()) this.control({ releaseOthers: false });
      if (this.hasActiveHUD) this.layer.hud.close();
      else this.layer.hud.bind(this);
    }
    if (!this._propagateRightClick(event)) event.stopPropagation();
  }, "MIXED");
}

function onRenderTokenHUD(app, html, context, options) {
  const token = app.object;
  const actor = token?.actor;
  if (!isInteractiveActor(actor)) return;

  const tokenDoc = token.document;
  const sceneId = canvas.scene.id;
  const tokenId = tokenDoc.id;
  const isGM = isModuleGM();
  const system = actor.system;
  dbg("hud:onRenderTokenHUD", { actorName: actor.name, actorId: actor.id, isGM, isContainer: system.isContainer, isLocked: system.isLocked, isOpen: system.isOpen, isIdentified: system.isIdentified });
  const col = html.querySelector(".col.right");
  if (!col) return;

  col.querySelector('[data-action="combat"]')?.remove();
  col.querySelector('[data-action="togglePalette"][data-palette="effects"]')?.remove();
  col.querySelector('.palette.status-effects')?.remove();
  col.querySelector('[data-action="togglePalette"][data-palette="movementActions"]')?.remove();
  col.querySelector('.palette.movement-actions')?.remove();

  const inspectBtn = createHUDButton(
    "fa-magnifying-glass",
    game.i18n.localize("INTERACTIVE_ITEMS.HUD.Inspect"),
    async () => {
      dbg("hud:inspect", { actorName: actor.name });
      await actor.sheet.render(true);
      canvas.tokens.hud.close();
    }
  );
  col.appendChild(inspectBtn);

  if (!system.isContainer) {
  const pickupBtn = createHUDButton(
    "fa-hand",
    game.i18n.localize("INTERACTIVE_ITEMS.HUD.PickUp"),
    async () => {
      dbg("hud:pickup", { actorName: actor.name, isGM });
      // Check proximity before lock state — distance is more actionable than
      // "locked" (players can't tell something is locked from too far away).
      if (!checkProximity(actor)) {
        dbg("hud:pickup", "proximity check failed");
        return;
      }
      // Gate on locked state (open is not checked — non-container items have no open state).
      if (!validateContainerAccess(actor, { checkOpen: false })) return;

      const targetActor = await resolvePickupTarget(actor);
      dbg("hud:pickup", "resolved target actor", { targetActorName: targetActor?.name });
      if (!targetActor) return;

      const item = system.topLevelItems[0];
      if (!item) {
        dbg("hud:pickup", "no top-level items found");
        ui.notifications.warn(game.i18n.localize("INTERACTIVE_ITEMS.Notify.NoItems"));
        return;
      }
      const itemId = item.id;
      const itemName = item.name;
      dbg("hud:pickup", "picking up item", { itemId, itemName, targetActorId: targetActor.id });

      await dispatchGM(
        "pickupItem",
        { sceneId, tokenId, itemId, targetActorId: targetActor.id },
        async () => pickupItem(sceneId, tokenId, itemId, targetActor.id)
      );
      if (!isGM) notifyItemAction("PickedUp", itemName);
      canvas.tokens.hud.close();
    }
  );
  pickupBtn.dataset.action = "pickup";
  col.appendChild(pickupBtn);
  }

  if (system.isContainer) {
    const isOpen = system.isOpen;
    const openBtn = createHUDButton(
      isOpen ? "fa-box-open" : "fa-box",
      game.i18n.localize(isOpen
        ? "INTERACTIVE_ITEMS.Sheet.StateOpened"
        : "INTERACTIVE_ITEMS.Sheet.StateClosed"),
      async () => {
        dbg("hud:open/close", { actorName: actor.name, currentIsOpen: isOpen, newIsOpen: !isOpen });
        if (!checkProximity(actor)) {
          dbg("hud:open/close", "proximity check failed");
          return;
        }
        const newIsOpen = !isOpen;
        const ok = await setContainerOpen(actor, newIsOpen);
        if (!ok || !newIsOpen) return;

        canvas.tokens.hud.close();
        if (isGM) {
          actor.sheet.render(true);
        } else {
          // Wait for the GM-driven update to propagate before rendering,
          // so the sheet's isOpen gate sees the new value.
          const targetUuid = actor.uuid;
          const hookId = Hooks.on("updateActor", (updatedActor, changes) => {
            if (updatedActor.uuid !== targetUuid) return;
            if (foundry.utils.getProperty(changes, "system.isOpen") !== true) return;
            Hooks.off("updateActor", hookId);
            clearTimeout(timeoutId);
            actor.sheet.render(true);
          });
          const timeoutId = setTimeout(() => Hooks.off("updateActor", hookId), 5000);
        }
      }
    );
    if (isOpen) openBtn.classList.add("ii-hud-active");
    col.appendChild(openBtn);
  }

  if (isGM) {
    const isLocked = system.isLocked;
    const lockBtn = createHUDButton(
      isLocked ? "fa-lock" : "fa-lock-open",
      game.i18n.localize(isLocked
        ? "INTERACTIVE_ITEMS.Sheet.StateLocked"
        : "INTERACTIVE_ITEMS.Sheet.StateUnlocked"),
      () => {
        dbg("hud:lock", { actorName: actor.name, currentIsLocked: isLocked });
        return toggleContainerLocked(actor);
      }
    );
    if (isLocked) lockBtn.classList.add("ii-hud-active");
    col.appendChild(lockBtn);
  }

  if (isGM) {
    const identified = system.isIdentified;
    const identifyBtn = createHUDButton(
      "fa-wand-sparkles",
      game.i18n.localize(identified
        ? "INTERACTIVE_ITEMS.HUD.Unidentify"
        : "INTERACTIVE_ITEMS.HUD.Identify"),
      async () => {
        dbg("hud:identify", { actorName: actor.name, currentIdentified: identified });
        const item = system.embeddedItem;
        if (!item || item.system?.identified === undefined) {
          dbg("hud:identify", "no embeddedItem or identified field, bail");
          return;
        }
        dbg("hud:identify", "toggling item.system.identified", { from: identified, to: !identified, itemId: item.id });
        await item.update({ "system.identified": !identified });
      }
    );
    if (identified) identifyBtn.classList.add("ii-hud-active");
    col.appendChild(identifyBtn);
  }

  if (isGM) {
    const configBtn = createHUDButton(
      "fa-gear",
      game.i18n.localize("INTERACTIVE_ITEMS.Sheet.ConfigureHUD"),
      async () => {
        dbg("hud:configure", { actorName: actor.name });
        await actor.sheet.renderConfig();
        canvas.tokens.hud.close();
      }
    );
    col.appendChild(configBtn);
  }
}

function createHUDButton(icon, title, onClick) {
  const btn = document.createElement("div");
  btn.classList.add("control-icon");
  btn.title = title;
  btn.innerHTML = `<i class="fa-solid ${icon}"></i>`;
  btn.addEventListener("click", onClick);
  return btn;
}
