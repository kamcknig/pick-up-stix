# Pick-Up-Stix

A Foundry VTT v13+ module that lets GMs place interactive objects on the canvas
for players to discover, inspect, and interact with — using the active game
system's own item and container sheets for a seamless experience.

> Behavior may differ slightly between supported game systems where the
> underlying system handles a feature differently (most notably identification
> and how container contents are displayed). The module follows each system's own
> conventions rather than imposing its own UI.

## Features

- **[Interactive items](docs/interactive-items.md)** — Place items and containers
  on the canvas as tokens. A single object adapts into either an inspectable,
  pickup-able item or an open/close, lockable container, with unidentified
  states, proximity-based visibility, quantity splitting, and full GM controls.
- **[Vendors](docs/vendor.md)** — Shopkeeper actors players can buy from. GMs
  stock wares and set prices with an adjustable Favor discount/surcharge; players
  browse a storefront and check out, served one at a time through a shopping
  queue.
- **[Light-emitting items](docs/lighting.md)** — Give any interactive item a
  light source that follows it on the canvas, in a player's pack, or inside an
  open container, layered on top of the carrier's own light.

Across all of these, objects render through each system's **native sheets**,
player actions route through **sockets** to the GM for security, and all
system-specific behavior is isolated behind a system adapter. Pick-Up-Stix ships
full support for **dnd5e** and **pf2e**, with a **generic fallback** for other
systems.

## Requirements

- Foundry VTT v13+
- A supported game system (dnd5e 4.0.0+ or pf2e 8.0.0+ with full support; any
  other system with generic-mode fallback)
- [lib-wrapper](https://foundryvtt.com/packages/lib-wrapper) module

## Installation

Install via the Foundry module browser by searching for "Pick-Up-Stix", or paste
the manifest URL into the Install Module dialog.

## AI Usage

AI has been used for CSS styling and for researching the Foundry VTT APIs to
ensure proper usage, most especially for determining the differences between the
various versions of Foundry supported by the module.

## Tutorials

You can find a playlist of videos quickly explaining some of the functionality on
the [Pick-Up-Stix](https://www.youtube.com/playlist?list=PLNzm8yjPdznaPpEjILB0y66kDnE-gR_St)
YouTube playlist.

---

Some icons included are from [vecteezy.com](https://www.vecteezy.com).
