import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UNITS } from '../lib/kingdom/game';
import { unitArt } from '../lib/kingdom/unitArt';

function context() {
    return {
        drawImage:vi.fn(),save:vi.fn(),restore:vi.fn(),translate:vi.fn(),rotate:vi.fn(),scale:vi.fn(),
        beginPath:vi.fn(),moveTo:vi.fn(),lineTo:vi.fn(),closePath:vi.fn(),clip:vi.fn(),ellipse:vi.fn(),
        fillRect:vi.fn(),createLinearGradient:vi.fn(()=>({addColorStop:vi.fn()})),
    };
}
let contexts: WeakMap<HTMLCanvasElement, ReturnType<typeof context>>;
let requested: string[];
let fail: string | undefined;
beforeEach(()=>{
    vi.resetModules();contexts=new WeakMap();requested=[];fail=undefined;
    vi.stubGlobal('Image',class {
        width=1024; height=768; onload?:()=>void; onerror?:()=>void; private url='';
        set src(url:string){this.url=url;requested.push(url);queueMicrotask(()=>url===fail?this.onerror?.():this.onload?.());}
        get src(){return this.url;}
    });
    vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockImplementation(function(this:HTMLCanvasElement){
        if(!contexts.has(this))contexts.set(this,context());
        return contexts.get(this) as unknown as CanvasRenderingContext2D;
    });
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});

describe('Equipment preserves recruited unit identity',()=>{
    it('uses real swarm shell and both jaw assets independently for mixed tiers on every pose',async()=>{
        const {loadEquipmentArtwork,drawEquippedUnit}=await import('../lib/kingdom/equipmentArt');
        const screen=context();
        for(const id of ['hatchling','forager','stinger','ravager','hive-guard'] as const){
            await loadEquipmentArtwork([{id,equipment:{weapon:5,armor:1}}]);
            for(let pose=0;pose<12;pose++){
                expect(drawEquippedUnit(screen as unknown as CanvasRenderingContext2D,id,{weapon:5,armor:1},pose,34)).toBe(true);
                const frame=contexts.get(screen.drawImage.mock.lastCall![0])!;
                expect(frame.drawImage.mock.calls.map(c=>c[0].src)).toEqual([
                    `/assets/units/${id}-v2/atlas.png`, '/assets/equipment/swarm-v1/armor-1.png',
                    '/assets/equipment/swarm-v1/lower-5.png','/assets/equipment/swarm-v1/upper-5.png',
                ]);
                expect(frame.fillRect).not.toHaveBeenCalled();
            }
        }
        expect(requested.some(url=>/mounted|knight|stable/.test(url))).toBe(false);
    });

    it('falls back to the original swarm if a jaw fails, then recovers on retry',async()=>{
        fail='/assets/equipment/swarm-v1/lower-4.png';
        const {loadEquipmentArtwork,drawEquippedUnit}=await import('../lib/kingdom/equipmentArt');
        const screen=context(),equipment={weapon:4,armor:0};
        await loadEquipmentArtwork([{id:'hatchling',equipment}]);
        expect(drawEquippedUnit(screen as unknown as CanvasRenderingContext2D,'hatchling',equipment,10,34)).toBe(false);
        expect(screen.drawImage).not.toHaveBeenCalled();
        fail=undefined;await loadEquipmentArtwork([{id:'hatchling',equipment}]);
        expect(drawEquippedUnit(screen as unknown as CanvasRenderingContext2D,'hatchling',equipment,10,34)).toBe(true);
        expect(requested.some(url=>url.includes('swarm-v1/armor-'))).toBe(false);
    });

    it('equips Scout Rider armor without loading or drawing a Knight/Lancer body, at every tier and pose',async()=>{
        const {loadEquipmentArtwork,drawEquippedUnit}=await import('../lib/kingdom/equipmentArt');
        const screen=context();
        for(let armor=1;armor<=5;armor++){
            await loadEquipmentArtwork([{id:'spearman',equipment:{weapon:0,armor}}]);
            for(let index=0;index<12;index++){
                expect(drawEquippedUnit(screen as unknown as CanvasRenderingContext2D,'spearman',{weapon:0,armor},index,76)).toBe(true);
                const [frame,x,y,w,h]=screen.drawImage.mock.lastCall!;
                const painted=contexts.get(frame)!;
                expect(painted.drawImage).toHaveBeenCalledTimes(1);
                expect(painted.drawImage.mock.calls[0]).toEqual([
                    expect.objectContaining({src:'/assets/units/spearman-v1/atlas.png'}),
                    index%4*256,Math.floor(index/4)*256,256,256,0,0,256,256,
                ]);
                // Armor is visibly applied, but clipped over the original pose. Native
                // proportions and foot anchor must stay identical to an unequipped Scout.
                expect(painted.fillRect).toHaveBeenCalledOnce();expect(painted.clip).toHaveBeenCalledOnce();
                [x,y,w,h].forEach((value,i)=>expect(value).toBeCloseTo([-128*76/91,-232*76/91,256*76/91,256*76/91][i]));
            }
        }
        expect(new Set(requested)).toEqual(new Set(['/assets/units/spearman-v1/atlas.png']));
    });

    it('never reuses an equipped frame between different bodies in the same class',async()=>{
        const {loadEquipmentArtwork,drawEquippedUnit}=await import('../lib/kingdom/equipmentArt');
        const screen=context(),equipment={weapon:3,armor:4};
        await loadEquipmentArtwork(['spearman','slinger'].map(id=>({id:id as 'spearman'|'slinger',equipment})));
        for(const id of ['spearman','slinger','spearman'] as const)drawEquippedUnit(screen as unknown as CanvasRenderingContext2D,id,equipment,9,76);
        const frames=screen.drawImage.mock.calls.map(call=>call[0]);
        expect(frames[0]).not.toBe(frames[1]);expect(frames[0]).toBe(frames[2]);
        expect(contexts.get(frames[1])!.drawImage.mock.calls[0][0].src).toBe('/assets/units/slinger-v1/atlas.png');
    });

    it('covers the whole roster, including weapon-only loadouts, without another identity as fallback',async()=>{
        const {loadEquipmentArtwork,drawEquippedUnit}=await import('../lib/kingdom/equipmentArt');
        const {IDENTITY_MATERIALS}=await import('../lib/kingdom/equipmentMaterials');
        const screen=context();
        for(const equipment of [{weapon:5,armor:0},{weapon:0,armor:2},{weapon:2,armor:5}]){
            for(const unit of UNITS){
                await loadEquipmentArtwork([{id:unit.id,equipment}]);
                for(let index=0;index<12;index++){
                    expect(drawEquippedUnit(screen as unknown as CanvasRenderingContext2D,unit.id,equipment,index,unitArt(unit.id).displayHeight)).toBe(unit.unitClass!=='siege');
                    if(unit.unitClass==='siege')continue;
                    const source=unitArt(unit.id).source;
                    if(IDENTITY_MATERIALS[source]){
                        const frame=screen.drawImage.mock.lastCall![0],painted=contexts.get(frame)!;
                        expect(painted.drawImage.mock.calls[0][0].src).toBe(unitArt(unit.id).atlas.src);
                        expect(painted.fillRect).toHaveBeenCalled();
                    }
                }
            }
        }
        expect(drawEquippedUnit(screen as unknown as CanvasRenderingContext2D,'spearman',{weapon:0,armor:0},0,76)).toBe(false);
    });

    it('leaves the original renderer in charge when a unit atlas fails to load',async()=>{
        fail='/assets/units/spearman-v1/atlas.png';
        const {loadEquipmentArtwork,drawEquippedUnit}=await import('../lib/kingdom/equipmentArt');
        const equipment={weapon:5,armor:5};
        await loadEquipmentArtwork([{id:'ravager',equipment},{id:'spearman',equipment}]);
        const screen=context();
        expect(drawEquippedUnit(screen as unknown as CanvasRenderingContext2D,'spearman',equipment,0,76)).toBe(false);
        expect(screen.drawImage).not.toHaveBeenCalled();
    });
});
