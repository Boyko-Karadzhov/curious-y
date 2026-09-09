import { describe, expect, it, vi } from 'vitest';
import { calculateMastery, createDefaultReasoningTrack } from '../lib/concepts/mastery';
import { nextReasoningStage } from '../../supabase/functions/_shared/reasoningProgression';
import {
    checkQuestionPrerequisites,
    generateEligibleQuestion,
    type QuestionRequirements,
    type RegistryConcept,
} from '../../supabase/functions/learning/prerequisites';

const concept = (name: string, overrides: Partial<RegistryConcept> = {}): RegistryConcept => ({
    canonical_name: name, definition: name, aliases: [], prerequisites: [],
    mastery: 'unseen', is_atomic: false, topics: { Physics: 1 }, ...overrides,
});

const registry = [
    concept('Speed of light', { aliases: ['c', 'speed of light in a vacuum'], prerequisites: ['Velocity', 'Electromagnetic radiation'] }),
    concept('Time dilation', { aliases: ['dilation of time'], prerequisites: ['Speed of light', 'Inertial frame of reference'] }),
    concept('Spacetime interval', { prerequisites: ['Speed of light', 'Time dilation'] }),
    concept('Velocity'),
];

const boss: QuestionRequirements = {
    concept: 'Spacetime interval', requiredConcepts: ['Speed of light', 'Time dilation'],
    isBossQuestion: true, reasoningComplexity: 'synthesis',
};

describe('Server prerequisite gate', () => {
    it('rejects the reported spacetime boss while speed of light and time dilation are unseen', () => {
        expect(checkQuestionPrerequisites(boss, registry)).toMatchObject({
            eligible: false, reasons: ['Unmet prerequisites: Speed of light, Time dilation.'],
        });
    });

    it.each(['unseen', 'learning'])('blocks a %s prerequisite even when the other is mastered', (mastery) => {
        const progress = registry.map((item) => ({
            ...item, mastery: item.canonical_name === 'Time dilation' ? mastery : 'mastered',
        }));
        expect(checkQuestionPrerequisites(boss, progress).eligible).toBe(false);
    });

    it('allows a boss once both requirements are proficient or mastered', () => {
        const progress = registry.map((item) => ({
            ...item, mastery: item.canonical_name === 'Time dilation' ? 'proficient' : 'mastered',
        }));
        expect(checkQuestionPrerequisites(boss, progress).eligible).toBe(true);
    });

    it('checks saved target dependencies even when the model omits them', () => {
        expect(checkQuestionPrerequisites({ ...boss, requiredConcepts: [] }, registry)).toMatchObject({
            eligible: false, requiredConcepts: ['Speed of light', 'Time dilation'],
        });
        expect(checkQuestionPrerequisites({
            ...boss, isBossQuestion: false, reasoningComplexity: 'directInference', requiredConcepts: [],
        }, registry).eligible).toBe(false);
    });

    it('resolves aliases, case and whitespace before checking progress', () => {
        const result = checkQuestionPrerequisites({
            ...boss, concept: ' spacetime   INTERVAL ', requiredConcepts: [' C ', 'dilation OF time'],
        }, registry);
        expect(result).toMatchObject({
            concept: 'Spacetime interval', requiredConcepts: ['Speed of light', 'Time dilation'], eligible: false,
        });
    });

    it('does not assume a missing prerequisite is mastered', () => {
        expect(checkQuestionPrerequisites(boss, []).eligible).toBe(false);
        expect(checkQuestionPrerequisites({ ...boss, requiredConcepts: [] }, []).eligible).toBe(false);
    });

    it('allows the concept being taught to be unseen, excludes it from its own prerequisites', () => {
        expect(checkQuestionPrerequisites({
            concept: 'Velocity', requiredConcepts: [' velocity '], isBossQuestion: false,
            reasoningComplexity: 'directInference',
        }, registry)).toMatchObject({ eligible: true, requiredConcepts: [] });
        expect(checkQuestionPrerequisites({ ...boss, requiredConcepts: ['Spacetime interval'] }, registry)
            .reasons.join(' ')).toContain('Spacetime interval');
    });

    it('permits an accessible first concept, but rejects advanced reasoning for unseen targets', () => {
        const first = { concept: 'Distance', requiredConcepts: [], isBossQuestion: false, reasoningComplexity: 'directInference' };
        expect(checkQuestionPrerequisites(first, []).eligible).toBe(true);
        expect(checkQuestionPrerequisites({ ...first, reasoningComplexity: 'synthesis' }, []).eligible).toBe(false);
    });

    it('only assumes atomic concepts mastered when they are leaves', () => {
        const question = { ...boss, concept: 'Motion', requiredConcepts: ['Distance'] };
        const atomic = concept('Distance', { is_atomic: true });
        expect(checkQuestionPrerequisites(question, [atomic]).eligible).toBe(true);
        expect(checkQuestionPrerequisites(question, [{ ...atomic, prerequisites: ['Measurement'] }]).eligible).toBe(false);
    });

    it('does not trust a cached prerequisitesMet flag over current progress', () => {
        const cached = { ...boss, prerequisitesMet: true };
        expect(checkQuestionPrerequisites(cached, registry).eligible).toBe(false);
    });
});

describe('Server generation retries', () => {
    it('advances six direct-inference successes to composition, including aliases and retries', async () => {
        const progress = [concept('Velocity', {
            mastery: 'learning', aliases: ['speed'], reasoning_track: { directInference: 6 },
        })];
        const candidate = { topic: 'Physics', concept: ' SPEED ', requiredConcepts: [], isBossQuestion: false,
            reasoningComplexity: 'directInference', question: 'Why does covering more distance take longer?' };
        const generate = vi.fn().mockResolvedValueOnce(candidate)
            .mockResolvedValueOnce({ ...candidate, reasoningComplexity: 'composition', question: 'Why do two legs of a trip take different times?' });
        expect(await generateEligibleQuestion(generate, 'Create Physics.', progress, 'Physics')).toMatchObject({
            concept: 'Velocity', reasoningComplexity: 'composition', eligible: true,
        });
        expect(generate.mock.calls[0][0]).toContain('correct answers {"directInference":6}; required next reasoningComplexity: composition');
        expect(generate.mock.calls[1][0]).toContain('The next reasoning stage for Velocity is composition');
        expect(generate.mock.calls[1][0]).not.toContain('Generate a different, non-boss directInference question');
    });

    it('does not downgrade a learning concept to direct inference after a duplicate rejection', async () => {
        const progress = [concept('Velocity', { mastery: 'learning', reasoning_track: { directInference: 1 } })];
        const candidate = { topic: 'Physics', concept: 'Velocity', requiredConcepts: [], isBossQuestion: false,
            reasoningComplexity: 'composition', question: 'Why is this repeated?' };
        const generate = vi.fn().mockResolvedValueOnce(candidate)
            .mockResolvedValueOnce({ ...candidate, reasoningComplexity: 'directInference', question: 'Why is this simpler?' })
            .mockResolvedValueOnce({ ...candidate, question: 'Why do these two effects combine?' });
        expect(await generateEligibleQuestion(generate, 'Create Physics.', progress, 'Physics', [candidate.question]))
            .toMatchObject({ reasoningComplexity: 'composition', question: 'Why do these two effects combine?' });
        expect(generate).toHaveBeenCalledTimes(3);
    });

    it('reaches proficiency and mastery through generated stages without a circular unlock', async () => {
        const track = createDefaultReasoningTrack();
        let sawProficient = false;
        for (let answer = 0; answer < 21; answer++) {
            const mastery = calculateMastery(track);
            const stage = nextReasoningStage(mastery, track);
            const progress = [concept('Velocity', { mastery, reasoning_track: { ...track } })];
            const question = await generateEligibleQuestion(async () => ({
                topic: 'Physics', concept: 'Velocity', requiredConcepts: [], isBossQuestion: false,
                reasoningComplexity: stage, question: `Why does example ${answer} behave this way?`,
            }), 'Create Physics.', progress, 'Physics');
            expect(question.eligible).toBe(true);
            expect(track[stage]).toBeLessThan(3);
            if (answer === 1) {
                expect(stage).toBe('composition');
            }

            if (answer === 2) {
                expect(stage).toBe('discrimination');
            }

            if (answer === 5) {
                expect(mastery).toBe('learning');
                expect(stage).toBe('transfer');
            }

            track[stage]++;
            sawProficient ||= calculateMastery(track) === 'proficient';
        }

        expect(sawProficient).toBe(true);
        expect(calculateMastery(track)).toBe('mastered');
    });

    it('keeps due reviews on the next unfinished stage and rejects invalid stage names', async () => {
        const progress = [concept('Velocity', { mastery: 'learning', reasoning_track: { directInference: 6 },
            reward_successes: 6, next_due_at: '2026-01-01T00:00:00Z' })];
        const candidate = { topic: 'Physics', concept: 'Velocity', requiredConcepts: [], isBossQuestion: false,
            reasoningComplexity: 'composition', question: 'Why do both parts of this trip matter?' };
        const generate = vi.fn().mockResolvedValueOnce({ ...candidate, reasoningComplexity: 'madeUpStage' })
            .mockResolvedValueOnce(candidate);
        expect(await generateEligibleQuestion(generate, 'Create Physics.', progress, 'Physics', [], Date.parse('2026-09-07')))
            .toMatchObject({ reasoningComplexity: 'composition' });
        expect(generate.mock.calls[0][0]).toContain('Spaced review is due');
        expect(generate.mock.calls[1][0]).toContain('Use a valid reasoningComplexity');
    });

    it('discards an ineligible boss and returns a verified prerequisite question instead', async () => {
        const generate = vi.fn()
            .mockResolvedValueOnce({ ...boss, topic: 'Physics' })
            .mockResolvedValueOnce({
                topic: 'Physics', concept: ' velocity ', requiredConcepts: ['Velocity'], isBossQuestion: false,
                reasoningComplexity: 'directInference', question: 'Why does covering more distance in the same time mean moving faster?',
            });
        const result = await generateEligibleQuestion(generate, 'Create a Physics question.', registry, 'Physics');
        expect(result).toMatchObject({
            concept: 'Velocity', requiredConcepts: [], isBossQuestion: false, eligible: true,
        });
        expect(generate).toHaveBeenCalledTimes(2);
        expect(generate.mock.calls[1][0]).toContain('Unmet prerequisites: Speed of light, Time dilation');
        expect(generate.mock.calls[1][0]).toContain('Choose one of these eligible concepts: Velocity.');
        expect(registry[0].mastery).toBe('unseen');
    });

    it('stops after three rejected candidates without returning an unsafe fallback', async () => {
        const generate = vi.fn().mockResolvedValue(boss);
        await expect(generateEligibleQuestion(generate, 'Create a question.', registry, 'Physics'))
            .rejects.toThrow('Could not generate a fresh question in the selected topic');
        expect(generate).toHaveBeenCalledTimes(3);
    });

    it.each([undefined, null, 'Speed of light', ['Speed of light', null], ['']])(
        'rejects malformed requirement lists: %j', async (requiredConcepts) => {
            const generate = vi.fn().mockResolvedValue({ ...boss, requiredConcepts });
            await expect(generateEligibleQuestion(generate, 'Create a question.', registry, 'Physics')).rejects.toThrow();
        },
    );

    it('keeps saved prerequisites in the accepted result even if absent from model metadata', async () => {
        const generate = vi.fn().mockResolvedValue({ ...boss, topic: 'Physics', question: 'Why is the interval invariant?', requiredConcepts: [] });
        const progress = registry.map((item) => ({ ...item, mastery: 'proficient' }));
        await expect(generateEligibleQuestion(generate, 'Create a question.', progress, 'Physics')).resolves.toMatchObject({
            requiredConcepts: ['Speed of light', 'Time dilation'], eligible: true,
        });
        expect(generate).toHaveBeenCalledTimes(1);
    });

    it.each(['Life', 'Mathematics & Logic'])('rejects biology labeled %s when math was requested', async (topic) => {
        const biology = concept('Biological Locomotion Constraints', {
            topics: { Life: 1 }, aliases: ['Locomotion'], mastery: 'learning',
        });
        const math = {
            topic: 'Mathematics & Logic', concept: 'Equality', question: 'Why does adding the same number preserve equality?',
            requiredConcepts: [], isBossQuestion: false, reasoningComplexity: 'directInference',
        };
        const generate = vi.fn().mockResolvedValueOnce({
            ...math, topic, concept: 'Locomotion', question: 'Why do organisms lack wheels?',
        }).mockResolvedValueOnce(math);
        expect(await generateEligibleQuestion(generate, 'Create math.', [biology], math.topic)).toMatchObject(math);
        expect(generate).toHaveBeenCalledTimes(2);
        expect(generate.mock.calls[1][0]).toContain('must belong to Mathematics & Logic');
        expect(generate.mock.calls[1][0]).not.toContain('Choose one of these eligible concepts: Biological');
    });

    it('rejects a repeat despite capitalization, whitespace, or terminal punctuation changes', async () => {
        const fresh = {
            topic: 'Physics', concept: 'Distance', question: 'Why does a longer path increase distance?',
            requiredConcepts: [], isBossQuestion: false, reasoningComplexity: 'directInference',
        };
        const generate = vi.fn().mockResolvedValueOnce({ ...fresh, question: '  WHY does speed   change? ' })
            .mockResolvedValueOnce(fresh);
        expect(await generateEligibleQuestion(generate, 'Create Physics.', [], 'Physics', ['Why does speed change!']))
            .toMatchObject(fresh);
        expect(generate.mock.calls[1][0]).toContain('already been shown');
    });
    it('snapshots registered alias weights and ignores replacement weights from generation', async () => {
        const target = concept('Canonical', { aliases: ['alias'], topics: { Physics: 7, Life: 3 } });
        const candidate = { concept: ' ALIAS ', topic: 'Physics', question: 'Why?', requiredConcepts: [],
            isBossQuestion: false, reasoningComplexity: 'directInference', topicWeights: { Life: 1 } };
        const result = await generateEligibleQuestion(async () => candidate, '', [target], 'Physics');
        expect(result.concept).toBe('Canonical');
        expect(result.topicWeights).toEqual({ Physics: .7, Life: .3 });
        target.topics.Physics = 100;
        expect(result.topicWeights).toEqual({ Physics: .7, Life: .3 });
    });
    it('normalizes new concept weights but never lets them bypass chosen-topic or prerequisite validation', async () => {
        const candidate = { concept: 'New', topic: 'Physics', question: 'Why?', requiredConcepts: [],
            isBossQuestion: false, reasoningComplexity: 'directInference', topicWeights: { Physics: 7, Life: 3, Other: 999 } };
        expect((await generateEligibleQuestion(async () => candidate, '', [], 'Physics')).topicWeights).toEqual({ Physics: .7, Life: .3 });
        await expect(generateEligibleQuestion(async () => ({ ...candidate, topicWeights: { Life: 1 } }), '', [], 'Physics')).rejects.toThrow();
        await expect(generateEligibleQuestion(async () => ({ ...candidate, requiredConcepts: ['Unknown'] }), '', [], 'Physics')).rejects.toThrow();
        expect((await generateEligibleQuestion(async () => ({ ...candidate, topicWeights: { Physics: NaN, Life: Infinity } }), '', [], 'Physics')).topicWeights).toEqual({ Physics: 1 });
    });

});
