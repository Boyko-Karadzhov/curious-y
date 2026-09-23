import { KNOWLEDGE_RESOURCES } from './resources.ts';
import type { Kingdom, TopicName } from './kingdom.ts';

export type TradeResource = 'gold' | 'food' | 'metal' | TopicName;
export const TRADE_RESOURCES: readonly TradeResource[] = ['gold', 'food', 'metal', ...KNOWLEDGE_RESOURCES.map(item => item.topic)];
const isKnowledge = (value: TradeResource) => value !== 'gold' && value !== 'food' && value !== 'metal';

export function tradeCost(from: TradeResource, to: TradeResource, amount: number, marketLevel: number) {
    if (from === to || isKnowledge(from) !== isKnowledge(to) || !Number.isSafeInteger(amount) || amount < 1 || amount > 1000 || marketLevel < 1) {
        throw new Error('Invalid Market trade.');
    }

    if (from === 'gold') {
        return amount * (11 - Math.min(5, marketLevel));
    }

    if (to === 'gold') {
        return amount;
    }

    return amount * 2;
}

export function tradeYield(_from: TradeResource, to: TradeResource, amount: number, marketLevel: number) {
    return to === 'gold' ? amount * (4 + Math.min(5, marketLevel)) : amount;
}

const balance = (state: Kingdom, resource: TradeResource) => isKnowledge(resource)
    ? state.tokens[resource as TopicName] : state[resource as 'gold' | 'food' | 'metal'];

export function trade(state: Kingdom, from: TradeResource, to: TradeResource, amount: number) {
    const cost = tradeCost(from, to, amount, state.buildings.market);
    if (balance(state, from) < cost) {
        throw new Error(`Not enough ${from} for this trade.`);
    }

    if (!Number.isSafeInteger(balance(state, to) + tradeYield(from, to, amount, state.buildings.market))) {
        throw new Error('Trade exceeds wallet limit.');
    }

    if (to === 'gold' && !Number.isSafeInteger(state.lifetimeGold + tradeYield(from, to, amount, state.buildings.market))) {
        throw new Error('Trade exceeds wallet limit.');
    }

    if (isKnowledge(from)) {
        state.tokens[from as TopicName] -= cost;
    } else {
        state[from as 'gold' | 'food' | 'metal'] -= cost;
    }

    if (isKnowledge(to)) {
        state.tokens[to as TopicName] += tradeYield(from, to, amount, state.buildings.market);
    } else {
        state[to as 'gold' | 'food' | 'metal'] += tradeYield(from, to, amount, state.buildings.market);
    }

    if (to === 'gold') {
        state.lifetimeGold += tradeYield(from, to, amount, state.buildings.market);
    }
}
