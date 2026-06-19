# Interactive Items

Interactive items are the core of Pick-Up-Stix: objects a GM places on the
canvas for players to discover, inspect, and interact with. Each one is a token
backed by a single embedded item, presented through the active game system's own
item and container sheets.

## One actor, two modes

A single actor type adapts to whatever item is dropped onto it:

- **Item mode** — for any non-container item (weapon, potion, quest item, etc.).
  Players inspect it through the system's native item sheet and can pick it up,
  removing the token from the canvas. Supports an **unidentified** state with a
  separate name, image, and description.
- **Container mode** — for a container item. Opens the system's native container
  sheet with full inventory. Supports **open/close** and **lock/unlock**, with
  the token art swapping between closed and open images.

## Placing objects

- **Drag-and-drop** — Drag any item from an inventory, the Items sidebar, or a
  compendium onto the canvas to create an interactive object. Dragging an
  existing interactive actor from the sidebar places one of its tokens.
- **Scene control button** — Create an empty interactive object from scratch.
- **Who can place** — GMs place freely anywhere; players place at their own
  token.
- **Template vs ephemeral** — When placing a world item, GMs choose a persistent
  **template** actor (reusable) or an **ephemeral** one-off that auto-cleans when
  its token is removed.
- **Source cleanup** — Placing an item from an inventory removes it from that
  inventory.

Each placed token is **independent** of the base actor it came from — picking up
or changing one token never affects others made from the same actor.

## Identification

Interactive objects use the active system's built-in identification model, kept
in sync between the actor and the embedded item. Toggling identification
preserves both the identified and unidentified presentations across cycles. Only
a GM can reveal or hide an object, via the system's native identify control, the
config dialog, the Token HUD, or system-specific inventory controls. While an
unidentified object sits in a player's inventory, that player sees only the
generic name, image, and description until a GM reveals it.

## Player interaction

- **Token HUD** — Players inspect contents, pick up items, and open/close
  containers from buttons on the Token HUD.
- **Two proximity ranges** — Each object has an **inspection range** (see the
  nameplate, open the real sheet) and a tighter **interaction range** (pick up,
  open/close, lock, view container contents). Beyond inspection range a player
  sees a **limited-view dialog** with a generic name and description; moving
  closer promotes it in place to the real sheet. Sheets update live as players
  move.
- **Limited name / description** — GMs can set what distant observers see; a
  sensible fallback is used when left blank, and containers append an "appears
  open/closed" line automatically.
- **Hidden container contents** — A container's inventory is replaced with a
  placeholder while it is closed, locked, or the player is out of interaction
  range.

## Pick up, drop, and deposit

- **Drop items** — Players drop items from their inventory onto the canvas by
  drag-and-drop (or a right-click "Drop Item" menu where supported). A GM can
  optionally require Ctrl to be held via the "Require Ctrl for drag actions"
  setting.
- **Deposit** — Drag items into an open container to deposit them. Drops are
  gated by lock/open/proximity for players. Containers cannot be nested.
- **Round-trip** — Items picked up from the canvas remember their source actor
  and token state; dropping them back restores the original appearance and base
  actor.

## Quantity handling

Stackable items are split-aware throughout:

- **Quantity badge** — Non-container tokens with more than one in the stack show
  a count in the corner.
- **Split prompts** — Moving a stack across actors (canvas drop, deposit, give to
  a nearby PC, HUD pickup, delete-key) opens a small dialog to choose how many to
  move. Multi-token deletes are batched into one dialog.
- **Split HUD button** — GMs can split a stacked token into a new adjacent token.

Containers, world items, and stacks of one skip every prompt.

## GM tools

- **Config dialog** — A dedicated dialog for module-specific properties
  (interaction/inspection ranges, identified/open/limited images, limited
  name/description, locked message). Opened from the Token HUD gear, the system
  sheet header gear, or by clicking the base actor in the sidebar.
- **Lock and identify** — Available from the config dialog, Token HUD, and the
  system sheet header. Locking an open container also closes it.
- **Open/close toggle** — A button in the container sheet header toggles state
  and updates both the sheet and token images.
- **Per-item controls in containers** — Lock, identify, and delete controls per
  row inside a container's contents. Items can be dragged back out to the canvas
  or onto another sheet.
- **Drop actors into containers** — Drag an item-mode interactive actor onto any
  container sheet to add it, preserving its identification and round-trip state.
- **GM actor picker** — When a GM picks up an item with no clear recipient, a
  searchable dialog lists candidate actors on the scene.
- **Configurable defaults** — Default container images, interaction/inspection
  ranges, and actor folder organization are set in module settings.

## System support

Pick-Up-Stix ships full adapters for **dnd5e** and **pf2e**, which use those
systems' native item and container sheets. On any other system it falls back to a
**generic mode** that stores object data in module flags and renders its own
item, container, and config sheets. In generic mode all placement, pickup, drop,
and proximity flows work normally, but identification is disabled (items are
always treated as identified). On first launch the module detects or prompts for
which item type counts as a "pickup item"; this can be changed later in settings.
