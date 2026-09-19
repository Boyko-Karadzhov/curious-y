# Learning generation review

Lessons, boss questions with prerequisite trees, and concept questions now each use one generation call. The content audits, audit prompts/schemas/fixtures, revision loops, malformed-output repair calls and Gemini schema fallback have been deleted.

Validation still rejects malformed JSON, missing dimensions, invalid choices and dependency cycles before saving. Failures preserve progress and release generation locks; they do not trigger another model call. Existing concept matching remains separate from content generation.

The Gemini 3.8 Flash model and shared dimension guidance remain, including fundamental-principles explanations and counterfactual reasoning. Quality improvements can be made in the authoring prompts without adding review calls.

The test suite verifies single-call success and failure behavior. The previous live samples in `.cache` came from the removed audit pipeline and are not measurements of the current generation path. No paid live runs were needed for this simplification.
