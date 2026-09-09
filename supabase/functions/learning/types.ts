import type { RegistryConcept } from './prerequisites.ts';
import type { CommandContext } from './kingdom.ts';
import type { Action, ActionEntropy, Kingdom } from '../_shared/kingdom.ts';

export type Json = Record<string, unknown>;

export type DatabaseResult = {
    data: unknown;
    error: { code?: string; message: string } | null;
};

export interface QueryBuilder extends PromiseLike<DatabaseResult> {
    select(columns: string): QueryBuilder;
    eq(column: string, value: unknown): QueryBuilder;
    maybeSingle(): PromiseLike<DatabaseResult>;
    insert(value: Json): QueryBuilder;
    not(column: string, operator: string, value: unknown): QueryBuilder;
    order(column: string, options?: Json): QueryBuilder;
    limit(count: number): QueryBuilder;
    range(start: number, end: number): QueryBuilder;
    single(): PromiseLike<DatabaseResult>;
}

export type LearningClient = {
    auth: { getUser(): Promise<DatabaseResult> };
    rpc(name: string, args: Json): PromiseLike<DatabaseResult>;
    from(table: string): QueryBuilder;
};

export type ClientFactory = (url: string, key: string, options: Json) => LearningClient;

export type Environment = {
    get(name: string): string | undefined;
};

export type QuestionGenerator = (
    generate: (prompt: string) => Promise<Json>,
    prompt: string,
    concepts: RegistryConcept[],
    topic: string,
    history: string[],
) => Promise<Json>;

export type KingdomCommand = Exclude<Action, { type: 'answer' }>;

export type Dependencies = {
    createClient: ClientFactory;
    env: Environment;
    callGemini(key: string, prompt: string, schema?: Json): Promise<string>;
    generateEligibleQuestion: QuestionGenerator;
    shuffleQuestionOptions(input: { options: string[]; correctIndex: number }): { options: string[]; correctIndex: number };
    parseKingdomCommand(value: unknown): KingdomCommand;
    executeKingdomCommand(context: CommandContext, command: KingdomCommand, entropy?: ActionEntropy): { state: Kingdom; battleClock: string | null };
    handleJourney(db: LearningClient, userId: string, body: Json, getKey: () => Promise<string>): Promise<Json>;
};

export type ActionContext = {
    body: Json;
    db: LearningClient;
    dependencies: Dependencies;
    userId: string;
};
