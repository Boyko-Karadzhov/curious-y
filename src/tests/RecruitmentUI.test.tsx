import {useState} from 'react';
import {act,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {describe,it,expect,vi} from 'vitest';
import {UnitRoster} from '../components/kingdom/UnitRoster';
import {RecruitmentPanel} from '../components/kingdom/RecruitmentPanel';
import {newKingdom,applyAction,type Kingdom,type Action} from '../lib/kingdom/game';
function Harness({initial}:{initial:Kingdom}) {
  const [state,setState]=useState(initial),[blocked,setBlocked]=useState(false);
  const perform=async(action:Action)=>{setBlocked(true);try{const next=applyAction(state,action,{requestId:crypto.randomUUID(),draws:[.5,.5,.5]});setState(next);window.dispatchEvent(new CustomEvent('curious-y-roster-result',{detail:next.lastResult}));return true;}finally{setBlocked(false);}};
  return <><RecruitmentPanel state={state} id="barracks" blocked={blocked} perform={perform} onLearn={()=>{}}/><UnitRoster state={state}/><output data-testid="state">{JSON.stringify(state)}</output></>;
}
describe('Recruitment and merge interface',()=>{
  it('recruits and shows the automatic merge at the building with a read-only collection',async()=>{
    const s=newKingdom();s.buildings.barracks=1;s.tokens.Physics=30;render(<Harness initial={s}/>);
    fireEvent.click(screen.getByRole('button',{name:'Recruit · 15 Force'}));await screen.findAllByText('New discovery!');
    expect(Object.keys(JSON.parse(screen.getByTestId('state').textContent!).units)).toHaveLength(1);
    expect(screen.getByLabelText('Recruitment merge result')).toHaveTextContent('Merged into Militia');
    expect(screen.getByLabelText('Recruitment merge result')).toHaveTextContent('+20 XP · Level 1 → 2');
    expect(screen.getByLabelText('Merge stat gains')).toHaveTextContent('HP65 → 78 (+13)');
    expect(screen.getByLabelText('Merge stat gains')).toHaveTextContent('Damage/sec20 → 23.35 (+3.35)');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:/merge|equip|lock|donor/i})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Recruit · 15 Force'}));
    await waitFor(()=>expect(screen.getByLabelText('Recruitment merge result')).toHaveTextContent('+30 XP · Level 2 → 3'));
    expect(Object.keys(JSON.parse(screen.getByTestId('state').textContent!).units)).toHaveLength(1);
    expect(screen.getByLabelText('Merge stat gains')).toHaveTextContent('HP78 → 91 (+13)');
  });
  it('shows healing gains with passive bonuses and hides gains for XP-only merges',()=>{
    const s=newKingdom();s.castle=5;s.buildings.academy=1;s.buildings.library=10;s.tokens.Life=60;
    s.towers.points.essence=1000000;
    render(<RecruitmentPanel state={s} id="academy" blocked={false} perform={async()=>true} onLearn={()=>{}}/>);
    let next=s;
    for(let n=1;n<=3;n++) {
      next=applyAction(next,{type:'recruit',id:'academy'},{requestId:`healer-${n}`,draws:[.5,.5,.5]});
      act(()=>window.dispatchEvent(new CustomEvent('curious-y-roster-result',{detail:next.lastResult})));
      if(n===1) {
        expect(screen.getByLabelText('Merge stat gains')).toHaveTextContent('HP33.16 → 40.2 (+7.04)');
        expect(screen.getByLabelText('Merge stat gains')).toHaveTextContent('Healing/sec15.06 → 18.07 (+3.01)');
        expect(screen.getByLabelText('Merge stat gains')).toHaveTextContent('Healing budget24.1 → 28.92 (+4.82)');
        expect(screen.getByLabelText('Merge stat gains')).not.toHaveTextContent('Damage/sec');
      }
    }
    expect(screen.getByLabelText('Recruitment merge result')).toHaveTextContent('+30 XP · Level 3 → 3');
    expect(screen.queryByLabelText('Merge stat gains')).not.toBeInTheDocument();
  });
  it('shows actual deficits, prevents duplicate pending commands, and has no reveal for failure or reload',async()=>{
    const s=newKingdom();s.buildings.barracks=1;s.tokens.Physics=5;const learn=vi.fn();let finish!:(ok:boolean)=>void;const perform=vi.fn(()=>new Promise<boolean>(resolve=>finish=resolve));
    const view=render(<RecruitmentPanel state={s} id="barracks" blocked={false} perform={perform} onLearn={learn}/>);
    expect(screen.getByText('Need 10 Force more.')).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Learn for recruitment'}));expect(learn).toHaveBeenCalledWith('Physics');
    s.tokens.Physics=15;view.rerender(<RecruitmentPanel state={s} id="barracks" blocked={false} perform={perform} onLearn={learn}/>);const button=screen.getByRole('button',{name:'Recruit · 15 Force'});fireEvent.click(button);fireEvent.click(button);expect(perform).toHaveBeenCalledOnce();await act(async()=>finish(false));expect(screen.queryByText('New discovery!')).not.toBeInTheDocument();
    const saved=applyAction(s,{type:'recruit',id:'barracks'},{requestId:'saved',draws:[.5,.5,.5]});view.rerender(<RecruitmentPanel state={saved} id="barracks" blocked={false} perform={perform} onLearn={learn}/>);expect(screen.queryByText('New discovery!')).not.toBeInTheDocument();
  });
  it('shows a higher-tier merge at the building and keeps its equipped slot',async()=>{
    const s=newKingdom();s.buildings.barracks=50;s.recruitCount.barracks=490;s.tokens.Physics=15;
    s.discovered=['militia'];s.units.veteran={unitId:'militia',investedXP:540,locked:false};s.armySlots[2]='veteran';
    const started=applyAction(s,{type:'start',stage:1});render(<Harness initial={started}/>);
    fireEvent.click(screen.getByRole('button',{name:'Recruit · 15 Force'}));
    await waitFor(()=>expect(screen.getByLabelText('Recruitment merge result')).toHaveTextContent('Merged into Swordsman'));
    expect(screen.getByLabelText('Merge stat gains')).toHaveTextContent('HP585 → 819 (+234)');
    const saved=JSON.parse(screen.getByTestId('state').textContent!);
    expect(Object.values(saved.units)).toEqual([{unitId:'swordsman',investedXP:730,locked:false}]);
    expect(saved.units[saved.armySlots[2]].unitId).toBe('swordsman');expect(saved.battle.config).toEqual(started.battle!.config);
    expect(screen.getByRole('button',{name:'Militia Tier 1 · Discovered'})).toBeInTheDocument();
  });
});
