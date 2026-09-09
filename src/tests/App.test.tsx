import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import App from '../App';
import { AuthProvider } from '../context/AuthContext';
import { SettingsProvider } from '../context/SettingsContext';
import { demoJourneyView } from '../lib/kingdom/demoLearning';

const mount = () => render(<AuthProvider><SettingsProvider><App /></SettingsProvider></AuthProvider>);
const enter = async () => {
    fireEvent.click(await screen.findByText(/Try Explorer Demo/i)); fireEvent.click(await screen.findByRole('button', {name:'Learn'})); await screen.findByRole('button', {name:'Choose topic Life'}); 
};

const start = async () => fireEvent.click(await screen.findByRole('button', {name:'Choose topic Life'}));
const collect = async () => {
    fireEvent.click(await screen.findByRole('button', {name:'Collect'}));
    expect(await screen.findByRole('button', {name:'Next Question'})).toBeEnabled();
    expect(screen.queryByRole('button', {name:'Collect'})).not.toBeInTheDocument();
};

const graph = async () => {
    fireEvent.click(screen.getByRole('button', {name:'Knowledge'})); await screen.findByRole('heading', {name:'Your knowledge graph'}); 
};

describe('Learning and global knowledge integration', () => {
    beforeEach(() => {
        localStorage.clear(); vi.spyOn(Math, 'random').mockReturnValue(0); 
    });
    afterEach(() => vi.mocked(Math.random).mockRestore());
    it('offers login and Explorer Demo', async () => {
        mount(); expect(await screen.findByText(/Welcome to Curious-Y/i)).toBeInTheDocument(); expect(screen.getByText(/Continue with Google/i)).toBeInTheDocument(); 
    });
    it('keeps Battle and Castle separate and opens a topic picker in Learn', async () => {
        mount(); fireEvent.click(await screen.findByText(/Try Explorer Demo/i));
        expect(await screen.findByRole('region', {name:'Battle'})).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', {name:'Castle · Level 1'})); expect(screen.getByLabelText('Castle management')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', {name:'Learn'}));
        await screen.findByRole('button', {name:'Select random topic'});
        expect(screen.queryByRole('region', {name:'Battle'})).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Zoom level')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Life mastery')).not.toBeInTheDocument();
        expect(within(screen.getByRole('region', { name: 'Learn' })).queryByRole('progressbar')).not.toBeInTheDocument();
        expect(screen.queryByText(/How does your body keep its cells supplied/)).not.toBeInTheDocument();
    });
    it('records a provisional insight, updates concept mastery and restores knowledge on reload', async () => {
        let app=mount(); await enter(); await start();
        await screen.findByText('What do you think? Make a choice, then explore the explanation.');
        expect(screen.queryByText('Added to your knowledge base')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', {name:/Food supplies energy and building materials/}));
        await screen.findByText('Added to your knowledge base'); await collect();
        fireEvent.click(screen.getByRole('button', {name:'Change Topic'}));
        await screen.findByRole('button', { name: 'Choose topic Life' });
        expect(within(screen.getByRole('region', { name: 'Learn' })).queryByRole('progressbar')).not.toBeInTheDocument();
        expect(demoJourneyView('demo-user-curious-y','Life').nodes[0].progress.intuition?.successes).toBe(1);
        app.unmount(); app=mount(); await graph();
        fireEvent.click(await screen.findByRole('button', {name:/Food as fuel, exploring/i}));
        expect(screen.getByRole('progressbar', { name: 'Food as fuel mastery' })).toHaveAttribute('value', '5');
        expect(screen.getByText('5% toward mastery', { selector: 'strong' })).toBeInTheDocument();
        expect(screen.queryByText('Your saved insights')).not.toBeInTheDocument();
        expect(screen.getByRole('navigation', { name: 'Dimensions of understanding' })).toBeInTheDocument();
        expect(screen.getByText('1 / 7 collected')).toBeInTheDocument();
        app.unmount();
    });
    it('keeps a missed dimension unearned and draws a fresh question on Next', async () => {
        mount(); await enter(); await start();
        await screen.findByRole('heading', {name:/You have not eaten since breakfast/});
        fireEvent.click(screen.getByRole('button', {name:/Food replaces the need for air/}));
        await screen.findByText('A useful thing to question.'); expect(screen.queryByText('Added to your knowledge base')).not.toBeInTheDocument();
        await collect(); fireEvent.click(screen.getByRole('button', {name:'Next Question'}));
        await screen.findByRole('heading', {name:/A child says food only fills the stomach/});
        const view=demoJourneyView('demo-user-curious-y','Life'); expect(view.nodes[0].progress.intuition?.successes).toBe(0); expect(view.nodes[0].progress.intuition?.entry).toBeUndefined();
    });
    it('shows topics together and topic practice does not filter the graph', async () => {
        mount(); await enter(); await graph();
        expect(await screen.findByRole('button', {name:/Describing motion, ready to explore/i})).toBeInTheDocument();
        expect(screen.getByRole('button', {name:/Food as fuel, ready to explore/i})).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('Practice topic'), {target:{value:'Physics'}});
        expect(screen.getByRole('option', { name: 'Physics' })).toBeInTheDocument();
        expect(screen.getByRole('button', {name:/Food as fuel, ready to explore/i})).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', {name:'Practice topic'}));
        await screen.findByText('What do you think? Make a choice, then explore the explanation.');
    });
    it('offers global list search and graph zoom controls', async () => {
        mount(); await enter(); await graph();
        await screen.findByLabelText('Zoom level');
        const before=screen.getByLabelText('Zoom level').textContent; fireEvent.click(screen.getByRole('button',{name:'Zoom in'})); expect(screen.getByLabelText('Zoom level').textContent).not.toBe(before);
        fireEvent.click(screen.getByRole('button',{name:'List view'}));
        const list=screen.getByLabelText('Revealed concepts'); expect(within(list).getAllByRole('button').length).toBeGreaterThan(2);
        fireEvent.change(screen.getByLabelText('Search revealed concepts'),{target:{value:'Cells'}}); expect(within(list).getAllByRole('button')).toHaveLength(1);
    });
});
