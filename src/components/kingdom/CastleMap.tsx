import { BookOpen, Hammer, LockKeyhole } from 'lucide-react';
import { BUILDING_DEFINITIONS, BuildingId, Kingdom } from '../../lib/kingdom/game';
import { availableCastleAction } from '../../lib/kingdom/availability';
import { AvailableActionIndicator } from './AvailableActionIndicator';
import { KeepVisual } from './KeepVisual';
import './castle-map.css';
import { buildingArt } from '../../lib/kingdom/buildingArt';

export type CastleSelection = 'castle' | BuildingId;
const plots: Record<BuildingId, { x: number; y: number; color: string }> = {
    library: { x: 19, y: 24, color: '#7b70bb' }, treasury: { x: 50, y: 19, color: '#c49743' },
    academy: { x: 81, y: 24, color: '#4e998c' }, barracks: { x: 18, y: 49, color: '#537da8' },
    range: { x: 82, y: 49, color: '#63854c' }, stable: { x: 22, y: 76, color: '#a36d45' },
    workshop: { x: 50, y: 80, color: '#7b8197' }, forge: { x: 78, y: 76, color: '#b2604b' },
};

/** The same approved building image serves the map and detail panel. */
export function BuildingVisual({ id, ghost = false }: { id: BuildingId; ghost?: boolean }) {
    return <img src={buildingArt(id)} alt="" aria-hidden="true" width="512" height="512" className={`castle-building-art object-contain ${ghost ? 'castle-building-ghost' : ''}`} />;
}

export function CastleMap({ state, selected, onSelect, onInspect, unavailable = false }: {
  state: Kingdom; unavailable?: boolean; selected: CastleSelection; onSelect: (id: CastleSelection) => void; onInspect: () => void;
}) {
    const keepAction = !unavailable ? availableCastleAction(state, 'castle') : null;
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
        <button type="button" id="kingdom-castle" aria-description={keepAction ?? undefined} aria-label={`Your Keep · Level ${state.castle}`} aria-pressed={selected === 'castle'} aria-controls="castle-building-details" className="castle-plot castle-keep" style={{ left: '50%', top: '47%' }} onFocus={() => onSelect('castle')} onClick={() => {
            onSelect('castle'); onInspect(); 
        }}>
            <KeepVisual level={state.castle} />
            <span className="castle-plot-label"><strong>Your Keep</strong><span>Level {state.castle}</span></span>
            {keepAction && <AvailableActionIndicator className="castle-ready" label={keepAction} />}
        </button>
        {BUILDING_DEFINITIONS.map(spec => {
            const level = state.buildings[spec.id];
            const locked = state.castle < spec.unlock;
            const planned = spec.mode === 'future';
            const availableAction = !unavailable ? availableCastleAction(state, spec.id) : null;
            const status = planned ? 'Coming soon' : level ? `Level ${level}` : locked ? `Keep ${spec.unlock} required` : spec.mode === 'knowledge' ? 'Earn by learning' : 'Empty plot';
            const Marker = planned || locked ? LockKeyhole : spec.mode === 'knowledge' ? BookOpen : Hammer;
            return <button type="button" key={spec.id} id={`kingdom-building-${spec.id}`} className={`castle-plot ${level ? 'castle-plot-built' : 'castle-plot-empty'}`} style={{ left: `${plots[spec.id].x}%`, top: `${plots[spec.id].y}%` }} aria-description={availableAction ?? undefined} aria-label={`${spec.name} · ${status}`} aria-pressed={selected === spec.id} aria-controls="castle-building-details" onFocus={() => onSelect(spec.id)} onClick={() => {
                onSelect(spec.id); onInspect(); 
            }}>
                <span className="castle-plot-foundation" /><BuildingVisual id={spec.id} ghost={!level} />
                {!level && <span className={`castle-plot-marker ${locked || planned ? 'castle-plot-locked' : ''}`}><Marker size={18} /></span>}
                <span className="castle-plot-label"><strong>{spec.name}</strong><span>{status}</span></span>
                {availableAction && <AvailableActionIndicator className="castle-ready" label={availableAction} />}
            </button>;
        })}
        <span className="castle-map-hint">Select a building or an empty plot</span>
    </div>;
}
