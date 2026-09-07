// One reviewed swordsman rig. Coordinates refer to the generated source sheet.
// This experiment is deliberately independent of combat state and equipment stats.
export const ASSET_ROOT = '/assets/equipment/forge-prototype-v1/';
export const ITEMS = ['iron-sword', 'sunsteel-sword', 'iron-armor', 'sunsteel-armor'];
const ROWS = [[0, 340], [340, 308], [648, 376]];
const FEET = [[225,318],[582,318],[938,318],[1293,318],[224,621],[581,621],[941,621],[1294,621],[217,940],[552,940],[922,940],[1294,940]];
const HANDS = [[218,193,72],[550,207,68],[908,192,74],[1274,192,72],[263,503,68],[619,503,68],[983,507,70],[1345,503,68],[181,699,-28],[631,837,120],[1050,770,90],[1287,820,70]];
const CHESTS = [[235,170,0],[586,170,0],[940,170,0],[1295,170,0],[228,482,10],[585,482,10],[947,487,15],[1306,482,10],[231,782,10],[564,795,28],[931,793,20],[1298,793,8]];
// Foreground sleeve + glove masks restore the actual painted arm above the plate.
const ARMS = [
 [[188,143],[207,149],[216,168],[235,184],[237,202],[219,209],[193,194],[178,174]],
 [[539,146],[558,151],[564,176],[564,192],[568,211],[551,221],[534,209],[522,187]],
 [[892,145],[910,150],[918,169],[934,183],[939,199],[923,207],[900,198],[882,181]],
 [[1250,145],[1267,151],[1275,170],[1295,183],[1301,200],[1281,209],[1254,193],[1238,176]],
 [[197,459],[216,460],[230,480],[260,487],[278,497],[278,510],[268,518],[239,512],[214,501],[197,485]],
 [[554,458],[574,462],[587,480],[618,488],[634,499],[632,514],[619,519],[592,512],[571,502],[550,484]],
 [[914,463],[934,468],[947,486],[979,491],[997,502],[994,519],[978,524],[951,514],[929,505],[909,486]],
 [[1274,456],[1296,461],[1309,480],[1343,488],[1361,498],[1359,514],[1346,519],[1312,510],[1289,499],[1269,482]],
 [[165,747],[158,726],[162,700],[168,685],[185,682],[200,693],[195,714],[192,737],[211,747],[216,765],[198,770]],
 [[548,775],[568,778],[589,803],[615,816],[639,826],[646,841],[637,853],[620,849],[597,835],[573,830],[548,809]],
 [[919,770],[932,758],[960,758],[993,762],[1028,756],[1059,756],[1068,772],[1063,783],[1039,788],[1009,785],[975,790],[943,793],[924,787]],
 [[1259,763],[1278,769],[1282,789],[1298,804],[1305,824],[1295,836],[1280,834],[1256,820],[1244,798]],
];

export async function loadEquipmentArt() {
  return Object.fromEntries(await Promise.all(['base', ...ITEMS].map(async id => {
    const image = new Image();
    image.src = `${ASSET_ROOT}${id}.png`;
    await image.decode();
    return [id, image];
  })));
}

export function animationFrame(pose, seconds) {
  const row = pose === 'attack' ? 2 : pose === 'walk' ? 1 : 0;
  const duration = pose === 'attack' ? 1.2 : pose === 'walk' ? .8 : 1.4;
  return row * 4 + Math.floor((Math.max(0, seconds) % duration) / duration * 4);
}

function polygon(ctx, points) {
  ctx.beginPath();
  points.forEach(([x,y], i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y));
  ctx.closePath();
}

export class EquipmentRig {
  constructor(art) { this.art = art; this.cache = new Map(); }
  frame(index, loadout) {
    const key = `${index}/${loadout.weapon}/${loadout.armor}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const canvas = document.createElement('canvas');
    canvas.width = 768; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const [footX, footY] = FEET[index];
    const [rowY, rowHeight] = ROWS[Math.floor(index / 4)];
    const colX = index % 4 * 384;
    ctx.translate(330 - footX, 460 - footY);
    const body = () => ctx.drawImage(this.art.base, colX,rowY,384,rowHeight,colX,rowY,384,rowHeight);
    body();
    if (loadout.armor !== 'none') {
      const [x,y,angle] = CHESTS[index];
      ctx.save(); ctx.translate(x,y); ctx.rotate(angle * Math.PI / 180);
      ctx.drawImage(this.art[loadout.armor], -34,-30,68,72);
      ctx.restore();
      // Preserve the scarf, neck and head above the cuirass.
      ctx.save(); ctx.beginPath(); ctx.rect(colX,rowY,384,y-rowY-21); ctx.clip(); body(); ctx.restore();
    }
    if (loadout.weapon !== 'none') {
      const [x,y,angle] = HANDS[index];
      const sword = this.art[loadout.weapon];
      const height = loadout.weapon === 'iron-sword' ? 164 : 184;
      const width = height * sword.width / sword.height;
      ctx.save(); ctx.translate(x,y); ctx.rotate(angle * Math.PI / 180);
      ctx.drawImage(sword,-width / 2,-height * .83,width,height);
      ctx.restore();
    }
    if (loadout.armor !== 'none' || loadout.weapon !== 'none') {
      ctx.save(); polygon(ctx, ARMS[index]); ctx.clip(); body(); ctx.restore();
    }
    // Bound decoded frame memory while experimenting with many combinations.
    if (this.cache.size >= 48) this.cache.delete(this.cache.keys().next().value);
    this.cache.set(key, canvas);
    return canvas;
  }
  draw(ctx, { x, y, height = 64, index = 0, direction = 1, loadout, anchors = false }) {
    const scale = height / 288;
    ctx.save(); ctx.translate(x,y); ctx.scale(direction * scale,scale);
    ctx.drawImage(this.frame(index,loadout), -330,-460);
    if (anchors) {
      const [fx,fy] = FEET[index];
      ctx.lineWidth = 2;
      for (const [point,color] of [[HANDS[index],'#ffba61'],[CHESTS[index],'#68e4da']]) {
        ctx.strokeStyle = color; ctx.beginPath(); ctx.arc(point[0]-fx,point[1]-fy,7,0,Math.PI*2); ctx.stroke();
      }
    }
    ctx.restore();
  }
}
