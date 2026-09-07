import { EquipmentRig, loadEquipmentArt, animationFrame } from './renderer.mjs';

const state = { weapon:'sunsteel-sword',armor:'sunsteel-armor',artifact:true,pose:'idle',playing:!matchMedia('(prefers-reduced-motion: reduce)').matches,seconds:0,direction:1,anchors:false };
const hero = document.querySelector('#hero');
const battlefield = document.querySelector('#battlefield');
const play = document.querySelector('#play');
const status = document.querySelector('#status');
let rig, lastTime = 0;
const names = { 'iron-sword':'Iron sword','sunsteel-sword':'Sunsteel sword','iron-armor':'Iron cuirass','sunsteel-armor':'Sunsteel cuirass',none:'Unequipped' };
function updateLabels() {
  document.querySelectorAll('[data-slot]').forEach(button => button.setAttribute('aria-pressed',String(state[button.dataset.slot] === button.dataset.item)));
  document.querySelectorAll('[data-pose]').forEach(button => button.setAttribute('aria-pressed',String(state.pose === button.dataset.pose)));
  document.querySelector('#artifact').setAttribute('aria-pressed',String(state.artifact));
  document.querySelector('#selection').textContent = `${names[state.weapon]} · ${names[state.armor]}${state.artifact ? " · Wayfinder's star" : ''}`;
  play.textContent = state.playing ? 'Pause' : 'Play';
  play.setAttribute('aria-pressed',String(state.playing));
}
function context(canvas) {
  const {width,height} = canvas.getBoundingClientRect();
  const ratio = Math.min(devicePixelRatio || 1,1.5);
  if(canvas.width !== Math.round(width*ratio) || canvas.height !== Math.round(height*ratio)) {
    canvas.width = Math.round(width*ratio); canvas.height = Math.round(height*ratio);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(ratio,0,0,ratio,0,0); ctx.clearRect(0,0,width,height); ctx.imageSmoothingEnabled=true;
  return {ctx,width,height};
}
function ground(ctx,x,y,width) {
  ctx.fillStyle='#07140e33';ctx.beginPath();ctx.ellipse(x,y,width,width*.17,0,0,Math.PI*2);ctx.fill();
}
function draw() {
  if(!rig)return;
  const index=animationFrame(state.pose,state.seconds);
  document.querySelector('#frame').textContent=`Frame ${index%4+1} / 4`;
  const large=context(hero);
  const unitHeight=Math.min(218,large.height*.68);
  const x=large.width*.48,y=large.height*.85;
  ground(large.ctx,x,y+3,unitHeight*.34);
  rig.draw(large.ctx,{x,y,height:unitHeight,index,direction:state.direction,loadout:state,time:state.seconds,anchors:state.anchors});
  const small=context(battlefield);
  const examples=[{weapon:'none',armor:'none',artifact:false},{weapon:'iron-sword',armor:'iron-armor',artifact:false},{weapon:'sunsteel-sword',armor:'sunsteel-armor',artifact:true},state];
  examples.forEach((loadout,i)=>{
    const unitX=small.width*(i+.5)/4, unitY=small.height*.75;
    ground(small.ctx,unitX,unitY+2,22);
    rig.draw(small.ctx,{x:unitX,y:unitY,height:64,index,direction:state.direction,loadout,time:state.seconds});
    small.ctx.fillStyle='#192b30';small.ctx.fillRect(unitX-13,unitY-74,26,3);
    small.ctx.fillStyle=i===3?'#ebc37f':'#7dd3fc';small.ctx.fillRect(unitX-13,unitY-74,26,3);
  });
}
document.querySelectorAll('[data-slot]').forEach(button => button.addEventListener('click',()=>{state[button.dataset.slot]=button.dataset.item;updateLabels();draw();}));
document.querySelectorAll('[data-pose]').forEach(button => button.addEventListener('click',()=>{state.pose=button.dataset.pose;state.seconds=0;updateLabels();draw();}));
document.querySelector('#artifact').addEventListener('click',()=>{state.artifact=!state.artifact;updateLabels();draw();});
play.addEventListener('click',()=>{state.playing=!state.playing;updateLabels();draw();});
document.querySelector('#step').addEventListener('click',()=>{state.playing=false;const duration=state.pose==='attack'?1.2:state.pose==='walk'?.8:1.4;state.seconds=(((animationFrame(state.pose,state.seconds)%4)+1)%4+.01)*duration/4;updateLabels();draw();});
document.querySelector('#flip').addEventListener('change',event=>{state.direction=event.target.checked?-1:1;draw();});
document.querySelector('#anchors').addEventListener('change',event=>{state.anchors=event.target.checked;draw();});
document.querySelector('#backdrop').addEventListener('change',event=>{document.querySelector('#field').dataset.backdrop=event.target.value;});
new ResizeObserver(draw).observe(hero);
new ResizeObserver(draw).observe(battlefield);
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',event=>{if(event.matches){state.playing=false;updateLabels();draw();}});
function tick(now) {
  const elapsed=lastTime?Math.min((now-lastTime)/1000,.05):0;lastTime=now;
  if(state.playing&&!document.hidden){state.seconds+=elapsed;draw();}
  requestAnimationFrame(tick);
}
try {
  rig=new EquipmentRig(await loadEquipmentArt());status.textContent='';
  updateLabels();draw();requestAnimationFrame(tick);
} catch(error) {status.textContent=`Artwork could not load: ${error.message}. Reload to try again.`;}
