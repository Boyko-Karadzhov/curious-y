import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { AuthProvider } from '../context/AuthContext';
import { SettingsProvider } from '../context/SettingsContext';
import { loadKingdom } from '../lib/kingdom/storage';
import { applyAction, newKingdom } from '../lib/kingdom/game';
import { goalStorageKey } from '../lib/kingdom/goals';
import { saveLocalConcepts } from '../services/database';
import { generateWhyQuestion } from '../lib/llm/factory';
import confetti from 'canvas-confetti';

vi.mock('../lib/llm/factory', async importOriginal => ({
  ...await importOriginal<typeof import('../lib/llm/factory')>(),
  generateWhyQuestion: vi.fn(async () => ({ topic: 'Physics', concept: 'Force', reasoningComplexity: 'directInference' as const, questionText: 'Why does a push accelerate an object?',
    options: ['A net force changes velocity', 'Mass disappears', 'Time stops', 'Gravity vanishes'], correctIndex: 0,
    explanation: 'A net force causes acceleration.' })),
}));

const userId = 'demo-user-curious-y';
function mount() {
  return render(<AuthProvider><SettingsProvider><App /></SettingsProvider></AuthProvider>);
}
async function answer(correct = true) {
  fireEvent.click(await screen.findByRole('button', { name: 'Learn' }));

  fireEvent.click(await screen.findByRole('button', { name: /Choose topic Physics/i }));
  fireEvent.click(await screen.findByRole('button', { name: correct ? /A net force changes velocity/ : /Mass disappears/ }));
  await screen.findByText(correct ? '+25 Resources ready to collect!' : '+4 Resources ready to collect!');
  fireEvent.click(screen.getByRole('button', { name: 'Collect' }));
  await screen.findByRole('button', { name: 'Next Question' });
}


function earthLifeConcept() {
 saveLocalConcepts(userId,[{canonicalName:'Force',definition:'Force',aliases:[],topics:{Life:.5,'Earth & Space':.5},prerequisites:[],mastery:'unseen',reasoningTrack:{directInference:0,composition:0,discrimination:0,transfer:0,counterfactual:0,synthesis:0,derivation:0}}]);
}
async function earthLifeAnswers() {
 await answer();
 fireEvent.click(screen.getByRole('button',{name:'Next Question'}));
 fireEvent.click(await screen.findByRole('button',{name:/A net force changes velocity/}));
 fireEvent.click(await screen.findByRole('button',{name:'Collect'}));
 await screen.findByRole('button',{name:'Next Question'});
}

describe('Playable Phase I journey', () => {
  it('guides earned Resources from Castle navigation through construction and recruitment, then clears the markers after spending', async () => {
    earthLifeConcept();
    mount();
    const navigation = within(await screen.findByRole('navigation', { name: 'Battle, Castle and Learn' }));
    expect(navigation.queryByTitle('Castle actions available')).not.toBeInTheDocument();
    await earthLifeAnswers();
    expect(navigation.getByTitle('Castle actions available')).toBeInTheDocument();
    fireEvent.click(navigation.getByRole('button', { name: 'Castle · Level 1' }));
    const plot = screen.getByRole('button', { name: 'Recruitment Hall · Empty plot' });
    expect(plot).toHaveAccessibleDescription('Build available');
    expect(within(plot).getByTitle('Build available')).toBeInTheDocument();
    fireEvent.click(plot);
    const build = screen.getByRole('button', { name: 'Build Recruitment Hall · 5 Essence · 5 Astral Dust' });
    expect(within(build).getByTitle('Build available')).toBeInTheDocument();
    fireEvent.click(build);
    const recruit = await screen.findByRole('button', { name: 'Recruit · 8 Essence · 8 Astral Dust' });
    expect(within(recruit).getByTitle('Recruitment available')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recruitment Hall · Level 1' })).toHaveAccessibleDescription('Recruitment available');
    expect(navigation.getByTitle('Castle actions available')).toBeInTheDocument();
    fireEvent.click(recruit);
    await waitFor(() => expect(loadKingdom(userId).recruitCount.barracks).toBe(1));
    fireEvent.click(recruit);
    await waitFor(() => expect(navigation.queryByTitle('Castle actions available')).not.toBeInTheDocument());
    expect(screen.queryByTitle('Recruitment available')).not.toBeInTheDocument();
    expect(recruit).toBeDisabled();
  });

  it('does not replay celebration when returning to Learn or restoring a pending reward', async () => {
    vi.mocked(confetti).mockClear();
    const app = mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Learn' }));
    fireEvent.click(await screen.findByRole('button', { name: /Choose topic Physics/i }));
    fireEvent.click(await screen.findByRole('button', { name: /A net force changes velocity/ }));
    await screen.findByRole('button', { name: 'Collect' });
    expect(confetti).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Battle' }));
    fireEvent.click(screen.getByRole('button', { name: 'Learn' }));
    expect(screen.getByRole('button', { name: 'Collect' })).toBeInTheDocument();
    expect(confetti).toHaveBeenCalledTimes(1);
    app.unmount();
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Learn' }));
    await screen.findByRole('button', { name: 'Collect' });
    expect(confetti).toHaveBeenCalledTimes(1);
  });

  it('replaces the answered question with the forge, restores on failure, and reveals a retried question', async () => {
    mount();
    await answer();
    let failGeneration!: (reason: Error) => void;
    vi.mocked(generateWhyQuestion).mockImplementationOnce(() => new Promise((_, reject) => { failGeneration = reject; }));
    fireEvent.click(screen.getByRole('button', { name: 'Next Question' }));
    expect(screen.getByRole('status', { name: 'Preparing your next question' })).toBeInTheDocument();
    expect(screen.queryByText('Why does a push accelerate an object?')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /A net force changes velocity/ })).not.toBeInTheDocument();
    expect(screen.queryByText('A net force causes acceleration.')).not.toBeInTheDocument();
    await waitFor(() => expect(failGeneration).toBeTypeOf('function'));
    await act(async () => failGeneration(new Error('Please try again.')));
    expect(await screen.findByText('Couldn’t load a question')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next Question' })).toBeInTheDocument();
    vi.mocked(generateWhyQuestion).mockResolvedValueOnce({ topic: 'Physics', questionText: 'Why is the sky blue?', options: ['Scattering', 'Water', 'Space', 'Clouds'], correctIndex: 0, explanation: 'Light scatters.' });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(screen.getByRole('status', { name: 'Preparing your next question' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Why is the sky blue?' })).toHaveFocus();
    expect(screen.queryByRole('status', { name: 'Preparing your next question' })).not.toBeInTheDocument();
  });

  it('keeps recruited copies, prepares the army and reloads a Demo recruit', async () => {
    const s=newKingdom();s.tokens.Life=8;s.tokens['Earth & Space']=8;s.buildings.barracks=1;
    localStorage.setItem(`curious_y_phase1_v1_${userId}`,JSON.stringify(s));
    const view=mount();fireEvent.click(await screen.findByRole('button',{name:'Castle · Level 1'}));
    fireEvent.click(await screen.findByRole('button',{name:/Recruitment Hall.*level 1/i}));
    fireEvent.click(await screen.findByRole('button',{name:'Recruit · 8 Essence · 8 Astral Dust'}));
    await waitFor(()=>expect(Object.keys(loadKingdom(userId).units)).toHaveLength(3));
    fireEvent.click(screen.getByRole('button',{name:'Battle'}));
    expect(Object.values(loadKingdom(userId).units)[0].investedXP).toBe(0);
    expect(within(screen.getByRole('region',{name:'Unit collection'})).queryByRole('combobox')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Army slot 1: Empty'}));
    fireEvent.click(screen.getByRole('button',{name:/^Militia · L/}));
    await waitFor(()=>expect(loadKingdom(userId).armySlots[0]).not.toBeNull());
    view.unmount();mount();fireEvent.click(await screen.findByRole('button',{name:'Battle'}));
    expect(await screen.findByRole('button',{name:'Army slot 1: Militia'})).toBeInTheDocument();
  });
  beforeEach(() => {
    localStorage.clear();
    saveLocalConcepts(userId, [{ canonicalName: 'Force', definition: 'Force', aliases: [], topics: {Physics:1}, prerequisites: [], mastery: 'unseen', reasoningTrack: {directInference:0,composition:0,discrimination:0,transfer:0,counterfactual:0,synthesis:0,derivation:0} }]);
    localStorage.setItem('curious_y_demo_user', JSON.stringify({ id: userId, user_metadata: {}, app_metadata: {} }));
  });
  afterEach(() => { vi.useRealTimers(); });

  it('snapshots canonical Demo weights at issuance and recovers every line without consulting changed concepts', async () => {
    const concept = { canonicalName: 'Force', aliases: ['push'], topics: { Physics: .7, 'Mathematics & Logic': .2, 'Earth & Space': .1 },
      definition: 'Force', prerequisites: [], mastery: 'unseen' as const,
      reasoningTrack: { directInference: 0, composition: 0, discrimination: 0, transfer: 0, counterfactual: 0, synthesis: 0, derivation: 0 } };
    saveLocalConcepts(userId, [concept]);
    vi.mocked(generateWhyQuestion).mockResolvedValueOnce({ topic: 'Physics', concept: 'push', reasoningComplexity: 'directInference', topicWeights: { Life: 1 },
      questionText: 'Why does a push accelerate?', options: ['A net force changes velocity','Mass disappears','Time stops','Gravity vanishes'], correctIndex: 0, explanation: 'Force.' });
    let app = mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Learn' }));

    fireEvent.click(await screen.findByRole('button', { name: /Choose topic Physics/i }));
    const option = await screen.findByRole('button', { name: /A net force changes velocity/ });
    saveLocalConcepts(userId, [{ ...concept, topics: { Physics: 1 } }]);
    fireEvent.click(option);
    await screen.findByText('+18 Force');
    expect(screen.getByText('+5 Runes')).toBeInTheDocument();
    app.unmount(); app = mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Learn' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Collect' }));
    await screen.findByRole('button', { name: 'Next Question' });
    expect(loadKingdom(userId).tokens).toMatchObject({ Physics: 18, 'Mathematics & Logic': 5, 'Earth & Space': 2 });
    expect(screen.getByRole('region', { name: 'Resources' })).toHaveTextContent('Runes 5');
    expect(screen.getByRole('region', { name: 'Resources' })).toHaveTextContent('Astral Dust 2');
  });

  it('tower links return to pending Collect without generating a different topic', async () => {
    mount(); fireEvent.click(await screen.findByRole('button', { name: 'Learn' }));
    fireEvent.click(await screen.findByRole('button', { name: /Choose topic Physics/i }));
    fireEvent.click(await screen.findByRole('button', { name: /A net force changes velocity/ }));
    await screen.findByRole('button', { name: 'Collect' });
    const calls = vi.mocked(generateWhyQuestion).mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: /Castle · Level/ }));
    const tower = within(screen.getByRole('article', { name: 'Life Tower' }));
    fireEvent.click(tower.getByRole('button', { name: 'Collect first for Life' }));
    expect(await screen.findByRole('button', { name: 'Collect' })).toBeEnabled();
    expect(vi.mocked(generateWhyQuestion).mock.calls.length).toBe(calls);
    expect(loadKingdom(userId).tokens.Physics).toBe(0);
  });

  it('restores the battlefield Collect state after reload and keeps it visible on a failed save', async () => {
    let state = newKingdom(); state.buildings.barracks = 1; state.units.militia={unitId:'militia',investedXP:0,locked:false}; state.armySlots = ['militia', null, null, null, null];
    state = applyAction(state, { type: 'start', stage: 1 });
    state.battle!.enemyHp = 0;
    state = applyAction(state, { type: 'tick' });
    localStorage.setItem(`curious_y_phase1_v1_${userId}`, JSON.stringify(state));
    let app = mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Battle' }));
    expect(within(screen.getByRole('group', { name: 'Battlefield' })).getByRole('button', { name: 'Collect' })).toBeEnabled();
    app.unmount(); app = mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Battle' }));
    const fail = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new Error('quota'); });
    fireEvent.click(within(screen.getByRole('group', { name: 'Battlefield' })).getByRole('button', { name: 'Collect' }));
    await screen.findByText(/Castle progress could not be saved/);
    fail.mockRestore();
    expect(loadKingdom(userId).gold).toBe(0);
    expect(screen.queryByRole('button', { name: 'Next battle' })).not.toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('group', { name: 'Battlefield' })).getByRole('button', { name: 'Collect' }));
    await screen.findByRole('button', { name: 'Next battle' });
    expect(loadKingdom(userId).gold).toBe(60);
    app.unmount(); app = mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Battle' }));
    expect(screen.queryByRole('button', { name: 'Collect' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next battle' })).toBeEnabled();
  });

  it('guides a fresh Demo through Earth & Life, three copies, conquest and automatic tribute', async () => {
    earthLifeConcept(); mount();
    const welcome=await screen.findByRole('dialog',{name:'Build Recruitment Hall'});
    expect(within(welcome).getByRole('progressbar',{name:'Resources for Recruitment Hall'})).toHaveAttribute('aria-valuenow','0');
    await earthLifeAnswers();
    fireEvent.click(screen.getByRole('button',{name:'Battle'}));
    fireEvent.click(await screen.findByRole('button',{name:'Go to Recruitment Hall'}));
    fireEvent.click(screen.getByRole('button',{name:'Build Recruitment Hall · 5 Essence · 5 Astral Dust'}));
    fireEvent.click(await screen.findByRole('button',{name:'Recruit · 8 Essence · 8 Astral Dust'}));
    await waitFor(()=>expect(Object.keys(loadKingdom(userId).units)).toHaveLength(3));
    fireEvent.click(screen.getByRole('button',{name:'Battle'}));
    fireEvent.click(screen.getByRole('button',{name:'Army slot 1: Empty'}));
    fireEvent.click(screen.getByRole('button',{name:/^Militia · L/}));
    await waitFor(()=>expect(screen.getByRole('button',{name:'Start battle'})).toBeEnabled());
    fireEvent.click(screen.getByRole('button',{name:'Start battle'}));
    await waitFor(()=>expect(loadKingdom(userId).cleared).toBe(1));
    expect(loadKingdom(userId).gold).toBe(10);expect(loadKingdom(userId).buildings.treasury).toBe(0);
    fireEvent.click(await screen.findByRole('button',{name:'Skip battle'}));
    fireEvent.click(await screen.findByRole('button',{name:'Collect'}));
    await waitFor(()=>expect(loadKingdom(userId).gold).toBe(70));
    expect(loadKingdom(userId).lifetimeGold).toBe(70);
  });

  it.each(['dismissed', 'different goal', 'existing army'] as const)('does not show the first-army prompt for %s', async scenario => {
    if (scenario === 'existing army') {
      const state = newKingdom(); state.buildings.barracks = 1;
      localStorage.setItem(`curious_y_phase1_v1_${userId}`, JSON.stringify(state));
    } else {
      localStorage.setItem(goalStorageKey(`demo:${userId}`), JSON.stringify(scenario === 'dismissed' ? null : { type: 'building', id: 'forge', level: 1 }));
    }
    mount();
    await screen.findByRole('dialog', { name: 'Ready for battle?' });
    expect(screen.queryByRole('dialog', { name: 'Build Recruitment Hall' })).not.toBeInTheDocument();
  });

  it('keeps goal completion and dismissal through reload, and isolates Demo identities', async () => {
    earthLifeConcept();
    let app = mount();
    await earthLifeAnswers();
    fireEvent.click(screen.getByRole('button', { name: 'Go to Recruitment Hall' }));
    fireEvent.click(screen.getByRole('button', { name: 'Build Recruitment Hall · 5 Essence · 5 Astral Dust' }));
    await screen.findByText('Goal complete! Choose a new goal below.');
    app.unmount(); app = mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Learn' }));
    await screen.findByText('Goal complete! Choose a new goal below.');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss goal' }));
    app.unmount(); app = mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Learn' }));
    await screen.findByText('Choose a construction or upgrade to guide your learning.');
    expect(screen.queryByRole('button', { name: 'Learn Life for Essence' })).not.toBeInTheDocument();
    app.unmount();
    localStorage.setItem('curious_y_demo_user', JSON.stringify({ id: 'second-demo', user_metadata: {}, app_metadata: {} }));
    app = mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Learn' }));
    await screen.findByRole('button', { name: 'Learn Life for Essence' });
    expect(loadKingdom('second-demo').tokens.Physics).toBe(0);
    expect(JSON.parse(localStorage.getItem(goalStorageKey(`demo:${userId}`))!)).toBeNull();
    app.unmount();
  });

  it('navigates both missing resources to canonical topics and blocks shortcuts during generation', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Castle · Level 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Recruitment Hall · Empty plot' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Set Recruitment Hall goal' }));
    fireEvent.click(screen.getByRole('button', { name: 'Learn Earth & Space for Astral Dust' }));
    await screen.findByRole('button', { name: /A net force changes velocity/ });
    expect(generateWhyQuestion).toHaveBeenLastCalledWith(expect.anything(), 'Earth & Space', true, expect.anything(), userId);
    let resolve!: (q: Awaited<ReturnType<typeof generateWhyQuestion>>) => void;
    vi.mocked(generateWhyQuestion).mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    fireEvent.click(screen.getByRole('button', { name: 'Learn Life for Essence' }));
    await waitFor(() => expect(resolve).toBeDefined());
    expect(generateWhyQuestion).toHaveBeenLastCalledWith(expect.anything(), 'Life', true, expect.anything(), userId);
    expect(screen.getByRole('button', { name: 'Learn Earth & Space for Astral Dust' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Learn Life for Essence' })).toBeDisabled();
    await act(async () => resolve({ topic: 'Life', questionText: 'A new topic', options: ['1','2','3','4'], correctIndex: 0, explanation: 'Explanation' }));
    await screen.findByText('A new topic');
    expect(screen.getByRole('heading', { name: 'A new topic' })).toHaveFocus();
  });

  it.each([
    '{damaged-json',
    JSON.stringify({ type: 'building', id: 'deleted-building', level: 1 }),
    JSON.stringify({ type: 'building', id: 'barracks', level: 3 }),
  ])('recovers an invalid stored goal without granting progress: %s', async stored => {
    localStorage.setItem(goalStorageKey(`demo:${userId}`), stored);
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Learn' }));
    const picker = await screen.findByRole('combobox', { name: 'Choose progression goal' });
    await waitFor(() => expect(picker).toBeEnabled());
    expect(screen.queryByRole('button', { name: /Go to Recruitment Hall/ })).not.toBeInTheDocument();
    expect(loadKingdom(userId).buildings.barracks).toBe(0);
    expect(loadKingdom(userId).tokens.Physics).toBe(0);
    fireEvent.change(picker, { target: { value: '0' } });
    await screen.findByRole('button', { name: 'Learn Life for Essence' });
  });

  it('uses immediate navigation for reduced motion while keeping learning keyboard reachable', async () => {
    const original = vi.mocked(window.matchMedia).getMockImplementation()!;
    const media = vi.mocked(window.matchMedia).mockImplementation(query => ({ ...original(query), matches: query.includes('prefers-reduced-motion') }));
    try {
      mount();
      fireEvent.click(await screen.findByRole('button', { name: 'Learn' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Learn Life for Essence' }));
      await screen.findByRole('button', { name: /A net force changes velocity/ });
      expect(screen.getByRole('heading', { name: 'Why does a push accelerate an object?' })).toHaveFocus();
      expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'auto' });
    } finally { media.mockImplementation(original); }
  });

  it('persists uncollected Resources through refresh and home navigation, then credits exactly once', async () => {
    let app = mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Learn' }));

    fireEvent.click(await screen.findByRole('button', { name: /Choose topic Physics/i }));
    fireEvent.click(await screen.findByRole('button', { name: /A net force changes velocity/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Learn' }));

    await screen.findByRole('button', { name: 'Collect' });
    expect(loadKingdom(userId).tokens.Physics).toBe(0);
    expect(screen.queryByRole('button', { name: 'Next Question' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Return to home / choose topic'));
    expect(screen.getByRole('button', { name: 'Collect' })).toBeInTheDocument();
    app.unmount();
    app = mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Learn' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Collect' }));
    await screen.findByRole('button', { name: 'Next Question' });
    expect(loadKingdom(userId).tokens.Physics).toBe(25);
    app.unmount();
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Learn' }));

    await screen.findByRole('button', { name: /Choose topic Physics/i });
    expect(loadKingdom(userId).tokens.Physics).toBe(25);
    expect(screen.queryByRole('button', { name: 'Collect' })).not.toBeInTheDocument();
  });

  it('keeps a failed collection pending and retries without duplicating Resources', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Learn' }));

    fireEvent.click(await screen.findByRole('button', { name: /Choose topic Physics/i }));
    fireEvent.click(await screen.findByRole('button', { name: /A net force changes velocity/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Learn' }));

    await screen.findByRole('button', { name: 'Collect' });
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new Error('Storage full'); });
    fireEvent.click(screen.getByRole('button', { name: 'Collect' }));
    await screen.findByText('Could not save your Resources. Click Collect to retry.');
    expect(loadKingdom(userId).tokens.Physics).toBe(0);
    write.mockRestore();
    fireEvent.click(screen.getByRole('button', { name: 'Collect' }));
    await screen.findByRole('button', { name: 'Next Question' });
    expect(loadKingdom(userId).tokens.Physics).toBe(25);
  });

  it('connects an answer to automatic combat that continues during learning and resumes after reload', async () => {
    earthLifeConcept();
    let app = mount();
    await earthLifeAnswers();
    expect(screen.getByRole('region', { name: 'Resources' })).toHaveTextContent('Essence');
    fireEvent.click(screen.getByRole('button', { name: 'Castle · Level 1' }));
    expect(screen.queryByText('Topic treasury')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Exchange/ })).not.toBeInTheDocument();
    expect(screen.getByText('Explorer Demo · Castle progress saves to this browser.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Forge · Keep 2 required' }));
    expect(screen.getByRole('button', { name: /^Build Forge/ })).toBeDisabled();
    expect(screen.getByText('Requires Keep (Castle) level 2.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /guild|gacha|equipment/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Ranked arena|Silver II|trophies|Archive Key|gems|knowledge yield|Daily orders|11h 42m|00:43/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Recruitment Hall · Empty plot' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Build Recruitment Hall · 5 Essence · 5 Astral Dust' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Build Recruitment Hall · 5 Essence · 5 Astral Dust' }));
    await screen.findByRole('button', { name: 'Recruitment Hall · Level 1' });
    expect(loadKingdom(userId).gold).toBe(0);
    expect(screen.getByRole('region', { name: 'Resources' })).toHaveTextContent('Essence');
    fireEvent.click(screen.getByRole('button',{name:'Recruit · 8 Essence · 8 Astral Dust'}));
    await waitFor(()=>expect(Object.keys(loadKingdom(userId).units)).toHaveLength(3));
    fireEvent.click(screen.getByRole('button', { name: 'Militia available · Go to empty square 1' }));
    expect(screen.getByRole('button', { name: 'Battle' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Army slot 1: Empty' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Start battle' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Army slot 1: Empty' }));
    fireEvent.click(screen.getByRole('button', { name: /^Militia · L/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start battle' })).toBeEnabled());
    vi.useFakeTimers();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Start battle' })); });
    expect(screen.getByRole('group', { name: 'Unit spawns' })).toBeInTheDocument();
    expect(loadKingdom(userId).battle!.result).toBe('victory');
    expect(screen.queryByRole('dialog', { name: 'Territory conquered!' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Deploy|Pause battle|Resume battle/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Learn' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    const saved = loadKingdom(userId);
    expect(saved.battle!.elapsed).toBeGreaterThan(10);
    expect(saved.battle!.result).toBe('victory');
    app.unmount();
    app = mount();
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(loadKingdom(userId).battle).toEqual(saved.battle);
    vi.useRealTimers();
    fireEvent.click(screen.getByRole('button', { name: 'Battle' }));
    expect(screen.getByRole('group', { name: 'Unit spawns' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Skip battle' }));
    await screen.findByRole('dialog', { name: 'Territory conquered!' });
    expect(loadKingdom(userId).buildings.barracks).toBe(1);
    fireEvent.click(await screen.findByRole('button', { name: 'Learn' }));

    await screen.findByRole('button', { name: /Choose topic Physics/ });
    app.unmount();
  });

  it('rewards incorrect attempts and does not mint rewards when history is reopened', async () => {
    mount();
    await answer(false);
    await waitFor(() => expect(loadKingdom(userId).tokens.Physics).toBe(4));
    fireEvent.click(screen.getByTitle('View learning history and chats'));
    await waitFor(() => expect(screen.getAllByText('Why does a push accelerate an object?')).toHaveLength(2));
    fireEvent.click(screen.getAllByText('Why does a push accelerate an object?')[1]);
    await waitFor(() => expect(screen.getAllByText('Why does a push accelerate an object?')).toHaveLength(1));
    expect(loadKingdom(userId).tokens.Physics).toBe(4);
  });

  it('does not show a stale generated question after returning home', async () => {
    let resolve!: (q: Awaited<ReturnType<typeof generateWhyQuestion>>) => void;
    vi.mocked(generateWhyQuestion).mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Learn' }));

    fireEvent.click(await screen.findByRole('button', { name: /Choose topic Physics/i }));
    await waitFor(() => expect(resolve).toBeDefined());
    fireEvent.click(screen.getByTitle('Return to home / choose topic'));
    await act(async () => { resolve({ topic: 'Physics', questionText: 'Stale question', options: ['1', '2', '3', '4'], correctIndex: 0, explanation: 'Old' }); });
    expect(screen.queryByText('Stale question')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Choose topic Physics/i })).toBeInTheDocument();
  });

  it('explains missing Gold and marks all four units locked until buildings are built', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Battle' }));
    const section = screen.getByLabelText('Battle management');
    expect(within(section).getByRole('dialog', { name: 'Build Recruitment Hall' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start battle' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Castle · Level 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Recruitment Hall · Empty plot' }));
    expect(screen.getByRole('button', { name: 'Build Recruitment Hall · 5 Essence · 5 Astral Dust' })).toBeDisabled();
    expect(screen.getByText('Need 5 Essence · 5 Astral Dust more.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Recruitment Hall · Empty plot' }));
    expect(screen.getByRole('button', { name: 'Build Recruitment Hall · 5 Essence · 5 Astral Dust' })).toBeDisabled();
  });

  it('resets Castle progress together with learning after explicit confirmation', async () => {
    mount();
    await answer();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Reset Progress' }));
    await waitFor(() => expect(loadKingdom(userId).tokens.Physics).toBe(0));
    expect(loadKingdom(userId).rewarded).toEqual([]);
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Castle'));
    fireEvent.click(await screen.findByRole('button', { name: 'Learn' }));

    await screen.findByRole('button', { name: /Choose topic Physics/i });
    confirm.mockRestore();
  });

  it.each(['forge', null])('restores the first goal after resetting a Demo goal of %s', async id => {
    localStorage.setItem(goalStorageKey(`demo:${userId}`), JSON.stringify(id ? { type: 'building', id, level: 1 } : null));
    const app = mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Learn' }));
    await screen.findByRole('combobox', { name: 'Choose progression goal' });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Reset Progress' }));
    await screen.findByRole('button', { name: 'Learn Life for Essence' });
    expect(screen.getByRole('region', { name: 'Current progression goal' })).toHaveTextContent('Build Recruitment Hall');
    expect(JSON.parse(localStorage.getItem(goalStorageKey(`demo:${userId}`))!)).toEqual({ type: 'building', id: 'barracks', level: 1 });
    app.unmount();
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Learn' }));
    await screen.findByRole('button', { name: 'Learn Life for Essence' });
    confirm.mockRestore();
  });
});
