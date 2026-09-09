import {useState} from 'react';
import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {describe,it,expect,vi} from 'vitest';
import {UnitRoster} from '../components/kingdom/UnitRoster';
import {RecruitmentPanel} from '../components/kingdom/RecruitmentPanel';
import {newKingdom,applyAction,type Kingdom,type Action} from '../lib/kingdom/game';
function Harness({initial}:{initial:Kingdom}) {
    const [state,setState]=useState(initial);
    const perform=async(action:Action)=>{
        const next=applyAction(state,action,{requestId:crypto.randomUUID(),draws:[.5,.5,.5,0,0,0]});setState(next);if(action.type==='recruit'){
            window.dispatchEvent(new CustomEvent('curious-y-roster-result',{detail:next.lastResult}));
        }

        return true;
    };

    return <><RecruitmentPanel state={state} id="barracks" blocked={false} perform={perform} onLearn={()=>{}}/><UnitRoster state={state} perform={perform}/><output data-testid="state">{JSON.stringify(state)}</output></>;
}

describe('Recruitment and deliberate merge interface',()=>{
    it('reveals three independent copies, keeps duplicates and merges only selected donors',async()=>{
        const s=newKingdom();s.buildings.barracks=1;s.tokens.Life=s.tokens['Earth & Space']=30;render(<Harness initial={s}/>);
        const recruit=()=>fireEvent.click(screen.getByRole('button',{name:/^Recruit ·/}));recruit();await screen.findAllByText('New discovery!');recruit();
        await waitFor(()=>expect(Object.keys(JSON.parse(screen.getByTestId('state').textContent!).units)).toHaveLength(6));
        fireEvent.click(within(screen.getByRole('group',{name:'Owned copies'})).getByRole('button',{name:/Militia · #1/}));
        const donors=screen.getAllByRole('checkbox');expect(donors).toHaveLength(3);fireEvent.click(donors[0]);fireEvent.click(donors[1]);
        fireEvent.click(screen.getByRole('button',{name:'Consume 2 selected copies & merge'}));
        await waitFor(()=>expect(Object.keys(JSON.parse(screen.getByTestId('state').textContent!).units)).toHaveLength(4));expect(screen.getByRole('region',{name:'Merge copies'})).toHaveTextContent('Level 2');
    });
    it('routes deficits, prevents double submission and does not replay a saved reveal',async()=>{
        const s=newKingdom();s.buildings.barracks=1;s.tokens.Life=5;s.tokens['Earth & Space']=8;const learn=vi.fn();let finish!:(ok:boolean)=>void;const perform=vi.fn(()=>new Promise<boolean>(r=>finish=r));
        const view=render(<RecruitmentPanel state={s} id="barracks" blocked={false} perform={perform} onLearn={learn}/>);
        expect(screen.getByText('Need 3 Essence more.')).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Learn Earth & Life for recruitment'}));expect(learn).toHaveBeenCalledWith('Life');
        s.tokens.Life=8;view.rerender(<RecruitmentPanel state={s} id="barracks" blocked={false} perform={perform} onLearn={learn}/>);const button=screen.getByRole('button',{name:/^Recruit ·/});fireEvent.click(button);fireEvent.click(button);expect(perform).toHaveBeenCalledOnce();await act(async()=>finish(false));
        const saved=applyAction(s,{type:'recruit',id:'barracks'},{requestId:'saved',draws:[.5,.5,.5,0,0,0]});view.rerender(<RecruitmentPanel state={saved} id="barracks" blocked={false} perform={perform} onLearn={learn}/>);expect(screen.queryByText('New discovery!')).not.toBeInTheDocument();
    });
    it('excludes equipped and protected donors from merge selection',()=>{
        const s=newKingdom();s.buildings.barracks=1;for(let i=0;i<4;i++){
            s.units['copy'+i]={unitId:'militia',investedXP:0,locked:i===2};
        }

        s.armySlots[0]='copy1';
        render(<UnitRoster state={s} perform={vi.fn()}/>);fireEvent.click(screen.getByRole('button',{name:/Militia · #1/}));expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    });
});
