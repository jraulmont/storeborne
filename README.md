# Shop Market

A multi-shop buy/sell module for Foundry VTT v13/v14, built for the **Daggerheart (`foundryborne`)** system.

## Features

- Any number of independent shops, each with its own name, image, and description.
- GM builds a shop's stock by **dragging Roll Tables** onto it and clicking **Generate Inventory** — each table result that points to an Item gets added to the shop.
- GM can also drag individual **Items** straight into a shop to stock/price them without a roll table.
- GM sets (and can re-set at any time) the price of every item, in **Handfuls of gold**.
- Players open a shop from a picker window (or a ready-made "Open Shops" macro), see live stock, and buy.
  - Buying deducts gold from the character, adds the item to their inventory (stacking quantity if they already own it), and reduces the shop's stock.
- Players can sell items from their own inventory back to a shop at the **same price the shop sells it for (1:1)** — only for items the shop actually stocks/prices.
- All stock and gold changes are handled through the GM's client so simultaneous purchases can't oversell the last item in stock.

## Installation

1. Copy this `storeborne` folder into your Foundry `Data/modules/` directory.
2. Enable **Shop Market** in **Manage Modules** for a world running the Daggerheart system.

## Setup (GM)

1. Run the **"Manage Shops (GM)"** macro that the module creates for you the first time it loads (or open it programmatically with `game.modules.get('storeborne').api.openShopManager()`).
2. Click **New Shop**, then **Edit** it.
3. Drag one or more **Roll Tables** (from the Roll Tables sidebar) onto the "Inventory Roll Tables" drop zone. Set how many times to draw ("Draws").
4. Click **Generate Inventory**. Every drawn item appears in the pricing table below with a default price of 1 Handful — adjust prices as you like. Re-running Generate later tops up existing items and preserves prices you've already set.
5. You can also drag Items directly into the "Inventory & Pricing" drop zone to stock something without using a roll table at all.
6. Toggle a shop's visibility to players with the eye icon, or delete it with the trash icon.

There's also a module setting (**Configure Settings → Shop Market**) to:
- Turn selling off globally.
- Control whether items sold back to a shop return to its stock.
- Set **Coins per Handful** (see "About gold" below).

## Opening shops (players)

Players (and the GM) get a macro called **"Open Shops"** automatically added to their hotbar-accessible macro list the first time the module loads. Running it opens a picker of all shops the GM has made visible; clicking one opens that shop's storefront for the player's assigned character (`User Configuration → Character`, or their one owned character if unambiguous — otherwise they're prompted to choose).

You can also call the API directly from a macro or another module:

```js
game.modules.get('storeborne').api.openShopBrowser();  // shop picker
game.modules.get('storeborne').api.openShop(shopId);   // a specific shop
game.modules.get('storeborne').api.openShopManager();  // GM management (GM only)
```

## About gold

Daggerheart's gold isn't a single number — a character's `system.gold` is `{ coins, handfuls, bags, chests }`, with a fixed 10:1 carry between handfuls→bags and bags→chests. The core rules don't define an exchange rate between the (optional/homebrew) "coins" tier and "handfuls," so this module needs one to do arithmetic. The **Coins per Handful** setting (default 10) fills that gap — the GM can change it to match their table's homebrew, or ignore "coins" entirely by leaving prices as whole/half Handfuls.

Item prices are set as a single number of **Handfuls** (decimals like `0.5` are fine). When a purchase or sale happens, the module converts the buyer's/seller's full gold total to a normalized Handfuls value, applies the price, and converts back to `coins/handfuls/bags/chests` — so the character sheet's gold tracker always ends up correct, it just may redistribute which "tier" the gold sits in.

## Notes & limitations

- A GM must be online (technically, Foundry's "active GM") to complete a buy or sell — this is what prevents two players from buying the last copy of an item at the same time, since the GM's client is the sole authority over shop stock.
- Selling only works for items the shop already has a price for (matched to the original item they were generated/dragged from). Items a character starts with that were never stocked in any shop can't be sold anywhere unless the GM drags that same item into a shop first to give it a price.
- Only Weapon, Armor, Consumable, and Loot items are treated as sellable/stockable inventory, matching which item types have a `quantity` field in the Daggerheart system.
