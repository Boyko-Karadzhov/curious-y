import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { UnitPortrait } from '../components/kingdom/UnitPortrait';
import { unitArt, unitArtFrame } from '../lib/kingdom/unitArt';

describe('Generated unit artwork', () => {
  it('uses the approved portrait and preserves legacy unit assets during migration', () => {
    render(createElement(UnitPortrait, { id: 'swordsman' }));
    expect(screen.getByRole('presentation')).toHaveAttribute('src', unitArt('swordsman').portrait);
    expect(unitArt('archer').portrait).toBe('/assets/units/archer.svg');
  });
  it('keeps animation inside the 12 populated cells and follows the fighter attack interval', () => {
    for (const pose of ['idle', 'walk', 'attack'] as const) for (let t=0;t<6;t+=.017) {
      const frame=unitArtFrame('swordsman',pose,t,1.5);
      expect(frame.column).toBeGreaterThanOrEqual(0); expect(frame.column).toBeLessThan(4);
      expect(frame.row).toBe(pose==='idle'?0:pose==='walk'?1:2);
    }
    expect(unitArtFrame('swordsman','attack',.75,1.5)).toEqual({row:2,column:2});
    expect(unitArtFrame('swordsman','attack',.75,1.5,true)).toEqual({row:0,column:0});
  });
});
