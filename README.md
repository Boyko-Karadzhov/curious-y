# Curious-Y

Curious-Y is a learning game built around questions, connected concepts, and a castle campaign. Answer questions to build understanding and earn resources, explore ideas with an AI tutor, then use your progress to grow your castle and take on battles.

You can sign in to save progress to your account or try Explorer Demo in your browser.

## Development

The frontend uses React, TypeScript, and Vite. Supabase provides authentication, data storage, and the learning Edge Function.

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env` and add your Supabase project URL and public key.
3. Start the app with `npm run dev`.

Useful checks: `npm test`, `npm run test:db`, `npm run lint`, and `npm run build`.

Application code lives in `src/`, Supabase code and migrations in `supabase/`, and detailed design and implementation notes in `docs/`.
