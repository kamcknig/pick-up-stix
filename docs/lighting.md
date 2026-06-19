# Light-emitting Items

Any interactive item can emit light — a torch, lantern, glowing relic, or a chest
full of luminous loot. The light follows the item wherever it goes: lying on the
canvas, carried in a player's pack, or stored inside a container.

## Configuring light

A **lightbulb** button in the item sheet header opens a light editor that matches
Foundry's standard Token Light tab — dim and bright radius, color, animation, and
the advanced options. Changes apply live.

## How carried light behaves

- **Carry on pickup** — When a player picks up a lit item, their token emits that
  item's light **in addition to** its own. The carrier's own token light is never
  overwritten, and the carried light tracks the token smoothly as it moves.
- **Container gating** — An item inside an interactive container emits light only
  while the container is **open**. Closing the container suppresses it.
- **On/off toggle** — A lightbulb control (a HUD button on canvas tokens for the
  GM, and a row icon in inventories and container contents for the GM or item
  owner) turns emission on or off without losing the configured radii.

Each placed token keeps its own light snapshot, so toggling or moving one lit
item never affects another.
