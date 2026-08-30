# Curious-Y 🧠✨

An LLM-based microlearning web application with TypeScript, ReactJS, Tailwind CSS, and Supabase backend.

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
5. **"Bring Your Own LLM" (BYO LLM)**
   - Configurable AI Providers:
      - **Google Gemini** (Gemini 3.5 Flash-Lite [Recommended], Gemini 3.7 Flash, Gemini 3.6 Flash, Gemini 3.1 Pro Preview, Gemini 3.5 Flash, Gemini 3 Pro, Gemini 2.5 Flash)
     - **OpenAI ChatGPT** (GPT-4o, o3-mini, o3, o4-mini, GPT-4o Mini, o1)
     - **Anthropic Claude** (Claude 3.7 Sonnet, Claude 3.5 Sonnet, Claude 3.5 Haiku, Claude 3 Opus)
   - Dynamic model dropdown for each provider with custom model ID input support.
   - API key connection test utility with live response validation.
   - Securely persisted to the user's Supabase profile (`user_settings` table with Row Level Security).
6. **Customizable Learning Topics**
   - Configure a comma-separated list of topics (e.g. *Quantum Computing, Astrophysics, Macroeconomics*).
   - "Reset to Default" button instantly restores: `Physics, Chemistry, Algebra, Calculus, History`.
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
   - *(Alternative manual setup)*: You can also copy the contents of [`supabase/migrations/20260830144439_initial_schema.sql`](file:///C:/Users/pc/Documents/projects/curious-y/supabase/migrations/20260830144439_initial_schema.sql) directly into the Supabase Dashboard **SQL Editor** and run it.
3. **Get API Keys**:
   - Go to **Project Settings > API**.
   - Copy **Project URL** into `VITE_SUPABASE_URL`.
   - Copy **Project API keys > `anon` `public`** into `VITE_SUPABASE_ANON_KEY`.
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
- **LLM Factory & Providers**: [factory.test.ts](file:///C:/Users/pc/Documents/projects/curious-y/src/tests/factory.test.ts)
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


