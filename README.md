# Pick-Up-Stix

A Foundry VTT v13+ module for the dnd5e and pf2e systems that lets GMs place interactive objects on the canvas for players to discover, inspect, and interact with. Objects use the active system's native item and container sheets for a seamless experience.

## Features

### One Actor, Two Modes

A single interactive object actor type adapts its behavior to whatever Item is dropped onto it:

- **Item mode** -- When the embedded item is any non-container (weapon, potion, quest item, etc.). Players inspect via the system's native item sheet and pick the object up, removing the token from the canvas. Supports an unidentified state with a separate name, image, and description, powered by the active system's built-in identification model.
- **Container mode** -- When the embedded item is a container (dnd5e `container`, pf2e `backpack`, etc.). Opens the system's native container sheet with full inventory display. Supports open/close and lock/unlock states with token image swapping between closed and open art.

### Native System Sheet Integration

Interactive objects display their contents through the active system's own sheets, routed through a per-system adapter:

- **dnd5e** -- Item-mode opens `ItemSheet5e`; container-mode opens `ContainerSheet` with the full dnd5e inventory grid, drag/drop, encumbrance, and filtering. Identification uses dnd5e's built-in `system.identified` / `system.unidentified` fields.
- **pf2e** -- Item-mode opens the matching per-type sheet (`WeaponSheetPF2e`, `EquipmentSheetPF2e`, `ConsumableSheetPF2e`, etc.); container-mode opens `ContainerSheetPF2e` for the embedded backpack item. Identification uses pf2e's `system.identification.status` (with the system's own mystify popup for image/name/description overrides).
- The native sheet automatically hides details from non-GM players when an item is unidentified, regardless of system.

### Player Interaction

- **Token HUD** -- Players interact through buttons on the Token HUD: inspect contents, pick up items, and open/close containers.
- **Two proximity ranges** -- Each object has a configurable **inspection range** (to see the nameplate and open the sheet) and a tighter **interaction range** (to pick up, open/close, lock, or view container contents). Beyond inspection range, players see a **limited-view dialog** with a generic name and description; when they move into inspection range, the dialog is promoted in place to the real sheet. Sheets update live as a player moves through the ranges.
- **Limited name / description** -- GMs can set a `Limited Name` and `Limited Description` shown to distant observers. When blank, a sensible fallback is used ("A chest of some sort" / "You are too far away to discern any details."). Containers append an "it appears open/closed" line automatically.
- **Hidden container contents** -- (dnd5e) When a player opens a container sheet while closed, locked, or outside interaction range, the inventory is replaced with a placeholder message instead of listing contents. On pf2e the native `ContainerSheetPF2e` only displays the backpack's properties, so contents are not exposed regardless of state.
- **Drop items** -- Players can drop items from their inventory onto the canvas via drag-and-drop or the "Drop Item" right-click context menu. Items are placed at the player's token position. By default no modifier key is required; GMs can optionally require Ctrl via the "Require Ctrl for drag actions" Module Setting.
- **Deposit items** -- Players can drag items from their inventory into an open container's sheet to deposit them.
- **Unidentified item privacy** -- When an interactive object item is in a player's inventory, the player sees only the generic name, image, and description until a GM reveals it.

### GM Tools

- **GM configuration dialog** -- Each interactive object has a dedicated config dialog for module-specific properties (interaction range, inspection range, identified/open/limited images, limited name/description, locked message). Accessible from the Token HUD (gear icon), the system sheet header (gear icon), or by clicking the base actor in the sidebar.
- **Drag-and-drop placement** -- Drag any item from an inventory or the Items sidebar onto the canvas to create an interactive object, or drag an interactive actor from the sidebar to place one of its tokens. GMs can place anywhere; players drop at their own token. By default no modifier key is required; GMs can require Ctrl via the "Require Ctrl for drag actions" Module Setting (Cmd on macOS).
- **Template vs ephemeral actors** -- When placing a world item, GMs can choose to create a persistent template actor (reusable) or an ephemeral one-off placement that auto-cleans when the token is removed.
- **Drop actors into containers** -- Drag an item-mode interactive object actor from the sidebar onto any container sheet (interactive container, PC/NPC backpack, or world-level container) to add it. The container preserves the actor's identification state and round-trip flags. Container-mode actors cannot be nested.
- **Scene control button** -- A toolbar button to create empty interactive objects from scratch.
- **GM actor picker** -- When a GM picks up an item with no unambiguous target (no single controlled NPC/PC token), a searchable dialog lists all non-interactive actors on the current scene so the GM can choose who receives the item. When multiple non-interactive tokens are already controlled, the picker is scoped to just those candidates.
- **Lock and identify controls** -- Available from the config dialog, Token HUD, and the system's native sheet header. Locking an open container also closes it.
- **Open/close toggle on container sheet** -- GMs see an open/close button in the container sheet header that toggles the container state and updates both the sheet image and token image.
- **Per-item identification toggle** -- (dnd5e) In a player's character sheet inventory, a GM-only wand icon appears next to each interactive object item, and a "Reveal / Hide" entry is added to the inventory context menu. (pf2e) The system's own per-row identify control is used.
- **Pickup buttons in container sheets** -- Token container sheets show pickup buttons next to each item in the inventory for quick item transfer.
- **Configurable defaults** -- Module settings for default container images (open and closed), default interaction and inspection ranges, actor folder organization, and folder color.

### Architecture Highlights

- **System adapter** -- All system-specific surfaces (item types, identification, sheet delegation, drop hooks, context menus) are isolated behind a `SystemAdapter` contract. The active adapter (`dnd5e/`, `pf2e/`) is selected at module entry by `game.system.id`, so core code never branches on system identity.
- **Unlinked tokens** -- Each placed token is independent from the base actor template. Picking up an item from one token doesn't affect other tokens created from the same actor.
- **Socket-based security** -- All player mutations (pickup, deposit, open/close, placement) route through sockets to the active GM client for processing.
- **Round-trip placement** -- Items picked up from the canvas remember their source actor and token state. Dropping them back restores the original token appearance and reuses the original base actor.
- **Native identification** -- Leverages each system's built-in identification model (dnd5e `IdentifiableTemplate`, pf2e `system.identification`), with bidirectional sync between the actor and embedded item via the adapter.

## Requirements

- Foundry VTT v13+
- One of: dnd5e system 4.0.0+ **or** pf2e system 8.0.0+
- [lib-wrapper](https://foundryvtt.com/packages/lib-wrapper) module

## Installation

Install via the Foundry module browser by searching for "Pick-Up-Stix", or paste the manifest URL into the Install Module dialog.

## AI Usage

AI has been used to CSS styling and for researching the Foundry VTT APIs to ensure proper usage most especially for determine the differences between the various versions of Foundry supported by the module.

---

Some icons included are from [vecteezy.com](https://www.vecteezy.com).
