export interface BattleTheme {
  id: string;
  name: string;
  background?: string;
  enemyKeep: string;
}

const theme = (id: string, name: string): BattleTheme => ({
    id, name,
    background: `/assets/battle/worlds/${id}-v1/background.jpg`,
    enemyKeep: `/assets/battle/worlds/${id}-v1/castle.png`,
});

export const BATTLE_THEMES: readonly BattleTheme[] = [
    { id: 'meadow', name: 'Greenfields', enemyKeep: '/assets/buildings/keep-enemy-v1/image.png' },
    theme('autumn', 'Amberwood'),
    theme('frost', 'Frostmarch'),
    theme('desert', 'Sunscar Dunes'),
    theme('marsh', 'Verdant Mire'),
    theme('volcanic', 'Embercrag'),
    theme('crystal', 'Crystal Hollow'),
    theme('coast', 'Stormbreak Coast'),
    theme('sky', 'Skyreach'),
    theme('astral', 'Astral Dominion'),
];

/** Stages are one-based: 1–10 = world 1, 101–110 = world 11. */
export function battleTheme(stage: number): BattleTheme {
    const safeStage = Number.isFinite(stage) ? Math.max(1, Math.floor(stage)) : 1;
    return BATTLE_THEMES[Math.floor((safeStage - 1) / 10) % BATTLE_THEMES.length];
}
