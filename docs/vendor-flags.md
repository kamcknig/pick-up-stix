# Vendor Actor Flags

Flags are stored on the vendor **actor** under the `pick-up-stix` scope. For linked
tokens (the default) the flag lives on the base actor; for unlinked tokens it lives on
the token's own delta — Foundry's standard routing applies.

```js
// Read
actor.getFlag("pick-up-stix", "<key>");

// Write
await actor.setFlag("pick-up-stix", "<key>", value);
```

---

## `favor`

How favourably this vendor prices for the party.

| | |
|---|---|
| **Type** | `integer` |
| **Range** | `-5` to `5` |
| **Default** | `0` (absent flag is treated as 0) |
| **Introduced** | 4.0.6 |

Each point shifts the sell price by [`favorFactor`](#favorfactor) percent:
- Positive → discount (e.g. `+3` with factor `4` → 12% off)
- Negative → surcharge (e.g. `-2` with factor `4` → 8% on top)
- `0` → no change

Fractions are always rounded **up** at the copper-piece level in the vendor's favour.

```js
// Give players a 12% discount
await actor.setFlag("pick-up-stix", "favor", 3);

// Make the vendor hostile (+20% surcharge at default factor)
await actor.setFlag("pick-up-stix", "favor", -5);
```

---

## `favorFactor`

The percentage applied per Favor point.

| | |
|---|---|
| **Type** | `integer` |
| **Range** | `1` to `20` |
| **Default** | `4` (absent flag is treated as 4) |
| **Introduced** | 4.0.6 |

The sell-price multiplier is `1 - (favor × favorFactor) / 100`.

| `favor` | `favorFactor` | Multiplier |
|---------|--------------|------------|
| +5 | 4 | 0.80 (−20%) |
| −5 | 4 | 1.20 (+20%) |
| +5 | 10 | 0.50 (−50%) |
| −3 | 6 | 1.18 (+18%) |

```js
// 10% per Favor point instead of the default 4%
await actor.setFlag("pick-up-stix", "favorFactor", 10);
```

---

## Utility helpers

Exported from `scripts/utils/vendorPricing.mjs`.

```js
import {
  getVendorFavor,
  getVendorFavorFactor,
  favorMultiplier,
  vendorPriceMultiplier,
} from "./scripts/utils/vendorPricing.mjs";
```

---

### `getVendorFavor(vendor)`

Reads the `favor` flag from a vendor actor and returns it clamped to
`[FAVOR_MIN, FAVOR_MAX]`. Returns `0` if the flag is absent or non-numeric.

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `vendor` | `Actor\|null` | The vendor actor (base or synthetic token actor) |

**Returns** `number` — integer in `[-5, 5]`

```js
const favor = getVendorFavor(actor);  // e.g. 3
```

---

### `getVendorFavorFactor(vendor)`

Reads the `favorFactor` flag from a vendor actor and returns it clamped to
`[FAVOR_FACTOR_MIN, FAVOR_FACTOR_MAX]`. Returns `FAVOR_FACTOR_DEFAULT` (`4`) if the
flag is absent or non-numeric.

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `vendor` | `Actor\|null` | The vendor actor (base or synthetic token actor) |

**Returns** `number` — integer in `[1, 20]`

```js
const factor = getVendorFavorFactor(actor);  // e.g. 4
```

---

### `favorMultiplier(favor, factor?)`

Computes the raw price multiplier from a Favor value and factor:
`1 - (favor × factor) / 100`.

Does **not** read any flags — pass pre-read values if you already have them, or use
`vendorPriceMultiplier` to read from a vendor actor directly.

**Parameters**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `favor` | `number` | — | Favor value (typically `[-5, 5]`) |
| `factor` | `number` | `4` | Percentage per Favor point (typically `[1, 20]`) |

**Returns** `number` — multiplier (e.g. `0.80` for −20%, `1.20` for +20%)

```js
favorMultiplier(5, 4);   // 0.80  (20% discount)
favorMultiplier(-5, 4);  // 1.20  (20% surcharge)
favorMultiplier(0, 4);   // 1.00  (no change)
favorMultiplier(3, 10);  // 0.70  (30% discount)
```

---

### `vendorPriceMultiplier(vendor)`

Convenience wrapper — reads both `favor` and `favorFactor` flags from the vendor
actor, clamps them, and returns the resulting multiplier. Equivalent to:

```js
favorMultiplier(getVendorFavor(vendor), getVendorFavorFactor(vendor))
```

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `vendor` | `Actor\|null` | The vendor actor (base or synthetic token actor) |

**Returns** `number` — price multiplier to apply to the item's base price

```js
const multiplier = vendorPriceMultiplier(actor);
const adjustedPrice = basePrice * multiplier;
```
