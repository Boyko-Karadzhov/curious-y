Create an LLM based microlearning webapp with Typescript. Frontend on ReactJs, backend in Supabase.

Features:
- Authentication with Google;
- Responsive design (mobile and desktop friendly);
- The main flow is the app asking a "why" question to the user with multiple possible answers for the user to select (only one correct);
- After the question is answered, the app explains and a chat session is started where the user may ask additional questions;
- The UI should be prepared to display LaTeX as some topics might include formulas;
- The app is "bring your own LLM". The user configures and is persisted for them: LLM provider and model - select between ChatGPT, Claude, and Gemini. Provide API key for the selected provider. Drop down with available models;
- The user also configures a coma-separated list of topics to get questions on (with ability to reset to default ones "Physics, Chemistry, Algebra, Calculus, History);
- There is a history persisted of the previous questions for the user (including the related chat sessions);

Let me know what I need to do on my side for Supabase and Google.

Ensure there is good test coverage.