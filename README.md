# Curious-Y 🧠✨

An LLM-based microlearning web application with TypeScript, ReactJS, Tailwind CSS, and Supabase backend.

## Phase I: Make answers feel valuable

The playable loop is **topic tokens → Gold → Castle → four buildings → four units → PvE tug-of-war**. Guilds, gacha, equipment, and PvP are outside this phase and have no UI entry points.

- A new answer earns **10 tokens when correct** or **3 for an incorrect learning attempt**, in that question's topic. Exchange any topic's balance at **1 token = 2 Gold**. Reopening history does not award tokens. Each question attempt has a stable reward ID to prevent duplicate collection.
- Start at Castle level 1 with an empty treasury. One correct answer funds the first Barracks. Castle upgrades cost `60 × current level` Gold and add 120 castle HP, up to level 5.
- Buildings unlock their unit permanently. Upgrade cost is `base cost × next building level`; building levels cannot exceed the Castle. Each level after the first adds 30% of the unit's base HP and damage.

| Building | Unit | Castle required | Base Gold cost | Battle supply |
| --- | --- | --- | --- | --- |
| Barracks | Swordsman | 1 | 20 | 3 |
| Archery Range | Archer | 1 | 30 | 4 |
| Stable | Knight | 2 | 40 | 6 |
| Siege Workshop | Catapult | 3 | 60 | 8 |

Five progressively stronger PvE fronts unlock in order. Deploy units manually; they advance, attack enemy units, and damage the opposing castle automatically. Archers fight at range, Knights are fast and durable, and Catapults deal triple damage to castles. Supply starts at 10, regenerates at 2/second, and caps at 20; at most 24 allied units can be on the field. Destroy the enemy castle within 120 seconds to win. Both castles surviving at the time limit, or both falling together, produces a draw. Defeat and retreat preserve buildings and currencies. Battles are free to retry and replay; they award campaign progress, not Gold.

**Persistence:** Signed-in Castle wallets, buildings, and campaigns are stored in Supabase. Edge commands validate every purchase and battle action; transactions serialize rewards and resource changes. Battle time is measured by the server and continues while away. Explorer Demo remains local and pausable. Retrying an answer recovers its committed result without crediting twice. Reset Progress atomically clears account progress and invalidates in-flight question generation.

**Try it:** Start Explorer Demo, answer a question, visit Castle, exchange tokens, build Barracks, then start Meadow Outpost and deploy Swordsmen. No API key is needed for this loop. Demo questions and scripted tutor replies are visibly labeled. Live generation requires Google sign-in and a Gemini key saved in Settings; these controls are disabled and marked unavailable in Explorer Demo.

**Merged UI:** The incoming resource names (Force, Runes, Reagents, Essence, Logic Cores, Astral Dust, Insight, Influence) label the existing eight topic currencies. Each exchanges for Gold; none grants an additional combat-stat bonus. The redesigned resource bar, reward card, and sidebar use the Phase I state. Tiny Swords artwork follows real combat positions and health instead of a simulated preview. Ranked arena, trophies, seasons, streak bonuses, daily countdowns, gems, and Archive Keys are hidden. The old server `game_stats` schema remains for backend compatibility; it is not the Phase I Castle wallet.

**Save migration:** Signed-in accounts start with a fresh verified Castle. Existing editable browser saves remain on the device but are never imported as trusted currency, buildings, or victories. Explorer Demo continues using its local saves. Legacy server questions remain readable as history but cannot earn new verified rewards. The unused legacy daily-claim and upgrade endpoints are retired.

`src/tests/kingdom.test.ts` covers economy rules, all units and fronts, stronger armies changing combat outcomes, results, retries, reward deduplication, save failures, and account isolation. `src/tests/KingdomJourney.test.tsx` exercises the answer-to-deployment UI, pause/reload, history, reset, and stale question requests.

`npm run test:db` runs the migrations and permission/transaction checks in isolated PostgreSQL using PGlite. CI also runs it against a disposable PostgreSQL 17 service with separate connections for concurrent answers and purchases. `SECURITY_TEST_DATABASE_URL` is accepted only for an empty local test database. See [security implementation](docs/security/implementation.md) for the trust boundaries and release checks.

---

## 🌟 Key Features

1. **Authentication with Google & Supabase**
   - Pure Google OAuth 2.0 flow via Supabase Auth.
   - Guarded routes: unauthenticated users are automatically directed to the login screen.
   - Built-in Explorer Demo mode for instant local testing without waiting for cloud keys.
2. **Interactive "Why" Microlearning Core Flow**
   - The app asks deep "Why" questions targeting the foundational intuition behind concepts.
   - 4 multiple-choice options with exactly 1 correct answer.
   - Instant visual feedback and celebratory confetti on correct answers.
3. **Comprehensive Explanation & Follow-Up AI Chat with Suggested Questions**
   - After answering, the app reveals the conceptual explanation.
   - Intelligently generates related suggested questions that ask about specific key terms, physical/mathematical quantities, and causal relations.
   - Launches an interactive AI chat session with the tutor to explore follow-up questions, request analogies, or probe deep derivations.
4. **Rich Mathematical & Scientific Rendering**
   - Full support for inline (`$E=mc^2$`) and block (`$$\int_0^\infty e^{-x} dx$$`) formulas and scientific notation across questions, options, explanations, and chat messages.
5. **Server-Authoritative Gemini Backend**
   - A Supabase Edge Function is the only code that calls Gemini.
   - Each user supplies their own Gemini API key. The Edge Function validates it and stores it encrypted in Supabase Vault.
   - The stored key is never returned to the browser; generation and chat functions read it directly from Vault.
   - Gemini is the only provider and the model is fixed by the application; users cannot choose it.
   - Correct answers remain private until a single-use answer submission is validated server-side.
   - Question history and concept mastery are read-only to authenticated browser clients. Phase I Castle rewards are credited locally only after a live answer is verified; Castle state is device-local and is not competitive or cloud-synced.
6. **Canonical Learning Topics**
   - Practice Physics, Mathematics & Logic, Chemistry, Life, Computer Science, Earth & Space, Mind & Behavior, and Society & History.
7. **Persisted History & Chat Threads**
   - Full history of all past questions answered by the user.
   - Filter by topic, search keywords, and filter by Correct/Incorrect status.
   - View past questions, user selections, explanations, and resume the linked follow-up chat sessions.
8. **Responsive Design**
   - Mobile-first, sleek UI built with Tailwind CSS, Lucide icons, and modern typography.

---

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Set your Supabase credentials in `.env`:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key-here
```

Deploy the learning function. No project-wide Gemini secret is required:

```bash
npx supabase functions deploy learning
```

After signing in, each user adds their Gemini API key in **Settings**. The key is encrypted in Supabase Vault and follows the account across devices.

Connection tests, questions, and follow-up chat use `gemini-3.5-flash-lite`, configured in `supabase/functions/learning/gemini.ts`. Model changes require redeploying the `learning` Edge Function; restarting the frontend alone does not update the live model.

The learning function validates generated and reused questions against the user's complete concept registry. Required concepts and saved target prerequisites must be proficient/mastered (or registered atomic leaves). Ineligible candidates are retried up to three times; an invalid cached question is expired and replaced. Changes to this prerequisite gate also require redeploying `learning`.

### 3. Run Development Server

```bash
npm run dev
```

### 4. Run Test Suite

```bash
npm test
```

---

## 🛠️ What You Need to Do for Supabase and Google

### Step 1: Supabase Setup & Migrations

1. **Create a Supabase Project**: Go to [supabase.com](https://supabase.com) and create a new project.
2. **Supabase CLI & Database Migrations**:
   - The project is configured with the Supabase CLI and migration files in `supabase/migrations/`.
   - **Login & Link to your Remote Supabase Project**:
     ```bash
     npx supabase login
     npx supabase link --project-ref <your-project-ref>
     ```
   - **Apply Migrations to Remote Database**:
     ```bash
     npm run db:push
     # or: npx supabase db push
     ```
   - **Creating Future Database Migrations**:
     ```bash
     npm run db:new <migration_name>
     # or: npx supabase migration new <migration_name>
     ```
     Edit the newly generated `.sql` file under `supabase/migrations/`, then run `npm run db:push`.
   - Apply every migration in order. The final security migration revokes direct browser writes, migrates existing Gemini keys into Vault, and removes the legacy provider/model settings table.
3. **Get Supabase API Keys**:
   - Go to **Project Settings > API**.
   - Copy **Project URL** into `VITE_SUPABASE_URL`.
   - Copy **Project API keys > `anon` `public`** into `VITE_SUPABASE_ANON_KEY`.
   - Each app user obtains their own Gemini key from Google AI Studio and enters it in the app Settings screen.
4. **Configure Redirect URLs**:
   - Go to **Authentication > URL Configuration**.
   - Set **Site URL** to `http://localhost:5173` (or your production URL).
   - In **Redirect URLs**, add `http://localhost:5173/**`.

---

### Step 2: Google Cloud Console Setup (OAuth 2.0)

1. **Open Google Cloud Console**: Go to [console.cloud.google.com](https://console.cloud.google.com/).
2. **Create / Select a Project**: Create a new project or select an existing one.
3. **Configure OAuth Consent Screen**:
   - Navigate to **APIs & Services > OAuth consent screen**.
   - Choose **External** user type and click **Create**.
   - Fill in App Name (*Curious-Y*), User Support Email, and Developer Contact Email.
   - Save and proceed.
4. **Create OAuth Client ID**:
   - Navigate to **APIs & Services > Credentials**.
   - Click **+ Create Credentials > OAuth client ID**.
   - Select **Web application**.
   - **Authorized JavaScript origins**:
     - `http://localhost:5173`
     - `https://<YOUR_SUPABASE_PROJECT_REF>.supabase.co`
   - **Authorized redirect URIs**:
     - `https://<YOUR_SUPABASE_PROJECT_REF>.supabase.co/auth/v1/callback`
   - Click **Create** and copy your **Client ID** and **Client Secret**.

---

### Step 3: Connect Google Auth in Supabase

1. In your Supabase dashboard, go to **Authentication > Providers > Google**.
2. Toggle Google to **Enabled**.
3. Paste the **Client ID** and **Client Secret** obtained from Google Cloud Console.
4. Click **Save**.

---

## 🧪 Test Coverage

Curious-Y includes unit and integration tests covering:

- **Mathematical Formula Rendering**: [MathMarkdown.test.tsx](file:///C:/Users/pc/Documents/projects/curious-y/src/tests/MathMarkdown.test.tsx)
- **Prompt Engineering & JSON Parsing**: [prompt.test.ts](file:///C:/Users/pc/Documents/projects/curious-y/src/tests/prompt.test.ts)
- **Demo question flow**: `src/tests/factory.test.ts`
- **Question Interaction & Reveal**: [QuestionCard.test.tsx](file:///C:/Users/pc/Documents/projects/curious-y/src/tests/QuestionCard.test.tsx)
- **Settings & Topics Reset**: [SettingsModal.test.tsx](file:///C:/Users/pc/Documents/projects/curious-y/src/tests/SettingsModal.test.tsx)
- **Follow-up AI Chat**: [FollowUpChat.test.tsx](file:///C:/Users/pc/Documents/projects/curious-y/src/tests/FollowUpChat.test.tsx)
- **Database Operations & Persistence**: [database.test.ts](file:///C:/Users/pc/Documents/projects/curious-y/src/tests/database.test.ts)
- **History Logs & Search Filters**: [HistoryModal.test.tsx](file:///C:/Users/pc/Documents/projects/curious-y/src/tests/HistoryModal.test.tsx)
- **Authentication Context**: [AuthContext.test.tsx](file:///C:/Users/pc/Documents/projects/curious-y/src/tests/AuthContext.test.tsx)
- **Full App User Journey**: [App.test.tsx](file:///C:/Users/pc/Documents/projects/curious-y/src/tests/App.test.tsx)

Run all tests:
```bash
npm test
```

## 🌐 Production Deployment (GitHub Pages)

### 1. GitHub Repository Settings
1. Navigate to **Settings > Pages** in your GitHub repository.
2. Under **Build and deployment > Source**, select **GitHub Actions**.

### 2. GitHub Secrets & Variables (Optional for Supabase)
In your repository: **Settings > Secrets and variables > Actions**:
- `VITE_SUPABASE_URL`: Your Supabase Project URL
- `VITE_SUPABASE_ANON_KEY`: Your Supabase Anon Public Key

### 3. Custom Domain & OAuth Configuration (Optional)
If deploying with a custom domain:
1. Place a `CNAME` file in the `public/` directory containing your custom domain.
2. Configure a `CNAME` DNS record with your domain provider pointing to `<username>.github.io`.
3. In **Supabase Dashboard > Authentication > URL Configuration**, update **Site URL** and **Redirect URLs** to your domain.
4. In **Google Cloud Console > Credentials > OAuth 2.0 Client**, add your domain to **Authorized JavaScript origins**.
