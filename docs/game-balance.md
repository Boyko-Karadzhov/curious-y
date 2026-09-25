# Game balance

Edit [`game-balance.json`](../supabase/functions/_shared/game-balance.json) for gameplay prices, rewards, unit and equipment stats, building effects, production, trading, towers, doctrines, and campaign tuning. The browser and Edge function import this same file. Building and unit names match the UI. Each `cost` object directly names its currencies, such as `Gold`, `Food`, `Metal`, `Runes`, and `Logic Cores`.

`economy.startingResources` lists literal starting amounts for every currency. The other economy settings are grouped under `battleRewards`, `dailyProduction`, `treasury`, and `trade`. `dailyProduction.baseGold` is the daily collection amount.

The `learningValue` section also feeds PostgreSQL. After changing values that affect the database, run `node scripts/sync-game-balance.mjs` to create a forward migration. Run `node scripts/sync-game-balance.mjs --check` after any balance edit. Deploy the Edge function and any new database migration together.

Run `npm run build` and `npm test` after changing values. The battle balance tests cover early stages and chapter transitions; measurement scripts under `scripts/measure-*.mjs` help evaluate larger changes.
