## Architecture & Code Constraints

Prioritize simplicity and maintainability through aggressive composition over inheritance or sprawling units. All generated and refactored code must strictly satisfy the following size and modularity constraints:

### Hard Structural Limits
- **Max 12 statements per function/method:** Exclude blank lines, standalone comments, and method signatures. If logic exceeds 12 statements, decompose it into focused, single-purpose helper functions or collaborator objects.
- **Max 12 members per class/interface:** This limit applies to the sum of fields, properties, methods, and accessors. Exceeding this indicates the type has multiple responsibilities; split it into smaller, composed types.

### Composition Guidelines
- Prefer small, pure functions and lightweight collaborator classes.
- Use dependency injection or direct composition to combine behaviors rather than creating deep inheritance hierarchies or kitchen-sink utility classes.
- Avoid artificial packing: do not condense multi-line statements or cram multiple expressions onto single lines simply to bypass the statement count. Write idiomatic, readable code.

### Refactoring Existing Violations ("Opportunistic Refactoring")

When modifying existing code that violates these limits:
- **Never expand a violation:** Do not add statements or members to a method or class that already exceeds the 12-statement / 12-member cap.
- **Refactor touched scopes:** If a task requires modifying an oversized method or class, refactor the immediate target into compliant units as part of the change.
  - Decompose bloated methods by extracting helper functions or pipeline steps.
  - Decompose bloated classes by extracting focused collaborator classes or value objects.
- **Bound the blast radius:** Confine refactoring strictly to the component being modified and its immediate callers. Do not attempt a codebase-wide overhaul outside the direct scope of the feature or bug fix.
- **Preserve behavior:** Verify that existing tests pass before and after refactoring before adding new behavior.

## SDLC

This project is still in development. No live users. Do not care about migrating existing state. It is ok to clear user data after a change.

After a task is completed it is expected that everything is pushed into the `main` barnch and all new supabase migrations are pushed, all edge functions are deployed.