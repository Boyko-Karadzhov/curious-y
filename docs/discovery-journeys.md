# Discovery journeys

Learn opens a saved concept map, starting with two accessible foundations. Each topic has an authored first chapter; its synthesis question and complete prerequisite plan are persisted before practice starts. Subsequent chapters are generated with Gemini from the previous chapter's earned knowledge, validated as connected acyclic graphs, and saved before being displayed. Earlier chapters remain available in the chapter selector, including after reload or on another device.

## The learning loop

Select a revealed concept and a dimension. Make a multiple-choice attempt before seeing an explanation. Each option has its own feedback. After a miss, “Try another angle” requests a fresh example of the same concept and dimension. After a success, the knowledge base gains a short entry; return to the map to explore or confirm it.

Dimensions are intuition, precision/math, limits/extremes, applications, mechanisms/principles, alternatives, and evidence/discovery. Only applicable dimensions are assigned. Math and infinite limits are not mandatory. Questions may ask for a prediction, comparison, example, or observation rather than beginning with “Why”. Generated options and explanations must respect earned vocabulary.

- **First insight:** one correct answer, recorded provisionally.
- **Confirmed dimension:** two successful distinct questions. Misses do not add successes or replace an existing entry.
- **Understood concept:** intuition and mechanism confirmed.
- **Deepened concept:** every assigned dimension confirmed.
- **Retained dimension:** another correct answer at least 24 hours after the previous success, after confirmation. Missed reviews do not revoke discoveries.
- **Boss conquered:** two successful synthesis examples. The first uses the exact persisted boss question; the second checks its application in a fresh situation.

An edge specifies exactly which parent dimensions it needs. All parents must satisfy their requirements. Optional depth does not block the rest of the chapter. The UI shows unnamed connection silhouettes and each visible concept's contribution. Hidden titles, definitions, boss flags and semantic node IDs are excluded from the live response. Every revealed concept offers both graph and list navigation, search, filters, pan, zoom, fit and keyboard controls. Touch supports panning and pinching.

## Rewards

Correct and incorrect attempts retain the existing resource economy, immutable receipts, and explicit Collect action. Dimension metadata determines the reasoning category for reward calculation; earned proficiency feeds the Library and Knowledge Towers. Discoveries, understanding, depth, retention and boss completion also produce milestone messages. No additional currency or punishment for missed days is introduced.

## Persistence and security

`learning_journeys` stores private plans and evidence. Browser roles cannot query or write it. The authenticated Edge Function returns a filtered view. Question answers, knowledge entries, option feedback and hidden plans stay server-side until the relevant action permits their disclosure. Selecting a locked node, another account's journey, or an unassigned dimension is rejected by the database.

Generation, scoring, evidence, rewards and reset share the existing per-account transaction lock. A replay of an answered question reuses its receipt without counting another success. The generation epoch rejects work started before a reset. A reset removes the journeys; deleting an individual history question does not erase earned knowledge. Chapter creation is idempotent and never overwrites a saved boss.

Explorer Demo stores its journey in the same local ledger transaction as its answer receipt. Life contains authored examples for every assigned dimension; other topics provide simpler scripted concept previews. Live Gemini supplies individual questions and feedback for every dimension. Demo does not generate additional chapters.

## Deployment and verification

Apply `20260908180000_discovery_journeys.sql`, deploy the `learning` Edge Function, then publish the frontend by pushing `main`.

`npm test` covers projections, prerequisite gates, plan validation, question validation, UI navigation, provisional entries, fresh retries, reloads and the established economy flows. `npm run test:db` checks private-table permissions, cross-account isolation, all-parent gates, idempotent receipts, mastery/tower projection, retention, chapter persistence and reset/generation races. `npm run build` and `npm run lint` verify the frontend.
