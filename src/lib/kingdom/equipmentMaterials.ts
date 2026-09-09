import { type EquipmentVisual } from './game';

type Polygon = readonly number[];
type Regions = { armor: Polygon; weapon: Polygon[] };
type Rig = readonly Regions[];
const region = (armor: Polygon, ...weapon: Polygon[]): Regions => ({ armor, weapon });
// Coordinates refer to each identity's original 256px animation cells. Keep
// face, hair, hands, capes and mounts outside the material masks. The native
// painted shading and alpha are retained, so equipment follows the exact pose.
const scoutIdle = region([116,144,138,151,132,170,111,167], [111,179,148,187,151,198,121,194]);
const lancerIdle = region([122,148,140,154,136,170,120,168], [149,87,160,88,157,119,149,119]);
const berserkerIdle = region([105,139,127,144,149,140,155,161,98,162], [75,189,103,187,117,211,84,210], [183,164,206,159,221,198,189,204]);
const spearmanIdle = region([121,173,136,176,138,187,119,192], [165,184,192,180,187,192,163,195]);
const shieldIdle = region([92,141,136,148,133,173,91,163], [65,194,97,189,112,217,77,230]);
const duelistIdle = region([124,174,138,176,142,190,130,195,122,184], [132,196,173,220,171,224,129,199]);
const slingerIdle = region([120,110,143,119,150,141,112,146], [157,171,183,198,176,211,163,205]);
const crossbowIdle = region([122,161,147,162,157,179,134,178], [144,178,196,187,201,200,154,201]);
const rangerIdle = region([134,109,153,115,161,135,133,139], [183,58,204,58,209,185,178,209,187,156,187,109]);
const gunnerIdle = region([120,158,140,161,146,174,127,174], [145,163,197,165,197,190,146,198]);
const frostIdle = region([130,159,142,160,150,176,129,179], [161,122,176,122,174,161,157,161]);
const sageIdle = region([116,158,141,159,157,173,135,181,112,173], [159,127,212,127,214,150,179,162,159,153]);
function rig(idle: Regions, walk: Regions[], attack: Regions[]): Rig {
    return [idle,idle,idle,idle,...walk,...attack];
}
export const IDENTITY_MATERIALS: Readonly<Record<string, Rig>> = {
    'scout-rider': rig(scoutIdle, [
        region([126,145,145,153,136,171,118,168], ...scoutIdle.weapon),
        region([127,143,146,151,140,170,120,168], ...scoutIdle.weapon),
        region([129,146,148,154,140,173,121,170], ...scoutIdle.weapon),
        region([127,144,146,152,138,170,120,168], ...scoutIdle.weapon),
    ], [
        region([127,148,148,156,140,174,119,168], [97,81,113,81,129,111,124,118]),
        region([126,157,145,161,131,179,112,173], [77,161,97,129,110,124,114,129,93,153]),
        region([124,163,144,157,156,163,137,181,115,182], [181,165,229,177,240,185,209,190,182,177]),
        scoutIdle,
    ]),
    lancer: rig(lancerIdle, [lancerIdle,lancerIdle,lancerIdle,lancerIdle], [
        region([119,160,137,166,132,179,115,175], [91,95,104,94,111,129,101,134]),
        region([123,160,140,166,134,181,119,177], [181,176,215,185,214,190,178,182]),
        region([121,163,139,169,133,183,116,178], [200,170,245,171,246,181,200,178]),
        lancerIdle,
    ]),
    berserker: rig(berserkerIdle,[berserkerIdle,berserkerIdle,
        region([115,139,136,148,153,145,160,159,122,167], [125,164,152,174,142,199,119,198], [196,155,218,158,230,188,195,193]),
        region([110,139,132,147,153,146,158,162,111,163], ...berserkerIdle.weapon),
    ],[
        region([101,149,121,151,113,174,86,174], [175,145,196,149,218,172,190,185], [142,194,170,193,175,219,146,227]),
        region([117,151,141,159,165,148,166,163,142,176,111,165], [49,56,80,59,83,82,57,85], [160,52,194,59,199,83,171,92]),
        region([107,151,124,152,121,176,97,178], [220,160,247,164,246,194,218,194]),
        berserkerIdle,
    ]),
    spearman: rig(spearmanIdle,[spearmanIdle,spearmanIdle,spearmanIdle,spearmanIdle],[
        spearmanIdle,
        region([131,183,143,183,142,197,124,194], [75,140,97,142,104,150,89,152]),
        region([139,183,154,190,149,202,130,198], [212,182,246,182,245,191,212,192]),
        spearmanIdle,
    ]),
    shieldbearer: rig(shieldIdle,[shieldIdle,shieldIdle,shieldIdle,shieldIdle],[
        region([99,162,137,164,135,181,98,173], [18,128,54,126,64,154,30,173]),
        region([110,143,147,153,148,184,117,181], [11,94,49,89,56,117,31,132]),
        region([91,169,130,181,120,197,86,186], [157,181,190,174,203,202,177,219]),
        shieldIdle,
    ]),
    duelist: rig(duelistIdle,[duelistIdle,duelistIdle,duelistIdle,duelistIdle],[
        duelistIdle,
        region([135,180,148,182,150,193,137,198,130,187], [77,146,116,151,122,158,101,155]),
        region([143,190,162,187,159,202,141,210], [188,185,244,185,244,190,187,190]),
        duelistIdle,
    ]),
    slinger: rig(slingerIdle,[
        region([126,118,148,126,151,145,113,151], ...slingerIdle.weapon),
        region([122,119,148,125,144,143,108,149], ...slingerIdle.weapon),
        region([132,120,156,123,158,145,123,150], ...slingerIdle.weapon),
        region([130,121,155,123,154,144,122,149], ...slingerIdle.weapon),
    ],[
        region([125,130,151,137,152,151,118,155], [175,151,194,171,193,188,178,185]),
        region([133,119,151,136,158,150,132,157,119,139], [42,27,81,29,99,46,70,53,44,45]),
        region([137,125,167,133,160,149,134,154], [219,107,244,107,245,121,224,121]),
        region([123,126,149,134,150,152,119,151], [14,160,66,157,110,146,99,156,58,175,21,173]),
    ]),
    crossbowman: rig(crossbowIdle,[crossbowIdle,crossbowIdle,crossbowIdle,crossbowIdle],[
        crossbowIdle,
        region([126,171,147,173,141,188,122,189], [142,153,192,154,192,173,148,176]),
        region([126,171,147,173,142,188,121,189], [142,153,195,156,195,177,148,177]),
        crossbowIdle,
    ]),
    ranger: rig(rangerIdle,[
        region([140,122,155,128,151,149,133,149], [167,79,225,79,225,163,173,191,166,170,190,142]),
        region([126,121,143,128,143,145,124,146], [169,91,221,89,222,175,178,200,163,177]),
        region([143,123,161,131,161,147,139,151], [171,91,222,89,223,175,179,200,166,177]),
        region([133,122,151,129,151,146,131,149], [170,91,222,89,223,175,179,200,165,177]),
    ],[
        region([131,124,148,126,153,145,130,150], [150,22,211,53,219,147,193,217,184,200,201,134,190,71,146,38]),
        region([130,119,152,121,157,138,129,148], [169,24,218,47,230,130,203,217,194,207,212,121,200,60,165,38]),
        region([142,124,163,125,169,144,139,151], [189,27,230,55,242,136,211,217,203,207,225,123,217,71,181,40]),
        rangerIdle,
    ]),
    'clockwork-gunner': rig(gunnerIdle,[gunnerIdle,gunnerIdle,gunnerIdle,gunnerIdle],[
        region([119,170,139,175,140,187,120,190], [142,148,209,148,209,174,146,179]),
        region([118,170,139,175,141,187,119,190], [140,148,206,148,206,174,143,179]),
        region([119,170,139,175,140,187,120,190], [142,148,208,148,208,174,146,179]),
        gunnerIdle,
    ]),
    'frost-mage': rig(frostIdle,[frostIdle,frostIdle,frostIdle,frostIdle],[
        frostIdle,
        region([127,164,142,165,146,184,124,185], [185,99,213,98,207,126,186,131]),
        region([128,164,143,165,149,183,126,185], [201,147,232,147,232,168,201,170]),
        frostIdle,
    ]),
    'battle-sage': rig(sageIdle,[sageIdle,sageIdle,sageIdle,sageIdle],[
        sageIdle,
        region([115,168,137,173,151,184,132,196,110,185], [157,131,213,130,213,154,178,166,157,156], [75,94,88,94,94,110,82,115]),
        region([126,171,148,175,157,187,139,201,120,190], [196,139,235,139,235,163,196,163]),
        sageIdle,
    ]),
};

export function drawIdentityMaterials(ctx: CanvasRenderingContext2D, source: string, equipment: EquipmentVisual, index: number, colors: readonly string[]) {
    const regions = IDENTITY_MATERIALS[source]?.[index];
    if (!regions) {
        return;
    }
    const material = (polygon: Polygon, tier: number, armor: boolean) => {
        if (!tier) {
            return;
        }
        ctx.save();
        ctx.beginPath(); ctx.moveTo(polygon[0],polygon[1]);
        for(let i=2;i<polygon.length;i+=2){
            ctx.lineTo(polygon[i],polygon[i+1]);
        }
        ctx.closePath();ctx.clip();
        // Source-atop cannot paint outside the unit. Translucent metal preserves the
        // artist's folds/highlights instead of pasting a rigid inventory icon on top.
        ctx.globalCompositeOperation='source-atop';
        ctx.globalAlpha=armor ? .62 : .48;
        const ys=polygon.filter((_,i)=>i%2===1),top=Math.min(...ys),bottom=Math.max(...ys);
        const gradient=ctx.createLinearGradient(0,top,12,bottom);
        gradient.addColorStop(0,'#f3f5f8');gradient.addColorStop(.3,colors[tier-1]);gradient.addColorStop(1,'#253044');
        ctx.fillStyle=gradient;ctx.fillRect(0,0,256,256);
        ctx.restore();
    };
    material(regions.armor,equipment.armor,true);
    for(const polygon of regions.weapon){
        material(polygon,equipment.weapon,false);
    }
}
