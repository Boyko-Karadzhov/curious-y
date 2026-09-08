-- Proficiency requires every planned dimension; advanced evidence earns mastery.
CREATE FUNCTION public.journey_target_available(p_node jsonb,p_progress jsonb,p_facet text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT public.journey_node_available(p_node,p_progress) AND (
    (p_node->'facets' ? p_facet) OR (p_facet='advanced' AND p_node->>'kind'='concept' AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(p_node->'facets') f
      WHERE COALESCE((p_progress->(p_node->>'id')->f->>'successes')::integer,0)<2
    ))
  );
$$;
REVOKE ALL ON FUNCTION public.journey_target_available(jsonb,jsonb,text) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.begin_journey_question(p_user_id uuid,p_journey_id uuid,p_node text,p_facet text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE k public.kingdom_state; j public.learning_journeys; n jsonb; q public.questions; reservation jsonb;
BEGIN
  SELECT * INTO STRICT k FROM public.kingdom_state WHERE user_id=p_user_id FOR UPDATE;
  SELECT * INTO j FROM public.learning_journeys WHERE id=p_journey_id AND user_id=p_user_id AND generation=k.generation;
  IF NOT FOUND THEN RAISE EXCEPTION 'Journey not found. Please reopen the map.'; END IF;
  SELECT node INTO n FROM jsonb_array_elements(j.plan->'nodes') node WHERE node->>'id'=p_node;
  IF n IS NULL OR NOT public.journey_target_available(n,j.progress,p_facet) THEN RAISE EXCEPTION 'This discovery is still hidden.'; END IF;
  IF public.pending_learning_reward(p_user_id) IS NOT NULL THEN RAISE EXCEPTION 'Collect your Resources before continuing.'; END IF;
  SELECT * INTO q FROM public.questions WHERE user_id=p_user_id AND trusted_issuance AND generation=k.generation
    AND answered_at IS NULL AND expires_at>now() ORDER BY created_at DESC LIMIT 1;
  IF q.journey_id=p_journey_id AND q.journey_node=p_node AND q.journey_facet=p_facet THEN
    RETURN jsonb_build_object('active',to_jsonb(q),'generation',k.generation);
  END IF;
  IF k.issuance_until>now() THEN RAISE EXCEPTION 'A question is being generated. Please retry shortly.'; END IF;
  UPDATE public.questions SET expires_at=now() WHERE id=q.id;
  reservation:=public.begin_question_generation(p_user_id,j.topic);
  RETURN reservation||jsonb_build_object('journey',to_jsonb(j),'node',n);
END $$;

CREATE OR REPLACE FUNCTION public.finish_journey_question(p_user_id uuid,p_lease uuid,p_generation bigint,p_journey_id uuid,p_node text,p_facet text,p_question jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE k public.kingdom_state; j public.learning_journeys; n jsonb; q public.questions; dependencies jsonb;
BEGIN
  SELECT * INTO STRICT k FROM public.kingdom_state WHERE user_id=p_user_id FOR UPDATE;
  IF k.generation<>p_generation OR k.issuance_lease IS DISTINCT FROM p_lease OR k.issuance_until<=now()
    THEN RAISE EXCEPTION 'Question generation expired or progress was reset. Please retry.'; END IF;
  SELECT * INTO j FROM public.learning_journeys WHERE id=p_journey_id AND user_id=p_user_id AND generation=k.generation;
  SELECT node INTO n FROM jsonb_array_elements(j.plan->'nodes') node WHERE node->>'id'=p_node;
  IF n IS NULL OR NOT public.journey_target_available(n,j.progress,p_facet)
    OR k.issuance_topic IS DISTINCT FROM j.topic THEN RAISE EXCEPTION 'Invalid journey target.'; END IF;
  IF public.pending_learning_reward(p_user_id) IS NOT NULL THEN RAISE EXCEPTION 'Collect your Resources before continuing.'; END IF;
  IF jsonb_typeof(p_question->'options') IS DISTINCT FROM 'array' OR jsonb_array_length(p_question->'options')<>4
    OR jsonb_typeof(p_question->'option_feedback') IS DISTINCT FROM 'array' OR jsonb_array_length(p_question->'option_feedback')<>4
    OR (p_question->>'correct_index')::integer NOT BETWEEN 0 AND 3 OR p_question->>'correct_index' IS NULL
    OR length(COALESCE(p_question->>'question_text','')) NOT BETWEEN 1 AND 4000
    OR length(COALESCE(p_question->>'knowledge_entry','')) NOT BETWEEN 1 AND 1600
    OR length(COALESCE(p_question->>'explanation','')) NOT BETWEEN 1 AND 8000
    THEN RAISE EXCEPTION 'Invalid journey question.'; END IF;
  IF EXISTS (SELECT 1 FROM public.questions WHERE user_id=p_user_id AND journey_id=p_journey_id
    AND lower(regexp_replace(question_text,'[^a-zA-Z0-9]','','g'))=lower(regexp_replace(p_question->>'question_text','[^a-zA-Z0-9]','','g')))
    THEN RAISE EXCEPTION 'That question has already been explored. Please retry for a fresh example.'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_each(j.progress) node, LATERAL jsonb_each(node.value) facet
    WHERE facet.value->'creditedQuestions' ? md5(lower(regexp_replace(p_question->>'question_text','[^a-zA-Z0-9]','','g'))))
    THEN RAISE EXCEPTION 'That question has already earned knowledge. Please retry for a fresh example.'; END IF;
  SELECT COALESCE(jsonb_agg(parent->>'title'),'[]') INTO dependencies FROM jsonb_array_elements(n->'requires') r
    JOIN jsonb_array_elements(j.plan->'nodes') parent ON parent->>'id'=r->>'nodeId';
  UPDATE public.questions SET expires_at=now() WHERE user_id=p_user_id AND answered_at IS NULL AND expires_at>now();
  INSERT INTO public.questions(user_id,topic,subtopic,angle,question_text,options,correct_index,explanation,suggested_questions,
    concept,concept_definition,reasoning_complexity,is_boss_question,required_concepts,prerequisites_met,
    expires_at,trusted_issuance,generation,topic_weights,journey_id,journey_node,journey_facet,knowledge_entry,option_feedback)
  VALUES(p_user_id,j.topic,n->>'title',p_facet,p_question->>'question_text',p_question->'options',(p_question->>'correct_index')::integer,
    p_question->>'explanation',COALESCE(p_question->'suggested_questions','[]'),n->>'title',n->>'definition',
    CASE WHEN n->>'kind'='boss' THEN 'synthesis' WHEN p_facet='intuition' THEN 'directInference' WHEN p_facet='mechanism' THEN 'composition'
      WHEN p_facet IN ('application','advanced') THEN 'transfer' WHEN p_facet IN ('boundaries','alternatives') THEN 'counterfactual'
      WHEN p_facet='precision' THEN 'derivation' ELSE 'discrimination' END,
    n->>'kind'='boss',dependencies,true,now()+interval '30 minutes',true,k.generation,jsonb_build_object(j.topic,1),
    j.id,p_node,p_facet,p_question->>'knowledge_entry',p_question->'option_feedback') RETURNING * INTO q;
  UPDATE public.kingdom_state SET issuance_topic=NULL,issuance_lease=NULL,issuance_until=NULL WHERE user_id=p_user_id;
  RETURN to_jsonb(q);
END $$;

CREATE OR REPLACE FUNCTION public.record_question_answer(p_user_id uuid,p_question_id uuid,p_selected_index integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE q public.questions; j public.learning_journeys; n jsonb; p jsonb; previous_progress jsonb; result jsonb;
  attempts integer; successes integer; stamp timestamptz:=now(); next_mastery text; review_due boolean; review_step integer; review_days integer;
BEGIN
  PERFORM 1 FROM public.kingdom_state WHERE user_id=p_user_id FOR UPDATE;
  SELECT * INTO q FROM public.questions WHERE id=p_question_id AND user_id=p_user_id FOR UPDATE;
  result:=public.record_pre_journey_answer(p_user_id,p_question_id,p_selected_index);
  IF q.journey_id IS NULL THEN RETURN result; END IF;
  SELECT * INTO STRICT j FROM public.learning_journeys WHERE id=q.journey_id AND user_id=p_user_id FOR UPDATE;
  previous_progress:=j.progress;
  IF q.answered_at IS NULL THEN
    p:=COALESCE(j.progress->q.journey_node->q.journey_facet,'{"attempts":0,"successes":0}');
    attempts:=(p->>'attempts')::integer+1;
    successes:=(p->>'successes')::integer;
    p:=p||jsonb_build_object('attempts',attempts,'lastAttemptAt',stamp,'lastCorrect',q.correct_index=p_selected_index);
    review_due:=successes>=2 AND COALESCE((p->>'nextReviewAt')::timestamptz,(p->>'lastSuccessAt')::timestamptz+interval '1 day')<=stamp;
    review_step:=COALESCE((p->>'reviewStep')::integer,0);
    IF review_due THEN review_step:=CASE WHEN q.correct_index=p_selected_index THEN LEAST(review_step+1,4) ELSE 0 END; END IF;
    review_days:=(ARRAY[1,3,7,14,30])[review_step+1];
    IF q.correct_index=p_selected_index THEN
      IF review_due THEN p:=p||jsonb_build_object('retainedAt',stamp); END IF;
      p:=p||jsonb_build_object('creditedQuestions',COALESCE(p->'creditedQuestions','[]')||jsonb_build_array(md5(lower(regexp_replace(q.question_text,'[^a-zA-Z0-9]','','g')))),'successes',successes+1,'entry',q.knowledge_entry,'firstSuccessAt',COALESCE(p->>'firstSuccessAt',stamp::text),'lastSuccessAt',stamp);
      IF successes+1>=2 THEN p:=p||jsonb_build_object('reviewStep',review_step,'nextReviewAt',stamp+review_days*interval '1 day'); END IF;
    ELSIF review_due THEN p:=p||jsonb_build_object('reviewStep',0,'nextReviewAt',stamp+interval '10 minutes');
    END IF;
    j.progress:=jsonb_set(j.progress,ARRAY[q.journey_node],COALESCE(j.progress->q.journey_node,'{}')||jsonb_build_object(q.journey_facet,p));
    UPDATE public.learning_journeys SET progress=j.progress WHERE id=j.id;
    SELECT node INTO n FROM jsonb_array_elements(j.plan->'nodes') node WHERE node->>'id'=q.journey_node;
    next_mastery:=CASE
      WHEN NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(n->'facets') f WHERE COALESCE((j.progress->q.journey_node->f->>'successes')::integer,0)<2) THEN CASE WHEN n->>'kind'='boss' OR COALESCE((j.progress->q.journey_node->'advanced'->>'successes')::integer,0)>=3 THEN 'mastered' ELSE 'proficient' END
      ELSE 'learning' END;
    UPDATE public.concepts SET mastery=next_mastery,
      next_due_at=(SELECT min((value->>'nextReviewAt')::timestamptz) FROM jsonb_each(j.progress->q.journey_node)) WHERE user_id=p_user_id AND canonical_name=q.concept;
  END IF;
  RETURN result||jsonb_build_object('journey',to_jsonb(j),'previousProgress',previous_progress,'kingdom',public.kingdom_snapshot(p_user_id));
END $$;

UPDATE public.learning_journeys j SET plan=jsonb_set(j.plan,'{nodes}',(
  SELECT jsonb_agg(jsonb_set(n,'{requires}',COALESCE((
    SELECT jsonb_agg(jsonb_set(r,'{facets}',parent->'facets')) FROM jsonb_array_elements(n->'requires') r
    JOIN jsonb_array_elements(j.plan->'nodes') parent ON parent->>'id'=r->>'nodeId'
  ),'[]'))) FROM jsonb_array_elements(j.plan->'nodes') n
));

-- Repair the authored first-chapter prerequisites and restore all seven dimensions.
UPDATE public.learning_journeys SET plan='{"title":"The living world","topic":"Life","nodes":[{"id":"food-fuel","title":"Food as fuel","definition":"Food contains chemical energy. Cells transfer some of that energy to processes such as movement, growth, and repair; food also supplies building materials.","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"],"kind":"concept","requires":[],"prerequisiteConcepts":[]},{"id":"cells","title":"Cells: living building blocks","definition":"A cell is a small unit of life enclosed by a membrane. Human bodies contain many cells that exchange materials with their surroundings and perform different jobs.","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"],"kind":"concept","requires":[],"prerequisiteConcepts":[]},{"id":"stores","title":"Saving fuel for later","definition":"The body stores some fuel after eating and releases stored fuel between meals. A store grows when more enters than leaves and shrinks when more leaves than enters.","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"],"kind":"concept","requires":[{"nodeId":"food-fuel","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"]},{"nodeId":"cells","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"]}],"prerequisiteConcepts":["Food as fuel","Cells: living building blocks"]},{"id":"feedback","title":"Keeping conditions steady","definition":"Negative feedback means a change triggers a response that opposes that change. In bodies, cells respond to information about changing conditions. Regulation keeps conditions within a range, not perfectly constant.","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"],"kind":"concept","requires":[{"nodeId":"food-fuel","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"]},{"nodeId":"cells","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"]}],"prerequisiteConcepts":["Food as fuel","Cells: living building blocks"]},{"id":"boss","title":"How does your body keep its cells supplied with fuel between meals?","definition":"Food supplies fuel, cells use energy, and stored fuel can be released. Feedback coordinates storage and release as available fuel changes. This introductory model leaves the detailed signals for later exploration.","kind":"boss","facets":["mechanism"],"requires":[{"nodeId":"stores","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"]},{"nodeId":"feedback","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"]}],"prerequisiteConcepts":["Saving fuel for later","Keeping conditions steady"]}]}'::jsonb WHERE topic='Life' AND chapter=1;
UPDATE public.learning_journeys SET plan='{"title":"Making sense of motion","topic":"Physics","nodes":[{"id":"motion","title":"Describing motion","definition":"Speed describes how far an object travels per unit time. Direction also matters when describing velocity. Motion is described relative to a reference point.","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"],"kind":"concept","requires":[],"prerequisiteConcepts":[]},{"id":"pushes","title":"Pushes and pulls","definition":"A force is a push or pull from an interaction. Forces can change motion or deform objects. Multiple forces can balance.","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"],"kind":"concept","requires":[],"prerequisiteConcepts":[]},{"id":"inertia","title":"Continuing in motion","definition":"With no net external force, an object keeps a constant velocity. A force is needed to change motion, not to maintain a constant velocity.","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"],"kind":"concept","requires":[{"nodeId":"motion","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"]},{"nodeId":"pushes","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"]}],"prerequisiteConcepts":["Describing motion","Pushes and pulls"]},{"id":"resistance","title":"What slows things down","definition":"Friction and drag oppose relative motion. They transfer energy from organized motion into other forms, including thermal energy.","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"],"kind":"concept","requires":[{"nodeId":"motion","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"]},{"nodeId":"pushes","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"]}],"prerequisiteConcepts":["Describing motion","Pushes and pulls"]},{"id":"boss","title":"Why does a bicycle slow down when you stop pedaling, while an object in empty space can keep moving?","definition":"A change in motion requires a net force. Pedaling can balance resistance; when pedaling stops, resistance slows a bicycle. Without a net external force, velocity stays constant.","kind":"boss","facets":["mechanism"],"requires":[{"nodeId":"inertia","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"]},{"nodeId":"resistance","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"]}],"prerequisiteConcepts":["Continuing in motion","What slows things down"]}]}'::jsonb WHERE topic='Physics' AND chapter=1;
UPDATE public.learning_journeys SET plan='{"title":"Patterns you can trust","topic":"Mathematics & Logic","nodes":[{"id":"claims","title":"Claims and truth","definition":"A mathematical statement makes a claim that can be true or false in a specified setting. A question or instruction is not itself such a claim.","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"],"kind":"concept","requires":[],"prerequisiteConcepts":[]},{"id":"examples","title":"Examples and patterns","definition":"Examples can suggest a pattern. A pattern observed in a few cases may or may not continue in other cases.","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"],"kind":"concept","requires":[],"prerequisiteConcepts":[]},{"id":"all","title":"What “every” means","definition":"A universal claim says a property holds for every member of a specified set. A single member without that property makes the universal claim false.","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"],"kind":"concept","requires":[{"nodeId":"claims","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"]},{"nodeId":"examples","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"]}],"prerequisiteConcepts":["Claims and truth","Examples and patterns"]},{"id":"proof","title":"Evidence and proof","definition":"A mathematical proof establishes a claim from stated assumptions using valid reasoning. Checking several examples is not generally a proof of a universal claim.","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"],"kind":"concept","requires":[{"nodeId":"claims","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"]},{"nodeId":"examples","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"]},{"nodeId":"all","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"]}],"prerequisiteConcepts":["Claims and truth","Examples and patterns","What “every” means"]},{"id":"boss","title":"How can a single counterexample overturn a rule that worked in a hundred examples?","definition":"A universal claim applies to every member of its stated domain. One valid counterexample contradicts it. Many agreeing examples provide evidence but do not by themselves prove the claim for all cases.","kind":"boss","facets":["mechanism"],"requires":[{"nodeId":"all","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"]},{"nodeId":"proof","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"]}],"prerequisiteConcepts":["What “every” means","Evidence and proof"]}]}'::jsonb WHERE topic='Mathematics & Logic' AND chapter=1;
UPDATE public.learning_journeys SET plan='{"title":"Matter in everyday life","topic":"Chemistry","nodes":[{"id":"matter","title":"What matter is","definition":"Matter has mass and occupies space. Air is matter even though it is usually invisible.","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"],"kind":"concept","requires":[],"prerequisiteConcepts":[]},{"id":"particles","title":"A world of tiny particles","definition":"Ordinary matter consists of atoms or groups of atoms. These particles are too small to see individually with the unaided eye.","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"],"kind":"concept","requires":[],"prerequisiteConcepts":[]},{"id":"states","title":"Solid, liquid, and gas","definition":"In a gas, particles are much farther apart and move freely compared with a liquid. Evaporation changes water from liquid to gas without changing its molecular identity.","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"],"kind":"concept","requires":[{"nodeId":"matter","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"]},{"nodeId":"particles","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"]}],"prerequisiteConcepts":["What matter is","A world of tiny particles"]},{"id":"conservation","title":"Tracking matter","definition":"Mass is conserved in ordinary physical changes in a closed system. In an open container, matter can leave and enter, changing the mass inside.","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"],"kind":"concept","requires":[{"nodeId":"matter","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"]},{"nodeId":"particles","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"]}],"prerequisiteConcepts":["What matter is","A world of tiny particles"]},{"id":"boss","title":"Why can a puddle disappear while its water still exists?","definition":"Matter consists of particles. Liquid water can evaporate as particles escape into the air and disperse. In a closed system, the total mass remains, even when the liquid becomes invisible vapor.","kind":"boss","facets":["mechanism"],"requires":[{"nodeId":"states","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"]},{"nodeId":"conservation","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"]}],"prerequisiteConcepts":["Solid, liquid, and gas","Tracking matter"]}]}'::jsonb WHERE topic='Chemistry' AND chapter=1;
UPDATE public.learning_journeys SET plan='{"title":"From instructions to solutions","topic":"Computer Science","nodes":[{"id":"instructions","title":"Step-by-step instructions","definition":"An algorithm is a sequence of clearly specified steps for solving a problem. An ambiguous everyday instruction needs clarification before a machine can execute it reliably.","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"],"kind":"concept","requires":[],"prerequisiteConcepts":[]},{"id":"data","title":"Representing information","definition":"Computers operate on representations of information. A stored number or symbol gets its meaning from the rules used to interpret it.","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"],"kind":"concept","requires":[],"prerequisiteConcepts":[]},{"id":"conditions","title":"Decisions in a program","definition":"A conditional instruction selects an action based on whether a specified condition holds. Its behavior depends on the exact condition and input.","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"],"kind":"concept","requires":[{"nodeId":"instructions","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"]},{"nodeId":"data","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"]}],"prerequisiteConcepts":["Step-by-step instructions","Representing information"]},{"id":"testing","title":"Checking a solution","definition":"Testing compares a program’s actual output with expected behavior for chosen inputs. A passing example does not establish correctness for every possible input.","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"],"kind":"concept","requires":[{"nodeId":"instructions","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"]},{"nodeId":"data","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"]},{"nodeId":"conditions","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"]}],"prerequisiteConcepts":["Step-by-step instructions","Representing information","Decisions in a program"]},{"id":"boss","title":"How can a computer follow every instruction correctly and still give the wrong result?","definition":"A program implements instructions on represented inputs. Incorrect assumptions, instructions, or inputs can produce an unwanted result even when the machine executes the program faithfully. Testing checks behavior against expectations.","kind":"boss","facets":["mechanism"],"requires":[{"nodeId":"conditions","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"]},{"nodeId":"testing","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"]}],"prerequisiteConcepts":["Decisions in a program","Checking a solution"]}]}'::jsonb WHERE topic='Computer Science' AND chapter=1;
UPDATE public.learning_journeys SET plan='{"title":"Our changing sky","topic":"Earth & Space","nodes":[{"id":"light","title":"Light and shadows","definition":"Light travels from a source. An opaque object blocks direct light, creating a shadow behind it.","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"],"kind":"concept","requires":[],"prerequisiteConcepts":[]},{"id":"earth","title":"Earth as a globe","definition":"Earth is approximately spherical. Places on different sides of a globe face different directions relative to a distant light source.","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"],"kind":"concept","requires":[],"prerequisiteConcepts":[]},{"id":"rotation","title":"A turning Earth","definition":"Earth rotates about its axis roughly once per day. A location moves with Earth as the planet turns.","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"],"kind":"concept","requires":[{"nodeId":"earth","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"]}],"prerequisiteConcepts":["Earth as a globe"]},{"id":"daylight","title":"The sunlit side","definition":"About half of Earth faces the Sun at a time. Rotation carries most places between illuminated and dark regions; polar regions have seasonal exceptions.","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"],"kind":"concept","requires":[{"nodeId":"light","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"]},{"nodeId":"earth","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"]},{"nodeId":"rotation","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"]}],"prerequisiteConcepts":["Light and shadows","Earth as a globe","A turning Earth"]},{"id":"boss","title":"Why can it be daytime where you live and nighttime somewhere else on Earth?","definition":"The Sun illuminates the side of Earth facing it. Earth rotates, carrying locations into and out of that illuminated region. Different longitudes face the Sun at different times.","kind":"boss","facets":["mechanism"],"requires":[{"nodeId":"rotation","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"]},{"nodeId":"daylight","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"]}],"prerequisiteConcepts":["A turning Earth","The sunlit side"]}]}'::jsonb WHERE topic='Earth & Space' AND chapter=1;
UPDATE public.learning_journeys SET plan='{"title":"How we learn about the mind","topic":"Mind & Behavior","nodes":[{"id":"attention","title":"What we notice","definition":"Attention prioritizes some information over other information. People may miss details even when those details are in view.","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"],"kind":"concept","requires":[],"prerequisiteConcepts":[]},{"id":"memory","title":"Remembering an experience","definition":"Memory involves taking in, keeping, and retrieving information. It is not a perfect recording of every detail.","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"],"kind":"concept","requires":[],"prerequisiteConcepts":[]},{"id":"reconstruction","title":"Putting memories together","definition":"Remembering can combine stored information with current knowledge and expectations. This can help interpretation but can also introduce errors.","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"],"kind":"concept","requires":[{"nodeId":"attention","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"]},{"nodeId":"memory","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"]}],"prerequisiteConcepts":["What we notice","Remembering an experience"]},{"id":"checking","title":"Checking a recollection","definition":"Confidence and accuracy are different. Independent records and carefully designed comparisons can help test whether a remembered detail is accurate.","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"],"kind":"concept","requires":[{"nodeId":"memory","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"]},{"nodeId":"reconstruction","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"]}],"prerequisiteConcepts":["Remembering an experience","Putting memories together"]},{"id":"boss","title":"Why does remembering something vividly not guarantee that it happened exactly that way?","definition":"Attention selects part of an experience. Memory stores and reconstructs information rather than replaying a perfect recording. Independent evidence can support or challenge a confident recollection.","kind":"boss","facets":["mechanism"],"requires":[{"nodeId":"reconstruction","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"]},{"nodeId":"checking","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"]}],"prerequisiteConcepts":["Putting memories together","Checking a recollection"]}]}'::jsonb WHERE topic='Mind & Behavior' AND chapter=1;
UPDATE public.learning_journeys SET plan='{"title":"Piecing together the past","topic":"Society & History","nodes":[{"id":"sources","title":"Traces of the past","definition":"A historical source is evidence from or about the past, such as an object, letter, record, or later account. Sources can support particular claims without answering every question.","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"],"kind":"concept","requires":[],"prerequisiteConcepts":[]},{"id":"perspective","title":"Different points of view","definition":"People observe events from different positions and interpret them through their knowledge and interests. Accounts may differ without every difference being an intentional lie.","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"],"kind":"concept","requires":[],"prerequisiteConcepts":[]},{"id":"context","title":"Putting a source in context","definition":"Who produced a source, when, for whom, and for what purpose affects how it can be interpreted. Context helps assess what a source can establish.","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"],"kind":"concept","requires":[{"nodeId":"sources","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"]},{"nodeId":"perspective","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"]}],"prerequisiteConcepts":["Traces of the past","Different points of view"]},{"id":"corroboration","title":"Comparing evidence","definition":"Agreement between independent sources can strengthen a claim. Accounts that copy a single source are not independent confirmations.","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"],"kind":"concept","requires":[{"nodeId":"sources","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"]},{"nodeId":"perspective","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"]},{"nodeId":"context","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"]}],"prerequisiteConcepts":["Traces of the past","Different points of view","Putting a source in context"]},{"id":"boss","title":"How can historians investigate an event when eyewitnesses disagree?","definition":"Sources preserve partial perspectives. Historians compare independent sources, context, and material evidence, assessing which claims are supported and which remain uncertain.","kind":"boss","facets":["mechanism"],"requires":[{"nodeId":"context","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"]},{"nodeId":"corroboration","facets":["intuition","precision","boundaries","application","mechanism","alternatives","evidence"]}],"prerequisiteConcepts":["Putting a source in context","Comparing evidence"]}]}'::jsonb WHERE topic='Society & History' AND chapter=1;
-- Update projections without discarding earned evidence or pending receipts.
UPDATE public.concepts c SET mastery=CASE
 WHEN EXISTS(SELECT 1 FROM jsonb_array_elements_text(n->'facets') f WHERE COALESCE((j.progress->(n->>'id')->f->>'successes')::integer,0)<2) THEN 'learning'
 WHEN n->>'kind'='boss' OR COALESCE((j.progress->(n->>'id')->'advanced'->>'successes')::integer,0)>=3 THEN 'mastered'
 ELSE 'proficient' END
FROM public.learning_journeys j CROSS JOIN LATERAL jsonb_array_elements(j.plan->'nodes') n
WHERE c.user_id=j.user_id AND c.canonical_name=n->>'title';

-- Reward fresh dimensions and advanced challenges using their own evidence,
-- and use the same due date shown by the concept map. Existing receipts stay immutable.
CREATE OR REPLACE FUNCTION public.record_pre_journey_answer(p_user_id uuid,p_question_id uuid,p_selected_index integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE k public.kingdom_state%ROWTYPE; q public.questions%ROWTYPE; c public.concepts;
  journey_progress jsonb; facet_progress jsonb; previous public.learning_reward_events%ROWTYPE; budget public.learning_reward_budget%ROWTYPE;
  result jsonb; score jsonb; breakdown jsonb; input jsonb; t jsonb:=public.learning_value_tuning();
  answer_time timestamptz; correct boolean; known boolean; atomic boolean; successes integer; step integer; due boolean;
BEGIN
  IF p_selected_index IS NULL OR p_selected_index NOT BETWEEN 0 AND 3 THEN RAISE EXCEPTION 'Invalid answer.'; END IF;
  -- Lock order is shared with generation, collection, spending and reset.
  SELECT * INTO STRICT k FROM public.kingdom_state WHERE user_id=p_user_id FOR UPDATE;
  SELECT * INTO q FROM public.questions WHERE id=p_question_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Question not found'; END IF;
  IF NOT q.trusted_issuance OR q.generation IS DISTINCT FROM k.generation OR q.expires_at IS NULL OR NOT q.prerequisites_met THEN
    RAISE EXCEPTION 'Question has expired';
  END IF;
  SELECT * INTO previous FROM public.learning_reward_events WHERE user_id=p_user_id AND question_id=p_question_id FOR UPDATE;
  IF FOUND THEN
    IF previous.selected_index<>p_selected_index THEN RAISE EXCEPTION 'Question has already been answered with a different selection'; END IF;
    RETURN jsonb_build_object('question',to_jsonb(q)||jsonb_build_object('reward',previous.reward),
      'stats',(SELECT to_jsonb(s) FROM public.game_stats s WHERE user_id=p_user_id),
      'collected',previous.collected_at IS NOT NULL,'reward',previous.reward,'kingdom',public.kingdom_snapshot(p_user_id));
  END IF;
  answer_time:=clock_timestamp();
  IF q.expires_at<=answer_time THEN RAISE EXCEPTION 'Question has expired'; END IF;
  IF public.pending_learning_reward(p_user_id) IS NOT NULL THEN RAISE EXCEPTION 'Collect your Resources before answering another question.'; END IF;
  c:=public.resolve_reward_concept(p_user_id,q.concept);
  IF c.id IS NOT NULL THEN SELECT * INTO c FROM public.concepts WHERE id=c.id FOR UPDATE; END IF;
  -- Issued name + definition can establish a new target. Missing metadata earns only capped conservative practice.
  known:=(c.id IS NOT NULL OR (NULLIF(trim(q.concept),'') IS NOT NULL AND NULLIF(trim(q.concept_definition),'') IS NOT NULL))
    AND t->'reasoning' ? q.reasoning_complexity;
  known:=COALESCE(known,false);
  atomic:=COALESCE(c.is_atomic,false);
  successes:=GREATEST(COALESCE(c.reward_successes,0),CASE WHEN NOT atomic AND c.id IS NOT NULL AND
    (c.mastery<>'unseen' OR EXISTS (SELECT 1 FROM jsonb_each_text(c.reasoning_track) v WHERE v.value::integer>0)) THEN 1 ELSE 0 END);
  correct:=p_selected_index=q.correct_index;
  INSERT INTO public.learning_reward_budget(user_id,generation,day) VALUES(p_user_id,k.generation,(answer_time AT TIME ZONE 'UTC')::date)
    ON CONFLICT(user_id) DO NOTHING;
  SELECT * INTO STRICT budget FROM public.learning_reward_budget WHERE user_id=p_user_id FOR UPDATE;
  IF budget.generation<>k.generation OR budget.day<>(answer_time AT TIME ZONE 'UTC')::date THEN
    budget.attempts:=0;
    UPDATE public.learning_reward_budget SET generation=k.generation,day=(answer_time AT TIME ZONE 'UTC')::date,attempts=0 WHERE user_id=p_user_id;
  END IF;
  input:=jsonb_build_object('canonicalConcept',COALESCE(c.canonical_name,q.concept),'metadataKnown',known,
    'preMastery',COALESCE(c.mastery,'unseen'),'atomic',atomic,'successes',successes,
    'axisSuccesses',COALESCE((c.reasoning_track->>q.reasoning_complexity)::integer,0),
    'nextDueAt',c.next_due_at,'reasoning',COALESCE(q.reasoning_complexity,''),'boss',COALESCE(q.is_boss_question,false),
    'lowValueAttempts',budget.attempts,'answeredAt',answer_time);
  IF q.journey_id IS NOT NULL THEN
    SELECT progress INTO journey_progress FROM public.learning_journeys WHERE id=q.journey_id AND user_id=p_user_id;
    facet_progress:=COALESCE(journey_progress->q.journey_node->q.journey_facet,'{}');
    input:=input||jsonb_build_object('axisSuccesses',COALESCE((facet_progress->>'successes')::integer,0),
      'nextDueAt',CASE WHEN COALESCE((facet_progress->>'successes')::integer,0)>=2
        THEN COALESCE((facet_progress->>'nextReviewAt')::timestamptz,(facet_progress->>'lastSuccessAt')::timestamptz+interval '1 day') ELSE NULL END);
  END IF;
  score:=public.learning_value_score(correct,input);
  breakdown:=public.castle_learning_reward(q.id,correct,(score->>'total')::integer,q.topic_weights,q.topic)
    ||jsonb_build_object('calculation',score->'calculation');
  -- Canonicalize legacy alias issuances before the unchanged mastery scorer runs.
  IF c.id IS NOT NULL AND q.concept IS DISTINCT FROM c.canonical_name THEN
    UPDATE public.questions SET concept=c.canonical_name WHERE id=q.id;
  END IF;
  result:=public.score_question_internal(p_user_id,p_question_id,p_selected_index);
  c:=public.resolve_reward_concept(p_user_id,COALESCE(c.canonical_name,q.concept));
  IF c.id IS NOT NULL THEN
    step:=c.review_step;
    due:=(score->'calculation'->>'due')::boolean;
    IF atomic OR NOT known THEN c.next_due_at:=NULL; step:=0;
    ELSIF NOT correct THEN
      step:=0;
      c.next_due_at:=CASE WHEN successes>0 THEN answer_time+make_interval(days=>(t->'reviewDays'->>0)::integer) ELSE NULL END;
    ELSIF successes=0 OR c.next_due_at IS NULL OR due THEN
      step:=CASE WHEN due THEN LEAST(step+1,jsonb_array_length(t->'reviewDays')-1) ELSE 0 END;
      c.next_due_at:=answer_time+make_interval(days=>(t->'reviewDays'->>step)::integer);
    END IF;
    UPDATE public.concepts SET reward_attempts=reward_attempts+1,
      reward_successes=successes+CASE WHEN correct AND NOT atomic THEN 1 ELSE 0 END,
      last_attempt_at=answer_time,last_success_at=CASE WHEN correct AND NOT atomic THEN answer_time ELSE last_success_at END,
      next_due_at=c.next_due_at,review_step=step,
      mastery=CASE WHEN atomic THEN 'mastered' ELSE mastery END WHERE id=c.id;
  END IF;
  IF (score->'calculation'->>'lowValue')::boolean THEN
    UPDATE public.learning_reward_budget SET attempts=LEAST(attempts+1,jsonb_array_length(t->'lowValueFactors')) WHERE user_id=p_user_id;
  END IF;
  INSERT INTO public.learning_reward_events(user_id,question_id,generation,selected_index,topic,tokens,reward)
    VALUES(p_user_id,q.id,k.generation,p_selected_index,q.topic,(score->>'total')::integer,breakdown);
  RETURN result||jsonb_build_object('question',result->'question'||jsonb_build_object('reward',breakdown),
    'reward',breakdown,'collected',false,'kingdom',public.kingdom_snapshot(p_user_id));
END $$;

