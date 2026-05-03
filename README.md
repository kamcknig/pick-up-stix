# Pick-Up-Stix

A Foundry VTT v13+ module for the dnd5e system that lets GMs place interactive objects on the canvas for players to discover, inspect, and interact with. Objects use native dnd5e item and container sheets for a seamless experience.

## Features

### One Actor, Two Modes

A single interactive object actor type adapts its behavior to whatever dnd5e Item is dropped onto it:

- **Item mode** -- When the embedded item is any non-container (weapon, potion, quest item, etc.). Players inspect via the native dnd5e item sheet and pick the object up, removing the token from the canvas. Supports an unidentified state with a separate name, image, and description, powered by dnd5e's built-in identification system.
- **Container mode** -- When the embedded item is a dnd5e container (chests, barrels, crates, etc.). Opens the native dnd5e container sheet with full inventory grid, drag/drop, and filtering. Supports open/close and lock/unlock states with token image swapping between closed and open art.

### Native dnd5e Sheet Integration

Interactive objects display their contents through dnd5e's own sheets:

- **Item-mode objects** open the embedded item's native `ItemSheet5e` -- players see the same polished sheet they'd see for any dnd5e item, with full description rendering, property display, and detail tabs.
- **Container-mode objects** open the embedded container's native `ContainerSheet` -- the full dnd5e inventory grid with columns, drag/drop support, encumbrance tracking, and item filtering.
- **Identification** uses dnd5e's built-in `system.identified` and `system.unidentified` fields. The dnd5e sheet automatically hides details from non-GM players when an item is unidentified.

### Player Interaction

- **Token HUD** -- Players interact through buttons on the Token HUD: inspect contents, pick up items, and open/close containers.
- **Two proximity ranges** -- Each object has a configurable **inspection range** (to see the nameplate and open the sheet) and a tighter **interaction range** (to pick up, open/close, lock, or view container contents). Beyond inspection range, players see a **limited-view dialog** with a generic name and description; when they move into inspection range, the dialog is promoted in place to the real sheet. Sheets update live as a player moves through the ranges.
- **Limited name / description** -- GMs can set a `Limited Name` and `Limited Description` shown to distant observers. When blank, a sensible fallback is used ("A chest of some sort" / "You are too far away to discern any details."). Containers append an "it appears open/closed" line automatically.
- **Hidden container contents** -- When a player opens a container sheet while closed, locked, or outside interaction range, the inventory is replaced with a placeholder message instead of listing contents.
- **Drop items** -- Players can drop items from their inventory onto the canvas via drag-and-drop or the "Drop Item" right-click context menu. Items are placed at the player's token position. By default no modifier key is required; GMs can optionally require Ctrl via the "Require Ctrl for drag actions" Module Setting.
- **Deposit items** -- Players can drag items from their inventory into an open container's sheet to deposit them.
- **Unidentified item privacy** -- When an interactive object item is in a player's inventory, the player sees only the generic name, image, and description until a GM reveals it.

### GM Tools

- **GM configuration dialog** -- Each interactive object has a dedicated config dialog for module-specific properties (interaction range, inspection range, identified/open/limited images, limited name/description, locked message). Accessible from the Token HUD (gear icon), the dnd5e sheet header (gear icon), or by clicking the base actor in the sidebar.
- **Drag-and-drop placement** -- Drag any item from an inventory or the Items sidebar onto the canvas to create an interactive object, or drag an interactive actor from the sidebar to place one of its tokens. GMs can place anywhere; players drop at their own token. By default no modifier key is required; GMs can require Ctrl via the "Require Ctrl for drag actions" Module Setting (Cmd on macOS).
- **Template vs ephemeral actors** -- When placing a world item, GMs can choose to create a persistent template actor (reusable) or an ephemeral one-off placement that auto-cleans when the token is removed.
- **Drop actors into containers** -- Drag an item-mode interactive object actor from the sidebar onto any dnd5e container sheet (interactive container, PC/NPC backpack, or world-level container) to add it. The container preserves the actor's identification state and round-trip flags. Container-mode actors cannot be nested.
- **Scene control button** -- A toolbar button to create empty interactive objects from scratch.
- **GM actor picker** -- When a GM picks up an item with no unambiguous target (no single controlled NPC/PC token), a searchable dialog lists all non-interactive actors on the current scene so the GM can choose who receives the item. When multiple non-interactive tokens are already controlled, the picker is scoped to just those candidates.
- **Lock and identify controls** -- Available from the config dialog, Token HUD, and dnd5e sheet header buttons. Locking an open container also closes it.
- **Open/close toggle on container sheet** -- GMs see an open/close button in the dnd5e ContainerSheet header that toggles the container state and updates both the sheet image and token image.
- **Per-item identification toggle** -- In a player's dnd5e character sheet inventory, a GM-only wand icon appears next to each interactive object item, and a "Reveal / Hide" entry is added to the inventory context menu.
- **Pickup buttons in container sheets** -- Token container sheets show pickup buttons next to each item in the inventory for quick item transfer.
- **Configurable defaults** -- Module settings for default container images (open and closed), default interaction and inspection ranges, actor folder organization, and folder color.

### Architecture Highlights

- **Unlinked tokens** -- Each placed token is independent from the base actor template. Picking up an item from one token doesn't affect other tokens created from the same actor.
- **Socket-based security** -- All player mutations (pickup, deposit, open/close, placement) route through sockets to the active GM client for processing.
- **Round-trip placement** -- Items picked up from the canvas remember their source actor and token state. Dropping them back restores the original token appearance and reuses the original base actor.
- **Native dnd5e identification** -- Leverages dnd5e's built-in `IdentifiableTemplate` for identification display, with bidirectional sync between the actor and embedded item.

## Requirements

- Foundry VTT v13+
- dnd5e system 4.0.0+
- [lib-wrapper](https://foundryvtt.com/packages/lib-wrapper) module

## Installation

Install via the Foundry module browser by searching for "Interactive Items", or paste the manifest URL into the Install Module dialog.

## AI Usage

AI has been used to CSS styling and for researching the Foundry VTT APIs to ensure proper usage most especially for determine the differences between the various versions of Foundry supported by the module.

---

Some icons included are from [vecteezy.com](https://www.vecteezy.com).
