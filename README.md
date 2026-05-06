# Pick-Up-Stix

A Foundry VTT v13+ module that lets GMs place interactive objects on the canvas for players to discover, inspect, and interact with. Objects use the active game system's native item and container sheets for a seamless experience.

> Behavior may differ slightly between supported game systems where the underlying system handles a feature differently (most notably around identification and how a system displays container contents). The module follows each system's own conventions rather than imposing its own UI.

## Features

### One Actor, Two Modes

A single interactive object actor type adapts its behavior to whatever Item is dropped onto it:

- **Item mode** -- When the embedded item is any non-container (weapon, potion, quest item, etc.). Players inspect via the system's native item sheet and pick the object up, removing the token from the canvas. Supports an unidentified state with a separate name, image, and description.
- **Container mode** -- When the embedded item is a container. Opens the system's native container sheet with full inventory display. Supports open/close and lock/unlock states with the token image swapping between closed and open art.

### Native System Sheet Integration

Interactive objects display through the active system's own item and container sheets so players see a familiar interface. Identification leverages each system's built-in identification model, with the actor and embedded item kept in sync; toggling identification preserves both the identified and unidentified presentations across cycles.

### Player Interaction

- **Token HUD** -- Players interact through buttons on the Token HUD: inspect contents, pick up items, and open/close containers.
- **Two proximity ranges** -- Each object has a configurable **inspection range** (to see the nameplate and open the sheet) and a tighter **interaction range** (to pick up, open/close, lock, or view container contents). Beyond inspection range, players see a **limited-view dialog** with a generic name and description; when they move into inspection range, the dialog is promoted in place to the real sheet. Sheets update live as a player moves through the ranges.
- **Limited name / description** -- GMs can set a `Limited Name` and `Limited Description` shown to distant observers. When blank, a sensible fallback is used ("A chest of some sort" / "You are too far away to discern any details."). Containers append an "it appears open/closed" line automatically.
- **Hidden container contents** -- When a player opens a container while it is closed, locked, or they are outside interaction range, the inventory listing is replaced with a placeholder message instead of revealing what's inside.
- **Drop items** -- Players can drop items from their inventory onto the canvas via drag-and-drop or a "Drop Item" right-click context menu where the system supports it. Items are placed at the player's token position. By default no modifier key is required; GMs can optionally require Ctrl via the "Require Ctrl for drag actions" Module Setting.
- **Deposit items** -- Players can drag items from their inventory into an open container to deposit them.
- **Unidentified item privacy** -- When an interactive object item is in a player's inventory, the player sees only the generic name, image, and description until a GM reveals it.

### GM Tools

- **GM configuration dialog** -- Each interactive object has a dedicated config dialog for module-specific properties (interaction range, inspection range, identified/open/limited images, limited name/description, locked message). Accessible from the Token HUD (gear icon), the system sheet header (gear icon), or by clicking the base actor in the sidebar.
- **Drag-and-drop placement** -- Drag any item from an inventory or the Items sidebar onto the canvas to create an interactive object, or drag an interactive actor from the sidebar to place one of its tokens. GMs can place anywhere; players drop at their own token.
- **Template vs ephemeral actors** -- When placing a world item, GMs can choose to create a persistent template actor (reusable) or an ephemeral one-off placement that auto-cleans when the token is removed.
- **Drop actors into containers** -- Drag an item-mode interactive object actor from the sidebar onto any container sheet to add it. The container preserves the actor's identification state and round-trip flags. Container-mode actors cannot be nested.
- **Scene control button** -- A toolbar button to create empty interactive objects from scratch.
- **GM actor picker** -- When a GM picks up an item with no unambiguous target (no single controlled NPC/PC token), a searchable dialog lists all non-interactive actors on the current scene so the GM can choose who receives the item. When multiple non-interactive tokens are already controlled, the picker is scoped to just those candidates.
- **Lock and identify controls** -- Available from the config dialog, Token HUD, and the system's native sheet header. Locking an open container also closes it.
- **Open/close toggle on container sheet** -- GMs see an open/close button in the container sheet header that toggles the container state and updates both the sheet image and token image.
- **Per-item pickup and management in containers** -- GMs see lock, identify, and delete controls per row inside a container's contents listing. Where the system displays its own row controls, those are reused; otherwise the module renders its own.
- **Drag items from container contents** -- Items in a container's contents listing can be dragged out to the canvas (placed as an interactive token) or onto another character/container sheet (transfers ownership).
- **Configurable defaults** -- Module settings for default container images (open and closed), default interaction and inspection ranges, actor folder organization, and folder color.

### Architecture Highlights

- **System adapter** -- All system-specific surfaces are isolated behind a `SystemAdapter` contract; one concrete adapter per supported system. Core code never branches on `game.system.id`, which keeps adding a new system to a single module under `scripts/adapter/`.
- **Unlinked tokens** -- Each placed token is independent from the base actor template. Picking up an item from one token doesn't affect other tokens created from the same actor.
- **Socket-based security** -- All player mutations (pickup, deposit, open/close, placement) route through sockets to the active GM client for processing.
- **Round-trip placement** -- Items picked up from the canvas remember their source actor and token state. Dropping them back restores the original token appearance and reuses the original base actor.

## Requirements

- Foundry VTT v13+
- A supported game system (currently dnd5e 4.0.0+ or pf2e 8.0.0+)
- [lib-wrapper](https://foundryvtt.com/packages/lib-wrapper) module

## Installation

Install via the Foundry module browser by searching for "Pick-Up-Stix", or paste the manifest URL into the Install Module dialog.

## AI Usage

AI has been used for CSS styling and for researching the Foundry VTT APIs to ensure proper usage, most especially for determining the differences between the various versions of Foundry supported by the module.

## Tutorials

You can find a playlist of videos quickly explaining some of the functionality on the [Pick-Up-Stix](https://www.youtube.com/playlist?list=PLNzm8yjPdznaPpEjILB0y66kDnE-gR_St) YouTube playlist.

---

Some icons included are from [vecteezy.com](https://www.vecteezy.com).
