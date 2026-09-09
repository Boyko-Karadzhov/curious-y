# Shared concept graph

Learning persists one private graph per learner in `learning_graphs`. Nodes are concepts or boss questions, with stable IDs, intrinsic topics and prerequisite edges. Progress is keyed directly by node ID. There are no chapters, concept owners, saved generation packages, or topic-completion states.

## Practice loop

1. Read the graph and check for an unanswered boss whose prerequisites are proficient. Present that boss first.
2. If a boss is still waiting for prerequisites, sample an available concept. Its own prerequisites must all be proficient. Proficient concepts have one-fifth the sampling weight while other available concepts still need proficiency.
3. When the selected scope has no unanswered boss, choose a new boss and work backwards. Reuse existing concepts regardless of their current proficiency, and add only missing concepts and prerequisite edges. A boss may require no new concepts.
4. Save the additions atomically, then return to the first check. A boss built entirely on proficient concepts is asked immediately.

Topic selection restricts the practice scope while also including prerequisite ancestors from other topics. Random uses the global scope. Knowledge always displays the global graph, and viewing it never generates content. An account lock prevents concurrent saves from adding multiple unanswered bosses for one topic; reusing concepts across bosses never copies progress.

Next Question preserves the entry path: topic practice stays in the selected topic scope, and random practice stays global. A concept opened from Knowledge stays selected through mastery, advancing its dimensions as evidence is confirmed. After mastery it moves to an available related concept, preferring dependents, and falls back to the original topic if no related unmastered concept is available.

Goal and Castle shortcuts remember their original target. After collection, Next Question checks current progress and selects the next missing resource, or reports that learning is complete and points back to Castle (or Battle for missing Gold). Recruitment, Forge, tower and Library shortcuts retain their own pack or milestone. Changing the saved progression goal does not redirect an existing question's path. Navigation hints survive pending-reward recovery on the same browser; balances and mastery are fetched again before continuation.

## Concepts and evidence

Concepts cover seven dimensions: intuition, precision, boundaries, application, mechanism, alternatives and evidence. The server chooses the next unconfirmed dimension. Two correct distinct questions confirm a dimension; all seven confirmed dimensions make the concept proficient and unlock its dependents. Three distinct advanced successes after proficiency earn mastery. A single correct answer completes a boss.

Only concepts display mastery percentages: capped successful core answers plus capped advanced successes, divided by 17. An initial correct answer shows 5%, proficiency shows 82%, and mastery shows 100%. Reviews cannot inflate progress above 100%, misses do not erase earned evidence, and adding nodes does not change any existing concept's denominator. Topics have no percentage or completion state.

Confirmed dimensions become due after one day. Successful due reviews increase the interval to 3, 7, 14, then 30 days. A missed due review schedules another attempt after ten minutes and preserves proficiency and mastery.

## Generation and privacy

Generation receives all existing concepts, including unearned ones, so it can reuse their IDs. Every prerequisite remains an explicit edge even when already proficient. A proposal contains one boss and only genuinely new prerequisite concepts; it has no fixed minimum size or root count. At most 16 new concepts can be added in one request; more demanding questions use an intermediate boss. No package is persisted after validation: the nodes join the same graph.

Structural validation rejects duplicate identities, cycles, missing prerequisites and additions unrelated to the proposed boss. An independent semantic audit checks missing reasoning and factual errors. Everyday language and inline definitions do not need separate prerequisite nodes; unrelated subject breadth and wording suggestions never block generation. Three failed repairs stop the request without saving or exposing private audit details.

Browser roles cannot read graph storage. The Edge Function projects only revealed nodes and anonymous connection silhouettes. Definitions, hidden titles, hidden IDs and hidden boss flags stay private. Question issuance checks node availability both before and after generation. Answers, evidence, reward receipts and mastery commit in one transaction. Replaying an answer never earns evidence twice; successful question fingerprints survive deleted history.

Progress reset clears the graph and advances the account generation, invalidating in-flight generation. Explorer Demo uses the same graph and evidence rules with a finite scripted catalog and no generated expansions.

## Deployment and verification

Apply `20260909160000_shared_concept_graph.sql`, deploy all Edge Functions, then publish the frontend through `main`. The migration resets development accounts that have old learning journeys before removing the old storage and RPCs.

Run `npm test`, `npm run test:db`, `npm run build` and `npm run lint`. Graph tests cover reuse of unearned concepts across topics, shared evidence unlocking multiple bosses, immediate boss selection after expansion, a fixed mastery denominator for each concept, private projection, answer retries, advanced evidence, review schedules and reset races. CI runs the database tests in PostgreSQL with separate connections for concurrent operations.
