# Vendors

A vendor is a shopkeeper actor that players can buy from in-world. The GM stocks
it with wares, sets its prices, and places it on the canvas; players open it to
browse a storefront and purchase items into their own inventory.

> **System support:** Vendors are currently a **dnd5e-only** feature. On pf2e and
> in generic mode the vendor sheet is not available.

## Creating and stocking a vendor

A vendor is its own actor sub-type, created like any other actor. Stock it by
dragging items onto the vendor sheet's **Inventory** tab. Dragging from another
actor's inventory **moves** the item (the source loses it); drops from a
compendium or the sidebar add a copy. Coins players spend are added straight to
the vendor's currency.

Each item has a **show / hide in shop** toggle so the GM can keep stock in
inventory without listing it on the storefront, plus an "All" toggle to add or
remove everything at once.

## The shop

The vendor sheet adds a **Shop** tab. GMs see it alongside the full set of normal
actor tabs (features, inventory, spells, etc.); players see a focused
storefront-only view. The storefront shows the vendor's public description, the
list of for-sale items with rarity, stock, and price, and a shopping queue.

## Buying

Players buy items either one at a time with a **Buy** button or by adding items
to a **cart** and checking out in a single transaction. Quantities are capped by
stock. The buyer must have a selected token or assigned character, and must be
able to afford the total — the system makes change automatically. As stock sells
out, items are removed from the vendor.

## Favor pricing

Each vendor has a **Favor** rating that shifts its prices for the party: positive
Favor is a discount, negative is a surcharge. A per-vendor **Favor Factor** sets
how much each point of Favor is worth (a percentage). The GM adjusts both with
sliders on the Shop tab, and all displayed prices and affordability checks update
to match. World-wide bounds for Favor and Favor Factor are configured in the
module's Vendor Settings.

For the underlying flags, formula, and helper API, see
[Vendor Actor Flags](vendor-flags.md).

## Shopping queue

A vendor serves **one shopper at a time**. When a player opens a vendor they join
its queue; only the actor at the front can actively buy, while everyone else can
browse but not purchase. Controls enable automatically as a player reaches the
front.

Each player can be in only one vendor's queue at a time — opening a second vendor
prompts to switch, leaving the first queue. Closing a vendor sheet leaves its
queue and clears any in-progress cart. The Shop tab shows the queue with who is
shopping now and who is waiting.
