import { beforeEach, expect, it, vi } from 'vitest';
import { practiceJourney } from '../services/backend';
const invoke = vi.hoisted(() => vi.fn());
vi.mock('../lib/supabase', () => ({ supabase: { functions: { invoke } } }));
beforeEach(() => invoke.mockReset());

it('continues a randomly chosen topic and its reset generation until a question is ready', async () => {
    invoke.mockResolvedValueOnce({ data: {
        preparing: true,
        topic: 'Life',
        generation: 7
    } })
        .mockResolvedValueOnce({ data: {
            preparing: true,
            topic: 'Life',
            generation: 7
        } })
        .mockResolvedValueOnce({ data: { question: { id: 'ready' } } });
    await expect(practiceJourney()).resolves.toEqual({ id: 'ready' });
    expect(invoke).toHaveBeenNthCalledWith(2, 'learning', { body: {
        action: 'journey_practice',
        topic: 'Life',
        generation: 7
    } });
    expect(invoke).toHaveBeenCalledTimes(3);
});

it('stops continuation on a failed stage so the saved checkpoint can be retried', async () => {
    invoke.mockResolvedValueOnce({ data: {
        preparing: true,
        topic: 'Physics',
        generation: 3
    } })
        .mockResolvedValueOnce({ data: { error: 'Progress was reset. Please start learning again.' } });
    await expect(practiceJourney('Physics')).rejects.toThrow('Progress was reset');
    expect(invoke).toHaveBeenCalledTimes(2);
});

it('asks the foundation reached by expansion without drawing another random concept', async () => {
    invoke.mockResolvedValueOnce({ data: {
        preparing: true,
        topic: 'Life',
        generation: 7,
        targetNodeId: 'foundation'
    } }).mockResolvedValueOnce({ data: { question: { id: 'ready' } } });
    await expect(practiceJourney('Life')).resolves.toEqual({ id: 'ready' });
    expect(invoke).toHaveBeenLastCalledWith('learning', { body: {
        action: 'journey_practice',
        topic: 'Life',
        generation: 7,
        targetNodeId: 'foundation'
    } });
});
