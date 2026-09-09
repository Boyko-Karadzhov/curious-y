import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UnitPortrait, portraitEquipment } from '../components/kingdom/UnitPortrait';
import { createBattle, newKingdom } from '../lib/kingdom/game';
import { ArmyPreparation } from '../components/kingdom/ArmyPreparation';
import { UnitRoster } from '../components/kingdom/UnitRoster';
import { drawEquippedUnit, loadEquipmentArtwork } from '../lib/kingdom/equipmentArt';

vi.mock('../lib/kingdom/equipmentArt',()=>({loadEquipmentArtwork:vi.fn(async()=>{}),drawEquippedUnit:vi.fn(()=>true)}));
beforeEach(()=>{
    vi.clearAllMocks();
    const pixels=new Uint8ClampedArray(512*512*4);pixels[(400*512+250)*4+3]=255;pixels[(300*512+280)*4+3]=255;
    vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({translate:vi.fn(),drawImage:vi.fn(),getImageData:()=>({data:pixels})} as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype,'toDataURL').mockReturnValue('data:image/png;base64,equipped');
});
afterEach(()=>{cleanup();vi.restoreAllMocks();});

describe('Equipped unit portraits',()=>{
    it('renders the actual identity with equipment, updates tiers and restores the ordinary portrait when gear is sold',async()=>{
        const view=render(<UnitPortrait id="hatchling" equipment={{weapon:2,armor:3}}/>);
        const img=()=>view.container.querySelector('img')!;
        await waitFor(()=>expect(img().src).toContain('data:image/png'));
        expect(drawEquippedUnit).toHaveBeenLastCalledWith(expect.anything(),'hatchling',{weapon:2,armor:3},0,120);
        view.rerender(<UnitPortrait id="hatchling" equipment={{weapon:4,armor:5}}/>);
        expect(img().getAttribute('src')).toBe('/assets/units/hatchling-v2/portrait.png');
        await waitFor(()=>expect(drawEquippedUnit).toHaveBeenLastCalledWith(expect.anything(),'hatchling',{weapon:4,armor:5},0,120));
        view.rerender(<UnitPortrait id="hatchling" equipment={{weapon:0,armor:0}}/>);
        expect(img().getAttribute('src')).toBe('/assets/units/hatchling-v2/portrait.png');
    });
    it('ignores an old asynchronous portrait after switching unit identity',async()=>{
        let finish!:()=>void;
        vi.mocked(loadEquipmentArtwork).mockImplementationOnce(()=>new Promise<void>(resolve=>{finish=resolve;}));
        const view=render(<UnitPortrait id="stinger" size={81} equipment={{weapon:1,armor:1}}/>);
        view.rerender(<UnitPortrait id="hatchling" size={81}/>);
        await act(async()=>finish());
        expect(view.container.querySelector('img')!.getAttribute('src')).toBe('/assets/units/hatchling-v2/portrait.png');
    });
    it('keeps Siege bodies and displays ammunition only',()=>{
        const view=render(<UnitPortrait id="catapult" equipment={{weapon:5,armor:5}}/>);
        expect([...view.container.querySelectorAll('img')].map(img=>img.getAttribute('src'))).toEqual(['/assets/units/catapult-v1/portrait.png','/assets/equipment/forge-v1/siege-weapon-5.png']);
        expect(drawEquippedUnit).not.toHaveBeenCalled();
    });
    it('resolves gear by class and excludes artifact and Siege armor visuals',()=>{
        const state=newKingdom();
        state.forge.equipped['swarm:armor']={id:'armor',unitClass:'swarm',slot:'armor',tier:4,bonus:{stat:'hp',target:'swarm',value:5}};
        state.forge.equipped['swarm:artifact']={id:'artifact',unitClass:'swarm',slot:'artifact',tier:5,bonus:{stat:'hp',target:'swarm',value:5}};
        state.forge.equipped['siege:armor']={id:'doctrine',unitClass:'siege',slot:'armor',tier:5,bonus:{stat:'hp',target:'siege',value:5}};
        for(const id of ['hatchling','stinger','ravager'] as const)expect(portraitEquipment(state,id)).toEqual({weapon:0,armor:4});
        expect(portraitEquipment(state,'catapult')).toEqual({weapon:0,armor:0});
    });
    it('uses frozen gear in an active army and current gear in the collection and next preparation',async()=>{
        const state=newKingdom();state.castle=4;state.buildings.barracks=1;
        state.units.swarm={unitId:'hatchling',investedXP:0,locked:false};state.armySlots[0]='swarm';
        state.forge.equipped['swarm:armor']={id:'old',unitClass:'swarm',slot:'armor',tier:2,bonus:{stat:'hp',target:'swarm',value:5}};
        const battle=createBattle(state);
        state.forge.equipped['swarm:armor']={...state.forge.equipped['swarm:armor'],id:'new',tier:5};
        const view=render(<ArmyPreparation state={state} preparation={battle} active blocked={false} perform={vi.fn()}/>);
        await waitFor(()=>expect(drawEquippedUnit).toHaveBeenCalledWith(expect.anything(),'hatchling',{weapon:0,armor:2},0,120));
        view.rerender(<><ArmyPreparation state={state} preparation={createBattle(state)} active={false} blocked={false} perform={vi.fn()}/><UnitRoster state={state}/></>);
        await waitFor(()=>expect(drawEquippedUnit).toHaveBeenCalledWith(expect.anything(),'hatchling',{weapon:0,armor:5},0,120));
        expect(state.units.swarm.unitId).toBe('hatchling');
    });
});
