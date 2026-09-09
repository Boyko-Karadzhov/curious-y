import {useState} from 'react';
import {render,screen,fireEvent,waitFor,within} from '@testing-library/react';
import {describe,it,expect,vi} from 'vitest';
import {ForgePanel} from '../components/kingdom/ForgePanel';
import {newKingdom,applyAction,TOPICS,type Action,type Kingdom} from '../lib/kingdom/game';
const ready=()=>{
    const s=newKingdom();s.castle=4;s.buildings.forge=1;for(const t of TOPICS){
        s.tokens[t]=20;
    }return s;
};
describe('Forge workshop',()=>{
    it('forges, compares and equips replacements with explicit automatic sale',async()=>{
        let n=0;
        function Workshop(){
            const [state,setState]=useState(ready());return <ForgePanel state={state} blocked={false} perform={async(action:Action)=>{
                setState(s=>applyAction(s,action,{requestId:`item-${++n}`,draws:[0,0,.99,0,0,.99]}));return true;
            }}/>;
        }
        render(<Workshop/>);expect(screen.getAllByText('Empty',{exact:true})).toHaveLength(15);
        fireEvent.click(screen.getByRole('button',{name:/Forge · 8/}));await screen.findByText('Just forged');expect(screen.getByRole('button',{name:/Forge · 8/})).toBeDisabled();fireEvent.click(screen.getByRole('button',{name:'Equip item'}));await waitFor(()=>expect(screen.queryByText('Just forged')).not.toBeInTheDocument());
        expect(within(screen.getByRole('region',{name:'Melee equipment'})).getByText('Tier 1')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button',{name:/Forge · 8/}));const replace=await screen.findByRole('button',{name:'Equip & sell old · +8 Gold'});fireEvent.click(replace);await screen.findByText('8 Gold',{exact:true});
    });
    it('shows durable pending decisions on reload, serializes clicks and leaves failures reviewable',async()=>{
        const pending=applyAction(ready(),{type:'forge'},{requestId:'saved',draws:[0,0,.99,0,0,.5]});const perform=vi.fn(async()=>false);
        render(<ForgePanel state={pending} blocked={false} perform={perform}/>);const sell=screen.getByRole('button',{name:'Sell new · +8 Gold'});fireEvent.click(sell);fireEvent.click(sell);expect(perform).toHaveBeenCalledTimes(1);await screen.findByRole('alert');expect(screen.getByText('Just forged')).toBeInTheDocument();expect(perform).toHaveBeenCalledWith({type:'resolve-forge',itemId:'saved',choice:'sell'});
    });
    it('routes missing resources to learning and distinguishes Siege slots',()=>{
        const s:Kingdom=ready();s.tokens.Chemistry=1;const learn=vi.fn();render(<ForgePanel state={s} blocked={false} perform={vi.fn()} onLearn={learn}/>);expect(screen.getByRole('button',{name:/Forge · 8/})).toBeDisabled();fireEvent.click(screen.getByTitle('Learn Chemistry'));expect(learn).toHaveBeenCalledWith('Chemistry');const siege=screen.getByRole('region',{name:'Siege equipment'});expect(within(siege).getByText('Ammunition')).toBeInTheDocument();expect(within(siege).getByText('Doctrine')).toBeInTheDocument();
    });
});
