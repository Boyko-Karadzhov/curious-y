We need to rebuild the whole learning process and generation. It is currently not good at all. The goal is to ensure meaningful progress and attacking the concepts from all possible angles. As you rework it, make sure to delete unused code from previous implementation. How I imagine the algorithm:

Learn a topic (regardless if it is chosen specificically or chosen at random):
1. Check if there is a boss question for the chosen topic that has all its prerequisite concepts mastered
1.a. Yes - ask that question. Done
1.b. No - Find all eligible concepts tagged with the topic:
    What is eligibe: concepts that are not yet mastered and are tagged with the topic;
    1.b.a. If there are eligible concepts:
        1.b.a.1. Choose an eligible concept at random
        1.b.a.2. Generate a question on the concept about its next undiscovered dimension
            All dimensions are prefilled for all concepts. So when you generate a question - add the dimension knowledge in the context and ask the LLM to produce a question about it.
        1.b.a.3. Ask that question. Done
    1.b.b. If there are no eligible concepts:
        1.b.b.1. Produce a boss question
            How to produce a boss question: Choose an ANGLE at random. Choose a subtopic at random. Ask for a question with the selected ANGLE on the selected subtopic (we may already have a nice prompt for that. evaluate it and maybe you don't need to redo it).
        1.b.b.2. Fill out its dependencies in the graph
            Show the LLM the BOSS question and ask it generate a list of directly dependant concepts.
                1.b.b.2.1. Match the concept list with the existing graph. 
                1.b.b.2.2. For all concepts that are new (do not match to existing):
                    1.b.b.2.2.1. Filter out concepts that do not need learning using the BASIC_CONCEPT_RULE
                    1.b.b.2.2.2. For every concept generate the whole concept knowledge with a prompt like this but ensure structured output so we know which dimension is which (each concept in its own LLM call):

                    ```
                    You should show all of this information:
                    - prerequisite knowledge (concepts)
                    - short intuitive definition and explanation
                    - formal definition and math
                    - limiting cases: what happens if this and that goes to zero? What is that goes to infinity?
                    - real world uses
                    - why does it make sense ? (touch on fundamental principals)
                    - why it cannot be any other way?
                    - how do we know it is true? historical discovery + method, additional validation
                    ```

                    All dimenstions to be persisted in the concept even though the user has not yet discovered them.

                    1.b.b.2.2.3. Show the LLM the concept intuition and formal definition and ask it generate a list of directly dependant concepts. 
                    1.b.b.2.2.4. Go to (1.b.b.2.1.) with this list
        1.b.b.3. Go to (1)

Practice specifically selected concept:
Go to 1.b.a.2.

Note: Generated questions should produce as a structure one right answer and 3 wrong answers that the server can shuffle afterwards. Don't let the LLM mix the right and wrong answers into the same array.

------------
- Merge ux, whole unit ux;
- indicate in unit collection where you have extras available for merge;

- manual code review;

- knowledge tower/library bonuses should be more substantial. Mastering concepts is hard yet the most important part;

- bad mobile ui on knowledge graph;