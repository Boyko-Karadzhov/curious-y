import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ProgressionGoalCard, ProgressionGoalProps } from '../components/game/ProgressionGoalCard';
import { applyAction, newKingdom } from '../lib/kingdom/game';
import { goalOptions, parseGoal } from '../lib/kingdom/goals';

function props(): ProgressionGoalProps {
  return { state: newKingdom(), goal: { type: 'building', id: 'stable', level: 1 }, unavailable: false,
    onSelect: vi.fn(), onLearnTopic: vi.fn(), onBattle: vi.fn(), onNavigateUpgrade: vi.fn(async () => true) };
}

describe('Progression goals use committed Kingdom rules', () => {
  it('distinguishes affordable construction from a Castle gate and offers the prerequisite goal', () => {
    const p = props(); p.state.tokens.Life = 20; p.state.tokens.Chemistry = 20;
    render(<ProgressionGoalCard {...p} />);
    expect(screen.getByRole('status')).toHaveTextContent('Affordable. Requires Keep (Castle) level 2.');
    expect(screen.getByRole('button', { name: 'Go to Stable' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Make Castle upgrade my goal' }));
    expect(p.onSelect).toHaveBeenCalledWith({ type: 'castle', level: 2 });
    expect(() => applyAction(p.state, { type: 'building', id: 'stable' })).toThrow('Requires Keep (Castle) level 2.');
    expect(p.onNavigateUpgrade).not.toHaveBeenCalled();
  });

  it('blocks an affordable upgrade during battle, then navigates to the normal upgrade control after retreat', async () => {
    const p = props(); p.goal = { type: 'building', id: 'treasury', level: 2 };
    p.state.castle = 2; p.state.buildings.barracks = 1; p.state.units.militia={unitId:'militia',investedXP:0,locked:false}; p.state.buildings.treasury=1;p.state.tokens['Society & History']=40;p.state.tokens['Mathematics & Logic']=40;p.state.gold = 20; p.state.tokens.Physics = 20;
    p.state.armySlots = ['militia', null, null, null, null];
    p.state = applyAction(p.state, { type: 'start', stage: 1 });
    const app = render(<ProgressionGoalCard {...p} />);
    expect(screen.getByRole('status')).toHaveTextContent('Affordable. Finish or retreat');
    expect(screen.getByRole('button', { name: /Go to Treasury/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Return to battle' }));
    expect(p.onBattle).toHaveBeenCalledOnce();
    p.state = applyAction(p.state, { type: 'retreat' });
    app.rerender(<ProgressionGoalCard {...p} />);
    await userEvent.click(screen.getByRole('button', { name: /Go to Treasury/ }));
    expect(p.onNavigateUpgrade).toHaveBeenCalledWith({ type: 'building', id: 'treasury' });
    // A successful callback alone is not proof of committed ownership.
    expect(screen.queryByText(/Goal complete!/)).not.toBeInTheDocument();
    p.state = applyAction(p.state, { type: 'building', id: 'treasury' });
    app.rerender(<ProgressionGoalCard {...p} />);
    expect(screen.getByRole('status')).toHaveTextContent('Goal complete!');
  });

  it('does not expose stale affordability while unavailable and recovers from invalid or deleted targets', () => {
    const p = props(); p.goal = { type: 'building', id: 'barracks', level: 1 }; p.state.tokens.Physics = 10;
    const app = render(<ProgressionGoalCard {...p} unavailable />);
    expect(screen.getByRole('status')).toHaveTextContent('Reload Castle');
    expect(screen.queryByRole('button', { name: /Go to Barracks/ })).not.toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeDisabled();
    app.rerender(<ProgressionGoalCard {...p} goal={{ type: 'building', id: 'barracks', level: 3 }} />);
    expect(screen.getByRole('status')).toHaveTextContent('no longer available');
    expect(screen.getByRole('combobox')).toBeEnabled();
    expect(parseGoal({ type: 'building', id: 'removed-building', level: 1 })).toBeNull();
    expect(parseGoal({ type: 'castle', level: 99, gold: 9999 })).toBeNull();
    expect(parseGoal({ type: 'building', id: 'barracks', level: 1, gold: 9999 })).toEqual(p.goal);
  });

  it('keeps goal selection and dismissal keyboard accessible, including Castle and every building', async () => {
    const p = props(); p.goal = null;
    const app = render(<ProgressionGoalCard {...p} />);
    const select = screen.getByRole('combobox', { name: 'Choose progression goal' });
    await userEvent.tab(); expect(screen.getByRole('button', { name: 'About your next goal' })).toHaveFocus();
    await userEvent.tab(); expect(select).toHaveFocus();
    const options = goalOptions(p.state);
    for (let index = 0; index < options.length; index++) {
      await userEvent.selectOptions(select, String(index));
      expect(p.onSelect).toHaveBeenLastCalledWith(options[index]);
    }
    app.rerender(<ProgressionGoalCard {...p} goal={options[0]} />);
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Dismiss goal' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(p.onSelect).toHaveBeenLastCalledWith(null);
  });

  it('reveals explanations on hover or click and dismisses them with Escape or an outside tap', async () => {
    render(<ProgressionGoalCard {...props()} />);
    const help = screen.getByRole('button', { name: 'About your next goal' });
    expect(screen.queryByText(/New learning and due reviews/)).not.toBeInTheDocument();
    fireEvent.mouseEnter(help.parentElement!);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Learn → Collect → Build → Recruit');
    fireEvent.mouseLeave(help.parentElement!);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    await userEvent.click(help);
    await userEvent.unhover(help);
    expect(screen.getByRole('tooltip')).toHaveTextContent('New learning and due reviews earn more.');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    await userEvent.click(help);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('links Gold deficits to battle requirements, the next stage, or the active battle', () => {
    const p = props(); p.goal = { type: 'building', id: 'treasury', level: 2 };
    p.state.castle = 2; p.state.buildings.treasury = 1;
    const app = render(<ProgressionGoalCard {...p} />);
    fireEvent.click(screen.getByRole('button', { name: 'View battle requirements' }));
    expect(p.onBattle).toHaveBeenCalledOnce();
    expect(screen.getByText(/Build a military building, recruit/)).toBeInTheDocument();
    p.state.buildings.barracks = 1; p.state.units.militia={unitId:'militia',investedXP:0,locked:false}; p.state.cleared = 10;
    app.rerender(<ProgressionGoalCard {...p} />);
    expect(screen.getByRole('button', { name: 'Go to battle 2-1' })).toBeEnabled();
    p.state.armySlots = ['militia', null, null, null, null];
    p.state = applyAction(p.state, { type: 'start', stage: 11 });
    app.rerender(<ProgressionGoalCard {...p} />);
    expect(within(screen.getByRole('region')).getByRole('button', { name: 'View active battle' })).toBeEnabled();
  });
});
