import { BuildingId } from './game';
import { TOWERS } from '../../../supabase/functions/_shared/towers';
import { battleTheme } from './battleArt';

export type TowerArtId = typeof TOWERS[number]['id'];
export const buildingArt = (id: BuildingId | TowerArtId) => `/assets/buildings/${id}-v1/image.png`;
export const keepArt = (level: number, enemy = false, stage = 1) => enemy
  ? battleTheme(stage).enemyKeep
  : `/assets/buildings/keep-${Math.max(1, Math.min(5, Math.round(level)))}-v1/image.png`;
