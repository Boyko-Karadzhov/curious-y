import { unitDefinition, type EquipmentVisual, type UnitId, type UnitClass } from './game';
import { unitArt } from './unitArt';
import { drawIdentityMaterials, IDENTITY_MATERIALS } from './equipmentMaterials';
import { drawSwarmEquipment, isSwarmArt, SWARM_EQUIPMENT_ROOT, SWARM_IDS } from './swarmArt';

const ROOT='/assets/equipment/forge-v1/';
const PROTOTYPE='/assets/equipment/forge-prototype-v1/';
export const EQUIPMENT_COLORS=['#bdc6d3','#64b7ad','#b892ef','#8de1e3','#ffc45f'];
const images=new Map<string,HTMLImageElement>();
const loading=new Map<string,Promise<void>>();
// A fitted replacement sheet is compatible with exactly one source identity.
// Sharing a combat class does not imply sharing a body, mount, or animation.
const FITTED_SOURCES=new Set(['swordsman','archer','knight','medic']);
const sources=new Map(['melee','ranged','mounted','healer','siege'].flatMap(c=>[
    ...Array.from({length:5},(_,i)=>[`${c}-weapon-${i+1}`,ROOT+`${c}-weapon-${i+1}.png`]),
    ...(c==='siege'?[]:Array.from({length:6},(_,i)=>[`${c}-armor-${i}`,c==='melee'&&[0,1,5].includes(i)?PROTOTYPE+(i===0?'base':i===1?'iron-armor-body-v2':'sunsteel-armor-body-v2')+'.png':ROOT+`${c}-body-${i}.png`]))
]).concat([['melee-sword-1',PROTOTYPE+'iron-sword.png'],['melee-sword-5',PROTOTYPE+'sunsteel-sword.png']]).map(([key,url])=>[key,url]));
for(const source of Object.keys(IDENTITY_MATERIALS)){
    sources.set(`identity-${source}`,`/assets/units/${source}-v1/atlas.png`);
}

for(const id of SWARM_IDS) {
    sources.set(`identity-${id}`,unitArt(id).atlas.src);
}

for(const part of ['armor','upper','lower']){
    for(let tier=1;tier<=5;tier++){
        sources.set(`swarm-${part}-${tier}`,`${SWARM_EQUIPMENT_ROOT}${part}-${tier}.png`);
    }
}

export function loadEquipmentArtwork(loadouts?:{id:UnitId;equipment?:EquipmentVisual}[]){
    const keys=loadouts ? loadouts.flatMap(({id,equipment:e})=>{
        if(!e||(!e.weapon&&!e.armor)){
            return [];
        }

        const c=unitDefinition(id).unitClass,w=e.weapon||1;
        if(c==='siege'){
            return e.weapon?[`siege-weapon-${e.weapon}`]:[];
        }

        const source=unitArt(id).source;
        if(c==='swarm'){
            return [`identity-${source}`,...(e.armor?[`swarm-armor-${e.armor}`]:[]),...(e.weapon?[`swarm-upper-${e.weapon}`,`swarm-lower-${e.weapon}`]:[])];
        }

        if(!FITTED_SOURCES.has(source)){
            return [`identity-${source}`];
        }

        return [`${c}-armor-${e.armor}`,c==='melee'&&[1,5].includes(w)?`melee-sword-${w}`:`${c}-weapon-${w}`];
    }):[...sources.keys()];
    return Promise.all([...new Set(keys)].map(key=>{
        if(images.has(key)){
            return Promise.resolve();
        }

        if(loading.has(key)){
            return loading.get(key)!;
        }

        const promise=new Promise<void>(resolve=>{
            const img=new Image();img.onload=()=>{
                images.set(key,img);resolve();
            };

            img.onerror=()=>resolve();img.src=sources.get(key)!;
        }).finally(()=>loading.delete(key));
        loading.set(key,promise);return promise;
    })).then(()=>{
        if(loadouts){
            const needed=new Set(keys);for(const key of images.keys()){
                if(images.size<=32){
                    break;
                }

                if(!needed.has(key)){
                    images.delete(key);
                }
            }
        }
    });
}

const FEET=[[225,318],[582,318],[938,318],[1293,318],[224,621],[581,621],[941,621],[1294,621],[217,940],[552,940],[922,940],[1294,940]];
const HANDS=[[218,193,72],[550,207,68],[908,192,74],[1274,192,72],[263,503,68],[619,503,68],[983,507,70],[1345,503,68],[181,699,-28],[631,837,120],[1050,770,90],[1287,820,70]];
const ROWS=[[0,340],[340,308],[648,376]];
// Hand positions in normalized 256px cells; body variants retain these poses.
const GRIPS:Record<Exclude<UnitClass,'melee'|'siege'>,number[][]>={
    ranged:[[168,164,0],[168,164,0],[168,164,0],[168,164,0],[168,160,0],[168,160,0],[173,161,0],[173,161,0],[187,158,0],[207,114,0],[218,113,0],[170,164,0]],
    swarm:[[109,168,20],[109,168,20],[109,168,20],[109,168,20],[110,171,30],[110,171,30],[110,171,30],[110,171,30],[107,101,-25],[118,166,55],[185,148,85],[114,166,30]],
    healer:[[165,189,0],[165,189,0],[165,189,0],[165,189,0],[153,198,30],[153,198,30],[153,198,30],[153,198,30],[98,139,-25],[202,181,85],[200,181,85],[167,190,0]],
};
const cache=new Map<string,HTMLCanvasElement>();
function drawWeapon(ctx:CanvasRenderingContext2D,c:UnitClass,tier:number,x:number,y:number,angle:number){
    const image=images.get(c==='melee'&&[1,5].includes(tier)?`melee-sword-${tier}`:`${c}-weapon-${tier}`);if(!image){
        return;
    }

    ctx.save();ctx.translate(x,y);ctx.rotate(angle*Math.PI/180);
    if(c==='melee'&&[1,5].includes(tier)){
        const h=tier===1?164:184,w=h*image.width/image.height;ctx.drawImage(image,-w/2,-h*.83,w,h);
    } else {
        // Catalog weapons run bottom-left to top-right. Register that axis upright.
        ctx.rotate(-Math.PI/4);
        const size=c==='melee'?174:c==='swarm'?168:c==='ranged'?111:75;
        const scale=size/Math.hypot(image.width,image.height),w=image.width*scale,h=image.height*scale;
        const grip=c==='ranged'?[.60,.61]:[.22,.79];ctx.drawImage(image,-w*grip[0],-h*grip[1],w,h);
    }

    ctx.restore();
}

/** Preserve the recruited identity; use fitted sheets only on their own body. */
export function drawEquippedUnit(ctx:CanvasRenderingContext2D,id:UnitId,equipment:EquipmentVisual|undefined,index:number,height:number):boolean{
    if(!equipment||(!equipment.weapon&&!equipment.armor)){
        return false;
    }

    const c=unitDefinition(id).unitClass;if(c==='siege'){
        return false;
    }

    const art=unitArt(id);
    if(c==='swarm') {
        const original=images.get(`identity-${art.source}`); if(!original){
            return false;
        }

        if(!isSwarmArt(id)||(equipment.armor&&!images.has(`swarm-armor-${equipment.armor}`))||(equipment.weapon&&(!images.has(`swarm-upper-${equipment.weapon}`)||!images.has(`swarm-lower-${equipment.weapon}`)))){
            return false;
        }

        const key=`swarm/${id}/${equipment.weapon}/${equipment.armor}/${index}`;
        let frame=cache.get(key);
        if(!frame){
            frame=document.createElement('canvas');frame.width=frame.height=256;const g=frame.getContext('2d')!;
            g.drawImage(original,index%4*256,Math.floor(index/4)*256,256,256,0,0,256,256);
            drawSwarmEquipment(g,id,equipment,index,images);
            if(cache.size>=96){
                cache.delete(cache.keys().next().value!);
            }

            cache.set(key,frame);
        }

        const size=height*256/art.idleHeight;
        ctx.drawImage(frame,-size*art.atlas.anchorX,-size*art.atlas.anchorY,size,size);return true;
    }

    if(!FITTED_SOURCES.has(art.source)){
        const original=images.get(`identity-${art.source}`);if(!original){
            return false;
        }

        const key=`${art.source}/${equipment.weapon}/${equipment.armor}/${index}`;
        let frame=cache.get(key);
        if(!frame){
            frame=document.createElement('canvas');frame.width=256;frame.height=256;
            const g=frame.getContext('2d')!;
            g.drawImage(original,index%4*256,Math.floor(index/4)*256,256,256,0,0,256,256);
            drawIdentityMaterials(g,art.source,equipment,index,EQUIPMENT_COLORS);
            if(cache.size>=48){
                cache.delete(cache.keys().next().value!);
            }

            cache.set(key,frame);
        }

        const size=height*256/art.idleHeight;
        ctx.drawImage(frame,-art.atlas.anchorX*size,-art.atlas.anchorY*size,size,size);
        return true;
    }

    const body=images.get(`${c}-armor-${equipment.armor}`);if(!body){
        return false;
    }

    const weapon=equipment.weapon||1;
    if(!images.has(c==='melee'&&[1,5].includes(weapon)?`melee-sword-${weapon}`:`${c}-weapon-${weapon}`)){
        return false;
    }

    const key=`${art.source}/${equipment.weapon}/${equipment.armor}/${index}`;
    let frame=cache.get(key);
    if(!frame){
        frame=document.createElement('canvas');frame.width=512;frame.height=384;const g=frame.getContext('2d')!;
        if(c==='melee'){
            const [fx,fy]=FEET[index],[ry,rh]=ROWS[Math.floor(index/4)],cx=index%4*384;
            g.translate(220-fx,340-fy);g.drawImage(body,cx,ry,384,rh,cx,ry,384,rh);
            const [x,y,angle]=HANDS[index];drawWeapon(g,c,equipment.weapon||1,x,y,angle);
            // Restore the glove over the grip. The small crop follows the authored hand.
            g.save();g.beginPath();g.ellipse(x,y,9,10,0,0,Math.PI*2);g.clip();g.drawImage(body,cx,ry,384,rh,cx,ry,384,rh);g.restore();
        }else{
            const sw=body.width/4,sh=body.height/3,cx=index%4*sw,cy=Math.floor(index/4)*sh;
            g.translate(220-128,340-232);g.drawImage(body,cx,cy,sw,sh,0,0,256,256);
            const [x,y,angle]=GRIPS[c][index];drawWeapon(g,c,equipment.weapon||1,x,y,angle);
            g.save();g.beginPath();g.ellipse(x,y,c==='ranged'?5:4,5,0,0,Math.PI*2);g.clip();g.drawImage(body,cx,cy,sw,sh,0,0,256,256);g.restore();
        }

        if(cache.size>=48){
            cache.delete(cache.keys().next().value!);
        }

        cache.set(key,frame);
    }

    const bodyHeight=c==='melee'?288:c==='ranged'?212:106;
    ctx.save();ctx.scale(height/bodyHeight,height/bodyHeight);ctx.drawImage(frame,-220,-340);ctx.restore();return true;
}

export function drawSiegeAmmunition(ctx:CanvasRenderingContext2D,tier:number,size:number,rotation:number){
    const image=images.get(`siege-weapon-${tier}`);if(!image){
        return false;
    }

    ctx.save();ctx.rotate(rotation);const factor=size/Math.max(image.width,image.height);ctx.drawImage(image,-image.width*factor/2,-image.height*factor/2,image.width*factor,image.height*factor);ctx.restore();return true;
}
