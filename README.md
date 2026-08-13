# Shop Market

A multi-shop buy/sell module for Foundry VTT v13/v14, built for the **Daggerheart (`foundryborne`)** system.

## Features

- Any number of independent shops, each with its own name, image, and description.
- GM builds a shop's stock by **dragging Roll Tables** onto it and clicking **Generate Inventory** — each table result that points to an Item gets added to the shop.
- GM can also drag individual **Items** straight into a shop to stock them without a roll table.
- A **global Price Catalog** defines every item players are allowed to sell, and the price (in Handfuls) shops pay/charge for it. When a shop's inventory is generated from roll tables (or an item is dragged in directly), its price is automatically pulled from the catalog if that item is listed there.
- Players open a shop from a picker window (or a ready-made "Open Shops" macro), see live stock, and buy.
  - Buying deducts gold from the character, adds the item to their inventory (stacking quantity if they already own it), and reduces the shop's stock.
- Players can sell items from their own inventory back to **any** selling-enabled shop, at the price set in the global catalog (1:1 buy/sell) — only for items that are actually in the catalog. Items never seen by the catalog can't be sold anywhere.
- Selling/stacking never tags an actor's items with any module-specific flag — a shop-bought item is identified purely by its name and type, so it's indistinguishable from (and stacks cleanly with) the same item found as regular loot.
- All stock and gold changes are handled through the GM's client so simultaneous purchases can't oversell the last item in stock.

## Setup (GM)

Shop Market's management tools live inside the Daggerheart system's own **"GM Tools"** sidebar menu (the tab with the Foundryborne logo, GM-only) — look for the **Shops** section there, with **Shop Manager** and **Price Catalog** buttons. You can also open them programmatically:

```js
game.modules.get('storeborne').api.openShopManager();  // Shop Manager
game.modules.get('storeborne').api.openShopCatalog();  // Price Catalog
```

1. Open **Price Catalog** and drag in the Items you want players to be able to buy/sell (from the world, a compendium, or a whole compendium folder for bulk import). Set each one's price in Handfuls.
2. Open **Shop Manager**, click **New Shop**, then **Edit** it.
3. Drag one or more **Roll Tables** (from the Roll Tables sidebar) onto the "Inventory Roll Tables" drop zone. Set how many times to draw ("Draws").
4. Click **Generate Inventory**. Every drawn item appears in the pricing table below, priced from the Price Catalog if it's listed there (otherwise a default of 1 Handful you can adjust). Re-running Generate later tops up existing items and preserves prices you've already set.
5. You can also drag Items directly into the "Inventory & Pricing" drop zone to stock something without using a roll table at all — a small warning icon appears next to any item's price if it isn't in the catalog, as a reminder that players won't be able to sell it back.
6. Toggle a shop's visibility to players with the eye icon, or delete it with the trash icon.



## Opening shops (players)

Players (and the GM) get a macro called **"shops"**, if as a GM you don't want to give players access to macros, they can run the chat command **/macro shops**. Running it opens a picker of all shops the GM has made visible; clicking one opens that shop's storefront for the player's assigned character.

Or also there is a button in the token controls

You can also call the API directly from a macro or another module:

```js
game.modules.get('storeborne').api.openShopBrowser();  // shop picker
game.modules.get('storeborne').api.openShop(shopId);   // a specific shop
game.modules.get('storeborne').api.openShopManager();  // GM management (GM only)
game.modules.get('storeborne').api.openShopCatalog();  // GM price catalog (GM only)
```

## About gold

Uses only handfuls, does not consider coins, bags or chests. Currently showing as Luna.
This is for a campaign frame such as Motherboard, which only uses 1 type of currency.
TODO: need to give a setting so you can configure your own label.

## Notes & limitations

 - A GM must be online (technically, Foundry's "active GM") to complete a buy or sell — this is what prevents two players from buying the last copy of an item at the same time, since the GM's client is the sole authority over shop stock.
 - Selling only works for items listed in the global Price Catalog, matched by name and type. Items a character starts with (or finds as loot) that were never added to the catalog can't be sold anywhere unless the GM adds that same item to the catalog first.
 - Only Loot items are treated as sellable/stockable inventory, matching which item types have a `quantity` field in the Daggerheart system.

## TO DO
 - Create a Setting to configure the handful label so it does not show only Luna