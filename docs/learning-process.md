# Learning process

Topic practice chooses a topic first, including when the user requests a random topic. It then:

1. Asks a saved, unfinished boss whose entire prerequisite tree is mastered.
2. Otherwise uniformly samples a tagged, unmastered concept and asks its next undiscovered dimension.
3. If no eligible concept remains, prepares a new boss using a randomly selected angle and subtopic, recursively prepares its prerequisites, then repeats selection.

Concept practice uses the same dimension selection directly. Concepts are eligible regardless of prerequisite progress. Questions must explain unearned prerequisite context inline instead of assuming it is known. Shared prerequisites retain their identity and are tagged with every topic that uses them.

Every concept has seven private, prefilled dimensions: intuition; precision and math; limits; applications; mechanism; alternatives; and evidence, discovery, and validation. Each concept gets its own structured generation call. A separate call extracts direct prerequisites from its intuition and formal definition. Matching reuses existing concepts by meaning before applying the basic-concept rule to unmatched concepts. Everyday ideas requiring no separate study are omitted. Cycle-closing edges are skipped; duplicate identities, missing dimensions and disconnected nodes are rejected.

Selection covers undiscovered dimensions first, then seeks a second successful confirmation in each dimension. Three advanced synthesis successes complete mastery. Automatic topic practice excludes mastered concepts. Explicit practice can review them, and missed reviews preserve earned mastery.

Boss questions and answers are generated once, before prerequisite extraction. A wrong answer leaves the same boss available to retry. Every prerequisite, including indirect prerequisites, must reach full mastery before a boss is available.

The model returns one `correctAnswer` and exactly three `wrongAnswers`, each with its own feedback. The server shuffles these pairs and computes the correct index. Question answers and unearned dimension knowledge are omitted from client responses. A successful dimension answer records the prepared knowledge in the notebook.

Curriculum generation advances one bounded stage per request. Private checkpoints survive reloads and provider errors; a per-user lease prevents overlapping writers. Only a complete, validated graph is committed. The browser continues the selected topic across stages, and generation checks stop continuation after a reset. An expansion is bounded to 128 new concepts and each provider call permits at most three structured-output attempts. These operational limits remain separate from cycle handling.

Circular relationships between concepts are natural. The server processes matched prerequisites in their returned order and skips an edge if it points to the concept itself or its prerequisite already reaches the target through accepted edges. All other edges and newly prepared concepts are retained, producing an acyclic study curriculum. A circular proposal does not trigger another LLM call, rewrite concept knowledge, roll back the batch, or replace the original boss. Existing saved concepts and earned progress remain unchanged. Final graph validation still enforces acyclicity before saving.

The `20260913200000_dimension_curriculum.sql` migration resets development accounts with existing learning graphs, including their associated learning and kingdom progress, because those graphs lack prepared dimension knowledge. Demo content remains scripted and uses the shared progression and selection rules.

Validation covers the selection order, recursive preparation, shared identities, missing dimensions, cycles, private graph projection, shuffled feedback, checkpoint recovery, leases, resets, and boss retries. Run the Vitest suite, production build, and `scripts/test-database.mjs` before deployment.
