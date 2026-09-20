# Learning generation review

Lessons, boss questions, prerequisite concept trees, and concept questions now each use one generation call. A new boss takes one question call followed by one concept-tree call. The content audits, semantic concept reconciliation, embeddings, revision loops, malformed-output repair calls and Gemini schema fallback have been deleted.

Validation only checks the generated JSON structure before saving. Storage still enforces graph integrity and exact normalized concept identity. Failures preserve progress and release generation locks; they do not trigger another model call.

The Gemini 3.8 Flash model and shared dimension guidance remain, including fundamental-principles explanations and counterfactual reasoning. Quality improvements can be made in the authoring prompts without adding review calls.

The test suite verifies single-call success and failure behavior. The previous live samples in `.cache` came from the removed audit pipeline and are not measurements of the current generation path. No paid live runs were needed for this simplification.
