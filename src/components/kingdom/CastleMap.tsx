import { BookOpen, Hammer, LockKeyhole, Sparkles } from 'lucide-react';
import { BUILDING_DEFINITIONS, BuildingId, Kingdom, upgradeStatus } from '../../lib/kingdom/game';
import { KeepVisual } from './KeepVisual';
import './castle-map.css';

export type CastleSelection = 'castle' | BuildingId;
const plots: Record<BuildingId, { x: number; y: number; color: string }> = {
  library: { x: 19, y: 24, color: '#7b70bb' }, treasury: { x: 50, y: 19, color: '#c49743' },
  academy: { x: 81, y: 24, color: '#4e998c' }, barracks: { x: 18, y: 49, color: '#537da8' },
  range: { x: 82, y: 49, color: '#63854c' }, stable: { x: 22, y: 76, color: '#a36d45' },
  workshop: { x: 50, y: 80, color: '#7b8197' }, forge: { x: 78, y: 76, color: '#b2604b' },
};

/** Original vector buildings keep the individual plots readable at any screen size. */
export function BuildingVisual({ id, ghost = false }: { id: BuildingId; ghost?: boolean }) {
  const color = plots[id].color;
  return <svg viewBox="0 0 120 110" aria-hidden="true" className={`castle-building-art ${ghost ? 'castle-building-ghost' : ''}`}>
    <ellipse cx="60" cy="96" rx="48" ry="10" fill="#193a2c" opacity=".25" />
    {id === 'range' ? <>
      <path d="M18 48v44M102 48v44M18 66h84M18 82h84" stroke="#725234" strokeWidth="6" />
      {[38, 78].map(x => <g key={x}><path d={`M${x} 75v24`} stroke="#593f2e" strokeWidth="5" /><ellipse cx={x} cy="60" rx="16" ry="21" fill="#e8d8b0" stroke="#886740" strokeWidth="3" /><ellipse cx={x} cy="60" rx="10" ry="14" fill="#9b5043" /><ellipse cx={x} cy="60" rx="4" ry="6" fill="#e8d8b0" /></g>)}
      <path d="M9 40 24 25 45 40Z" fill={color} /><path d="M24 26v-15l18 6-18 6" fill="#e4c478" stroke="#685339" strokeWidth="2" />
    </> : <>
      <path d="M24 49h64v43H24Z" fill="#e1d3af" stroke="#696650" strokeWidth="2" />
      <path d="m88 49 17-10v44L88 92Z" fill="#a49c7f" stroke="#696650" strokeWidth="2" />
      <path d="M14 51 47 19l49 32Z" fill={color} stroke="#374c49" strokeWidth="3" />
      <path d="m47 19 27-6 40 28-18 10Z" fill={color} stroke="#374c49" strokeWidth="3" />
      <path d="M20 43h68M29 34h48M40 25h22" stroke="#fff" strokeOpacity=".18" strokeWidth="3" />
      <path d="M49 92V72a10 10 0 0 1 20 0v20" fill="#4d4938" />
      <path d="M31 62h10v13H31ZM77 62h7v13h-7Z" fill="#e7b964" stroke="#79704e" strokeWidth="2" />
      <path d="M27 83h13M72 85h12M28 57h12" stroke="#b7aa8a" strokeWidth="2" />
      {id === 'library' && <g fill="#f9e7ba" stroke="#534d76" strokeWidth="2"><path d="m36 54 19 3 19-3v16l-19 3-19-3Z" /><path d="M55 57v16" /></g>}
      {id === 'academy' && <path d="M49 48h12v9h9v12h-9v9H49v-9h-9V57h9Z" fill="#f5ead0" stroke="#4f8072" strokeWidth="2" />}
      {id === 'treasury' && <g fill="#edc363" stroke="#8e6a38" strokeWidth="2"><circle cx="56" cy="61" r="12" /><path d="M56 53v16m5-13H53v5h7v5h-9" fill="none" /></g>}
      {id === 'barracks' && <><path d="m48 50 19 23m0-23L48 73" stroke="#637786" strokeWidth="7" /><path d="m48 48 19 23m0-23L48 71" stroke="#eef0d6" strokeWidth="3" /><path d="M92 35V8l19 7-19 6" fill="#88b3d4" stroke="#526774" strokeWidth="2" /></>}
      {id === 'stable' && <><path d="M34 66h50v26H34Z" fill="#6a4f34" /><path d="M37 91V70m15 21V70m15 21V70m15 21V70" stroke="#be9c66" strokeWidth="4" /><path d="m87 95 2-18 9-9 9 9-7 4-2 14" fill="#ccad7a" stroke="#6c5538" strokeWidth="2" /></>}
      {(id === 'forge' || id === 'workshop') && <><path d="M82 29V8h14v31" fill="#858579" stroke="#4c5b54" strokeWidth="3" /><path d="M33 92h46v7H33Z" fill="#8a7c5c" />{id === 'workshop' ? <g stroke="#ddc591" strokeWidth="4"><circle cx="98" cy="85" r="14" fill="#6b624a" /><path d="M98 71v28M84 85h28m-24-10 20 20m0-20-20 20" /></g> : <path d="M76 77h31l-8 9H87v9h-8v-9l-8-5Z" fill="#4b5556" />}</>}
    </>}
  </svg>;
}

export function CastleMap({ state, selected, onSelect, onInspect }: {
  state: Kingdom; selected: CastleSelection; onSelect: (id: CastleSelection) => void; onInspect: () => void;
}) {
  return <div className="castle-map" role="group" aria-label="Interactive Castle map">
    <svg className="castle-landscape" viewBox="0 0 1000 760" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <pattern id="castle-grass" width="48" height="40" patternUnits="userSpaceOnUse"><path d="m6 9 3-5 2 5m24 19 2-4 3 4" fill="none" stroke="#abc289" strokeWidth="2" opacity=".3" /></pattern>
        <pattern id="castle-stone" width="36" height="20" patternUnits="userSpaceOnUse"><path d="M0 0h36v20H0Zm18 0v10M0 10h36" fill="#9b9e86" stroke="#707e6e" strokeWidth="2" /></pattern>
      </defs>
      <path fill="#436951" d="M0 0h1000v760H0z" />
      <path fill="#658759" d="m0 43 240-40 304 28 456-8v704l-242 33H0Z" />
      <path fill="#82945f" stroke="#425f48" strokeWidth="18" d="m91 60 810 0 32 628-843 0Z" />
      <path fill="url(#castle-grass)" d="M0 0h1000v760H0z" />
      <path d="M500 110v650M177 240q320 120 648 0M165 407h670M205 593q288-110 585 0" fill="none" stroke="#586d46" strokeWidth="40" opacity=".35" />
      <path d="M500 110v650M177 240q320 120 648 0M165 407h670M205 593q288-110 585 0" fill="none" stroke="#c4b88b" strokeWidth="27" />
      <ellipse cx="500" cy="387" rx="138" ry="66" fill="#aeaa84" stroke="#d2c49a" strokeWidth="6" />
      <path d="M85 690V80h830v610H570v-27h315V110H115v553h315v27Z" fill="url(#castle-stone)" stroke="#546c5b" strokeWidth="5" />
      {[85, 885].flatMap(x => [62, 640].map(y => <g key={`${x}-${y}`}><rect x={x - 15} y={y} width="60" height="64" rx="5" fill="url(#castle-stone)" stroke="#526859" strokeWidth="4" /><path d={`M${x - 15} ${y}v-12h12v12h12v-12h12v12h12v-12h12v12`} fill="#c0bea0" stroke="#697967" strokeWidth="3" /></g>))}
      <path d="M430 690v-45h-21v-18h19v8h14v-8h18v63m110 0v-45h21v-18h-19v8h-14v-8h-18v63" fill="url(#castle-stone)" stroke="#546c5b" strokeWidth="4" />
      {[[36,120],[952,170],[38,490],[967,560],[60,730],[922,736],[30,40],[965,42]].map(([x,y],i) => <g key={i} transform={`translate(${x} ${y})`}><ellipse cy="15" rx="27" ry="12" fill="#304e3f" opacity=".4" /><path d="M-4 0h8v22h-8Z" fill="#67563c" /><path d="M0-47 26-8H15L32 9H-32l17-17h-11Z" fill={i % 2 ? '#345e4a' : '#3e7250'} stroke="#365b46" strokeWidth="3" /></g>)}
    </svg>
    <span className="castle-map-caption">THE KEEP OF CURIOSITY</span>
    <button type="button" id="kingdom-castle" aria-label={`Your Keep · Level ${state.castle}`} aria-pressed={selected === 'castle'} aria-controls="castle-building-details" className="castle-plot castle-keep" style={{ left: '50%', top: '47%' }} onFocus={() => onSelect('castle')} onClick={() => { onSelect('castle'); onInspect(); }}>
      <KeepVisual level={state.castle} />
      <span className="castle-plot-label"><strong>Your Keep</strong><span>Level {state.castle}</span></span>
      {upgradeStatus(state, { type: 'castle' }).ready && <span className="castle-ready" aria-label="Upgrade available"><Sparkles size={13} /></span>}
    </button>
    {BUILDING_DEFINITIONS.map(spec => {
      const level = state.buildings[spec.id];
      const locked = state.castle < spec.unlock;
      const planned = spec.mode === 'future';
      const ready = upgradeStatus(state, { type: 'building', id: spec.id }).ready;
      const status = planned ? 'Coming soon' : level ? `Level ${level}` : locked ? `Keep ${spec.unlock} required` : spec.mode === 'knowledge' ? 'Earn by learning' : 'Empty plot';
      const Marker = planned || locked ? LockKeyhole : spec.mode === 'knowledge' ? BookOpen : Hammer;
      return <button type="button" key={spec.id} id={`kingdom-building-${spec.id}`} className={`castle-plot ${level ? 'castle-plot-built' : 'castle-plot-empty'}`} style={{ left: `${plots[spec.id].x}%`, top: `${plots[spec.id].y}%` }} aria-label={`${spec.name} · ${status}`} aria-pressed={selected === spec.id} aria-controls="castle-building-details" onFocus={() => onSelect(spec.id)} onClick={() => { onSelect(spec.id); onInspect(); }}>
        <span className="castle-plot-foundation" /><BuildingVisual id={spec.id} ghost={!level} />
        {!level && <span className={`castle-plot-marker ${locked || planned ? 'castle-plot-locked' : ''}`}><Marker size={18} /></span>}
        <span className="castle-plot-label"><strong>{spec.name}</strong><span>{status}</span></span>
        {ready && <span className="castle-ready" aria-label={level ? 'Upgrade available' : 'Build available'}><Sparkles size={13} /></span>}
      </button>;
    })}
    <span className="castle-map-hint">Select a building or an empty plot</span>
  </div>;
}
