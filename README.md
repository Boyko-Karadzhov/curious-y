# Curious-Y

Curious-Y is a learning game built around questions, connected concepts, and a castle campaign. Answer questions to build understanding and earn resources, explore ideas with an AI tutor, then use your progress to grow your castle and take on battles.

You can sign in to save progress to your account or try Explorer Demo in your browser.

## Development

The frontend uses React, TypeScript, and Vite. Supabase provides authentication, data storage, and the learning Edge Function.

1. Install dependencies with `npm install` and start Docker.
2. Run `npm run dev`. It starts the local Supabase stack, serves Edge Functions with the inspector enabled, and starts Vite with the local Supabase URL and anon key.
3. To debug the `learning` function, select **Attach to Supabase learning function** in VS Code's Run and Debug panel, press F5, and trigger a request in the app.

Useful checks: `npm test`, `npm run test:db`, `npm run lint`, and `npm run build`.

Application code lives in `src/`, Supabase code and migrations in `supabase/`, and detailed design and implementation notes in `docs/`.
