# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What This Is

A Foundry VTT v13/v14 module (`pick-up-stix`) for the **dnd5e** and **pf2e** systems. GMs place interactive objects (items, containers) on the canvas as tokens; players interact via the Token HUD and the active system's native item / container sheets. Requires `lib-wrapper`, plus dnd5e ≥ 4.0.0 or pf2e ≥ 8.0.0.

## Compatibility (mandatory)

Every change must remain compatible with **every Foundry version and every system version declared in `module.json`** — re-read it for the current floors/ceilings rather than assuming. Today: Foundry `compatibility.minimum: 13`, `verified: 14`, no `maximum`; dnd5e `minimum: 4.0.0` (no verified); pf2e `minimum: 8.0.0`, `verified: 8.1.0`; lib-wrapper `minimum: 1.12.0`, `verified: 1.13.4`.

Before introducing or changing an API call, hook signature, document path, CSS class, or template helper:

1. Confirm the API behaves the same on `compatibility.minimum` *and* `verified`. Read the local Foundry source at the paths in `.claude/settings.local.json` for both versions over guessing.
2. Confirm the system surface is stable across every supported major. Anything system-specific must live in (or be reached through) the system adapter — never branch on `game.system.id` in core code.
3. If a desired API exists only on a higher Foundry generation or system major, **stop and ask** before writing — raising the floor is a coordination decision.
4. Where versions diverge, prefer feature-detection (`if (foundry.applications?.api?.DialogV2)`) over generation-checks. If a generation-check is unavoidable, isolate it in a small helper with a comment naming the API and the version it's gating on.
5. **System-fired hooks, sheet classes, and CSS class assumptions belong in the adapter**, not core. Anything dnd5e- or pf2e-only must be introduced inside `scripts/adapter/<systemId>/` and exposed through the `SystemAdapter` contract.

When developing system-specific adapter code, **follow that system's own conventions** — if the system uses ApplicationV1 sheets, the adapter does too; same for V2. (Today: dnd5e is V2, pf2e is V1.)

## Development Setup

Symlink the repo into Foundry's modules directory:
```bash
ln -s <this-repo> <FOUNDRY_DATA_DIR>/Data/modules/pick-up-stix
```

No build step. Edit and refresh Foundry (F5). Foundry app/data paths for both v13 and v14 are configured in `.claude/settings.local.json` — read locally rather than searching the web for Foundry / system source.

## Architecture

### System Adapter

`scripts/adapter/SystemAdapter.mjs` is an abstract base class that declares the contract every supported system implements. Concrete subclasses live at `scripts/adapter/<systemId>/index.mjs` and are mixed from per-concern sub-modules (`identification.mjs`, `container.mjs`, `sheets.mjs`, `hooks.mjs`, `configSheet.mjs`, etc.) via `Object.assign`.

`scripts/adapter/index.mjs` exposes:
- `loadAdapter()` — async, dynamic-imports the active adapter (idempotent; called once at module entry).
- `getAdapter()` — sync accessor; throws if `loadAdapter()` hasn't resolved.

Core code calls `getAdapter()` and operates on the singleton — **never `if (game.system.id === ...)`**. The contract covers identity/capabilities, item-type vocabulary (container vs physical), container-parent ID accessors, identification (read/write/toggle, source-name/img/description sync, button config, native sheet selectors), item construction, sheet delegation (`renderConfigSheet`/`renderContainerView`/`renderItemView`/`renderEmbeddedSheet`), and hook registration. Read `SystemAdapter.mjs` for the current method list.

Adding a new system: create `scripts/adapter/<id>/index.mjs` with a subclass that overrides everything the base abstracts. The dispatcher and core flows do not need to change.

### Unified Actor Sub-Type

One actor sub-type — `pick-up-stix.interactiveItem` — wraps a single Item. `InteractiveItemModel` (mixed with `InteractiveModelMixin`) derives `isContainer` / `containerItem` / `embeddedItem` on the fly via `getAdapter().isContainerItem()`. If the embedded item is the system's container type, the actor behaves as a container (open/close, open image); otherwise it's a single-item interactive (with optional unidentified-image override).

pf2e-specific: `Pf2eInteractiveItemModel` adds the stub fields pf2e's prepare chain reads (`details.level.value`, `details.alliance`) so its actor classes don't crash. The pf2e adapter also registers `LootPF2e` as the document class for our sub-type, satisfying pf2e's closed `ActorProxyPF2e` registry.

Container template actors created from an item drop set `flags["pick-up-stix"].containerDefault` so `getDefaultArtwork` returns the configured default container image.

### Sheet Architecture — Dispatcher + Adapter-Owned Sheets

`InteractiveItemSheet` is registered as the sheet for `pick-up-stix.interactiveItem` but **never visually renders**. Its `render()` is purely a system-agnostic dispatcher:

- **Base actor (sidebar) or `#configMode === true`** → `adapter.renderConfigSheet()`. Each adapter ships its own GM config sheet matching the system's UI conventions (dnd5e: V2 `Dnd5eInteractiveItemConfigSheet`; pf2e: V1 `Pf2eInteractiveItemConfigSheet`). Both cache instances per actor UUID and clean up abandoned actors on `close()`.
- **Container-mode token** → `adapter.renderContainerView()` opens the system's native container sheet (dnd5e `ContainerSheet`; pf2e opens the embedded backpack item's `ContainerSheetPF2e` and the module injects a **Contents** tab between Description and Details that lists deposited items in row form).
- **Item-mode token** → `adapter.renderItemView()` opens the system's native item sheet.
- **Out-of-inspection-range non-GM** → `showLimitedDialog()` shows a `DialogV2` with `system.limitedDisplayName` / `limitedDisplayDescription`. Open dialogs are tracked in `InteractiveItemSheet.limitedDialogs` (keyed by actor UUID) and promoted to the real sheet when the player moves into inspection range.

The dispatcher also suppresses dispatch for blank uninitialized actors lacking a creation marker (`containerDefault`, `createKindConfirmed`, `ephemeral`, `system.sourceItemUuid`), and uses a static `pendingPicker` Set to suppress the empty-sheet flash while the kind-picker dialog is open.

**Header buttons / config dialog header toggles**: Adapter `register*` methods subscribe to system render hooks and forward to system-agnostic decorators. Decorators inject GM-only buttons (lock, configure, open/close on containers) styled via `adapter.cssClasses`. The config dialog injects its own header toggles for the same set via `_onRender` / `_getHeaderButtons`. When the system already provides an identify control on its sheet header (dnd5e), the adapter exposes its selector via `nativeIdentifyHeaderSelector` so we relocate that control rather than duplicating it.

### Base Actor vs Token (critical concept)

All tokens are **unlinked** (`actorLink: false`). The base actor in the sidebar is a **template**. `preCreateToken` snapshots the full actor state into the token's delta plus a `flags["pick-up-stix"].snapshotItemIds` array. After creation, changes to the base actor (items, name, description, isOpen) do **not** propagate to already-placed tokens.

- **Base actor sheet** opens the config dialog (always shows settings, no proximity/lock/open checks).
- **Token actor sheet** opens the system's native sheet (enforces open/close, lock, proximity for players).

`tokenDoc._source.delta.items` is unreliable (Foundry clears it after processing) — don't filter on it. Use `flags["pick-up-stix"].snapshotItemIds` instead. `topLevelItems` (in `InteractiveModelMixin`) filters by snapshot IDs **plus** any items not on the base actor (deposited after placement) **and** treats a `containerId` pointing to a non-existent sibling as null (defence against stale pointers carried over from a prior inventory life).

**Token copy/paste (Ctrl+C / Ctrl+V):** A pasted token references the same base actor as the source (Foundry preserves `actorId`, `actorLink`, and the full `delta`). A `pasteToken` hook in `scripts/pick-up-stix.mjs` captures the source token's synthetic-actor state into a transient `flags["pick-up-stix"].pasteSnapshot` on the create-data; `preCreateToken` consumes that snapshot and clears the flag, so the copy's delta mirrors the source's runtime state (deposited container items, identification, lock, open, light emission) rather than re-snapshotting from the base actor. The base actor is unchanged. For ephemeral actors the cleanup hook is multi-token-aware (`deleteToken` hook scans every scene), so the ephemeral actor survives until the last token referencing it — copy or original — is deleted.

### Identification State Management

The active system's native identified flag on the embedded item is the single source of truth, accessed through the adapter (`isItemIdentified` / `setItemIdentified`). The actor's `system.isIdentified` mirrors it bidirectionally:

- **Actor → Item** (`updateActor` hook): `adapter.buildItemIdentificationUpdate(actor, changes)` writes the system-specific identification fields. The same handler also calls `adapter.buildEmbeddedItemSourceUpdate(actor, isIdentified)` on name/description/unidentifiedName/unidentifiedDescription changes — this writes the embedded item's `_source.{name, img, system.description.value}` and (on pf2e) the per-state cache `system.identification.{state}.{name, img, data.description.value}`. The cache update is critical because pf2e populates `identification.identified` once via `??=` and reads `getMystifiedData(status)` thereafter; without updating it, the original name/description/image resurrects on the next identify cycle.
- **Item → Actor** (`updateItem` hooks): When the embedded item's identified flag changes, sync `actor.system.isIdentified` back, update token name/image via `resolveTokenName()` / `resolveImage()`, and re-run `buildEmbeddedItemSourceUpdate` for the new state. A separate `updateItem` hook calls `adapter.parseEmbeddedItemChanges(item, changes, actor)` to route edits made on the system's native sheet (main name input, description editor, mystification fields) back to the appropriate actor field for the current identification state. Loop prevention: source-sync writes pass `options.pickUpStix.internalSourceSync = true` so the parse hook skips its own writes.

**Identification can only be toggled by the GM**, via the system's native identify toggle, the config dialog identify button, the HUD identify button, dnd5e's "Reveal / Hide (Interactive)" inventory context entry, dnd5e's wand icon in character-sheet inventory rows, or (pf2e) the wand icon in the injected Contents tab.

**Identification on picked-up items** in player inventories uses flag-based payloads (`identifiedData`, `unidentifiedData`, `tokenState`) under `flags["pick-up-stix"]`. `toggleItemIdentification()` swaps `name`/`img`/`description` from the appropriate payload and routes the system-specific update through `adapter.performIdentifyToggle()`.

### Container Open/Close Image Sync

When `isOpen` flips, the `updateActor` hook syncs the embedded container item's `img` (open → `openImage`, closed → `actor.img`) and the token texture is updated separately via `updateContainerTokenImage()`.

### Pickup / Drop Round-Trip

Item-type pickups stamp the actor's identity onto the transferred item and snapshot the token state into `flags["pick-up-stix"].tokenState`. Re-dropping restores the token state and reuses the original base actor via `flags["pick-up-stix"].sourceActorId`. Container items are independent — pickups from a container preserve the item's original identity, but interactive object items inside a container keep their interactive flags for round-trip behavior.

### Deposit into Containers

Drops onto container sheets are gated through `adapter.registerContainerDropGate` (dnd5e: `dnd5e.dropItemSheetData` hook; pf2e: libWrapper on `ActorSheetPF2e.prototype._handleDroppedItem` since pf2e has no equivalent public hook). Items get their container-parent set via `adapter.setItemContainerId(itemData, containerItem.id)`. Wrapping an item into a new interactive actor strips any stale `containerId` first (via the same adapter call) so phantom pointers don't survive.

Actor drops onto any container sheet are handled by the `installActorDropListener` decorator: extract the item via `buildInteractiveItemData()`, set the container-parent, create the document on the destination's parent actor (or world-level). Player drops into interactive containers are gated by lock/open/proximity. Container-mode actors cannot be nested (notify "NoContainerInContainer").

**Container item controls**: GM-only lock, identify, and delete icons render on each row inside a container's contents listing. On dnd5e via the `injectItemRowControls` decorator on the native ContainerSheet rows; on pf2e inside `_buildContainerContentRow` in the injected Contents tab (synthetic-token sheets add a hand pickup glyph). Lock and identify use the item's `flags["pick-up-stix"].tokenState.system` data. Per-item lock state is enforced on pickup. Contents-tab rows are draggable with the standard `{type:"Item", uuid}` payload so items can be moved to the canvas, character sheets, or other containers.

### Placement Behavior

- **Grid snapping**: `createInteractiveToken()` snaps to the grid cell via `canvas.grid.getTopLeftPoint()`.
- **Player placement** lands at the player's character token; **GM placement** is freeform.
- **Source deletion**: both paths delete the source item from inventory after placement.
- **Template vs ephemeral**: GMs choosing "Templated" keep a persistent base actor; "Ephemeral" creates a one-off that auto-deletes when the token is removed.

### Proximity and Live Sheet Updates

Each interactive actor has two ranges:
- `system.interactionRange` (default 1) — pickup, open/close, lock, deposits, container contents access.
- `system.inspectionRange` (default 4) — nameplate visibility, real-sheet access (vs the limited dialog). Must be ≥ `interactionRange`; `preCreateActor` / `preUpdateActor` clamp `interactionRange` down when violated. 0 = unlimited.

Defaults come from module settings `defaultInteractionRange` / `defaultInspectionRange` (seeded by `preCreateActor`).

`checkProximity(actor, { range, silent, playerToken })` measures grid distance. Default range is `"interaction"`. GMs always pass. With no `playerToken`, iterates `getPlayerCandidateTokens()` (controlled non-interactive tokens, else assigned character's scene token) and returns true if any is in range — every player-side proximity gate is multi-token-aware. With an explicit `playerToken`, prefers its recorded override position from `_playerPositionOverrides` (Foundry's animation interpolates `document.x/y` mid-flight, so the live coords lie during movement — the `updateToken` hook captures the final destination into the override map; a `controlToken` hook seeds the override on selection).

`_reevaluateInteractiveProximity()` (triggered by `updateToken` / `controlToken`) walks **both** AppV1 (`ui.windows`) and AppV2 (`foundry.applications.instances`) registries. For each open interactive sheet, it closes the sheet if the viewer is now beyond inspection range; otherwise re-renders container sheets so the contents-hide gate re-evaluates. Item-document sheets (pf2e ContainerSheetPF2e) resolve their actor via `app.item?.actor`. The same dual-registry walk happens in `_rerenderContainerViews(actor)` so updates from anywhere reach both V1 and V2 sheets.

**Limited-view dialog**: Shown when a non-GM opens a sheet beyond inspection range. `promoteLimitedDialogsInRange()` (called from `updateToken` / `controlToken`) closes any dialog whose actor is now in inspection range and opens the real sheet via `adapter.renderEmbeddedSheet`, clamped to the dialog's prior position. A separate `updateActor` hook calls `refreshLimitedDialog()` on `isOpen` flip so the body's "appears open/closed" suffix stays current.

**Hidden container contents**: A render hook subscribed via `adapter.registerContainerViewHooks` replaces inventory with a `.pick-up-stix-contents-hidden` placeholder when the viewer is non-GM and either out of interaction range or the container is closed/locked. dnd5e: removes the items grid plus the currency/treasure row and the search/filter bar. pf2e: `_renderContainerContents` (the Contents-tab decorator) emits the placeholder in place of rows. The `updateToken` hook re-renders open container sheets so the placeholder tracks proximity.

### Permission Model

- Default ownership: `OBSERVER` for all players (set in `preCreateActor`).
- `libWrapper` patches `Token._canHUD` so Observer-level players see the HUD.
- `libWrapper` wraps `Token.prototype._refreshState` to hide hover and Alt-key border on interactive tokens (the standard selected border still renders for the GM). Force-hides the nameplate when the viewer is outside `inspectionRange` (re-triggered via `refreshState` on `updateToken`).
- `libWrapper` patches `Token.prototype._onClickRight` (MIXED) for interactive tokens: calls `this.control({ releaseOthers: false })` so opening the HUD doesn't release previously-controlled NPC/PC tokens — preserves `canvas.tokens.controlled[0]` as the natural pickup target for `getPlayerCharacter()`.
- All player mutations route through sockets → active GM processes them.
- `_canDragDrop()` returns `true` so non-owners can drop items.

### Drag Modifier Gate (canvas drops only)

`scripts/utils/dragModifier.mjs#dragModifiersHeld(event?)` reads the world-scope `requireCtrlForDrag` setting. When on, the configured Ctrl modifier (Cmd on macOS via `event.metaKey`) must be held for canvas drops to proceed. Falls back to `game.keyboard.isModifierActive("CONTROL")` when no DOM event is available.

The gate applies to **canvas drops only** — Item drops (always) and Actor drops where the dropped actor is interactive. Non-interactive Actor drops, all other data types, and **all sheet-side drops** pass through Foundry core untouched regardless of the setting.

### Quantity Prompt on Drop

When a stackable item with `system.quantity > 1` is moved across actors —
canvas drop, deposit into an interactive container, or give to an
overlapping PC token — the module shows a small `DialogV2` (`promptItemQuantity`
in `scripts/utils/quantityPrompt.mjs`) before the move executes. The dialog
has a number input clamped to `[1, source quantity]` plus **Min** / **Max**
shortcuts and **Confirm** / **Cancel** footer buttons. Cancel (or window
close) is a no-op; Confirm splits the source: a partial choice decrements
`system.quantity` on the source; a full-stack choice deletes the source as
before.

The prompt sits **after** the drop-target picker on canvas drops — picker
first (canvas / overlap container / overlap PC), quantity second.

Adapter contract: `getItemQuantity(item)` reads the current stack size and
`setItemDataQuantity(itemData, n)` writes the override on raw item data
prior to `createDocuments`. Both default implementations write
`system.quantity`, which dnd5e and pf2e share. Subclasses override only
when their system uses a different field path.

Quantity is threaded through the existing socket payloads as an optional
`quantity` field on `placeItem` and `depositItem`. The GM-side handlers
forward into `createInteractiveToken` / `depositItem` and replace the
unconditional `item.delete()` with `decrementOrDeleteItem(item, chosen)`.

Container-typed items, world items dropped by the GM, and items with
`quantity ≤ 1` skip the prompt entirely.

### Quantity Badge & Stack Controls (canvas)

Non-container interactive tokens whose embedded item has
`system.quantity > 1` show a numeric badge in the bottom-right corner
(`scripts/canvas/qtyBadge.mjs`). The badge is a `PreciseText` child
attached in the `drawToken` hook, repositioned in `refreshToken` (on
`refreshSize`/`refreshState` flags), and live-updated from
`updateItem` watching `system.quantity`.

Three canvas-side prompts share the `promptItemQuantity` dialog (the
same one introduced for drops):

- **Pickup**: clicking the HUD pickup hand on a stacked token opens
  the dialog. Threaded through the `pickupItem` socket payload as an
  optional `quantity`; partial pickups call `decrementOrDeleteItem`
  on the source instead of `item.delete()`.
- **Delete-key**: a `preDeleteToken` hook intercepts deletions of
  stacked interactive tokens. Multi-select deletes are batched
  (collected during the synchronous fire pass, flushed in a
  microtask) so the GM sees one combined `promptItemQuantitiesBatch`
  dialog with a row per stacked token instead of N stacked modals;
  single-token deletes route to the focused `promptItemQuantity`.
  Per-row choice >= max re-fires the delete with
  `options.pickUpStix.suppressPrompt = true` (full); choice < max
  decrements the embedded item without deleting (partial). Cancel
  suppresses the entire batch. Non-stacked tokens in the same
  selection (qty 1, containers) are deleted immediately and do not
  appear in the dialog.
- **Split**: a GM-only HUD button (`fa-arrows-split-up-and-left`)
  visible on stacked non-container tokens calls
  `splitInteractiveToken(sceneId, tokenId, splitQty)`. The split
  decrements the source and creates a new token in the next free
  adjacent cell — templated source reuses the same base actor;
  ephemeral source creates a fresh ephemeral actor.

All three sites read quantities through `adapter.getItemQuantity()`
and write either through the source item directly (`item.update`) or
through `decrementOrDeleteItem`, so dnd5e and pf2e are covered without
branching. Container tokens, world items, and stacks of `quantity ≤ 1`
skip every prompt.

### Socket Events

All handled by the active GM only. Events: `pickupItem`, `depositItem`, `toggleOpen`, `placeItem`, `splitItem`. The `placeItem` and `depositItem` payloads carry an optional `quantity` for partial-stack splits; `pickupItem` does the same; `splitItem` carries `splitQty`. Absent or `null` means "move the full stack" (legacy behavior).

### Debug Logging

All new code paths must use `dbg()` from `scripts/utils/debugLog.mjs`. The helper is a no-op when the `debugLogging` client setting is off (default: on) so it's cheap to leave in place.

**Required when writing/modifying code**:
- Every new hook callback: log entry with actor/item/token identity and relevant `changes` keys.
- Every new button click handler, socket handler, or sheet action: log entry.
- Every non-trivial decision branch: log which branch was taken and why.
- Every early `return` / bail: log the reason.
- Every document mutation (`actor.update`, `item.update`, `tokenDoc.update`, create/delete): log before with payload summary.

Tag format: `"fileShortName:function"` — e.g. `"hud:pickup"`, `"hook:updateActor"`, `"xfer:pickupItem"`. **Do NOT log inside per-frame paths** like `Token#_refreshState`. Log inside hooks that fire on state changes, not render loops.

## Styling Conventions

**Prefer built-in styles over custom CSS.** Use existing Foundry / system CSS classes rather than creating new ones. Only add to `styles/pick-up-stix.css` when no built-in equivalent exists.

System-specific class choices live on the adapter as `cssClasses.{stateToggle, configButton, rowControl, headerElementType}` so the system-agnostic decorators apply the right native class.

Module-specific CSS in `styles/pick-up-stix.css` is intentionally minimal — only elements with no built-in equivalent (empty-state prompts, GM identify toggle in character sheets, container row controls, folder trash button, settings dialog field sizing, GM actor picker dialog, the pf2e Contents-tab row layout, and pf2e config-sheet overrides that restore item-sheet input/label styling and tidy the header layout).

## Foundry v13/v14 Patterns Used

- **ApplicationV2 sheets**: `HandlebarsApplicationMixin(ActorSheetV2)` with `PARTS`, `submitOnChange: true`. Use `<file-picker>` and `<prose-mirror>` custom elements. Override `_prepareSubmitData` to inject `prototypeToken.texture.src` sync when `img` changes.
- **ApplicationV1 sheets**: `foundry.appv1.sheets.ActorSheet` with `getData()` / `_updateObject()` / `activateListeners()` / `_getHeaderButtons()`. AppV1 render hooks pass `html` as either jQuery or `HTMLElement` — normalise via the helper in `pf2e/hooks.mjs`. AppV1's `_replaceHTML` only swaps `.window-content`, so injected header controls must be re-synced manually in a `_render` override (see `Pf2eInteractiveItemConfigSheet`). Foundry V1's click-delegation looks descriptors up via `classList.contains(b.class)` — header button `class` strings must be a single token.
- **Dispatcher sheet pattern**: `InteractiveItemSheet` registered as the actor's sheet, never visually renders, routes to adapter sheets.
- **FilePicker instantiation**: `new foundry.applications.apps.FilePicker.implementation({...})` — `new FilePicker()` is broken in v13.
- **Custom actor sub-types**: `TypeDataModel` with `defineSchema()`, registered via `CONFIG.Actor.dataModels`. pf2e additionally requires registration into `CONFIG.PF2E.Actor.documentClasses`.
- **Default artwork**: Override `CONFIG.Actor.documentClass.getDefaultArtwork` (on the Actor class, not the data model).
- **Token texture animation**: `tokenDoc.update({"texture.src": path}, {animation: {duration: 500}})`.
- **System hooks via adapter**: never call `Hooks.on("dnd5e.*")` or `Hooks.on("renderSomethingPF2e", ...)` from core. Subscribe through the adapter's `register*` methods, which on pf2e fall back to libWrapper prototype patches for surfaces that have no public hook.

## Manifest Declarations

Custom `FilePathField` properties under `system.*` are declared in `module.json` under `documentTypes.Actor.<subtype>.filePathFields`. `HTMLField` properties under `system.*` are declared in `htmlFields`. Currently:
- `filePathFields`: `unidentifiedImage`, `openImage` (both `["IMAGE"]`).
- `htmlFields`: `description`, `unidentifiedDescription`, `limitedDescription`.

System support in `relationships.systems`: dnd5e minimum `4.0.0` (no verified, 4.x and 5.x in scope), pf2e minimum `8.0.0` / verified `8.1.0`.

## Breaking Changes & Migrations (mandatory)

If a change would invalidate, rename, remove, or reshape **any data that can already exist in a user's world** (actor flags, `system.*` fields, item flag payloads like `tokenState` / `identifiedData` / `unidentifiedData`, stored settings, schema keys, module-owned folder conventions, etc.), it is a **breaking change**.

**Before writing any code for a breaking change, STOP and inform the developer.** Describe what data would be invalidated, what the upgrade path would look like, and explicitly ask whether to proceed.

Once confirmed:

1. **Bump `module.json` version** in the same PR (semver — minor for additive-incompatible reshapes, major for true breaks).
2. **Ship a migration script** wired to `ready` that:
   - Runs only for the active GM.
   - Prompts via `DialogV2` describing the change with Run / Skip.
   - Persists a "completed" world-scoped setting flag once successful (e.g. `pick-up-stix.migration.<name>.completed`); after that, no re-prompt.
   - Re-prompts on every subsequent load until accepted (no "declined" persistence).
   - Is idempotent — re-running on an already-migrated world is safe.
   - Reports outcomes via `ui.notifications`.
3. **Document the break** in the PR description.

Pure code-level refactors that don't touch persisted data are **not** breaking changes. When unsure, default to asking before writing code.

## Commit Conventions

NEVER attribute Claude Code in commit messages.

## Documentation updates

CLAUDE.md should be optimized if it grows beyond a reasonable range to keep it concise.

README should be kept concise and not call out specific differences between systems unless they are MAJOR differences.
