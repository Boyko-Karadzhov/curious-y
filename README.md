# Curious-Y

Curious-Y is a learning game built around questions, connected concepts, and a castle campaign. Answer questions to build understanding and earn resources, explore ideas with an AI tutor, then use your progress to grow your castle and take on battles.

You can sign in to save progress to your account or try Explorer Demo in your browser.

User experience prinicples of the game are described in GAME-PRINCIPLES.md.

## Development

The frontend uses React, TypeScript, and Vite. Supabase provides authentication, data storage, and the learning Edge Function.

1. Install dependencies with `npm install` and install Docker Desktop.
2. Run `npm run dev`. On Windows it starts Docker Desktop if needed, then starts the local Supabase stack, serves Edge Functions with the inspector enabled, and starts Vite with the local Supabase URL and anon key.
3. Trigger a `learning` request once to create an inspector target. In VS Code, select **Attach to Supabase learning function** in Run and Debug and press F5. Set breakpoints, then trigger another request. The first request runs without pausing.

The local stack uses a separate Auth database. Create an account with the local email form on the login screen; Google OAuth requires separate local provider credentials.

Useful checks: `npm test`, `npm run test:db`, `npm run lint`, and `npm run build`.

Application code lives in `src/`, Supabase code and migrations in `supabase/`, and detailed design and implementation notes in `docs/`.
