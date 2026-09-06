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
  fireEvent.click(await screen.findByRole('button', { name: /Choose topic Physics/i }));
  fireEvent.click(await screen.findByRole('button', { name: correct ? /A net force changes velocity/ : /Mass disappears/ }));
  await screen.findByText(correct ? '+25 Resources ready to collect!' : '+4 Resources ready to collect!');
  fireEvent.click(screen.getByRole('button', { name: 'Collect' }));
  await screen.findByRole('button', { name: 'Next Question' });
}

describe('Playable Phase I journey', () => {
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
    fireEvent.click(await screen.findByRole('button', { name: /Choose topic Physics/i }));
    const option = await screen.findByRole('button', { name: /A net force changes velocity/ });
    saveLocalConcepts(userId, [{ ...concept, topics: { Physics: 1 } }]);
    fireEvent.click(option);
    await screen.findByText('+18 Force');
    expect(screen.getByText('+5 Runes')).toBeInTheDocument();
    app.unmount(); app = mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Collect' }));
    await screen.findByRole('button', { name: 'Next Question' });
    expect(loadKingdom(userId).tokens).toMatchObject({ Physics: 18, 'Mathematics & Logic': 5, 'Earth & Space': 2 });
    expect(screen.getByRole('region', { name: 'Resources' })).toHaveTextContent('Runes 5');
    expect(screen.getByRole('region', { name: 'Resources' })).toHaveTextContent('Astral Dust 2');
  });

  it('restores the battlefield Collect state after reload and keeps it visible on a failed save', async () => {
    let state = newKingdom(); state.buildings.barracks = 1; state.armySlots = ['swordsman', null, null, null];
    state = applyAction(state, { type: 'start', stage: 1 });
    state.battle!.enemyHp = 0;
    state = applyAction(state, { type: 'tick' });
    localStorage.setItem(`curious_y_phase1_v1_${userId}`, JSON.stringify(state));
    let app = mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Castle · Level 1' }));
    expect(within(screen.getByRole('group', { name: 'Battlefield' })).getByRole('button', { name: 'Collect' })).toBeEnabled();
    app.unmount(); app = mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Castle · Level 1' }));
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
    fireEvent.click(await screen.findByRole('button', { name: 'Castle · Level 1' }));
    expect(screen.queryByRole('button', { name: 'Collect' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next battle' })).toBeEnabled();
  });

  it('guides a fresh Demo through Physics, Collect, construction, and a first victory for Gold', async () => {
    mount();
    const goal = await screen.findByRole('region', { name: 'Current progression goal' });
    fireEvent.click(await within(goal).findByRole('button', { name: 'Learn Physics for Force' }));
    fireEvent.click(await screen.findByRole('button', { name: /A net force changes velocity/ }));
    await screen.findByRole('button', { name: 'Collect' });
    expect(goal).toHaveTextContent('Force: 0 / 10');
    expect(within(goal).queryByRole('button', { name: /Go to Barracks/ })).not.toBeInTheDocument();
    const calls = vi.mocked(generateWhyQuestion).mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Castle · Level 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Learn Physics for Force' }));
    expect(screen.getByRole('button', { name: 'Collect' })).toBeInTheDocument();
    expect(vi.mocked(generateWhyQuestion).mock.calls).toHaveLength(calls);
    fireEvent.click(screen.getByRole('button', { name: 'Collect' }));
    await screen.findByRole('button', { name: 'Next Question' });
    fireEvent.click(await screen.findByRole('button', { name: 'Go to Barracks' }));
    expect(document.getElementById('kingdom-building-barracks')).toHaveFocus();
    expect(loadKingdom(userId).buildings.barracks).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Build Barracks · 10 Force' }));
    await screen.findByText('Goal complete! Choose a new goal below.');
    expect(loadKingdom(userId).tokens.Physics).toBe(15);
    expect(loadKingdom(userId).buildings.barracks).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Go to battle 1-1' }));
    expect(screen.getByRole('region', { name: 'Battle' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Start battle' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Army slot 1: Empty' }));
    fireEvent.click(screen.getByRole('button', { name: 'Swordsman' }));
    fireEvent.click(screen.getByRole('button', { name: 'Assign Swordsman' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start battle' })).toBeEnabled());
    vi.useFakeTimers();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Start battle' })); });
    await act(async () => { await vi.advanceTimersByTimeAsync(120000); });
    expect(loadKingdom(userId).battle?.result).toBe('victory');
    expect(loadKingdom(userId).gold).toBe(0);
    expect(screen.queryByRole('button', { name: 'Next battle' })).not.toBeInTheDocument();
    await act(async () => { fireEvent.click(within(screen.getByRole('group', { name: 'Battlefield' })).getByRole('button', { name: 'Collect' })); });
    expect(loadKingdom(userId).gold).toBe(60);
    expect(screen.getByRole('button', { name: 'Next battle' })).toBeEnabled();
    expect(screen.getByRole('dialog', { name: 'Victory!' })).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('keeps goal completion and dismissal through reload, and isolates Demo identities', async () => {
    let app = mount();
    await answer();
    fireEvent.click(screen.getByRole('button', { name: 'Go to Barracks' }));
    fireEvent.click(screen.getByRole('button', { name: 'Build Barracks · 10 Force' }));
    await screen.findByText('Goal complete! Choose a new goal below.');
    app.unmount(); app = mount();
    await screen.findByText('Goal complete! Choose a new goal below.');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss goal' }));
    app.unmount(); app = mount();
    await screen.findByText('Choose a construction or upgrade to guide your learning.');
    expect(screen.queryByRole('button', { name: 'Learn Physics for Force' })).not.toBeInTheDocument();
    app.unmount();
    localStorage.setItem('curious_y_demo_user', JSON.stringify({ id: 'second-demo', user_metadata: {}, app_metadata: {} }));
    app = mount();
    await screen.findByRole('button', { name: 'Learn Physics for Force' });
    expect(loadKingdom('second-demo').tokens.Physics).toBe(0);
    expect(JSON.parse(localStorage.getItem(goalStorageKey(`demo:${userId}`))!)).toBeNull();
    app.unmount();
  });

  it('navigates both missing resources to canonical topics and blocks shortcuts during generation', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Castle · Level 1' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Set Archery Range goal' }));
    fireEvent.click(screen.getByRole('button', { name: 'Learn Earth & Space for Astral Dust' }));
    await screen.findByRole('button', { name: /A net force changes velocity/ });
    expect(generateWhyQuestion).toHaveBeenLastCalledWith(expect.anything(), 'Earth & Space', true, expect.anything(), userId);
    let resolve!: (q: Awaited<ReturnType<typeof generateWhyQuestion>>) => void;
    vi.mocked(generateWhyQuestion).mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    fireEvent.click(screen.getByRole('button', { name: 'Learn Mind & Behavior for Insight' }));
    await waitFor(() => expect(resolve).toBeDefined());
    expect(generateWhyQuestion).toHaveBeenLastCalledWith(expect.anything(), 'Mind & Behavior', true, expect.anything(), userId);
    expect(screen.getByRole('button', { name: 'Learn Earth & Space for Astral Dust' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Learn Mind & Behavior for Insight' })).toBeDisabled();
    await act(async () => resolve({ topic: 'Mind & Behavior', questionText: 'A new topic', options: ['1','2','3','4'], correctIndex: 0, explanation: 'Explanation' }));
    await screen.findByText('A new topic');
    expect(document.getElementById('learning-deck')).toHaveFocus();
  });

  it.each([
    '{damaged-json',
    JSON.stringify({ type: 'building', id: 'deleted-building', level: 1 }),
    JSON.stringify({ type: 'building', id: 'barracks', level: 3 }),
  ])('recovers an invalid stored goal without granting progress: %s', async stored => {
    localStorage.setItem(goalStorageKey(`demo:${userId}`), stored);
    mount();
    const picker = await screen.findByRole('combobox', { name: 'Choose progression goal' });
    await waitFor(() => expect(picker).toBeEnabled());
    expect(screen.queryByRole('button', { name: /Go to Barracks/ })).not.toBeInTheDocument();
    expect(loadKingdom(userId).buildings.barracks).toBe(0);
    expect(loadKingdom(userId).tokens.Physics).toBe(0);
    fireEvent.change(picker, { target: { value: '0' } });
    await screen.findByRole('button', { name: 'Learn Physics for Force' });
  });

  it('uses immediate navigation for reduced motion while keeping learning keyboard reachable', async () => {
    const original = vi.mocked(window.matchMedia).getMockImplementation()!;
    const media = vi.mocked(window.matchMedia).mockImplementation(query => ({ ...original(query), matches: query.includes('prefers-reduced-motion') }));
    try {
      mount();
      fireEvent.click(await screen.findByRole('button', { name: 'Learn Physics for Force' }));
      await screen.findByRole('button', { name: /A net force changes velocity/ });
      expect(document.getElementById('learning-deck')).toHaveFocus();
      expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'auto' });
    } finally { media.mockImplementation(original); }
  });

  it('persists uncollected Resources through refresh and home navigation, then credits exactly once', async () => {
    let app = mount();
    fireEvent.click(await screen.findByRole('button', { name: /Choose topic Physics/i }));
    fireEvent.click(await screen.findByRole('button', { name: /A net force changes velocity/ }));
    await screen.findByRole('button', { name: 'Collect' });
    expect(loadKingdom(userId).tokens.Physics).toBe(0);
    expect(screen.queryByRole('button', { name: 'Next Question' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Return to home / choose topic'));
    expect(screen.getByRole('button', { name: 'Collect' })).toBeInTheDocument();
    app.unmount();
    app = mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Collect' }));
    await screen.findByRole('button', { name: 'Next Question' });
    expect(loadKingdom(userId).tokens.Physics).toBe(25);
    app.unmount();
    mount();
    await screen.findByRole('button', { name: /Choose topic Physics/i });
    expect(loadKingdom(userId).tokens.Physics).toBe(25);
    expect(screen.queryByRole('button', { name: 'Collect' })).not.toBeInTheDocument();
  });

  it('keeps a failed collection pending and retries without duplicating Resources', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /Choose topic Physics/i }));
    fireEvent.click(await screen.findByRole('button', { name: /A net force changes velocity/ }));
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
    let app = mount();
    await answer();
    expect(screen.getByRole('region', { name: 'Resources' })).toHaveTextContent('Force 25');
    fireEvent.click(screen.getByRole('button', { name: 'Castle · Level 1' }));
    expect(screen.queryByText('Topic treasury')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Exchange/ })).not.toBeInTheDocument();
    expect(screen.getByText('Explorer Demo · Castle progress saves to this browser.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Requires Castle 2/ })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /guild|gacha|equipment/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Ranked arena|Silver II|trophies|Archive Key|gems|knowledge yield|Daily orders|11h 42m|00:43/i)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Build Barracks · 10 Force' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Build Barracks · 10 Force' }));
    await screen.findByText('Level 1 · Swordsman unlocked');
    expect(loadKingdom(userId).gold).toBe(0);
    expect(screen.getByRole('region', { name: 'Resources' })).toHaveTextContent('Force 15');
    expect(screen.getByRole('button', { name: 'Start battle' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Army slot 1: Empty' }));
    fireEvent.click(screen.getByRole('button', { name: 'Swordsman' }));
    fireEvent.click(screen.getByRole('button', { name: 'Assign Swordsman' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start battle' })).toBeEnabled());
    vi.useFakeTimers();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Start battle' })); });
    expect(screen.getByRole('group', { name: 'Unit spawns' })).toBeInTheDocument();
    expect(loadKingdom(userId).battle!.fighters).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /Deploy|Pause battle|Resume battle/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Earn more by learning' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    const saved = loadKingdom(userId);
    expect(saved.battle!.elapsed).toBe(2);
    expect(saved.battle!.playerSpawned).toBe(0);
    app.unmount();
    app = mount();
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(loadKingdom(userId).battle!.elapsed).toBe(3);
    vi.useRealTimers();
    fireEvent.click(screen.getByRole('button', { name: 'Castle · Level 1' }));
    expect(screen.getByRole('group', { name: 'Unit spawns' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retreat' }));
    await screen.findByRole('dialog', { name: 'Defeat' });
    expect(loadKingdom(userId).buildings.barracks).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Answer another question' }));
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
    fireEvent.click(await screen.findByRole('button', { name: /Choose topic Physics/i }));
    await waitFor(() => expect(resolve).toBeDefined());
    fireEvent.click(screen.getByTitle('Return to home / choose topic'));
    await act(async () => { resolve({ topic: 'Physics', questionText: 'Stale question', options: ['1', '2', '3', '4'], correctIndex: 0, explanation: 'Old' }); });
    expect(screen.queryByText('Stale question')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Choose topic Physics/i })).toBeInTheDocument();
  });

  it('explains missing Gold and marks all four units locked until buildings are built', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Castle · Level 1' }));
    const section = screen.getByLabelText('Castle management');
    expect(within(section).getByText(/Equip a unit below/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start battle' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Build Barracks · 10 Force' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Build Archery Range · 15 Astral Dust · 15 Insight' })).toBeDisabled();
    expect(screen.getByText('Need 10 Force more.')).toBeInTheDocument();
  });

  it('resets Castle progress together with learning after explicit confirmation', async () => {
    mount();
    await answer();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Reset Progress' }));
    await waitFor(() => expect(loadKingdom(userId).tokens.Physics).toBe(0));
    expect(loadKingdom(userId).rewarded).toEqual([]);
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Castle'));
    await screen.findByRole('button', { name: /Choose topic Physics/i });
    confirm.mockRestore();
  });
});
