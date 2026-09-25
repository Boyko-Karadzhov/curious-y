# Game balance

Edit [`game-balance.json`](../supabase/functions/_shared/game-balance.json) for gameplay prices, rewards, unit and equipment stats, building effects, production, trading, towers, doctrines, and campaign tuning. The browser and Edge function import this same file. Historical battle rules and legacy units remain in code so saved battles can be replayed.

The `learningValue` section also feeds PostgreSQL. After editing the JSON, run `node scripts/sync-game-balance.mjs` to create a new forward migration, and `node scripts/sync-game-balance.mjs --check` to verify it. Deploy the Edge function and database migration together.

Run `npm run build` and `npm test` after changing values. The battle balance tests cover early stages and chapter transitions; measurement scripts under `scripts/measure-*.mjs` help evaluate larger changes.
