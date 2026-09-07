import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { KingdomPanel } from '../components/kingdom/KingdomPanel';
import { applyAction, BUILDING_DEFINITIONS, newKingdom, TOPICS, type Kingdom } from '../lib/kingdom/game';

const rich = (): Kingdom => ({ ...newKingdom(), castle: 5, gold: 1000, tokens: Object.fromEntries(TOPICS.map(t => [t, 1000])) as Kingdom['tokens'] });
const props = () => ({ act: vi.fn(async () => true), unavailable: false, onLearn: vi.fn() });

describe('Interactive Castle map', () => {
  it('marks affordable Keep and building upgrades and removes markers at their level caps', () => {
    const state = { ...rich(), castle: 4 };
    state.buildings.treasury = 1;
    const handlers = props();
    const view = render(<KingdomPanel {...handlers} state={state} />);
    expect(screen.getByRole('button', { name: 'Your Keep · Level 4' })).toHaveAccessibleDescription('Upgrade available');
    expect(within(screen.getByRole('button', { name: /^Upgrade Castle/ })).getByTitle('Upgrade available')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Treasury · Level 1' }));
    expect(within(screen.getByRole('button', { name: /^Upgrade Treasury/ })).getByTitle('Upgrade available')).toBeInTheDocument();
    view.rerender(<KingdomPanel {...handlers} state={{ ...state, castle: 5, buildings: { ...state.buildings, treasury: 5 } }} />);
    expect(screen.getByRole('button', { name: 'Treasury at max level' })).toBeDisabled();
    expect(screen.queryByTitle('Upgrade available')).not.toBeInTheDocument();
  });

  it('inspects an empty plot, constructs it, and upgrades the selected building in place', async () => {
    let state = rich();
    const handlers = props();
    const view = render(<KingdomPanel {...handlers} state={state} />);
    const map = screen.getByRole('group', { name: 'Interactive Castle map' });
    expect(within(map).getAllByRole('button')).toHaveLength(BUILDING_DEFINITIONS.length + 1);
    expect(screen.queryByRole('button', { name: /^Build Barracks/ })).not.toBeInTheDocument();
    const plot = within(map).getByRole('button', { name: 'Barracks · Empty plot' });
    expect(plot.querySelector('.castle-building-ghost')).toBeInTheDocument();
    fireEvent.click(plot);
    expect(screen.getByRole('region', { name: 'Barracks details' })).toHaveFocus();
    expect(plot).toHaveAttribute('aria-pressed', 'true');
    expect(handlers.act).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Build Barracks · 10 Force' }));
    await waitFor(() => expect(handlers.act).toHaveBeenCalledWith({ type: 'building', id: 'barracks' }));
    state = applyAction(state, { type: 'building', id: 'barracks' });
    view.rerender(<KingdomPanel {...handlers} state={state} />);
    expect(screen.getByRole('button', { name: 'Barracks · Level 1' }).querySelector('.castle-building-ghost')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Barracks built to level 1.');
    fireEvent.click(screen.getByRole('button', { name: 'Recruit · 15 Force' }));
    await waitFor(() => expect(handlers.act).toHaveBeenCalledTimes(2));
  });

  it('keeps locked, capped, unaffordable and unavailable buildings inspectable without allowing a purchase', () => {
    const state = newKingdom();
    const handlers = props();
    const view = render(<KingdomPanel {...handlers} state={state} />);
    fireEvent.click(screen.getByRole('button', { name: 'Stable · Keep 2 required' }));
    expect(screen.getByText('Requires Keep (Castle) level 2.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Build Stable/ })).toBeDisabled();
    expect(screen.queryByTitle('Build available')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Barracks · Empty plot' }));
    expect(screen.getByRole('button', { name: /^Build Barracks/ })).toBeDisabled();
    expect(screen.getByText('Need 10 Force more.')).toBeInTheDocument();
    view.rerender(<KingdomPanel {...handlers} state={{ ...rich(), castle: 1, buildings: { ...state.buildings, barracks: 1 } }} />);
    expect(screen.getByRole('button', { name: /^Recruit ·/ })).toBeEnabled();
    view.rerender(<KingdomPanel {...handlers} state={rich()} unavailable />);
    expect(screen.getByRole('button', { name: /^Build Barracks/ })).toBeDisabled();
    expect(screen.queryByTitle('Build available')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Upgrade available')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Recruitment available')).not.toBeInTheDocument();
    expect(handlers.act).not.toHaveBeenCalled();
  });

  it('opens Library learning and shows the Keep gate for Forge construction', () => {
    const handlers = props();
    render(<KingdomPanel {...handlers} state={newKingdom()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Library · Earn by learning' }));
    expect(screen.getByRole('progressbar', { name: 'Library knowledge milestone' })).toHaveAttribute('max', '10');
    expect(screen.queryByRole('button', { name: /^Build Library/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Learn toward the Library' }));
    expect(handlers.onLearn).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Forge · Keep 4 required'  }));
    expect(screen.getByRole('region', { name: 'Forge details' })).toHaveTextContent('Requires Keep (Castle) level 4');
    expect(screen.getByRole('button', { name: /^Build Forge/ })).toBeDisabled();
    expect(handlers.act).not.toHaveBeenCalled();
  });

  it('opens details when a goal focuses a plot and supports keyboard activation and return to the map', async () => {
    const user = userEvent.setup();
    render(<KingdomPanel {...props()} state={rich()} />);
    const plot = document.getElementById('kingdom-building-treasury')!;
    act(() => plot.focus());
    expect(plot).toHaveFocus();
    expect(screen.getByRole('region', { name: 'Treasury details' })).toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('region', { name: 'Treasury details' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: /Back to Castle map/ }));
    expect(plot).toHaveFocus();
  });

  it('prevents duplicate purchases, preserves failed plots, and blocks upgrades in battle', async () => {
    let finish!: (success: boolean) => void;
    const handlers = { ...props(), act: vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; })) };
    const state = rich();
    const view = render(<KingdomPanel {...handlers} state={state} />);
    fireEvent.click(screen.getByRole('button', { name: 'Barracks · Empty plot' }));
    const build = screen.getByRole('button', { name: /^Build Barracks/ });
    fireEvent.click(build); fireEvent.click(build);
    expect(handlers.act).toHaveBeenCalledOnce();
    expect(build).toBeDisabled();
    expect(within(build).queryByTitle('Build available')).not.toBeInTheDocument();
    await act(async () => finish(false));
    expect(screen.getByRole('status')).toHaveTextContent('Could not save');
    expect(screen.getByRole('button', { name: 'Barracks · Empty plot' })).toBeInTheDocument();
    expect(build).toBeEnabled();
    expect(within(build).getByTitle('Build available')).toBeInTheDocument();
    const fighting = applyAction({ ...state, units:{militia:{unitId:'militia',investedXP:0,locked:false}}, buildings: { ...state.buildings, barracks: 1 }, armySlots: ['militia', null, null, null, null] }, { type: 'start', stage: 1 });
    view.rerender(<KingdomPanel {...handlers} state={fighting} />);
    expect(screen.getByRole('button', { name: /^Recruit ·/ })).toBeEnabled();
    fireEvent.click(screen.getByRole('button',{name:'Archery Range · Empty plot'}));expect(screen.getByRole('button',{name:/^Build Archery/})).toBeDisabled();
  });
});
