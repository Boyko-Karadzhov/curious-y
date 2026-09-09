import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import '../../src/index.css';
import {ArmyPreparation} from '../../src/components/kingdom/ArmyPreparation';
import {UnitRoster} from '../../src/components/kingdom/UnitRoster';
import {ForgePanel,EquipmentIcon} from '../../src/components/kingdom/ForgePanel';
import {newKingdom,applyAction,TOPICS,UNIT_CLASSES,UNITS,EQUIPMENT_CATALOG,equipmentKey,equipmentName,createBattle, type Action,type Kingdom} from '../../src/lib/kingdom/game';
import {unitArt} from '../../src/lib/kingdom/unitArt';
import {BattleRenderer} from '../../src/lib/kingdom/battleRenderer';
import {drawEquippedUnit,drawSiegeAmmunition,loadEquipmentArtwork} from '../../src/lib/kingdom/equipmentArt';
const initial=()=>{
    const s=newKingdom();s.castle=4;s.buildings.forge=40;s.forge.count=390;for(const topic of TOPICS){
        s.tokens[topic]=100;
    }for(const [i,c]of UNIT_CLASSES.entries()){
        s.buildings[c.building]=1;const unit=UNITS.find(u=>u.unitClass===c.id&&u.tier===3)!;s.units[c.id]={unitId:unit.id,investedXP:0,locked:false};s.armySlots[i]=c.id;s.forge.equipped[`${c.id}:weapon`]={id:`initial-${c.id}`,unitClass:c.id,slot:'weapon',tier:1,bonus:{stat:'hp',target:c.id,value:5}};
    }return s;
};
function Review(){
    const [state,setState]=useState<Kingdom>(initial),[battleKey,setBattleKey]=useState(0),[tier,setTier]=useState(1),[pose,setPose]=useState<'idle'|'walk'|'attack'>('attack'),[armor,setArmor]=useState(1),[running,setRunning]=useState(true),[unitTier,setUnitTier]=useState(1);
    const canvas=useRef<HTMLCanvasElement>(null),rigs=useRef<HTMLCanvasElement>(null);
    useEffect(()=>{
        const c=canvas.current!,renderer=new BattleRenderer(c,c.getContext('2d')!);let s={...state,battle:createBattle(state,30)};renderer.update(s.battle!,true);const timer=setInterval(()=>{
            for(let i=0;i<2;i++){
                s=applyAction(s,{type:'tick'});
            }renderer.update(s.battle!,!s.battle!.result);
        },100);return()=>{
            clearInterval(timer);renderer.dispose();
        };
    },[battleKey]);
    useEffect(()=>{
        let raf=0,disposed=false;const c=rigs.current!,ctx=c.getContext('2d')!;
        const roster=UNIT_CLASSES.map(u=>UNITS.find(unit=>unit.unitClass===u.id&&unit.tier===unitTier)!);
        const originals=roster.map(unit=>{
            const img=new Image();img.src=unitArt(unit.id).atlas.src;return img;
        });
        const begin=performance.now();
        const draw=(now:number)=>{
            if(disposed){
                return;
            }ctx.clearRect(0,0,c.width,c.height);
            const seconds=Math.max(0,(now-begin)/1000),index=(pose==='idle'?0:pose==='walk'?4:8)+(running?Math.floor(seconds*3)%4:0);
            roster.forEach((unit,i)=>{
                const x=100+i*180,art=unitArt(unit.id),size=65*256/art.idleHeight;
                ctx.save();ctx.translate(x-42,160);
                if(originals[i].complete&&originals[i].naturalWidth){
                    ctx.drawImage(originals[i],index%4*256,Math.floor(index/4)*256,256,256,-art.atlas.anchorX*size,-art.atlas.anchorY*size,size,size);
                }
                ctx.restore();ctx.save();ctx.translate(x+42,160);
                if(unit.unitClass==='siege'){
                    drawSiegeAmmunition(ctx,tier,40,running?seconds*3:0);
                } else if(!drawEquippedUnit(ctx,unit.id,{weapon:tier,armor},index,65)&&originals[i].complete&&originals[i].naturalWidth){
                    ctx.drawImage(originals[i],index%4*256,Math.floor(index/4)*256,256,256,-art.atlas.anchorX*size,-art.atlas.anchorY*size,size,size);
                }
                ctx.restore();ctx.fillStyle='#ccd6e5';ctx.textAlign='center';ctx.font='14px sans-serif';ctx.fillText(unit.name,x,195);
                ctx.font='11px sans-serif';ctx.fillStyle='#97a8c0';ctx.fillText('Original',x-42,215);ctx.fillText(unit.unitClass==='siege'?'Ammo':'Equipped',x+42,215);
            });raf=requestAnimationFrame(draw);
        };
        void loadEquipmentArtwork(roster.map(unit=>({id:unit.id,equipment:{weapon:tier,armor}}))).then(()=>draw(performance.now()));
        return()=>{
            disposed=true;cancelAnimationFrame(raf);
        };
    },[tier,armor,pose,running,unitTier]);
    return <main style={{maxWidth:1100,margin:'0 auto',padding:'30px 16px',color:'#dce5f5'}}><header style={{marginBottom:24}}><p style={{color:'#eabb72',fontSize:11,letterSpacing:3}}>FORGE · PLAYABLE REVIEW</p><h1 style={{fontSize:32,fontWeight:800,margin:'10px 0'}}>A new purpose for every resource.</h1><p style={{color:'#97a8c0'}}>Isolated review state · This page does not spend your account’s resources.</p></header><ForgePanel state={state} blocked={false} perform={async(action:Action)=>{
        setState(s=>applyAction(s,action,{requestId:crypto.randomUUID(),draws:Array.from(crypto.getRandomValues(new Uint32Array(6)),n=>n/4294967296)}));return true;
    }}/>
    <details style={{margin:'24px 0'}}><summary style={{cursor:'pointer',padding:12}}>Equipment in army preparation and unit collection</summary><h2 style={{fontSize:20,fontWeight:800}}>Prepare your army</h2><ArmyPreparation state={state} preparation={createBattle(state,30)} active={false} blocked={false} perform={async action=>{
        setState(s=>applyAction(s,action));return true;
    }}/><UnitRoster state={state}/></details>
    <section style={{margin:'28px 0',padding:20,background:'#172235',borderRadius:20}}><h2 style={{fontSize:20,fontWeight:800}}>Fitted equipment · all classes</h2><div style={{display:'flex',flexWrap:'wrap',gap:20,marginTop:14}}><label>Unit tier <select aria-label="Unit tier" value={unitTier} onChange={e=>setUnitTier(Number(e.target.value))} style={{color:'#111',marginLeft:8}}>{[1,2,3,4,5].map(n=><option key={n}>{n}</option>)}</select></label><label>Weapon tier <select aria-label="Weapon tier" value={tier} onChange={e=>setTier(Number(e.target.value))} style={{color:'#111',marginLeft:8}}>{[0,1,2,3,4,5].map(n=><option key={n}>{n}</option>)}</select></label><label>Armor tier <select aria-label="Armor tier" value={armor} onChange={e=>setArmor(Number(e.target.value))} style={{color:'#111',marginLeft:8}}>{[0,1,2,3,4,5].map(n=><option key={n}>{n}</option>)}</select></label><label>Pose <select aria-label="Pose" value={pose} onChange={e=>setPose(e.target.value as typeof pose)} style={{color:'#111',marginLeft:8}}>{['idle','walk','attack'].map(n=><option key={n}>{n}</option>)}</select></label><button onClick={()=>setRunning(!running)}>{running?'Pause':'Play'}</button></div><div style={{overflowX:'auto'}}><canvas ref={rigs} width={950} height={240} style={{width:950,maxWidth:'none'}} aria-label="Equipped class animation preview"/></div><p style={{fontSize:12,color:'#97a8c0'}}>Artifacts and Siege armor stay off the battlefield. Siege shows the ammunition itself.</p></section>
    <section style={{margin:'28px 0',padding:20,background:'#172235',borderRadius:20}}><h2 style={{fontSize:20,fontWeight:800}}>Battlefield</h2><button style={{padding:10,background:'#dcb171',color:'#201a13',borderRadius:8,margin:'10px 0'}} onClick={()=>setBattleKey(n=>n+1)}>Start battle with current equipment</button><canvas ref={canvas} style={{width:'100%',height:256,background:'linear-gradient(#667d83,#384d40)'}} aria-label="Equipment battlefield review"/></section>
    <details><summary style={{cursor:'pointer',padding:12}}>All 75 item designs</summary><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(135px,1fr))',gap:10}}>{EQUIPMENT_CATALOG.map(item=><div key={`${equipmentKey(item)}-${item.tier}`} style={{textAlign:'center',background:'#182438',padding:10,borderRadius:9}}><EquipmentIcon item={item}/><p style={{fontSize:11}}>{equipmentName(item)}</p></div>)}</div></details></main>;
}
if(import.meta.env.DEV){
    const root=createRoot(document.getElementById('root')!);root.render(<Review/>);import.meta.hot?.dispose(()=>root.unmount());
}
