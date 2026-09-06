import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { KnowledgeTowers } from '../components/kingdom/KnowledgeTowers';
import { ArmyPreparation } from '../components/kingdom/ArmyPreparation';
import { createBattle, newKingdom } from '../lib/kingdom/game';
import { TOWERS, TOWER_SCALE } from '../../supabase/functions/_shared/towers';

describe('Knowledge Towers view', () => {
  it('army details use frozen stats after learning increases a tower during combat', () => {
    const state = newKingdom(); state.buildings.barracks = 1; state.armySlots = ['militia', null, null, null, null];
    const battle = createBattle(state); state.battle = battle;
    state.towers.points.force = 15 * TOWER_SCALE; state.towers.points.essence = 15 * TOWER_SCALE;
    render(<ArmyPreparation state={state} preparation={battle} active blocked={false} perform={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Army slot 1: Militia' }));
    expect(screen.getByText('65 HP')).toBeInTheDocument();
    expect(screen.getByText(/Battle snapshot: 4% armor/)).toBeInTheDocument();
    expect(screen.queryByText('66.625 HP')).not.toBeInTheDocument();
  });
  it('shows eight distinct labeled shapes, effects, exact progress and topic learning links', () => {
    const state = newKingdom(), onLearnTopic = vi.fn(); state.towers.points.force = 3.25 * TOWER_SCALE;
    render(<KnowledgeTowers state={state} onLearnTopic={onLearnTopic} />);
    for (const t of TOWERS) {
      const card = within(screen.getByRole('article', { name: t.name }));
      expect(card.getByText(new RegExp(t.appearance))).toBeInTheDocument();
      expect(card.getByRole('progressbar', { name: `${t.name} progress` })).toBeInTheDocument();
      fireEvent.click(card.getByRole('button')); expect(onLearnTopic).toHaveBeenLastCalledWith(t.topic);
    }
    const force = within(screen.getByRole('article', { name: 'Force Tower' }));
    expect(force.getByText('Level 2 / 5')).toBeInTheDocument(); expect(force.getByText('3.25 points · Next: 6')).toBeInTheDocument();
    expect(force.getByText('Current bonus')).toBeInTheDocument();
    expect(force.getByText('At level 3 · total bonus')).toBeInTheDocument();
    expect(force.getByText('Melee, mounted & siege: +1.5% damage; +0.9 percentage points armor')).toBeInTheDocument();
    expect(force.getByText('Earn 2.75 more points in Physics to upgrade.')).toBeInTheDocument();
    const life = within(screen.getByRole('article', { name: 'Life Tower' }));
    expect(life.getByText('Unlock at level 1')).toBeInTheDocument();
    expect(life.getByText('All: +0.5% HP; healers: +0.4% healing and budget')).toBeInTheDocument();
    expect(life.queryByText(/\+0%/)).not.toBeInTheDocument();
  });
  it('compact view keeps all topics available, routes pending Collect through the existing flow and blocks in-flight learning', () => {
    const onLearnTopic = vi.fn(), state = newKingdom();
    const { rerender } = render(<KnowledgeTowers state={state} compact pendingReward onLearnTopic={onLearnTopic} />);
    expect(screen.getAllByRole('article')).toHaveLength(8);
    fireEvent.click(within(screen.getByRole('article', { name: 'Life Tower' })).getByRole('button', { name: 'Collect first for Life' }));
    expect(onLearnTopic).toHaveBeenCalledWith('Life');
    rerender(<KnowledgeTowers state={state} compact onLearnTopic={onLearnTopic} learningBlocked="Saving Resources…" />);
    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled();
  });
});
