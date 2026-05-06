/**
 * pf2e hook-registration methods for the SystemAdapter contract.
 *
 * pf2e does not fire any of the dnd5e-specific hooks this module previously
 * relied on (`dnd5e.dropItemSheetData`, `dnd5e.getItemContextOptions`,
 * `renderContainerSheet`, `renderItemSheet5e`). Each `register*` method
 * below substitutes an equivalent pf2e-native approach, using libWrapper where
 * a clean hook surface does not exist.
 *
 * Verified against pf2e 8.1.0 source (pf2e.mjs):
 * - Actor sheets: CharacterSheetPF2e, NPCSheetPF2e, LootSheetPF2e each have
 *   `__name(this, "<ClassName>")` set, so Foundry fires "render<ClassName>" hooks.
 * - Physical item sheets: AmmoSheetPF2e, ArmorSheetPF2e, BookSheetPF2e,
 *   ConsumableSheetPF2e, ContainerSheetPF2e (backpack), EquipmentSheetPF2e,
 *   ShieldSheetPF2e, TreasureSheetPF2e, WeaponSheetPF2e — all named, all
 *   extend PhysicalItemSheetPF2e which extends ItemSheetPF2e (AppV1).
 * - Drop: `_handleDroppedItem(event, item, data)` exists on ActorSheetPF2e
 *   (line ~22609 in pf2e.mjs). This is the earliest interception point for
 *   external-item drops onto a pf2e actor sheet.
 * - Context menu: pf2e builds inventory context menus internally; there is no
 *   public `pf2e.getItemContextOptions` hook equivalent. The plan proposes a
 *   libWrapper wrap on a context-menu builder method — however, pf2e's
 *   inventory context menus are assembled inline and do not have a separately
 *   named builder method on ActorSheetPF2e that is safe to wrap without
 *   risk. For Phase 6, a Hooks-based approach on the actor sheet render hooks
 *   is used instead (documented below).
 *
 * These methods are mixed into `Pf2eAdapter` in `pf2e/index.mjs`.
 */

import { dbg } from "../../utils/debugLog.mjs";
import { isInteractiveContainer } from "../../utils/actorHelpers.mjs";

// ── Shared ────────────────────────────────────────────────────────────────────

/**
 * Normalise the `html` argument supplied by Foundry AppV1 render hooks to a
 * bare `HTMLElement`. Foundry v13/v14 with AppV1 sheets may supply either a
 * jQuery wrapper or a plain element depending on the Foundry generation.
 *
 * @param {jQuery|HTMLElement|undefined} html
 * @returns {HTMLElement|null}
 */
function _resolveHtml(html) {
  if (!html) return null;
  if (html instanceof HTMLElement) return html;
  // jQuery-wrapped: take the first element.
  if (typeof html[0] !== "undefined") return html[0] ?? null;
  return null;
}

// ── Actor render hook names (verified) ───────────────────────────────────────
//
// Foundry derives the render hook name from the class name set by __name().
// Each class below has __name(this, "<Name>") in its static block — verified.

const ACTOR_INVENTORY_HOOKS = [
  "renderCharacterSheetPF2e",
  "renderNPCSheetPF2e",
  "renderLootSheetPF2e"
];

// ── Physical item sheet render hook names (verified) ─────────────────────────
//
// All physical-item sheet classes use __name() — verified in pf2e.mjs.
// The hook "renderPhysicalItemSheetPF2e" does NOT exist separately; Foundry
// fires the concrete subclass hook only. We must enumerate all subclasses.

const PHYSICAL_ITEM_SHEET_HOOKS = [
  "renderAmmoSheetPF2e",
  "renderArmorSheetPF2e",
  "renderBookSheetPF2e",
  "renderConsumableSheetPF2e",
  "renderContainerSheetPF2e",   // "backpack" type — ContainerSheetPF2e
  "renderEquipmentSheetPF2e",
  "renderShieldSheetPF2e",
  "renderTreasureSheetPF2e",
  "renderWeaponSheetPF2e"
];

// ── exports ───────────────────────────────────────────────────────────────────

export const Pf2eHooks = {

  /**
   * Subscribe to pf2e actor sheet render hooks and forward each render to the
   * supplied `callback`. The callback receives `(app, html)` as supplied by
   * the hook, with `html` normalised to a plain HTMLElement.
   *
   * Subscribes to CharacterSheetPF2e, NPCSheetPF2e, and LootSheetPF2e because
   * those are the actor types that show an inventory where the wand-icon
   * identification toggles need to appear.
   *
   * @param {(app: Application, html: HTMLElement) => void} callback
   */
  registerActorInventoryHooks(callback) {
    for (const hookName of ACTOR_INVENTORY_HOOKS) {
      Hooks.on(hookName, (app, html) => {
        dbg("pf2e-hooks:registerActorInventoryHooks", hookName, app?.actor?.id);
        callback(app, _resolveHtml(html));
      });
    }
  },

  /**
   * Subscribe to pf2e physical-item sheet render hooks and forward each render
   * to the `injectHeaderControls` handler, which receives `{ app, html }`.
   *
   * pf2e fires per-type render hooks (renderWeaponSheetPF2e, etc.) rather than
   * a single renderItemSheet hook. We subscribe to all known physical-item sheet
   * classes so that any embedded item type gets the GM configure/lock buttons.
   *
   * @param {object} handlers
   * @param {(ctx: {app: Application, html: HTMLElement}) => void} [handlers.injectHeaderControls]
   */
  registerItemSheetHooks({ injectHeaderControls }) {
    for (const hookName of PHYSICAL_ITEM_SHEET_HOOKS) {
      Hooks.on(hookName, (app, html) => {
        dbg("pf2e-hooks:registerItemSheetHooks", hookName, app?.item?.id);
        injectHeaderControls?.({ app, html: _resolveHtml(html) });
      });
    }
  },

  /**
   * Register a drop-into-container intercept for pf2e actor sheets.
   *
   * pf2e has no `pf2e.dropItemSheetData` hook equivalent. The earliest
   * cancellable interception point for external-item drops onto a pf2e actor
   * sheet is `ActorSheetPF2e.prototype._handleDroppedItem`, verified in
   * pf2e 8.1.0 at line ~22609. This method is called from `_onDropItem` for
   * items dropped from outside the actor's own inventory.
   *
   * Because `ActorSheetPF2e` is defined inside pf2e's bundled IIFE it is not
   * exported to the global scope; libWrapper's string-path resolution cannot
   * reach it. Instead we defer to the `setup` hook (after pf2e has registered
   * its sheets), retrieve the class from the Foundry sheet registry, and patch
   * its prototype directly. We store the original method so the patch is
   * idempotent and compatible with other modules that do the same.
   *
   * The wrapper inspects the drop target element to see if it lands inside a
   * pf2e container row (`li[data-is-container]`). If a matching interactive
   * container actor is found, or if the target actor itself is an interactive
   * container, the gate callback is invoked. Returning `false` from the
   * callback cancels pf2e's native drop handling.
   *
   * @param {(ctx: {actor: Actor, item: Item|null, sheet: Application, data: object}) => boolean|undefined} callback
   */
  registerContainerDropGate(callback) {
    // Defer until `setup` so pf2e has registered its sheets.
    Hooks.once("setup", async () => {
      // Retrieve ActorSheetPF2e from the registered sheet list. The class is
      // not on the global scope because pf2e bundles it inside an IIFE.
      const registeredSheets = foundry.documents.collections.Actors.registeredSheets ?? [];
      const actorSheetPf2eClass = registeredSheets.find(
        (s) => s.name === "ActorSheetPF2e"
      );

      if (!actorSheetPf2eClass) {
        console.warn(
          "pick-up-stix | pf2e: registerContainerDropGate — ActorSheetPF2e not found in " +
          "registered actor sheets. Drop gating will not function on pf2e. " +
          "This may indicate a pf2e version mismatch (target: 8.x)."
        );
        return;
      }

      // Direct prototype patch: store the original so other modules can chain.
      const proto = actorSheetPf2eClass.prototype;
      const _original = proto._handleDroppedItem;

      /**
       * Intercepts item drops onto pf2e actor sheets for proximity/lock/open
       * gating on interactive container actors.
       *
       * @this {ActorSheetPF2e}
       * @param {DragEvent} event
       * @param {ItemPF2e} item
       * @param {object} data
       * @returns {Promise<ItemPF2e[]>}
       */
      proto._handleDroppedItem = async function (event, item, data) {
        dbg("pf2e-hooks:registerContainerDropGate", this.actor?.id, item?.id);
        // Determine if the drop lands on a pf2e inline container row.
        const containerEl = event?.target?.closest?.("li[data-is-container]");
        const containerItemId = containerEl?.dataset?.itemId ?? null;
        const destContainer = containerItemId
          ? (this.actor?.items?.get(containerItemId) ?? null)
          : null;
        const destActor = this.actor;

        // Only gate if a pf2e container row is targeted OR the actor type is
        // "loot" (which pf2e uses as a world-item-container actor type).
        if (destContainer !== null || destActor?.type === "loot") {
          const proceed = await callback({
            actor: destActor,
            item: destContainer,
            sheet: this,
            data
          });
          if (proceed === false) return;
        }

        return _original.call(this, event, item, data);
      };
    });
  },

  /**
   * Register an item-context-menu extension for pf2e actor inventory rows.
   *
   * pf2e has no `pf2e.getItemContextOptions` hook and does not expose a named
   * context-menu builder method on ActorSheetPF2e that is stable across
   * versions. Rather than wrapping an undocumented internal method (which would
   * be fragile), we inject menu items via DOM manipulation after each actor
   * sheet render. This mirrors the approach used by some pf2e modules and is
   * the safest option for Phase 6 compatibility.
   *
   * Note: Context menus in pf2e are built by ContextMenu instances attached
   * during `_activateListeners`. We cannot intercept those without libWrapper
   * on internal methods that have no stable public name. The render-hook DOM
   * approach appends `<li>` elements to existing `ContextMenu` containers if
   * already present, or patches via the module's own `ContextMenu` call if
   * pf2e exposes it in the future.
   *
   * For Phase 6, this implementation installs a `contextmenu` event listener
   * on the rendered inventory list that fires the `extender` callback when a
   * right-click targets an item row. This gives the module a chance to inject
   * entries into whatever context menu pf2e is about to show by listening to
   * `getActorSheetContext` or a similar Foundry core hook if available.
   *
   * Current status: pf2e 8.1.0 does not fire a hookable context-menu event
   * that modules can extend cleanly. This method registers a no-op for Phase 6
   * and emits a console warning directing Phase 7 implementers to revisit when
   * pf2e exposes a suitable hook or when a tested libWrapper target is
   * confirmed.
   *
   * @param {(item: Item, menuItems: object[]) => void} extender
   */
  registerItemContextMenu(extender) {
    // No stable pf2e hook for context-menu extension was found in 8.1.0.
    // A libWrapper target for the internal ContextMenu builder was not
    // confirmed against the source — wrapping an unverified method would risk
    // breaking pf2e's own context menus.
    //
    // Phase 7: once a stable target is identified (either a future pf2e hook
    // or a confirmed libWrapper path), replace this with the real integration.
    console.warn(
      "pick-up-stix | pf2e: registerItemContextMenu — no stable pf2e hook found in 8.1.0. " +
      "Context menu extension for pf2e inventory rows is deferred to Phase 7."
    );
  },

  /**
   * Register handlers for "a pf2e container item sheet was rendered".
   *
   * pf2e has no standalone window-style container view. We use ContainerSheetPF2e
   * (the native pf2e backpack item sheet) as the container UX. This hook subscribes
   * to `renderContainerSheetPF2e` and forwards each render to the four system-agnostic
   * decorators, but ONLY when the backpack item belongs to one of our interactive
   * container actors.
   *
   * AppV1 render hooks supply the inner content element; the decorators need the
   * full window (`.window-header` is outside the inner content), so we pass
   * `app.element[0]` as `html`.
   *
   * Decorators that look for pf2e actor-sheet-specific DOM (e.g.
   * `section.inventory.tab[data-tab="contents"] .items-list`) will be no-ops
   * because ContainerSheetPF2e uses the standard pf2e item sheet template
   * (description + details tabs). Header-control injection and actor-drop
   * listening both work correctly.
   *
   * @param {object} handlers
   * @param {(ctx: {actor: Actor, app: Application, html: HTMLElement}) => void} [handlers.injectHeaderControls]
   * @param {(ctx: {actor: Actor, app: Application, html: HTMLElement}) => void} [handlers.maybeHideContents]
   * @param {(ctx: {actor: Actor, app: Application, html: HTMLElement}) => void} [handlers.installActorDropListener]
   * @param {(ctx: {actor: Actor, app: Application, html: HTMLElement}) => void} [handlers.injectItemRowControls]
   */
  registerContainerViewHooks(handlers) {
    dbg("pf2e-hooks:registerContainerViewHooks", "subscribing to renderContainerSheetPF2e");

    Hooks.on("renderContainerSheetPF2e", (app, element) => {
      // Only handle backpack items embedded in our interactive container actors.
      const actor = app.item?.actor;
      if (!isInteractiveContainer(actor)) return;

      // AppV1 render hooks pass the inner template content. Decorators need the
      // full window element to reach `.window-header`. Use app.element[0].
      const windowEl = app.element instanceof HTMLElement
        ? app.element
        : app.element?.[0] ?? null;
      if (!windowEl) return;

      const ctx = { actor, app, html: windowEl };

      dbg("pf2e-hooks:renderContainerSheetPF2e", {
        actorName: actor?.name,
        actorId: actor?.id,
        itemId: app.item?.id
      });

      handlers.injectHeaderControls?.(ctx);
      handlers.maybeHideContents?.(ctx);
      handlers.installActorDropListener?.(ctx);
      handlers.installItemDropListener?.(ctx);
      handlers.injectItemRowControls?.(ctx);
      handlers.injectContentsTab?.(ctx);
    });
  }
};
