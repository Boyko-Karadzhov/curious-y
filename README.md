# Curious-Y 🧠✨

An LLM-based microlearning web application with TypeScript, React, Tailwind CSS and Supabase.

## Learning graph

Learn offers topics and Random practice. Knowledge displays one connected graph of concepts and boss questions. Concepts have shared identities and progress regardless of which question introduced them; bosses reuse existing concepts and add only missing prerequisites.

Practice checks for an unlocked boss first. Otherwise it works on available concepts for a waiting boss. When another boss is needed, it adds that boss and any missing concepts, then checks again for an unlocked boss before issuing a question. There are no chapters or topic-completion gates.

Mastery percentages belong to individual concepts: two confirmations in each of seven dimensions plus three advanced successes. Proficiency shows 82%; mastery shows 100%. Topics have no completion percentage. Explorer Demo has a finite scripted graph.

See [the learning graph rules and deployment guide](docs/discovery-journeys.md). Deploy migration `20260909160000_shared_concept_graph.sql`, all Edge Functions, then this frontend.

## Learning, recruitment and battle

**Learn → Collect Resources → Recruit or Forge → Equip → Conquer territory.** One Recruitment Hall rolls all five classes and keeps three independent copies. Five army slots allow duplicate types; spare copies can be deliberately merged for XP. The starter pack contains a Militia, Slinger and Hatchling.

- Recruitment uses Life + Earth & Space; forging uses Physics + Chemistry. Both consume small, fixed resource pairs. The Keep and War Academy use the other related topic pairs.
- Cavalry is replaced by swarm: five creatures share one deployment point. Each side supports 32 deployment points. Every equipped copy deploys independently.
- Each conquered stage produces 10 Gold daily, increased by Treasury level. One correct answer automatically claims today's tribute, even without a Treasury. Days reset at 00:00 UTC; missed days expire. The first conquest starts income immediately.
- Gold funds permanent Keep, Treasury and War Academy upgrades. Lifetime Gold remains a score after spending. War Academy unlocks battle doctrines with explicit tradeoffs; Library and Towers still grow through learning.
- Signed-in answers, rolls, commands and rewards remain server-authoritative and retry-safe. Explorer Demo uses the same game rules with local storage.

See [territory progression and exact recipes](docs/territory-progression.md), [recruitment/XP mechanics](docs/unit-collection.md), and [Castle progression](docs/castle-progression.md). State 11 resets development military, campaign, equipment and construction while retaining wallets and learning. Apply `20260908120000_territory_armies.sql`, deploy `learning`, then publish this frontend.

Validation: `npm test`, `npm run test:db`, `npm run build`, `npm run lint`. Database tests run migrations and security/transaction invariants in isolated PGlite; CI also uses PostgreSQL 17 with separate connections for real races. `SECURITY_TEST_DATABASE_URL` accepts only an empty local test database. Deterministic measurement scripts reproduce discovery percentiles and example campaign builds. See [security implementation](docs/security/implementation.md).

---

## 🌟 Key Features

1. **Authentication with Google & Supabase**
   - Pure Google OAuth 2.0 flow via Supabase Auth.
   - Guarded routes: unauthenticated users are automatically directed to the login screen.
   - Built-in Explorer Demo mode for instant local testing without waiting for cloud keys.
2. **Question-first discovery journeys**
   - Explore accessible concepts and unlock connections by confirming specific dimensions of understanding.
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
   - Question history and concept mastery are read-only to authenticated browser clients. Verified answers prepare a pending reward. Explicit Collect credits the server-authoritative Castle wallet; signed-in Castle state persists in Supabase. Explorer Demo alone uses browser storage.
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

Live journey questions target an automatically sampled concept, or a concept selected in Knowledge, with a server-selected dimension. The private plan supplies prerequisites, while earned knowledge supplies the permitted vocabulary. Two successful fresh questions confirm a dimension; every required parent must be ready before a dependency is revealed. Optional depth remains available without blocking progress. Old reasoning-stage generation endpoints remain for compatibility; Learn uses the new journey endpoints.

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

**Progression goals:** Pin construction, a building upgrade, or the next Castle upgrade from learning or Castle management. Goals track only collected Resources and committed purchases. Missing resources link to their canonical learning topic; missing Gold links to the active or next unbeaten battle. Castle gates and active battles remain visible even when a goal is affordable. Signed-in goal preferences (including dismissal) are stored with the account in Supabase and load across devices, with version checks protecting against conflicting edits. They never grant balances or unlocks. Only Explorer Demo stores its goal in the browser. Completed or invalid targets offer a new goal, and dismissal survives reload.

**Goal deployment:** Apply `20260906010000_account_progression_goals.sql` before deploying the `learning` Edge Function and frontend. Signed-in goals are read and saved through authenticated `goal` / `set_goal` actions; no device fallback or browser preference import is used. The client refreshes goals on window focus and tab visibility, and failed saves offer an explicit retry.

**Weighted learning Resources:** See [the step 3 contract and rollout guide](docs/weighted-learning-resources.md) for canonical weight validation, immutable receipts, old pending rewards, Demo compatibility, and the required database -> Edge Function -> frontend deployment order.

**Knowledge Towers (step 6):** Eight topic towers grow from distinct earned proficient/mastered concepts, using the same evidence as Library. Weighted progress unlocks levels at 1/3/6/10/15 points and gives modest bonuses frozen at battle start. Spending never lowers a tower. See [progression, bonuses and release requirements](docs/knowledge-towers.md). Deploy migration `20260906090000_knowledge_towers.sql`, the `learning` Edge Function, then the frontend.
