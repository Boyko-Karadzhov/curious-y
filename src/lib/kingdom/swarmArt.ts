import type { EquipmentVisual } from './game';
import rig from './swarmRig.json';

export const SWARM_IDS = ['hatchling','forager','stinger','ravager','hive-guard'] as const;
export type SwarmId = typeof SWARM_IDS[number];
export const isSwarmArt = (id: string): id is SwarmId => SWARM_IDS.some(s => s === id);
export const swarmIdleHeight = (id: SwarmId) => rig[id].idleHeight;
export const SWARM_EQUIPMENT_ROOT = '/assets/equipment/swarm-v1/';

// Landmarks were measured in the generated source poses. The importer preserves
// their coordinate system at .58 scale and records each frame's foot offset.
// Armor ends at the neck; mandible sheaths hinge below the eyes, independently.
const shells = [
 [47,128,177,112], [48,130,180,112], [54,129,174,111], [48,130,176,111],
 [46,113,184,118], [49,111,184,118], [56,114,176,117], [47,110,179,115],
 [47,101,179,119], [49,100,180,119], [65,81,172,132], [48,101,177,121],
];
const jaws = [
 [286,237,275,249,0,0], [292,238,280,250,0,0], [285,237,274,250,0,0], [291,236,280,251,0,0],
 [292,221,279,240,0,0], [292,223,280,239,0,0], [292,225,280,240,0,0], [292,220,280,235,0,0],
 [286,214,275,227,5,5], [294,158,279,195,-12,12], [332,120,311,170,-18,18], [289,214,278,227,0,0],
];

export function swarmFrameRig(id: SwarmId, index: number) {
 const [dx,dy]=rig[id].transforms[index],s=.58;
 const [x,y,w,h]=shells[index], [ux,uy,lx,ly,ua,la]=jaws[index];
 const resting=index<9||index===11;
 return { shell:[dx+x*s,dy+y*s,w*s,h*s],upper:[dx+(ux-(resting?8:0))*s,dy+uy*s,resting?-22:ua],lower:[dx+lx*s,dy+ly*s,resting?22:la] };
}

export function drawSwarmEquipment(ctx: CanvasRenderingContext2D, id: SwarmId, equipment: EquipmentVisual, index: number, images: ReadonlyMap<string,HTMLImageElement>) {
 const {shell,upper,lower}=swarmFrameRig(id,index);
 if(equipment.armor) ctx.drawImage(images.get(`swarm-armor-${equipment.armor}`)!,shell[0],shell[1],shell[2],shell[3]);
 if(equipment.weapon) {
  const draw=(part:'upper'|'lower',point:number[])=>{
   ctx.save();ctx.translate(point[0],point[1]);ctx.rotate(point[2]*Math.PI/180);
   const w=55*.58,h=30*.58;
   ctx.drawImage(images.get(`swarm-${part}-${equipment.weapon}`)!,-w*.08,-h*(part==='upper'?.28:.72),w,h);
   ctx.restore();
  };
  draw('lower',lower);draw('upper',upper);
 }
}
