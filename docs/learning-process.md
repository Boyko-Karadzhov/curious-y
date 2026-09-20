# Learning process

Topic practice chooses a topic first, including when the user requests a random topic. It then:

1. Asks a saved, unfinished boss whose entire prerequisite tree is mastered.
2. Otherwise uniformly samples a tagged, unmastered concept and asks its next undiscovered dimension.
3. If no eligible concept remains, prepares a new boss using a randomly selected angle and subtopic, recursively prepares its prerequisites, then repeats selection.

Concept practice uses the same dimension selection directly. Concepts are eligible regardless of prerequisite progress. Questions must explain unearned prerequisite context inline instead of assuming it is known. Shared prerequisites retain their identity and are tagged with every topic that uses them.

Every concept has seven private, prefilled dimensions: intuition; precision and math; limits; applications; fundamental principles; why it cannot be any other way; and evidence, discovery, and validation. Each concept expansion gets one structured generation call. Boss preparation uses a separate concept-tree prompt after the question prompt. Existing concepts are reused only when their normalized titles match exactly. Everyday ideas requiring no separate study are omitted.

Selection covers undiscovered dimensions first, then seeks a second successful confirmation in each dimension. Three advanced synthesis successes complete mastery. Automatic topic practice excludes mastered concepts. Explicit practice can review them, and missed reviews preserve earned mastery.

Boss questions and answers are generated once, before prerequisite extraction. A wrong answer leaves the same boss available to retry. Every prerequisite, including indirect prerequisites, must reach full mastery before a boss is available.

The model returns one `correctAnswer` and exactly three `wrongAnswers`, each with its own feedback. The server shuffles these pairs and computes the correct index. Question answers and unearned dimension knowledge are omitted from client responses. A successful dimension answer records the prepared knowledge in the notebook.

Generation advances one bounded stage per request. Every generated boss, knowledge set, and dependency list is checked for JSON structure and written to the learning graph immediately. Saving is independent of question selection: the next request reloads the graph and can select any unfinished node to continue from its durable preparation state. Unfinished nodes remain hidden and there is no separate curriculum draft. A per-user lease prevents overlapping writers, and generation checks stop continuation after a reset. Each patch is bounded to 129 nodes and each prompt gets one provider call, with no audit, reconciliation, repair, revision or automatic retry. Storage remains responsible for graph integrity.

Circular relationships between concepts are natural, but the stored study curriculum must remain acyclic. Storage rejects a circular patch without another LLM call or any partial graph update. Existing saved concepts and earned progress remain unchanged.

The `20260913200000_dimension_curriculum.sql` migration resets development accounts with existing learning graphs, including their associated learning and kingdom progress, because those graphs lack prepared dimension knowledge. Demo content remains scripted and uses the shared progression and selection rules.

Validation covers the selection order, incremental persistence, shared identities, missing dimensions, cycles, private graph projection, shuffled feedback, interrupted generation, leases, resets, and boss retries. Run the Vitest suite, production build, and `scripts/test-database.mjs` before deployment.
