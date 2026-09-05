import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { KingdomPanel } from '../components/kingdom/KingdomPanel';
import { applyAction, newKingdom } from '../lib/kingdom/game';

const ready = () => ({ ...newKingdom(), armySlots: ['swordsman', null, null, null] as ['swordsman', null, null, null], buildings: { barracks: 1, range: 0, stable: 0, workshop: 0 } });

describe('Battle controls', () => {
  it('prepares empty slots, prevents duplicates, scouts opponents and locks during combat', async () => {
    let state = ready();
    const command = vi.fn(async () => true);
    const props = { act: command, unavailable: false, onLearn: vi.fn() };
    const view = render(<KingdomPanel {...props} state={state} />);
    expect(screen.getByLabelText('Opponent scouting')).toHaveTextContent('140 castle HP');
    expect(screen.getByLabelText('Opponent scouting')).toHaveTextContent('Steady frontline infantry');
    expect(within(screen.getByRole('combobox', { name: 'Army slot 2' })).getByRole('option', { name: 'Swordsman' })).toBeDisabled();
    expect(within(screen.getByRole('combobox', { name: 'Army slot 1' })).getByRole('option', { name: /Knight/ })).toBeDisabled();
    fireEvent.change(screen.getByRole('combobox', { name: 'Army slot 1' }), { target: { value: '' } });
    await waitFor(() => expect(command).toHaveBeenCalledWith({ type: 'army', slots: [null, null, null, null] }));
    view.rerender(<KingdomPanel {...props} state={{ ...state, armySlots: [null, null, null, null] }} />);
    expect(screen.getByRole('button', { name: 'Start battle' })).toBeDisabled();
    state = applyAction(state, { type: 'start', stage: 1 }) as typeof state;
    view.rerender(<KingdomPanel {...props} state={state} />);
    for (const select of screen.getAllByRole('combobox')) expect(select).toBeDisabled();
    expect(screen.getByText(/90s left/)).toBeInTheDocument();
  });
  it('shows live unit counts and spawn progress on the battlefield without the old explanation', () => {
    let state = applyAction(ready(), { type: 'start', stage: 1 });
    for (let i = 0; i < 9; i++) state = applyAction(state, { type: 'tick' });
    const props = { act: vi.fn(async () => true), unavailable: false, onLearn: vi.fn() };
    const view = render(<KingdomPanel {...props} state={state} />);
    const field = screen.getByRole('group', { name: 'Battlefield' });
    expect(within(field).getByRole('group', { name: /Swordsman: 1 on field/ })).toBeInTheDocument();
    expect(within(field).getByRole('progressbar', { name: 'Swordsman spawn progress' })).toHaveAttribute('aria-valuenow', '50');
    expect(within(field).getByLabelText('Slot 2: Empty')).toBeInTheDocument();
    expect(within(field).getByRole('button', { name: 'Retreat' })).toBeInTheDocument();
    expect(screen.queryByText('Automatic battle')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    for (let i = 0; i < 9; i++) state = applyAction(state, { type: 'tick' });
    view.rerender(<KingdomPanel {...props} state={state} />);
    expect(within(field).getByRole('group', { name: /Swordsman: 2 on field/ })).toBeInTheDocument();
    expect(within(field).getByRole('progressbar', { name: 'Swordsman spawn progress' })).toHaveAttribute('aria-valuenow', '0');
    view.rerender(<KingdomPanel {...props} state={state} unavailable />);
    expect(within(field).getByRole('status')).toHaveTextContent('Reconnecting');
    expect(within(field).getByRole('progressbar', { name: 'Swordsman spawn progress' }).querySelector('.battle-spawn-ring')).toBeNull();
  });

  it('opens with Battle first, an idle battlefield, and a start overlay inside it', async () => {
    const act = vi.fn(async () => true);
    render(<KingdomPanel state={ready()} act={act} unavailable={false} onLearn={vi.fn()} />);
    const panel = screen.getByLabelText('Castle management');
    expect(panel.firstElementChild).toBe(screen.getByRole('region', { name: 'Battle' }));
    const start = screen.getByRole('button', { name: 'Start battle' });
    const field = screen.getByRole('group', { name: 'Battlefield' });
    expect(field).toContainElement(start);
    expect(within(field).getByRole('dialog', { name: 'Ready for battle?' })).toContainElement(start);
    expect(within(field).getByRole('progressbar', { name: 'Your Castle' })).toHaveAttribute('aria-valuenow', '240');
    expect(screen.getAllByRole('combobox')).toHaveLength(4);
    expect(screen.queryByText(/supply|tug-of-war|Battlefront/i)).not.toBeInTheDocument();
    expect(screen.getByText('Swordsman · Spawns every 4.5s')).toBeInTheDocument();
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
    expect(screen.getByText('Stage 1-10 cleared · Next: 2-1')).toBeInTheDocument();
    expect(act).not.toHaveBeenCalled();
    const next = screen.getByRole('button', { name: 'Next battle' });
    expect(screen.getByRole('dialog', { name: 'Victory!' })).toContainElement(next);
    expect(screen.getByRole('group', { name: 'Battlefield' })).toContainElement(next);
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
    expect(within(battle).getByRole('dialog')).toContainElement(retry);
    expect(within(battle).getByRole('group', { name: 'Battlefield' })).toContainElement(retry);
    fireEvent.click(retry);
    await waitFor(() => expect(act).toHaveBeenCalledWith({ type: 'start', stage: 11 }));
  });
});
