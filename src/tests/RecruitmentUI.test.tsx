import {useState} from 'react';
import {act,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {describe,it,expect,vi} from 'vitest';
import {UnitRoster} from '../components/kingdom/UnitRoster';
import {RecruitmentPanel} from '../components/kingdom/RecruitmentPanel';
import {newKingdom,applyAction,type Kingdom,type Action} from '../lib/kingdom/game';
function Harness({initial}:{initial:Kingdom}) {
  const [state,setState]=useState(initial),[blocked,setBlocked]=useState(false);
  const perform=async(action:Action)=>{setBlocked(true);try{const next=applyAction(state,action,{requestId:crypto.randomUUID(),draws:[.5,.5,.5]});setState(next);window.dispatchEvent(new CustomEvent('curious-y-roster-result',{detail:next.lastResult}));return true;}finally{setBlocked(false);}};
  return <><RecruitmentPanel state={state} id="barracks" blocked={blocked} perform={perform} onLearn={()=>{}}/><UnitRoster state={state} blocked={blocked} perform={perform}/><output data-testid="state">{JSON.stringify(state)}</output></>;
}
describe('Recruitment and merge interface',()=>{
  it('previews a manual merge, shows committed multi-level results, and never consumes on selection',async()=>{
    const s=newKingdom();s.buildings.barracks=1;s.tokens.Physics=15;render(<Harness initial={s}/>);
    fireEvent.click(screen.getByRole('button',{name:'Recruit · 15 Force'}));await screen.findAllByText('New discovery!');
    fireEvent.click(screen.getByRole('button',{name:'Merge spare recruits'}));expect(JSON.parse(screen.getByTestId('state').textContent!).units).toSatisfy((r:object)=>Object.keys(r).length===3);
    expect(screen.getByLabelText('Merge preview')).toHaveTextContent('+20 XP · Level 1 → 2');fireEvent.click(screen.getByRole('button',{name:'Merge'}));
    await waitFor(()=>expect(Object.keys(JSON.parse(screen.getByTestId('state').textContent!).units)).toHaveLength(1));
    expect(screen.getByText('+20 XP · Level 1 → 2 · +1 level')).toBeInTheDocument();
  });
  it('transfers an equipped veteran only via a deliberate replacement preview',async()=>{
    const s=newKingdom();s.buildings.barracks=1;s.units={veteran:{unitId:'militia',investedXP:540,locked:false},spearman:{unitId:'spearman',investedXP:0,locked:false}};s.armySlots[2]='veteran';render(<Harness initial={s}/>);
    fireEvent.click(screen.getByRole('button',{name:'Spearman Tier 2 · ×1'}));expect(screen.getByRole('button',{name:'Merge spare recruits'})).toBeDisabled();
    fireEvent.click(screen.getByRole('button',{name:'Choose donors / transfer veteran'}));fireEvent.click(screen.getByRole('checkbox',{name:/Militia · Level 10/}));fireEvent.click(screen.getByRole('button',{name:'Preview selected merge'}));
    expect(screen.getByLabelText('Merge preview')).toHaveTextContent('slot 3');expect(screen.getByLabelText('Merge preview')).toHaveTextContent('+550 XP · Level 1 → 5');
    fireEvent.click(screen.getByRole('button',{name:'Merge and replace'}));await waitFor(()=>expect(JSON.parse(screen.getByTestId('state').textContent!).armySlots[2]).toBe('spearman'));
    expect(screen.getByText('+550 XP · Level 1 → 5 · +4 levels')).toBeInTheDocument();
  });
  it('shows actual deficits, prevents duplicate pending commands, and has no reveal for failure or reload',async()=>{
    const s=newKingdom();s.buildings.barracks=1;s.tokens.Physics=5;const learn=vi.fn();let finish!:(ok:boolean)=>void;const perform=vi.fn(()=>new Promise<boolean>(resolve=>finish=resolve));
    const view=render(<RecruitmentPanel state={s} id="barracks" blocked={false} perform={perform} onLearn={learn}/>);
    expect(screen.getByText('Need 10 Force more.')).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Learn for recruitment'}));expect(learn).toHaveBeenCalledWith('Physics');
    s.tokens.Physics=15;view.rerender(<RecruitmentPanel state={s} id="barracks" blocked={false} perform={perform} onLearn={learn}/>);const button=screen.getByRole('button',{name:'Recruit · 15 Force'});fireEvent.click(button);fireEvent.click(button);expect(perform).toHaveBeenCalledOnce();await act(async()=>finish(false));expect(screen.queryByText('New discovery!')).not.toBeInTheDocument();
    const saved=applyAction(s,{type:'recruit',id:'barracks'},{requestId:'saved',draws:[.5,.5,.5]});view.rerender(<RecruitmentPanel state={saved} id="barracks" blocked={false} perform={perform} onLearn={learn}/>);expect(screen.queryByText('New discovery!')).not.toBeInTheDocument();
  });
});
