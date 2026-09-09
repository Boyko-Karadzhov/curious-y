import { asObject } from './http.ts';
import type { Json } from './types.ts';

export const questionForClient = (row: Json, revealAnswer = false) => ({
    id: row.id,
    userId: row.user_id,
    topic: row.topic,
    subtopic: row.subtopic,
    angle: row.angle,
    angleFit: row.angle_fit,
    questionText: row.question_text,
    options: row.options,
    ...(revealAnswer ? {
        correctIndex: row.correct_index,
        selectedIndex: row.selected_index,
        isCorrect: row.is_correct,
        explanation: row.explanation,
        suggestedQuestions: row.suggested_questions,
    } : {}),
    topicWeights: row.topic_weights,
    ...(revealAnswer && row.reward ? { reward: row.reward } : {}),
    concept: row.concept,
    reasoningComplexity: row.reasoning_complexity,
    isBossQuestion: row.is_boss_question,
    requiredConcepts: row.required_concepts,
    prerequisitesMet: row.prerequisites_met,
    createdAt: row.created_at,
    ...(row.graph_node ? { graphNodeId: row.graph_node, graphFacet: row.graph_facet } : {}),
    ...(revealAnswer && row.graph_node ? {
        knowledgeEntry: row.is_correct ? row.knowledge_entry : undefined,
        optionFeedback: row.option_feedback,
    } : {}),
});

export const gameStatsForClient = (value: unknown) => {
    const row = asObject(value);
    return {
        dayStamp: row.day_stamp,
        castleLevel: row.castle_level,
        castleXp: row.castle_xp,
        gold: row.gold,
        gems: row.gems,
        keys: row.keys,
        knowledge: row.knowledge,
        answersToday: row.answers_today,
        correctToday: row.correct_today,
        dailyClaimed: row.daily_claimed,
        streak: row.streak,
        trophies: row.trophies,
        warPressure: Number(row.war_pressure),
    };
};
