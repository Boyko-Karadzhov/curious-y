import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { KingdomPanel } from '../components/kingdom/KingdomPanel';
import { applyAction, newKingdom } from '../lib/kingdom/game';

const ready = () => ({ ...newKingdom(), buildings: { barracks: 1, range: 0, stable: 0, workshop: 0 } });

describe('Battle controls', () => {
  it('opens with Battle first, an idle battlefield, and a start button above it', async () => {
    const act = vi.fn(async () => true);
    render(<KingdomPanel state={ready()} act={act} unavailable={false} onLearn={vi.fn()} />);
    const panel = screen.getByLabelText('Castle management');
    expect(panel.firstElementChild).toBe(screen.getByRole('region', { name: 'Battle' }));
    const start = screen.getByRole('button', { name: 'Start battle' });
    const field = screen.getByRole('img', { name: /Battlefield: 0 allied units/ });
    expect(start.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByText(/supply|tug-of-war|Battlefront/i)).not.toBeInTheDocument();
    expect(screen.getByText('Swordsman · Spawns every 1.5s')).toBeInTheDocument();
    expect(act).not.toHaveBeenCalled();
    fireEvent.click(start);
    await waitFor(() => expect(act).toHaveBeenCalledWith({ type: 'start', stage: 1 }));
  });

  it('waits for Next battle after winning 1-10 before starting 2-1', async () => {
    let state = applyAction({ ...ready(), cleared: 9 }, { type: 'start', stage: 10 });
    state.battle!.enemyHp = 0;
    state = applyAction(state, { type: 'tick' });
    const act = vi.fn(async () => true);
    render(<KingdomPanel state={state} act={act} unavailable={false} onLearn={vi.fn()} />);
    expect(screen.getByText('Next unbeaten stage 2-1')).toBeInTheDocument();
    expect(act).not.toHaveBeenCalled();
    const next = screen.getByRole('button', { name: 'Next battle' });
    expect(next.compareDocumentPosition(screen.getByRole('img')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(next);
    await waitFor(() => expect(act).toHaveBeenCalledWith({ type: 'start', stage: 11 }));
  });

  it.each(['defeat', 'draw'] as const)('retries the same unbeaten stage after %s and reload', async result => {
    const state = applyAction({ ...ready(), cleared: 10 }, { type: 'start', stage: 11 });
    state.battle!.result = result;
    const act = vi.fn(async () => true);
    const props = { state, act, unavailable: false, onLearn: vi.fn() };
    const mounted = render(<KingdomPanel {...props} />);
    mounted.unmount();
    render(<KingdomPanel {...props} />);
    expect(act).not.toHaveBeenCalled();
    const battle = screen.getByRole('region', { name: 'Battle' });
    const retry = within(battle).getByRole('button', { name: 'Retry' });
    expect(retry.compareDocumentPosition(within(battle).getByRole('img')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(retry);
    await waitFor(() => expect(act).toHaveBeenCalledWith({ type: 'start', stage: 11 }));
  });
});
