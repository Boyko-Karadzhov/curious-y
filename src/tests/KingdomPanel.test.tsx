import { act as flush, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BattlePanel } from '../components/kingdom/BattlePanel';
import { KingdomPanel } from '../components/kingdom/KingdomPanel';
import { applyAction, newKingdom, type Kingdom } from '../lib/kingdom/game';
import { ResourceBar } from '../components/game/ResourceBar';

const ready = () => ({ ...newKingdom(), armySlots: ['swordsman', null, null, null] as ['swordsman', null, null, null], buildings: { ...newKingdom().buildings, barracks: 1, range: 0, stable: 0, workshop: 0 } });

describe('Battle controls', () => {
  it('shows the knowledge/economy branches, real specialties, goals and frozen paid Gold', () => {
    let state: Kingdom = { ...ready(), castle: 5, libraryConcepts: 30, buildings: { ...ready().buildings, academy: 1, library: 2, treasury: 1 } };
    const select = vi.fn(); const props = { act: vi.fn(async () => true), unavailable: false, onLearn: vi.fn(), onSelectGoal: select, serverBacked: true };
    const view = render(<KingdomPanel {...props} state={state} />);
    expect(screen.getByRole('group', { name: 'Interactive Castle map' })).toHaveTextContent('Forge');
    expect(screen.getAllByRole('img', { name: 'Keep level 5: Crown Keep' }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Library · Level 2' }));
    expect(screen.getByText(/Next knowledge milestone: 75/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Academy · Level 1' }));
    expect(screen.getByText(/3 HP\/sec to one ally/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Build Library|Build Forge/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Treasury · Level 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Set Treasury goal' }));
    expect(select).toHaveBeenCalledWith({ type: 'building', id: 'treasury', level: 2 });
    state = applyAction(state, { type: 'start', stage: 1 });
    state.battle!.enemyHp = 0; state = applyAction(state, { type: 'tick' });
    state.buildings.treasury = 5;
    state = applyAction(state, { type: 'collect-battle', stage: 1 });
    view.rerender(<BattlePanel {...props} state={state} />);
    expect(screen.getByText('+61 Gold collected')).toBeInTheDocument();
    expect(screen.getByText('60 base + 1 Treasury (2%) · fixed at battle start')).toBeInTheDocument();
  });
  it.each([false, true])('animates saved Gold in expanded=%s, skips failed saves, and locks collection until the coins arrive', async expanded => {
    let state = applyAction(ready(), { type: 'start', stage: 1 });
    state.battle!.enemyHp = 0;
    state = applyAction(state, { type: 'tick' });
    const command = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
    let finish!: () => void;
    const finished = new Promise<void>(resolve => { finish = resolve; });
    const animated: HTMLElement[] = [];
    const original = HTMLElement.prototype.animate;
    HTMLElement.prototype.animate = function () {
      animated.push(this);
      return { finished } as unknown as Animation;
    };
    const content = () => <><ResourceBar state={state} /><BattlePanel state={state} act={command} unavailable={false} onLearn={vi.fn()} /></>;
    try {
      const view = render(content());
      if (expanded) fireEvent.click(screen.getByRole('button', { name: 'Expand battle' }));
      const collect = screen.getByRole('button', { name: 'Collect' });
      fireEvent.click(collect);
      fireEvent.click(collect);
      await waitFor(() => expect(collect).toBeEnabled());
      expect(command).toHaveBeenCalledTimes(1);
      expect(animated).toHaveLength(0);
      fireEvent.click(collect);
      fireEvent.click(collect);
      await waitFor(() => expect(document.querySelectorAll('.collect-resource-particle')).toHaveLength(7));
      if (expanded) expect(document.querySelector('.battle-view-expanded')!.querySelectorAll('.collect-resource-particle')).toHaveLength(7);
      expect(command).toHaveBeenCalledTimes(2);
      expect(animated.every(element => element.textContent === '🪙')).toBe(true);
      state = applyAction(state, { type: 'collect-battle', stage: 1 });
      view.rerender(content());
      const next = screen.getByRole('button', { name: 'Next battle' });
      expect(next).toBeDisabled();
      await flush(async () => { finish(); });
      expect(next).toBeEnabled();
      expect(animated.at(-1)).toBe(document.querySelector(expanded ? '[data-battle-gold]' : '[data-resource-gold]'));
      expect(document.querySelectorAll('.collect-resource-particle')).toHaveLength(0);
    } finally {
      finish();
      HTMLElement.prototype.animate = original;
    }
  });

  it('suggests the next empty square for available units and assigns only after an explicit choice', async () => {
    const state = { ...ready(), buildings: { ...ready().buildings, range: 1 } };
    const command = vi.fn(async () => true);
    const props = { act: command, unavailable: false, onLearn: vi.fn() };
    const view = render(<BattlePanel {...props} state={state} />);
    expect(screen.getByRole('status')).toHaveTextContent('Archer available. Click empty square 2');
    expect(command).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Army slot 2: Empty' }));
    fireEvent.click(screen.getByRole('button', { name: 'Archer' }));
    expect(screen.getByRole('region', { name: 'Army slot 2 details' })).toHaveTextContent('32 HP');
    expect(command).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Assign Archer' }));
    await waitFor(() => expect(command).toHaveBeenCalledWith({ type: 'army', slots: ['swordsman', 'archer', null, null] }));
    view.rerender(<BattlePanel {...props} state={{ ...state, armySlots: ['swordsman', 'archer', null, null] }} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('prepares empty slots, prevents duplicates, scouts opponents and locks during combat', async () => {
    let state = ready();
    const command = vi.fn(async () => true);
    const props = { act: command, unavailable: false, onLearn: vi.fn() };
    const view = render(<BattlePanel {...props} state={state} />);
    expect(screen.getByLabelText('Opponent scouting')).toHaveTextContent('140 castle HP');
    expect(screen.getByLabelText('Opponent scouting')).toHaveTextContent('Steady frontline infantry');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Army slot 2: Empty' }));
    expect(screen.getByRole('region', { name: 'Army slot 2 details' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Swordsman · assigned' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Knight · building required' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Army slot 1: Swordsman' }));
    expect(screen.getByRole('region', { name: 'Army slot 1 details' })).toHaveTextContent('65 HP');
    fireEvent.click(screen.getByRole('button', { name: 'Empty this slot' }));
    await waitFor(() => expect(command).toHaveBeenCalledWith({ type: 'army', slots: [null, null, null, null] }));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Army slot 1 details' })).not.toBeInTheDocument());
    view.rerender(<BattlePanel {...props} state={{ ...state, armySlots: [null, null, null, null] }} />);
    expect(screen.getByRole('button', { name: 'Start battle' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Click empty square 1');
    state = applyAction(state, { type: 'start', stage: 1 }) as typeof state;
    view.rerender(<BattlePanel {...props} state={state} />);
    fireEvent.click(screen.getByRole('button', { name: 'Army slot 1: Swordsman' }));
    expect(screen.getByRole('region', { name: 'Army slot 1 details' })).toHaveTextContent('Finish or retreat');
    expect(screen.queryByRole('button', { name: 'Empty this slot' })).not.toBeInTheDocument();
    expect(screen.getByText(/90s left/)).toBeInTheDocument();
  });
  it('shows live unit counts and spawn progress on the battlefield without the old explanation', () => {
    let state = applyAction(ready(), { type: 'start', stage: 1 });
    for (let i = 0; i < 9; i++) state = applyAction(state, { type: 'tick' });
    const props = { act: vi.fn(async () => true), unavailable: false, onLearn: vi.fn() };
    const view = render(<BattlePanel {...props} state={state} />);
    const field = screen.getByRole('group', { name: 'Battlefield' });
    expect(within(field).getByRole('group', { name: /Swordsman: 0 on field/ })).toBeInTheDocument();
    expect(within(field).getByRole('progressbar', { name: 'Swordsman spawn progress' })).toHaveAttribute('aria-valuenow', '50');
    expect(within(field).getByLabelText('Slot 2: Empty')).toBeInTheDocument();
    expect(within(field).getByRole('button', { name: 'Retreat' })).toBeInTheDocument();
    expect(screen.queryByText('Automatic battle')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    for (let i = 0; i < 9; i++) state = applyAction(state, { type: 'tick' });
    view.rerender(<BattlePanel {...props} state={state} />);
    expect(within(field).getByRole('group', { name: /Swordsman: 1 on field/ })).toBeInTheDocument();
    expect(within(field).getByRole('progressbar', { name: 'Swordsman spawn progress' })).toHaveAttribute('aria-valuenow', '0');
    view.rerender(<BattlePanel {...props} state={state} unavailable />);
    expect(within(field).getByRole('status')).toHaveTextContent('Reconnecting');
    expect(within(field).getByRole('progressbar', { name: 'Swordsman spawn progress' }).querySelector('.battle-spawn-ring')).toBeNull();
  });

  it('opens with Battle first, an idle battlefield, and a start overlay inside it', async () => {
    const act = vi.fn(async () => true);
    render(<BattlePanel state={ready()} act={act} unavailable={false} onLearn={vi.fn()} />);
    const panel = screen.getByLabelText('Battle management');
    expect(panel.firstElementChild).toBe(screen.getByRole('region', { name: 'Battle' }));
    const start = screen.getByRole('button', { name: 'Start battle' });
    const field = screen.getByRole('group', { name: 'Battlefield' });
    expect(field).toContainElement(start);
    expect(within(field).getByRole('dialog', { name: 'Ready for battle?' })).toContainElement(start);
    expect(within(field).getByRole('progressbar', { name: 'Your Castle' })).toHaveAttribute('aria-valuenow', '240');
    expect(screen.getAllByRole('button', { name: /Army slot/ })).toHaveLength(4);
    expect(screen.queryByText(/supply|tug-of-war|Battlefront/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Castle management')).not.toBeInTheDocument();
    expect(act).not.toHaveBeenCalled();
    fireEvent.click(start);
    await waitFor(() => expect(act).toHaveBeenCalledWith({ type: 'start', stage: 1 }));
  });

  it('requires collection inside the battlefield after winning 1-10 before starting 2-1', async () => {
    let state = applyAction({ ...ready(), cleared: 9 }, { type: 'start', stage: 10 });
    state.battle!.enemyHp = 0;
    state = applyAction(state, { type: 'tick' });
    const act = vi.fn(async () => true);
    const view = render(<BattlePanel state={state} act={act} unavailable={false} onLearn={vi.fn()} />);
    const collect = within(screen.getByRole('group', { name: 'Battlefield' })).getByRole('button', { name: 'Collect' });
    expect(screen.queryByRole('button', { name: 'Next battle' })).not.toBeInTheDocument();
    expect(act).not.toHaveBeenCalled();
    fireEvent.click(collect);
    await waitFor(() => expect(act).toHaveBeenCalledWith({ type: 'collect-battle', stage: 10 }));
    state = applyAction(state, { type: 'collect-battle', stage: 10 });
    view.rerender(<BattlePanel state={state} act={act} unavailable={false} onLearn={vi.fn()} />);
    expect(screen.getByText('Stage 1-10 cleared · Next: 2-1')).toBeInTheDocument();
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
    const mounted = render(<BattlePanel {...props} />);
    mounted.unmount();
    render(<BattlePanel {...props} />);
    expect(act).not.toHaveBeenCalled();
    const battle = screen.getByRole('region', { name: 'Battle' });
    const retry = within(battle).getByRole('button', { name: 'Retry' });
    expect(within(battle).getByRole('dialog')).toContainElement(retry);
    expect(within(battle).getByRole('group', { name: 'Battlefield' })).toContainElement(retry);
    fireEvent.click(retry);
    await waitFor(() => expect(act).toHaveBeenCalledWith({ type: 'start', stage: 11 }));
  });
});
