import {useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import '../../src/index.css';
import {unitArt} from '../../src/lib/kingdom/unitArt';
import {SWARM_IDS,swarmFrameRig} from '../../src/lib/kingdom/swarmArt';
import {drawEquippedUnit,loadEquipmentArtwork} from '../../src/lib/kingdom/equipmentArt';
import {unitDefinition} from '../../src/lib/kingdom/game';
import {EquipmentIcon} from '../../src/components/kingdom/ForgePanel';

export function Review(){
    const [pose,setPose]=useState(0),[playing,setPlaying]=useState(false),[tier,setTier]=useState(3),[guides,setGuides]=useState(false),[result,setResult]=useState('');
    const ref=useRef<HTMLCanvasElement>(null),detail=useRef<HTMLCanvasElement>(null);
    useEffect(()=>{
        if(!playing){
            return;
        }

        const t=setInterval(()=>setPose(p=>(p+1)%12),250);return()=>clearInterval(t);
    },[playing]);
    useEffect(()=>{
        let disposed=false;
        const loadouts=[{weapon:0,armor:0},{weapon:tier,armor:0},{weapon:0,armor:tier},{weapon:tier,armor:tier},{weapon:5,armor:1},{weapon:1,armor:5}];
        const originals=SWARM_IDS.map(id=>new Promise<HTMLImageElement>(resolve=>{
            const image=new Image();image.onload=()=>resolve(image);image.src=unitArt(id).atlas.src;
        }));
        void Promise.all([Promise.all(originals),loadEquipmentArtwork(SWARM_IDS.flatMap(id=>loadouts.map(equipment=>({id,equipment}))))]).then(([images])=>{
            if(disposed){
                return;
            }

            const c=ref.current!,g=c.getContext('2d')!;g.fillStyle='#101b2c';g.fillRect(0,0,c.width,c.height);
            const labels=['Natural','Mandibles only','Carapace only',`Matched tier ${tier}`,'Weapon 5 / Armor 1','Weapon 1 / Armor 5'];
            labels.forEach((label,i)=>{
                g.fillStyle='#efc889';g.font='bold 15px sans-serif';g.textAlign='center';g.fillText(label,120+i*220,30);
            });
            SWARM_IDS.forEach((id,row)=>{
                loadouts.forEach((equipment,col)=>{
                    const x=120+220*col,y=180+row*185,art=unitArt(id),s=90/ art.idleHeight;
                    g.save();g.translate(x,y);
                    if(!drawEquippedUnit(g,id,equipment,pose,90)){
                        g.drawImage(images[row],pose%4*256,Math.floor(pose/4)*256,256,256,-128*s,-232*s,256*s,256*s);
                    }

                    if(guides){
                        const f=swarmFrameRig(id,pose);g.strokeStyle='#ff7979';g.lineWidth=1;g.strokeRect((f.shell[0]-128)*s,(f.shell[1]-232)*s,f.shell[2]*s,f.shell[3]*s);for(const p of [f.upper,f.lower]){
                            g.fillStyle='#fff';g.beginPath();g.arc((p[0]-128)*s,(p[1]-232)*s,2,0,Math.PI*2);g.fill();
                        }
                    }

                    g.restore();g.textAlign='center';g.font='13px sans-serif';g.fillStyle='#b8c9db';g.fillText(unitDefinition(id).name,x,y+28);
                });
            });
            const zoom=detail.current!,zg=zoom.getContext('2d')!;zg.fillStyle='#101b2c';zg.fillRect(0,0,zoom.width,zoom.height);
            for(let i=0;i<3;i++) {
                const height=i===2?34:175,art=unitArt('hatchling'),s=height/art.idleHeight;
                zg.save();zg.translate(185+i*310,215);
                if(i===0){
                    zg.drawImage(images[0],pose%4*256,Math.floor(pose/4)*256,256,256,-128*s,-232*s,256*s,256*s);
                } else {
                    drawEquippedUnit(zg,'hatchling',{weapon:tier,armor:tier},pose,height);
                }

                zg.restore();zg.fillStyle='#dce4ef';zg.font='14px sans-serif';zg.textAlign='center';zg.fillText(i===0?'Natural detail':i===1?'Equipped detail':'Battlefield size',185+i*310,255);
            }
        });return()=>{
            disposed=true;
        };
    },[pose,tier,guides]);
    const audit=async()=>{
        setResult('Checking every pose and loadout…');
        await loadEquipmentArtwork(SWARM_IDS.flatMap(id=>Array.from({length:5},(_,i)=>({id,equipment:{weapon:i+1,armor:i+1}}))));
        const c=document.createElement('canvas');c.width=c.height=320;const g=c.getContext('2d')!;let count=0,missing=0,clipped=0;
        for(const id of SWARM_IDS){
            for(let weapon=0;weapon<=5;weapon++){
                for(let armor=0;armor<=5;armor++) {
                    if(!weapon&&!armor){
                        continue;
                    }

                    await loadEquipmentArtwork([{id,equipment:{weapon,armor}}]);
                    for(let frame=0;frame<12;frame++) {
                        g.clearRect(0,0,320,320);g.save();g.translate(160,264);
                        if(!drawEquippedUnit(g,id,{weapon,armor},frame,unitArt(id).idleHeight)){
                            missing++;
                        }

                        g.restore();const pixels=g.getImageData(0,0,320,320).data;
                        for(let i=0;i<256;i++){
                            if(pixels[((32*320+32+i)*4)+3]>8||pixels[((287*320+32+i)*4)+3]>8||pixels[(((32+i)*320+32)*4)+3]>8||pixels[(((32+i)*320+287)*4)+3]>8){
                                clipped++;break;
                            }
                        }

                        count++;
                    }
                }
            }
        }

        setResult(`${count} equipped frames checked · ${missing} missing · ${clipped} clipped`);
    };

    return <main style={{maxWidth:1400,margin:'auto',padding:24,color:'#dbe7f7'}}>
        <p style={{color:'#dfb879',letterSpacing:3,fontSize:12}}>CURIOUS-Y · ART REVIEW</p><h1 style={{fontSize:32,fontWeight:800,margin:'10px 0'}}>Swarm · forged for their anatomy</h1>
        <p>Five identities, separate shell armor and articulated mandibles. Isolated art preview; account data is untouched.</p>
        <div style={{display:'flex',gap:20,alignItems:'center',margin:'24px 0',flexWrap:'wrap'}}>
            <label>Equipment tier <select aria-label="Equipment tier" value={tier} onChange={e=>setTier(+e.target.value)} style={{color:'#111',padding:6}}>{[1,2,3,4,5].map(n=><option key={n}>{n}</option>)}</select></label>
            <label>Frame <input aria-label="Frame" type="range" min={0} max={11} value={pose} onChange={e=>{
                setPlaying(false);setPose(+e.target.value);
            }}/>{pose} · {pose<4?'Idle':pose<8?'Walk':'Bite'}</label>
            <button onClick={()=>setPlaying(p=>!p)}>{playing?'Pause':'Play animation'}</button><label><input type="checkbox" checked={guides} onChange={e=>setGuides(e.target.checked)}/> Attachment guides</label>
            {[0,4,8,9,10,11].map(frame=><button key={frame} onClick={()=>{
                setPlaying(false);setPose(frame);
            }}>Pose {frame}</button>)}
            <button onClick={()=>void audit()}>Check every equipment combination</button><span role="status">{result}</span>
        </div>
        <canvas ref={detail} width={1000} height={285} style={{width:'100%',maxWidth:1000,borderRadius:18,marginBottom:20}} aria-label="Enlarged swarm equipment fit"/>
        <canvas ref={ref} width={1320} height={990} style={{width:'100%',borderRadius:18}} aria-label="Swarm unit and fitted equipment comparison"/>
        <h2 style={{fontSize:22,margin:'24px 0 10px'}}>All 15 swarm equipment designs</h2>
        <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:12}}>{[1,2,3,4,5].map(t=><section key={t} style={{background:'#17263b',borderRadius:12,padding:12,textAlign:'center'}}><b>Tier {t}</b>{(['weapon','armor','artifact'] as const).map(slot=><div key={slot}><EquipmentIcon item={{unitClass:'swarm',slot,tier:t}}/><small>{slot==='weapon'?'Mandibles':slot==='armor'?'Carapace':'Hive crest'}</small></div>)}</section>)}</div>
    </main>;
}

if(import.meta.env.DEV){
    const root=createRoot(document.getElementById('root')!);root.render(<Review/>);import.meta.hot?.dispose(()=>root.unmount());
}
