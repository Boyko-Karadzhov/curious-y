import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Battlefield } from '../components/game/Battlefield';
import { battleTheme, BATTLE_THEMES } from '../lib/kingdom/battleArt';
import { createBattle, newKingdom } from '../lib/kingdom/game';

afterEach(cleanup);

describe('Battle world artwork', () => {
    it('changes at world boundaries and repeats scenery and castles every ten worlds', () => {
        const battle = createBattle(newKingdom());
        const view = render(<Battlefield battle={battle} running={false} />);
        const home = view.container.querySelector('.battle-keep-home img')!.getAttribute('src');
        for (let world = 1; world <= 30; world++) {
            for (const level of [1, 10]) {
                const stage = (world - 1) * 10 + level;
                const theme = BATTLE_THEMES[(world - 1) % 10];
                view.rerender(<Battlefield battle={{ ...battle, stage }} running={false} />);
                expect(view.container.querySelector('.battlefield')).toHaveAttribute('data-theme', theme.id);
                expect(view.container.querySelector('.battle-keep-enemy img')).toHaveAttribute('src', theme.enemyKeep);
                expect(view.container.querySelector('.battle-keep-home img')).toHaveAttribute('src', home);
                const scenery = view.container.querySelector<HTMLElement>('.battle-scenery');
                if (theme.background) {
                    expect(scenery!.style.backgroundImage).toContain(theme.background);
                } else {
                    expect(scenery).toBeNull();
                }
            }
        }
    });

    it('ships distinct lightweight scenery and transparent castle sprites for every new world', () => {
        expect(new Set(BATTLE_THEMES.map(theme => theme.enemyKeep)).size).toBe(10);
        for (const theme of BATTLE_THEMES) {
            const castle = readFileSync(resolve('public', theme.enemyKeep.slice(1)));
            expect(castle.readUInt32BE(16)).toBe(512);
            expect(castle.readUInt32BE(20)).toBe(512);
            expect(castle[25]).toBe(6); // PNG RGBA, never an opaque checkerboard.
            if (theme.background) {
                const file = resolve('public', theme.background.slice(1));
                expect(existsSync(file)).toBe(true);
                expect(readFileSync(file).length).toBeLessThan(600_000);
            }
        }
    });

    it('uses the original world for invalid or not-yet-initialized stages', () => {
        for (const stage of [0, -1, NaN, Infinity]) {
            expect(battleTheme(stage)).toBe(BATTLE_THEMES[0]);
        }
    });
});
