import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppViewNavigation } from '../app/components/AppViewNavigation';
import { UnitRoster } from '../components/kingdom/UnitRoster';
import { newKingdom, type Kingdom } from '../lib/kingdom/game';

function roster(): Kingdom {
    const state = newKingdom();
    state.buildings.barracks = 1;
    state.units = {
        slinger: {
            unitId: 'slinger',
            investedXP: 0,
            locked: false
        },
        spareMilitia: {
            unitId: 'militia',
            investedXP: 0,
            locked: false
        },
        spearman: {
            unitId: 'spearman',
            investedXP: 0,
            locked: false
        },
        equippedMilitia: {
            unitId: 'militia',
            investedXP: 0,
            locked: false
        },
        secondSlinger: {
            unitId: 'slinger',
            investedXP: 0,
            locked: false
        },
    };
    state.armySlots = ['equippedMilitia', null, null, null, null];
    return state;
}

describe('Unit collection actions', () => {
    it('marks one copy per unequipped type and equipped merge recipients while sorting equipped first', () => {
        const state = roster();
        render(<><AppViewNavigation view="castle" state={state} unavailable={false} isDemoUser castleActionAvailable={false} onViewChange={vi.fn()} /><UnitRoster state={state} /></>);
        const cards = within(screen.getByRole('group', { name: 'Owned copies' })).getAllByRole('button');
        expect(cards.map(card => card.querySelector('strong')?.textContent)).toEqual([
            'Militia · #4', 'Militia · #2', 'Slinger · #1', 'Slinger · #5', 'Spearman · #3',
        ]);
        expect(cards.map(card => card.getAttribute('aria-description'))).toEqual([
            'Merge a spare copy', null, 'Equip in an empty army slot', null, 'Equip in an empty army slot',
        ]);
        expect(screen.getByRole('button', { name: 'Battle' })).toHaveAttribute('aria-description', 'Unit collection actions available');
    });

    it('keeps merge indicators when slots are full and ignores protected donors', () => {
        const state = roster();
        state.armySlots = ['equippedMilitia', 'slinger', 'spearman', 'secondSlinger', 'spareMilitia'];
        state.units.thirdMilitia = {
            unitId: 'militia',
            investedXP: 0,
            locked: false
        };
        const view = render(<><AppViewNavigation view="castle" state={state} unavailable={false} isDemoUser castleActionAvailable={false} onViewChange={vi.fn()} /><UnitRoster state={state} /></>);
        expect(screen.getByRole('button', { name: 'Battle' })).toHaveAttribute('aria-description', 'Unit collection actions available');
        expect(within(screen.getByRole('group', { name: 'Owned copies' })).getAllByRole('button').filter(card => card.getAttribute('aria-description') === 'Merge a spare copy')).toHaveLength(3);
        state.units.thirdMilitia.locked = true;
        view.rerender(<><AppViewNavigation view="castle" state={state} unavailable={false} isDemoUser castleActionAvailable={false} onViewChange={vi.fn()} /><UnitRoster state={state} /></>);
        expect(screen.getByRole('button', { name: 'Battle' })).not.toHaveAttribute('aria-description');
    });
});
