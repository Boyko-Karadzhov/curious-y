import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { UnitPortrait } from '../components/kingdom/UnitPortrait';
import { EquipmentIcon } from '../components/kingdom/ForgePanel';
import { unitArt, unitArtFrame } from '../lib/kingdom/unitArt';
import { UNITS, BUILDING_DEFINITIONS } from '../lib/kingdom/game';
import { TOWERS } from '../../supabase/functions/_shared/towers';
import { buildingArt, keepArt } from '../lib/kingdom/buildingArt';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Generated unit artwork', () => {
  it('uses dedicated transparent swarm equipment in every Forge slot and tier',()=>{
    for(const slot of ['weapon','armor','artifact'] as const)for(let tier=1;tier<=5;tier++){
      const path=`/assets/equipment/swarm-v1/${slot}-${tier}.png`;
      const png=readFileSync(resolve('public',path.slice(1)));
      expect(png.subarray(1,4).toString()).toBe('PNG');expect(png[25]).toBe(6);
      const view=render(createElement(EquipmentIcon,{item:{unitClass:'swarm',slot,tier}}));
      expect(view.container.firstElementChild).toHaveStyle({backgroundImage:`url("${path}")`,backgroundSize:'contain'});
      view.unmount();
    }
  });
  it('uses the approved portrait for every unit', () => {
    render(createElement(UnitPortrait, { id: 'swordsman' }));
    expect(screen.getByRole('presentation')).toHaveAttribute('src', unitArt('swordsman').portrait);
    expect(unitArt('archer').portrait).toBe('/assets/units/archer-v1/portrait.png');
  });
  it('resolves every new roster identity to a complete RGBA atlas and portrait', () => {
    expect(UNITS).toHaveLength(25);
    for (const unit of UNITS) {
      const art=unitArt(unit.id);
      for(const path of [art.portrait,art.atlas!.src]) {
        const png=readFileSync(resolve('public',path.slice(1)));
        if (path.endsWith('.svg')) {
          expect(png.toString()).toContain('<svg');
          if (path === art.atlas.src) { expect(png.toString()).toContain('width="1024"'); expect(png.toString()).toContain('height="768"'); }
          continue;
        }
        expect(png.subarray(1,4).toString()).toBe('PNG');
        expect(png[25]).toBe(6); // RGBA, not an opaque checkerboard RGB export.
        if(path===art.atlas!.src) {
          expect(png.readUInt32BE(16)).toBe(1024);expect(png.readUInt32BE(20)).toBe(768);
        }
      }
    }
  });
  it('ships every town building, Knowledge Tower and Keep tier with alpha', () => {
    const paths=[...BUILDING_DEFINITIONS.map(b=>buildingArt(b.id)),...TOWERS.map(t=>buildingArt(t.id)),
      ...[1,2,3,4,5].map(level=>keepArt(level)),keepArt(1,true)];
    expect(new Set(paths).size).toBe(19);
    for(const path of paths) {
      const png=readFileSync(resolve('public',path.slice(1)));
      expect(png[25]).toBe(6);expect(png.readUInt32BE(16)).toBe(512);expect(png.readUInt32BE(20)).toBe(512);
    }
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
