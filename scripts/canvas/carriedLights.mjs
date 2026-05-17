/**
 * Carried-light synthetic source manager.
 *
 * When an inventory item carries an active light configuration (its
 * `flags["pick-up-stix"].tokenState.system.lightActive` is true and the snapshot
 * has a non-zero dim/bright radius), this module registers a per-(token, item)
 * `PointLightSource` into `canvas.effects.lightSources` with a custom sourceId
 * (`pus-light:<tokenId>:<itemId>`). The source coexists with the token's own
 * `Token.<id>` source so the token visually emits BOTH lights — the player's own
 * vision/light AND the carried item's emission.
 *
 * The manager rebuilds sources in response to:
 *   - canvasReady — initial pass over every placeable.
 *   - drawToken (mid-session token adds) — initial pass for that token.
 *   - updateToken (x/y/elevation/level changes) — re-position carried sources.
 *   - deleteToken — destroy all sources for that token.
 *   - createItem/updateItem/deleteItem on the token's actor — re-evaluate
 *     which items contribute and toggle their sources.
 *   - updateActor on an interactive container token (isOpen flip) — enable /
 *     disable contents-driven emission.
 *   - updateActor on a generic actor (flags.pick-up-stix.interactive change) —
 *     re-evaluate contents-driven emission when the contents array mutates.
 *
 * For interactive container tokens, sources are only created when the container
 * is OPEN; closing the container destroys all contents-driven sources.
 */

import { isInteractiveActor, isInteractiveContainer } from "../utils/actorHelpers.mjs";
import { getAdapter } from "../adapter/index.mjs";
import { dbg } from "../utils/debugLog.mjs";

/** sourceId prefix to keep our synthetic sources distinguishable from Foundry's. */
const PREFIX = "pus-light";

/**
 * Build the canonical sourceId for a given (token, item) pair.
 *
 * @param {string} tokenId
 * @param {string} itemId
 * @returns {string}
 */
function makeSourceId(tokenId, itemId) {
  return `${PREFIX}:${tokenId}:${itemId}`;
}

/**
 * Return every item (or item-like record) on the actor whose carried-light
 * snapshot is currently active and has a non-zero radius.
 *
 * For interactive container tokens (generic mode), the container's contents
 * live in its flag blob as plain objects rather than Item documents. This
 * function wraps those records into a minimal item-like shape so the rest of
 * the pipeline can treat them uniformly.
 *
 * For model-backed actors (dnd5e / pf2e), items are real Item documents and
 * `adapter.getItemCarriedLightData(item)` reads from the standard tokenState
 * flag payload.
 *
 * @param {Actor} actor
 * @returns {Array<Item|{id: string, flags: object}>}
 */
function getEmittingItems(actor) {
  if (!actor) return [];
  const adapter = getAdapter();

  // Generic interactive containers store their contents in the flag blob.
  // Each content row has its own emittedLight / lightActive fields (written
  // by the deposit paths in placement.mjs and ItemTransfer.mjs).
  if (adapter.constructor.SYSTEM_ID === "generic" && isInteractiveContainer(actor)) {
    const data = adapter.getInteractiveData(actor);
    return (data.contents ?? []).filter(c =>
      c?.lightActive
      && c?.emittedLight
      && ((c.emittedLight.dim ?? 0) > 0 || (c.emittedLight.bright ?? 0) > 0)
    ).map(c => ({
      id: c.id,
      // Wrap content data into the tokenState flag shape that buildSourceData and
      // the adapter's getItemCarriedLightData both read from.
      flags: {
        "pick-up-stix": {
          tokenState: {
            system: {
              emittedLight: c.emittedLight,
              lightActive: true
            }
          }
        }
      }
    }));
  }

  // Model-backed actors: items are real documents with flag payloads.
  return (actor.items?.contents ?? []).filter(item => {
    const { light, active } = adapter.getItemCarriedLightData(item);
    if (!active || !light) return false;
    if ((light.dim ?? 0) <= 0 && (light.bright ?? 0) <= 0) return false;
    return true;
  });
}

/**
 * Build the data payload the PointLightSource consumes. Mirrors the shape
 * `Token#_getLightSourceData()` constructs: the LightData fields, plus an
 * origin (x, y, elevation) derived from the carrier token's position.
 *
 * The light field values come from the item's carried-light snapshot rather
 * than the carrier's own `tokenDoc.light`, so the carrier's own light is
 * completely unaffected.
 *
 * @param {Token} tokenObj  The carrier token placeable.
 * @param {{id: string, flags: object}|Item} item  Item or item-like record.
 * @returns {object}
 */
function buildSourceData(tokenObj, item) {
  const adapter = getAdapter();
  const { light } = adapter.getItemCarriedLightData(item);
  // Fallback: read directly from the wrapped flag shape (used by the generic
  // container path whose item-like objects have that shape set explicitly).
  const lightData = light ?? item.flags?.["pick-up-stix"]?.tokenState?.system?.emittedLight ?? {};

  const tokenDoc = tokenObj.document;
  // getLightOrigin() exists on v14 (elevation-aware); v13 tokens lack it.
  // Fall back to the explicit center/elevation pair that v13 uses. Note that
  // `tokenObj.center` reads through `document.getCenterPoint()` which Foundry
  // interpolates per-frame during animation — so this expression yields the
  // live animated position when called from refreshToken, and the destination
  // when called from updateToken/drawToken.
  const origin = tokenDoc.getLightOrigin?.() ?? {
    x: tokenObj.center.x,
    y: tokenObj.center.y,
    elevation: tokenDoc.elevation ?? 0
  };

  // Scale grid-unit radii to pixels. `Token#getLightRadius(units)` is what
  // Foundry's own token-light pipeline uses internally — passing raw grid
  // values straight to a PointLightSource yields a malformed source that
  // doesn't emit (only a tiny indicator renders).
  const dimPx = tokenObj.getLightRadius(lightData.dim ?? 0);
  const brightPx = tokenObj.getLightRadius(lightData.bright ?? 0);

  return {
    ...lightData,
    x: origin.x,
    y: origin.y,
    elevation: origin.elevation,
    level: tokenDoc.level,
    rotation: tokenDoc.rotation ?? 0,
    dim: dimPx,
    bright: brightPx,
    externalRadius: tokenObj.externalRadius ?? 0,
    seed: tokenDoc.getFlag?.("core", "animationSeed") ?? 0,
    preview: false,
    disabled: false
  };
}

/**
 * Ensure a synthetic PointLightSource exists (or is refreshed) for one
 * (token, item) pair. Creates the source on first call; on subsequent calls
 * re-initializes it in-place (cheap data swap, no shader rebuild) and
 * re-registers it via `add()`.
 *
 * @param {Token} tokenObj
 * @param {{id: string, flags: object}|Item} item
 * @returns {PointLightSource}
 */
function ensureSource(tokenObj, item) {
  const sourceId = makeSourceId(tokenObj.id, item.id);
  const SourceCls = CONFIG.Canvas.lightSourceClass;
  let source = canvas.effects.lightSources.get(sourceId);
  if (!source) {
    source = new SourceCls({ sourceId, object: tokenObj });
    dbg("carriedLights:create", { sourceId, tokenId: tokenObj.id, itemId: item.id });
  }
  source.initialize(buildSourceData(tokenObj, item));
  source.add();
  return source;
}

/**
 * Destroy the synthetic source for a (token, item) pair if one exists. This
 * removes the source from `canvas.effects.lightSources` and tears down its
 * internal state.
 *
 * @param {string} tokenId
 * @param {string} itemId
 */
function destroySource(tokenId, itemId) {
  const sourceId = makeSourceId(tokenId, itemId);
  const source = canvas.effects.lightSources.get(sourceId);
  if (!source) return;
  dbg("carriedLights:destroy", { sourceId });
  source.destroy();
}

/**
 * Reconcile every carried-light source for `tokenObj` with the actor's current
 * inventory (or flag-blob contents for generic containers). Adds missing
 * sources, re-initializes existing ones with current position data, and
 * destroys those whose item is no longer present or no longer active.
 *
 * For interactive container tokens, sources are only created when the
 * container is open; closing the container causes all contents-driven sources
 * to be destroyed.
 *
 * Skips silently when the canvas lighting pipeline is not available (scene
 * swaps, teardown).
 *
 * @param {Token} tokenObj  The carrier token placeable.
 */
export function syncTokenCarriedLights(tokenObj) {
  if (!canvas?.effects?.lightSources) return;

  const actor = tokenObj.actor;
  if (!actor) {
    dbg("carriedLights:sync", "no actor on token, skip", { tokenId: tokenObj.id });
    return;
  }

  const isContainer = isInteractiveContainer(actor);
  const containerOpen = isContainer ? getAdapter().isInteractiveOpen(actor) : true;

  dbg("carriedLights:sync", {
    tokenId: tokenObj.id,
    actorName: actor.name,
    isContainer,
    containerOpen
  });

  // Container items only emit while the container is open.
  const desired = (isContainer && !containerOpen) ? [] : getEmittingItems(actor);
  const desiredIds = new Set(desired.map(i => i.id));

  // Destroy stale sources keyed under this token that are no longer in the
  // desired set (item removed, toggled off, or container closed).
  const prefix = `${PREFIX}:${tokenObj.id}:`;
  for (const [sid] of canvas.effects.lightSources.entries()) {
    if (!sid.startsWith(prefix)) continue;
    const itemId = sid.slice(prefix.length);
    if (!desiredIds.has(itemId)) {
      dbg("carriedLights:sync", "destroying stale source", { sid });
      destroySource(tokenObj.id, itemId);
    }
  }

  // Create / refresh sources for the desired set.
  for (const item of desired) ensureSource(tokenObj, item);

  // Trigger a perception re-composite whenever any source changed.
  if (desired.length > 0 || [...canvas.effects.lightSources.keys()].some(k => k.startsWith(prefix))) {
    canvas.perception.update({ refreshLighting: true, refreshVision: true });
  }
}

/**
 * Cheap per-frame position refresh used during token animation. Re-initializes
 * existing synthetic sources for this token with the current animated position
 * without re-evaluating the inventory or destroying/recreating anything.
 *
 * Called from the `refreshToken` hook on `refreshPosition` flags so the carried
 * light tracks the token's PIXI animation smoothly instead of snapping to the
 * destination on commit and staying there.
 *
 * @param {Token} tokenObj
 */
function refreshCarriedLightPositions(tokenObj) {
  if (!canvas?.effects?.lightSources) return;
  const prefix = `${PREFIX}:${tokenObj.id}:`;
  let any = false;
  for (const [sid, source] of canvas.effects.lightSources.entries()) {
    if (!sid.startsWith(prefix)) continue;
    const itemId = sid.slice(prefix.length);
    // Reconstruct the item-like wrapper from the actor so getEmittingItems
    // ordering / wrapping doesn't matter — we just need the carried-light data.
    const actor = tokenObj.actor;
    if (!actor) continue;
    let item = actor.items?.get?.(itemId);
    if (!item) {
      // Generic container content row — pull from flag blob.
      const data = getAdapter().getInteractiveData(actor);
      const row = (data.contents ?? []).find(c => c.id === itemId);
      if (!row) continue;
      item = {
        id: itemId,
        flags: { "pick-up-stix": { tokenState: { system: { emittedLight: row.emittedLight, lightActive: true } } } }
      };
    }
    source.initialize(buildSourceData(tokenObj, item));
    any = true;
  }
  if (any) canvas.perception.update({ refreshLighting: true, refreshVision: true });
}

/**
 * Destroy every synthetic source associated with `tokenId`. Called when a
 * token is deleted so no orphaned sources remain in the scene's light pipeline.
 *
 * @param {string} tokenId
 */
export function destroyTokenCarriedLights(tokenId) {
  if (!canvas?.effects?.lightSources) return;

  const prefix = `${PREFIX}:${tokenId}:`;
  const toDestroy = [];
  for (const [sid] of canvas.effects.lightSources.entries()) {
    if (sid.startsWith(prefix)) toDestroy.push(sid.slice(prefix.length));
  }

  if (!toDestroy.length) return;

  dbg("carriedLights:destroyAll", { tokenId, count: toDestroy.length });
  for (const itemId of toDestroy) destroySource(tokenId, itemId);
  canvas.perception.update({ refreshLighting: true, refreshVision: true });
}

/**
 * Wire all lifecycle hooks that drive carried-light source management. Called
 * once from `pick-up-stix.mjs` init after `registerQtyBadge()`.
 */
export function registerCarriedLights() {

  // Full re-pass after every scene draw. Covers scene switches and initial load.
  Hooks.on("canvasReady", () => {
    if (!canvas?.effects?.lightSources) return;
    dbg("carriedLights:canvasReady", "syncing all token carried lights");
    for (const t of canvas.tokens?.placeables ?? []) syncTokenCarriedLights(t);
  });

  // Mid-session token additions — run initial sync for the new placeable.
  Hooks.on("drawToken", (token) => {
    if (!canvas?.effects?.lightSources) return;
    dbg("carriedLights:drawToken", { tokenId: token.id });
    syncTokenCarriedLights(token);
  });

  // Movement / elevation changes — re-initialize every carried source on
  // this token so the light origin tracks the token's new position. This
  // fires once at update commit; the per-frame interpolation is handled by
  // the refreshToken hook below.
  Hooks.on("updateToken", (tokenDoc, changes) => {
    if (!canvas?.effects?.lightSources) return;
    if (!("x" in changes) && !("y" in changes) && !("elevation" in changes) && !("level" in changes)) return;
    const obj = canvas.tokens?.get(tokenDoc.id);
    if (!obj) return;
    dbg("carriedLights:updateToken", { tokenId: tokenDoc.id, movedKeys: Object.keys(changes).filter(k => ["x","y","elevation","level"].includes(k)) });
    syncTokenCarriedLights(obj);
  });

  // Per-frame position refresh during animation. Foundry's _onAnimationUpdate
  // sets refreshPosition on every animated frame; without this hook our
  // synthetic sources would snap to the destination at update-commit and stay
  // there while the token visual animates over to it.
  Hooks.on("refreshToken", (token, flags) => {
    if (!flags?.refreshPosition && !flags?.refreshElevation) return;
    refreshCarriedLightPositions(token);
  });

  // Token removal — destroy all synthetic sources for it.
  Hooks.on("deleteToken", (tokenDoc) => {
    dbg("carriedLights:deleteToken", { tokenId: tokenDoc.id });
    destroyTokenCarriedLights(tokenDoc.id);
  });

  // Inventory mutations — re-evaluate which items on this actor emit light.
  const onItemChange = (item) => {
    const actor = item?.parent;
    if (!actor) return;
    if (!canvas?.effects?.lightSources) return;
    const tokens = canvas.tokens?.placeables.filter(
      t => t.actor?.id === actor.id || t.actor?.uuid === actor.uuid
    ) ?? [];
    dbg("carriedLights:itemChange", { actorName: actor.name, tokenCount: tokens.length });
    for (const t of tokens) syncTokenCarriedLights(t);
  };

  Hooks.on("createItem", onItemChange);

  Hooks.on("updateItem", (item, changes) => {
    // Fast-path: only re-sync when light-relevant fields changed.
    const lightActiveChanged = foundry.utils.hasProperty(changes ?? {}, "flags.pick-up-stix.tokenState.system.lightActive");
    const emittedLightChanged = foundry.utils.hasProperty(changes ?? {}, "flags.pick-up-stix.tokenState.system.emittedLight");
    if (!lightActiveChanged && !emittedLightChanged) return;
    dbg("carriedLights:updateItem", { itemId: item.id, lightActiveChanged, emittedLightChanged });
    onItemChange(item);
  });

  Hooks.on("deleteItem", onItemChange);

  // Container open/close gate — re-sync when the open state flips.
  // Also re-syncs generic containers when the contents array mutates
  // (new deposit / row removal changes which items should emit).
  Hooks.on("updateActor", (actor, changes) => {
    if (!canvas?.effects?.lightSources) return;
    if (!isInteractiveActor(actor)) return;

    // Model-backed container: isOpen lives at system.isOpen.
    const modelIsOpenChanged = foundry.utils.hasProperty(changes, "system.isOpen");
    // Generic container: isOpen lives inside the flag blob.
    const genericFlagChanged = foundry.utils.hasProperty(changes, "flags.pick-up-stix.interactive");

    if (!modelIsOpenChanged && !genericFlagChanged) return;

    // Only re-sync interactive container tokens; player tokens pick up items
    // whose light is driven by updateItem hooks above, not by updateActor.
    if (!isInteractiveContainer(actor)) return;

    const tokens = canvas.tokens?.placeables.filter(t => t.actor?.id === actor.id) ?? [];
    dbg("carriedLights:updateActor", {
      actorName: actor.name,
      modelIsOpenChanged,
      genericFlagChanged,
      tokenCount: tokens.length
    });
    for (const t of tokens) syncTokenCarriedLights(t);
  });
}
