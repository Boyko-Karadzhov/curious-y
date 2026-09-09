# Unified learning update — September 9

Learn shows topic selection and Random. Knowledge shows all saved chapters in a single graph; selecting a practice topic leaves the graph intact. Node ids are namespaced by saved journey, and explicit earned prerequisites carry source identities so cross-topic edges remain visible. Private nodes and the waiting boss remain hidden until prerequisites are confirmed.

Question sampling gives each available unproficient concept (including a revealed boss) weight 1 and each proficient/mastered concept weight 0.2 when there is unproficient material in the selected scope. Otherwise available concepts have equal weight. Random samples concepts across saved topics; a new account starts a randomly chosen topic. Selecting an unstarted topic generates its first plan. The server chooses the next dimension from evidence, ignoring client facet preferences. Next Question repeats the selected topic scope, or the global Random scope.

Live initial and subsequent plans use the same generation and prerequisite audit. A basic concept is accessible through ordinary observation and language without unearned specialist prerequisites. No fixed starter inventory is used in live generation. Planning includes proficient concepts from every topic and forbids duplicating their identities. The offline demo has a finite scripted catalog.

Each chapter covers one coherent subarea; breadth develops across future chapters. The audit distinguishes substantive prerequisite gaps and factual errors from nonblocking wording suggestions. Blockers must cite a real node and an exact excerpt, explain the reasoning gap or incorrect claim, and propose a repair. Ordinary descriptions, inline definitions, and the target concept itself do not need separate prerequisite nodes. Three failed repairs stop generation without saving the plan or exposing private concept names in the audit error.

A single correct boss answer completes its challenge. Once every concept is proficient and the boss is complete, a practice request grows the topic; graph viewing never generates a plan. Random expands at most one eligible completed topic per request. Saves lock the account state and return an existing chapter on retries, so simultaneous calls cannot save multiple waiting bosses for a topic. The existing question-generation lease protects issuance independently.

Topic percentages use capped successful answers: two per core dimension plus three advanced successes per generated concept. Hidden generated concepts count in the denominator, bosses do not. Proficiency alone is 82% for seven dimensions; 100% requires mastery of all generated concepts. New plans expand the denominator. This is progress through generated material, not a claim to have mastered an entire discipline.

Deploy `20260909120000_unified_learning.sql`, then all Edge Functions, then the frontend. Validation: unit/UI tests, isolated database/RLS/transaction checks, TypeScript/build and lint. The migration adds service-only catalog readers, guards chapter expansion and recognizes one correct boss answer.

---

The earlier implementation notes below describe the original chapter UI; the update above supersedes its navigation, initial seeds, dimension selection and two-answer boss rule.

# Discovery journeys

Learn opens a saved concept map, starting with two accessible foundations. Each topic has an authored first chapter; its synthesis question and complete prerequisite plan are persisted before practice starts. Subsequent chapters are generated with Gemini from the previous chapter's earned knowledge, validated as connected acyclic graphs, independently audited for missing semantic prerequisites, and saved before being displayed. Earlier chapters remain available in the chapter selector, including after reload or on another device.

## The learning loop

Select a revealed concept and a dimension. Make a multiple-choice attempt before seeing an explanation. Each option has its own feedback. After a miss, “Try another angle” requests a fresh example of the same concept and dimension. After a success, the knowledge base gains a short entry; return to the map to explore or confirm it.

Dimensions are intuition, precision/math, limits/extremes, applications, mechanisms/principles, alternatives, and evidence/discovery. Every concept covers all seven dimensions. Precision can use a formal verbal definition; math and infinite limits are used only when meaningful and supported by earned prerequisites. Questions may ask for a prediction, comparison, example, or observation rather than beginning with “Why”. Generated options and explanations must respect earned vocabulary.

- **First insight:** one correct answer, recorded provisionally.
- **Confirmed dimension:** two successful distinct questions. Misses do not add successes or replace an existing entry.
- **Proficient concept:** all seven dimensions confirmed. This unlocks dependent concepts and the advanced challenge track.
- **Mastered concept:** three distinct correct advanced answers after proficiency: transfer, changed assumptions, and evaluation using evidence. Misses do not subtract earned progress.
- **Ready to refresh:** confirmed dimensions become due after one day. Successful due reviews increase the interval to 3, 7, 14, then 30 days, recurring indefinitely. A missed due review schedules a fresh attempt after ten minutes. Rust is a reminder, not a loss of the earned level or graph connections.
- **Boss conquered:** two successful synthesis examples. The first uses the exact persisted boss question; the second checks its application in a fresh situation.

Every edge requires full proficiency in its parent. All parents must satisfy their requirements before a dependent node is revealed. Mastery is optional for opening the next concept. The explicit prerequisiteConcepts list must match graph edges or earned knowledge from earlier chapters; the generation audit checks for missing vocabulary, mathematical foundations, and dependencies hidden inside later dimensions. If the closure would exceed a chapter, generation must choose a smaller intermediate boss. Authored starter graphs use subject-specific prerequisites. The UI shows unnamed connection silhouettes and each visible concept's contribution. Hidden titles, definitions, boss flags and semantic node IDs are excluded from the live response. Every revealed concept offers both graph and list navigation, search, filters, pan, zoom, fit and keyboard controls. Touch supports panning and pinching.

## Rewards

Correct and incorrect attempts retain the existing resource economy, immutable receipts, and explicit Collect action. Dimension metadata determines the reasoning category for reward calculation. Repetition uses evidence for that specific dimension or advanced track, and review bonuses use the same due date as the map; earned proficiency feeds the Library and Knowledge Towers. Discoveries, proficiency, advanced successes, mastery, refreshed recall and boss completion also produce milestone messages. No additional currency or punishment for missed days is introduced.

## Persistence and security

`learning_journeys` stores private plans and evidence. Browser roles cannot query or write it. The authenticated Edge Function returns a filtered view. Question answers, knowledge entries, option feedback and hidden plans stay server-side until the relevant action permits their disclosure. Selecting a locked node, another account's journey, or an unassigned dimension is rejected by the database.

Generation, scoring, evidence, rewards and reset share the existing per-account transaction lock. A replay of an answered question reuses its receipt without counting another success. Successful question fingerprints persist with evidence, preventing deleted history from making the same answer count again. Advanced issuance is checked both when reserving and saving a question. The generation epoch rejects work started before a reset. A reset removes the journeys; deleting an individual history question does not erase earned knowledge. Chapter creation is idempotent and never overwrites a saved boss.

Explorer Demo stores its journey in the same local ledger transaction as its answer receipt. Life contains authored examples for all seven dimensions and three advanced challenges per concept; other topics provide simpler scripted concept previews. Live Gemini supplies individual questions and feedback for every dimension. Demo does not generate additional chapters.

## Deployment and verification

Apply `20260908180000_discovery_journeys.sql` and `20260908200000_proficiency_mastery_reviews.sql`, deploy the `learning` Edge Function, then publish the frontend by pushing `main`.

`npm test` covers projections, prerequisite gates, plan validation, question validation, UI navigation, provisional entries, fresh retries, reloads and the established economy flows. `npm run test:db` checks private-table permissions, cross-account isolation, all-parent gates, idempotent receipts, mastery/tower projection, retention, chapter persistence and reset/generation races. `npm run build` and `npm run lint` verify the frontend.

The second revision follows the structure of the user’s shared concept breakdown: explicit prerequisites, seven dimensions, then advanced diagnostic questions. Its scientific text is not imported as curriculum content. Generated lesson accuracy and semantic prerequisite audits still depend on model quality; structural and progression rules are enforced deterministically.
