import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import App from '../App';
import { AuthProvider } from '../context/AuthContext';
import { SettingsProvider } from '../context/SettingsContext';
import { demoJourneyView } from '../lib/kingdom/demoLearning';

const mount = () => render(<AuthProvider><SettingsProvider><App /></SettingsProvider></AuthProvider>);
const enter = async () => { fireEvent.click(await screen.findByText(/Try Explorer Demo/i)); fireEvent.click(await screen.findByRole('button', {name:'Learn'})); await screen.findByRole('heading', {name:'The living world'}); };
const start = async () => fireEvent.click(await screen.findByRole('button', {name:'Make your first guess'}));
const collect = async () => { fireEvent.click(await screen.findByRole('button', {name:'Collect'})); await screen.findByText(/Resources collected!/); };

describe('Discovery journey integration', () => {
  beforeEach(() => localStorage.clear());
  it('offers login and Explorer Demo', async () => { mount(); expect(await screen.findByText(/Welcome to Curious-Y/i)).toBeInTheDocument(); expect(screen.getByText(/Continue with Google/i)).toBeInTheDocument(); });
  it('keeps Battle and Castle separate, and opens the saved concept map in Learn', async () => {
    mount(); fireEvent.click(await screen.findByText(/Try Explorer Demo/i));
    expect(await screen.findByRole('region', {name:'Battle'})).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name:'Castle · Level 1'})); expect(screen.getByLabelText('Castle management')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name:'Learn'}));
    await screen.findByRole('heading', {name:'The living world'});
    expect(screen.queryByRole('region', {name:'Battle'})).not.toBeInTheDocument();
    expect(screen.getByRole('button', {name:/Food as fuel, ready to explore/i})).toBeInTheDocument();
    expect(screen.queryByText(/How does your body keep its cells supplied/)).not.toBeInTheDocument();
    expect(screen.queryByText('Saving fuel for later')).not.toBeInTheDocument();
    expect(screen.queryByText(/Select the most accurate reason/)).not.toBeInTheDocument();
  });
  it('starts with an accessible guess, then adds a provisional knowledge entry and restores it on reload', async () => {
    let app=mount(); await enter(); await start();
    await screen.findByText('What do you think? Make a choice, then explore the explanation.');
    expect(screen.queryByText('Added to your knowledge base')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name:/Food supplies energy and building materials/}));
    await screen.findByText('Added to your knowledge base'); await collect();
    fireEvent.click(screen.getAllByRole('button', {name:'Back to map'})[0]);
    await screen.findByText('First insight · provisional');
    expect(demoJourneyView('demo-user-curious-y','Life').nodes[0].progress.intuition?.successes).toBe(1);
    app.unmount(); app=mount(); fireEvent.click(await screen.findByRole('button', {name:'Learn'}));
    expect(await screen.findByText('First insight · provisional')).toBeInTheDocument();
    app.unmount();
  });
  it('follows a miss with a fresh example of the same dimension and no invented knowledge', async () => {
    mount(); await enter(); await start();
    const first=await screen.findByRole('heading', {name:/You have not eaten since breakfast/}); const text=first.textContent;
    fireEvent.click(screen.getByRole('button', {name:/Food replaces the need for air/}));
    await screen.findByText('A useful thing to question.'); expect(screen.queryByText('Added to your knowledge base')).not.toBeInTheDocument();
    await collect(); fireEvent.click(screen.getByRole('button', {name:'Try another angle'}));
    await screen.findByRole('heading', {name:/A child says food only fills the stomach/});
    expect(screen.queryByText(text!)).not.toBeInTheDocument();
    const view=demoJourneyView('demo-user-curious-y','Life'); expect(view.nodes[0].progress.intuition?.successes).toBe(0); expect(view.nodes[0].progress.intuition?.entry).toBeUndefined();
  });
  it('switches worlds without generating a random question', async () => {
    mount(); await enter(); fireEvent.change(screen.getByLabelText('Journey topic'), {target:{value:'Physics'}});
    await screen.findByRole('heading', {name:'Making sense of motion'});
    expect(screen.getByRole('button', {name:/Describing motion, ready to explore/i})).toBeInTheDocument();
    expect(screen.queryByText('What do you think? Make a choice, then explore the explanation.')).not.toBeInTheDocument();
  });
  it('offers list navigation, filters, search, and graph zoom controls', async () => {
    mount(); await enter();
    const before=screen.getByLabelText('Zoom level').textContent; fireEvent.click(screen.getByRole('button',{name:'Zoom in'})); expect(screen.getByLabelText('Zoom level').textContent).not.toBe(before);
    fireEvent.click(screen.getByRole('button',{name:'List view'}));
    const list=screen.getByLabelText('Revealed concepts'); expect(within(list).getAllByRole('button')).toHaveLength(2);
    fireEvent.change(screen.getByLabelText('Search revealed concepts'),{target:{value:'Cells'}}); expect(within(list).getAllByRole('button')).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('Filter concepts'),{target:{value:'review'}}); expect(screen.getByText('Let these ideas settle.')).toBeInTheDocument();
  });
});
