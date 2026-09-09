import { getKnowledgeGraph } from '../services/backend';
import { journeyView } from '../../supabase/functions/_shared/journey';
import { starterJourney } from '../../supabase/functions/_shared/journeySeeds';
import { startJourney } from './fixtures/journeyUI';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { practiceJourney, submitServerAnswer, AnswerResult, getServerKingdom, commandServerKingdom, getServerPendingReward, collectServerReward, getServerGoal, setServerGoal, GoalSnapshot, resetServerProgress } from '../services/backend';
import * as supabaseConfig from '../lib/supabase';
import { loadKingdom } from '../lib/kingdom/storage';
import { useKingdom } from '../lib/kingdom/useKingdom';
import { newKingdom, applyAction, type KingdomSnapshot } from '../lib/kingdom/game';
import { createInitialGameState } from '../game/economy';
import { goalStorageKey, initialGoal, PROGRESS_RESET } from '../lib/kingdom/goals';
import { useProgressionGoal } from '../lib/kingdom/useProgressionGoal';
import { Question } from '../types';
import { LearningRequestError, learningPayloadFailure, missingGeminiKey } from '../services/learningErrors';

const userId = '11111111-1111-4111-8111-111111111111';
const session = vi.hoisted(() => ({ user: { id: '11111111-1111-4111-8111-111111111111', user_metadata: {} }, loading: false, isDemoUser: false }));
const preferences = vi.hoisted(() => ({ settings: { apiKey: '', hasApiKey: true }, loading: false, error: null as string | null }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => session }));
vi.mock('../context/SettingsContext', () => ({ useSettings: () => preferences }));
vi.mock('../services/backend', () => ({ generateJourneyQuestion: vi.fn(), practiceJourney: vi.fn(), getKnowledgeGraph: vi.fn(), getServerJourney: vi.fn(), nextServerJourney: vi.fn(), submitServerAnswer: vi.fn(), getServerKingdom: vi.fn(), commandServerKingdom: vi.fn(), getServerPendingReward: vi.fn(), collectServerReward: vi.fn(), getServerGoal: vi.fn(), setServerGoal: vi.fn(), resetServerProgress: vi.fn() }));
vi.mock('../services/database', async importOriginal => ({
  ...await importOriginal<typeof import('../services/database')>(),
  getQuestionHistory: vi.fn().mockResolvedValue([]), getChatMessages: vi.fn().mockResolvedValue([]),
}));
const question: Question = { id: 'server-issued-question', topic: 'Physics', questionText: 'Why does force change motion?',
  options: ['It changes velocity', 'It removes mass', 'It stops time', 'It removes gravity'], correctIndex: -1, explanation: '' };
const answered: AnswerResult = {
  collected: false,
  kingdom: { state: { ...newKingdom(), tokens: { ...newKingdom().tokens, Physics: 0 } }, revision: 1, generation: 0 },
  question: { ...question, selectedIndex: 0, correctIndex: 0, isCorrect: true, explanation: 'Force produces acceleration.' },
  stats: createInitialGameState(),
  reward: { id: question.id!, totalKnowledge: 10, topicWeights: { Physics: 1 }, correct: true, lines: [{ key: 'force', amount: 10 }] },
};
answered.question.reward = answered.reward;

describe('Merged server learning → Phase I journey', () => {
  it('serializes signed-in recruitment without importing Demo inventory', async () => {
    const s=newKingdom();s.tokens.Life=30;s.tokens['Earth & Space']=30;s.buildings.barracks=1;
    let current: KingdomSnapshot={state:s,revision:1,generation:0};
    vi.mocked(getServerKingdom).mockImplementation(async()=>current);
    vi.mocked(commandServerKingdom).mockImplementation(async (action,_generation,requestId)=>{
      current={...current,state:applyAction(current.state,action,{requestId,draws:[.5,.5,.5,0,0,0]}),revision:current.revision+1};return current;
    });
    const {result}=renderHook(()=>useKingdom(userId,false));await waitFor(()=>expect(result.current.unavailable).toBe(false));
    await act(async()=>{await Promise.all([result.current.act({type:'recruit',id:'barracks'}),result.current.act({type:'recruit',id:'barracks'})]);});
    expect(commandServerKingdom).toHaveBeenCalledTimes(1);expect(Object.keys(result.current.state.units)).toHaveLength(3);expect(result.current.state.tokens.Life).toBe(22);expect(loadKingdom(userId).units).toEqual({});
  });
  it('resets a signed-in Stable goal only after the reset succeeds and restores Recruitment Hall on reload', async () => {
    const configured = vi.spyOn(supabaseConfig, 'isSupabaseConfigured').mockReturnValue(true);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      vi.mocked(getServerGoal).mockResolvedValue({ goal: { type: 'building', id: 'forge', level: 1 }, revision: 5 });
      const app = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Learn' }));
      await waitFor(() => expect(screen.getByRole('region', { name: 'Current progression goal' })).toHaveTextContent('Build Forge'));
      vi.mocked(resetServerProgress).mockRejectedValueOnce(new Error('Offline'));
      fireEvent.click(screen.getByRole('button', { name: 'Reset Progress' }));
      await screen.findByText('Progress could not be reset. Please retry.');
      expect(screen.getByRole('region', { name: 'Current progression goal' })).toHaveTextContent('Build Forge');
      vi.mocked(resetServerProgress).mockImplementationOnce(async () => {
        vi.mocked(getServerGoal).mockResolvedValue({ goal: initialGoal, revision: 6 });
        return { stats: createInitialGameState(), kingdom: { state: newKingdom(), revision: 1, generation: 1 } };
      });
      fireEvent.click(screen.getByRole('button', { name: 'Reset Progress' }));
      await screen.findByRole('button', { name: 'Learn Life for Essence' });
      expect(screen.getByRole('region', { name: 'Current progression goal' })).toHaveTextContent('Build Recruitment Hall');
      app.unmount();
      render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Learn' }));
      await screen.findByRole('button', { name: 'Learn Life for Essence' });
      expect(resetServerProgress).toHaveBeenCalledTimes(2);
    } finally { configured.mockRestore(); confirm.mockRestore(); log.mockRestore(); }
  });

  it.each(['resolve', 'reject'])('reloads the reset goal and ignores a delayed pre-reset save that will %s', async outcome => {
    vi.mocked(getServerGoal).mockResolvedValue({ goal: { type: 'building', id: 'forge', level: 1 }, revision: 5 });
    const { result } = renderHook(() => useProgressionGoal(userId, newKingdom(), false, false));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    let resolve!: (value: GoalSnapshot) => void;
    let reject!: (error: Error) => void;
    vi.mocked(setServerGoal).mockImplementationOnce(() => new Promise((yes, no) => { resolve = yes; reject = no; }));
    act(() => { void result.current.select(null); });
    expect(result.current.saving).toBe(true);
    vi.mocked(getServerGoal).mockResolvedValue({ goal: initialGoal, revision: 7 });
    act(() => { window.dispatchEvent(new CustomEvent(PROGRESS_RESET, { detail: userId })); });
    await waitFor(() => expect(result.current.goal).toEqual(initialGoal));
    await act(async () => {
      if (outcome === 'resolve') resolve({ goal: null, revision: 6 });
      else reject(new Error('Connection lost'));
    });
    expect(result.current.goal).toEqual(initialGoal);
    expect(result.current.saving).toBe(false);
    expect(result.current.error).toBeNull();
    await act(async () => { await result.current.select({ type: 'castle', level: 2 }); });
    expect(setServerGoal).toHaveBeenLastCalledWith({ type: 'castle', level: 2 }, 7);
  });

  it('discards a failed goal retry when progress resets', async () => {
    const { result } = renderHook(() => useProgressionGoal(userId, newKingdom(), false, false));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    vi.mocked(setServerGoal).mockRejectedValueOnce(new Error('Offline'));
    await act(async () => { await result.current.select({ type: 'building', id: 'forge', level: 1 }); });
    expect(result.current.error).not.toBeNull();
    vi.mocked(getServerGoal).mockResolvedValue({ goal: initialGoal, revision: 2 });
    act(() => { window.dispatchEvent(new CustomEvent(PROGRESS_RESET, { detail: userId })); });
    await waitFor(() => expect(result.current.error).toBeNull());
    await act(async () => { result.current.retry(); });
    expect(setServerGoal).toHaveBeenCalledTimes(1);
    expect(result.current.goal).toEqual(initialGoal);
  });
  it('never imports editable Demo Library or Treasury progress into a signed-in account', async () => {
    const fake = newKingdom(); fake.castle = 5; fake.libraryConcepts = 150;
    fake.buildings.library = 4; fake.buildings.treasury = 5; fake.buildings.academy = 5;
    localStorage.setItem(`curious_y_phase1_v1_${userId}`, JSON.stringify(fake));
    vi.mocked(getServerKingdom).mockResolvedValue({ state: newKingdom(), revision: 0, generation: 0 });
    const { result } = renderHook(() => useKingdom(userId, false));
    await waitFor(() => expect(result.current.unavailable).toBe(false));
    expect(result.current.state).toEqual(newKingdom());
    expect(JSON.parse(localStorage.getItem(`curious_y_phase1_v1_${userId}`)!).buildings.library).toBe(4);
  });
  it('migrates trusted ownership on read and retries army edits with the same request identity', async () => {
    const legacy = { ...newKingdom(), units:{militia:{unitId:'militia',investedXP:0,locked:false},slinger:{unitId:'slinger',investedXP:0,locked:false}}, armySlots:['militia','slinger',null,null,null], buildings: { ...newKingdom().buildings, barracks: 1, range: 1, stable: 0, workshop: 0 } };
    vi.mocked(getServerKingdom).mockResolvedValue({ state: legacy as never, revision: 7, generation: 2 });
    const { result } = renderHook(() => useKingdom(userId));
    await waitFor(() => expect(result.current.unavailable).toBe(false));
    expect(result.current.state.armySlots).toEqual(['militia', 'slinger', null, null, null]);
    const action = { type: 'army', slots: [null, 'slinger', null, null, null] } as const;
    const edited = applyAction(result.current.state, { type: 'army', slots: [...action.slots] });
    vi.mocked(commandServerKingdom).mockRejectedValueOnce(new Error('Connection lost'))
      .mockResolvedValueOnce({ state: edited, revision: 8, generation: 2 });
    await act(async () => { await result.current.act({ type: 'army', slots: [...action.slots] }); });
    expect(result.current.state.armySlots[0]).toBe('militia');
    await act(async () => { await result.current.act({ type: 'army', slots: [...action.slots] }); });
    const calls = vi.mocked(commandServerKingdom).mock.calls;
    expect(calls[0]).toEqual(calls[1]);
    expect(calls[0][1]).toBe(2);
    expect(result.current.state.armySlots).toEqual(action.slots);
    expect(loadKingdom(userId)).toEqual(newKingdom());
    await act(async () => {
      result.current.applyServer({ state: newKingdom(), revision: 9, generation: 3 });
      result.current.applyServer({ state: edited, revision: 8, generation: 2 });
    });
    expect(result.current.state).toEqual(newKingdom());
  });
  it('isolates preferences on an in-place account switch and restores selection on reload', async () => {
    const app = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Learn' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Learn Life for Essence' }));
    await startJourney('Life');
    await screen.findByText(question.questionText);
    fireEvent.click(screen.getByRole('button', { name: 'Castle · Level 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'War Academy · Keep 2 required' }));
    fireEvent.click(screen.getByRole('button', { name: 'Set War Academy goal' }));
    await waitFor(() => expect(screen.getByRole('region', { name: 'Current progression goal' })).toHaveTextContent('Build War Academy'));
    session.user.id = '22222222-2222-4222-8222-222222222222';
    app.rerender(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Learn' }));
    await screen.findByRole('button', { name: 'Learn Life for Essence' });
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss goal' }));
    await screen.findByText('Choose a construction or upgrade to guide your learning.');
    session.user.id = userId;
    app.rerender(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Learn' }));
    await screen.findByRole('button', { name: 'Learn Computer Science for Logic Cores' });
    app.unmount();
    localStorage.clear(); // A different device has no browser preference to restore.
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Learn' }));
    await screen.findByRole('button', { name: 'Learn Computer Science for Logic Cores' });
    expect(localStorage.getItem(goalStorageKey(`account:${userId}`))).toBeNull();
    expect(screen.getByRole('region', { name: 'Resources' })).toHaveTextContent('Logic Cores 0');
  });

  it('does not create a default goal from an unavailable Castle or trust a saved preference as currency', async () => {
    localStorage.setItem(goalStorageKey(`account:${userId}`), JSON.stringify({ type: 'building', id: 'barracks', level: 1, gold: 99999, tokens: { Physics: 99999 } }));
    vi.mocked(getServerKingdom).mockRejectedValueOnce(new Error('Castle offline'));
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Learn' }));
    await screen.findByText('Reload Castle to check goal progress.');
    expect(screen.queryByRole('button', { name: 'Learn Life for Essence' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Complete goal:/ })).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Reload Castle' }));
    await screen.findByRole('button', { name: 'Learn Life for Essence' });
    expect(screen.getByRole('region', { name: 'Current progression goal' })).toHaveTextContent('Essence: 0 / 5');
    expect(commandServerKingdom).not.toHaveBeenCalled();
  });

  it('routes a goal through the API-key requirement without generating a sample question', async () => {
    preferences.settings.hasApiKey = false;
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Learn' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Learn Life for Essence' }));
    await screen.findByText('Application Settings');
    expect(practiceJourney).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Close modal' }));
    preferences.settings.hasApiKey = true;
    // Settings updates normally trigger a context render.
    fireEvent.click(screen.getByRole('button', { name: 'Learn' }));
    fireEvent.click(screen.getByRole('button', { name: 'Learn Life for Essence' }));
    await startJourney('Life');
    await screen.findByText(question.questionText);
    expect(practiceJourney).toHaveBeenLastCalledWith('Life');
  });

  it('disables goal shortcuts until the pending reward check can recover', async () => {
    vi.mocked(getServerPendingReward).mockRejectedValueOnce(new Error('Offline'));
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Learn' }));
    await screen.findByText('Could not check your uncollected Resources. Retry to continue.');
    expect(screen.getByRole('button', { name: 'Learn Life for Essence' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry Resources' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Learn Life for Essence' })).toBeEnabled());
    expect(practiceJourney).not.toHaveBeenCalled();
  });

  it('does not invent a local goal when the database read fails', async () => {
    vi.mocked(getServerGoal).mockRejectedValueOnce(new Error('Offline'));
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Learn' }));
    await screen.findByText('Your saved goal is unavailable. Retry to continue.');
    expect(screen.getByRole('combobox', { name: 'Choose progression goal' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Learn Life for Essence' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose topic Physics' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry goal' }));
    await screen.findByRole('button', { name: 'Learn Life for Essence' });
    expect(localStorage.getItem(goalStorageKey(`account:${userId}`))).toBeNull();
  });

  it('waits for committed goal writes and retries a failed dismissal across reload', async () => {
    vi.mocked(setServerGoal).mockRejectedValueOnce(new Error('Connection lost'));
    let app = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Learn' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss goal' }));
    await screen.findByText('Could not save your goal. Retry to confirm your selection.');
    expect(screen.getByRole('button', { name: 'Learn Life for Essence' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry goal' }));
    await screen.findByText('Choose a construction or upgrade to guide your learning.');
    expect(setServerGoal).toHaveBeenNthCalledWith(1, null, 0);
    expect(setServerGoal).toHaveBeenNthCalledWith(2, null, 0);
    app.unmount(); localStorage.clear(); app = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Learn' }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Choose progression goal' })).toBeEnabled());
    expect(screen.queryByRole('button', { name: 'Learn Life for Essence' })).not.toBeInTheDocument();
    app.unmount();
  });

  it('refreshes a goal changed on another device and rejects a stale edit', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Learn' }));
    await screen.findByRole('button', { name: 'Learn Life for Essence' });
    vi.mocked(getServerGoal).mockResolvedValue({ goal: { type: 'castle', level: 2 }, revision: 1 });
    fireEvent(window, new Event('focus'));
    await screen.findByRole('button', { name: 'Learn Mind & Behavior for Insight' });
    const conflict = new LearningRequestError('Your goal changed on another device.'); conflict.httpStatus = 409;
    vi.mocked(setServerGoal).mockRejectedValueOnce(conflict);
    vi.mocked(getServerGoal).mockResolvedValue({ goal: { type: 'building', id: 'barracks', level: 1 }, revision: 2 });
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss goal' }));
    await screen.findByText('Your goal changed on another device. Review it and choose again.');
    expect(screen.getByRole('button', { name: 'Learn Earth & Space for Astral Dust' })).toBeInTheDocument();
    expect(setServerGoal).toHaveBeenCalledOnce();
  });

  it('ignores an old account’s delayed goal save after switching accounts', async () => {
    let resolve!: (value: GoalSnapshot) => void;
    vi.mocked(setServerGoal).mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    const app = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Learn' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss goal' }));
    await screen.findByText('Saving your goal…');
    expect(screen.getByRole('button', { name: 'Dismiss goal' })).toBeDisabled();
    session.user.id = '22222222-2222-4222-8222-222222222222'; app.rerender(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Learn' }));
    await screen.findByRole('button', { name: 'Learn Life for Essence' });
    await act(async () => resolve({ goal: null, revision: 1 }));
    expect(screen.getByRole('button', { name: 'Learn Life for Essence' })).toBeInTheDocument();
  });

  it('shows the same multi-resource receipt after refresh and credits exactly those HUD balances even if animation fails', async () => {
    const reward = { id: question.id!, correct: true, totalKnowledge: 10,
      topicWeights: { Physics: .7, 'Mathematics & Logic': .2, 'Earth & Space': .1 },
      lines: [{ key: 'force' as const, amount: 7 }, { key: 'runes' as const, amount: 2 }, { key: 'astral' as const, amount: 1 }] };
    const pending = { ...answered.question, topicWeights: { Life: 1 }, reward };
    vi.mocked(submitServerAnswer).mockResolvedValueOnce({ ...answered, question: pending, reward });
    vi.mocked(collectServerReward).mockResolvedValueOnce({ ...answered.kingdom, reward, revision: 2,
      state: { ...newKingdom(), tokens: { ...newKingdom().tokens, Physics: 7, 'Mathematics & Logic': 2, 'Earth & Space': 1 } } });
    // A forged Demo reward in account storage never reaches signed-in collection.
    localStorage.setItem(`curious_y_pending_reward_${userId}`, JSON.stringify({ ...pending, reward: { ...reward, totalKnowledge: 9999 } }));
    const app = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Learn' }));
    await startJourney('Physics');
    fireEvent.click(await screen.findByRole('button', { name: /It changes velocity/i }));
    await screen.findByText('+7 Force');
    expect(screen.getByText('+2 Runes')).toBeInTheDocument();
    expect(screen.getByText('+1 Astral Dust')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Resources' })).toHaveTextContent('Force 0');
    app.unmount(); vi.mocked(getServerPendingReward).mockResolvedValueOnce(pending);
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Learn' }));
    const collect = await screen.findByRole('button', { name: 'Collect' });
    expect(screen.getByText('+7 Force')).toBeInTheDocument();
    const original = HTMLElement.prototype.animate;
    HTMLElement.prototype.animate = () => { throw new Error('animation unsupported'); };
    try {
      fireEvent.click(collect);
      await screen.findByRole('button', { name: 'Next Question' });
      expect(screen.getByRole('region', { name: 'Resources' })).toHaveTextContent('Force 7');
      expect(screen.getByRole('region', { name: 'Resources' })).toHaveTextContent('Runes 2');
      expect(screen.getByRole('region', { name: 'Resources' })).toHaveTextContent('Astral Dust 1');
      expect(screen.getByText('+10 Resources collected!')).toBeInTheDocument();
      expect(loadKingdom(userId).tokens.Physics).toBe(0);
      expect(document.querySelectorAll('.collect-resource-particle')).toHaveLength(0);
    } finally { HTMLElement.prototype.animate = original; }
  });

  it('recovers the server pending reward on refresh and retries a failed collection', async () => {
    vi.mocked(getServerPendingReward).mockResolvedValue(answered.question);
    vi.mocked(collectServerReward).mockRejectedValueOnce(new Error('Connection interrupted. Retry Collect.'));
    const app = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Learn' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Collect' }));
    await screen.findByText('Connection interrupted. Retry Collect.');
    expect(screen.queryByRole('button', { name: 'Next Question' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Resources' })).toHaveTextContent('Force 0');
    app.unmount();
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Learn' }));
    const collect = await screen.findByRole('button', { name: 'Collect' });
    fireEvent.click(collect);
    fireEvent.click(collect);
    await screen.findByRole('button', { name: 'Next Question' });
    expect(collectServerReward).toHaveBeenCalledTimes(2);
    expect(collectServerReward).toHaveBeenLastCalledWith(question.id);
    expect(screen.getByRole('region', { name: 'Resources' })).toHaveTextContent('Force 10');
    expect(practiceJourney).not.toHaveBeenCalled();
  });

  it('blocks generation while pending rewards cannot be loaded', async () => {
    vi.mocked(getServerPendingReward).mockRejectedValueOnce(new Error('Offline'));
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Learn' }));
    await screen.findByText('Could not check your uncollected Resources. Retry to continue.');
    expect(screen.queryByRole('button', { name: 'Choose topic Physics' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry Resources' }));
    await screen.findByRole('button', { name: 'Choose topic Physics' });
    expect(practiceJourney).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    localStorage.clear(); vi.clearAllMocks();
    vi.mocked(getKnowledgeGraph).mockResolvedValue(journeyView({id:'test-journey',chapter:1,plan:starterJourney('Physics'),progress:{}}));
    session.user.id = userId;
    const goals = new Map<string, GoalSnapshot>();
    vi.mocked(getServerGoal).mockImplementation(async () => goals.get(session.user.id) ?? { goal: { type: 'building', id: 'barracks', level: 1 }, revision: 0 });
    vi.mocked(setServerGoal).mockImplementation(async (goal, revision) => {
      const next = { goal, revision: revision + 1 };
      goals.set(session.user.id, next);
      return next;
    });
    preferences.settings.hasApiKey = true;
    preferences.loading = false;
    preferences.error = null;
    vi.mocked(practiceJourney).mockResolvedValue(question);
    vi.mocked(submitServerAnswer).mockResolvedValue(answered);
    vi.mocked(getServerPendingReward).mockResolvedValue(null);
    vi.mocked(collectServerReward).mockResolvedValue({ ...answered.kingdom, reward: answered.reward, revision: 2, state: { ...newKingdom(), tokens: { ...newKingdom().tokens, Physics: 10, Life:5, 'Earth & Space':5 } } });
    vi.mocked(getServerKingdom).mockResolvedValue({ state: newKingdom(), revision: 0, generation: 0 });
    let server: KingdomSnapshot = { ...structuredClone(answered.kingdom), state: { ...newKingdom(), tokens: { ...newKingdom().tokens, Physics: 10, Life:5, 'Earth & Space':5 } } };
    vi.mocked(commandServerKingdom).mockImplementation(async command => {
      server = { ...server, revision: server.revision + 1, state: applyAction(server.state, command) };
      return server;
    });
  });

  it('checks for a saved key before offering live questions', async () => {
    preferences.settings.hasApiKey = false;
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Learn' }));
    expect(await screen.findByText('Add your Gemini key to get started')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Choose topic Physics' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Configure Gemini Settings' }));
    expect(screen.getByLabelText(/Gemini API Key/i)).toBeInTheDocument();
    expect(practiceJourney).not.toHaveBeenCalled();
  });

  it('offers Settings when the server finds a missing key despite cached key status', async () => {
    vi.mocked(practiceJourney).mockRejectedValueOnce(missingGeminiKey());
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Learn' }));
    await startJourney('Physics');
    await screen.findByText('Check your Gemini key');
    fireEvent.click(screen.getByRole('button', { name: 'Open Settings' }));
    expect(screen.getByLabelText(/Gemini API Key/i)).toBeInTheDocument();
  });

  it('retries the selected topic after a connection failure', async () => {
    vi.mocked(practiceJourney).mockRejectedValueOnce(new LearningRequestError('Check your connection and try again.'));
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Learn' }));
    await startJourney('Physics');
    await screen.findByText('Couldn’t load a question');
    expect(screen.queryByRole('button', { name: 'Open Settings' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByText(question.questionText);
    expect(practiceJourney).toHaveBeenLastCalledWith('Physics');
  });

  it('does not claim the key is missing when its status could not be checked', async () => {
    preferences.settings.hasApiKey = false;
    preferences.error = 'Gemini key status is unavailable.';
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Learn' }));
    expect(screen.queryByText('Add your Gemini key to get started')).not.toBeInTheDocument();
    await startJourney('Physics');
    await screen.findByText(question.questionText);
    expect(practiceJourney).toHaveBeenCalledWith('Physics');
  });

  it('preserves the server question ID and waits for verification before awarding the local currency', async () => {
    let resolve!: (result: AnswerResult) => void;
    vi.mocked(submitServerAnswer).mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Learn' }));
    await startJourney('Physics');
    const option = await screen.findByRole('button', { name: /It changes velocity/i });
    fireEvent.click(option);
    expect(submitServerAnswer).toHaveBeenCalledWith('server-issued-question', 0);
    expect(loadKingdom(userId).tokens.Physics).toBe(0);
    expect(option).toBeDisabled();
    await act(async () => { resolve(answered); });
    await screen.findByText('+10 Resources ready to collect!');
    expect(loadKingdom(userId).tokens.Physics).toBe(0); // Server rewards never enter writable browser storage.
    expect(loadKingdom(userId).gold).toBe(0);
    expect(screen.queryByText(/Archive Key|32 Gold|yield|ranked arena/i)).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Resources' })).toHaveTextContent('Force 0');
    fireEvent.click(screen.getByRole('button', { name: 'Collect' }));
    await screen.findByText('+10 Resources collected!');
    fireEvent.click(screen.getByRole('button', { name: 'Castle · Level 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Recruitment Hall · Empty plot' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Build Recruitment Hall · 5 Essence · 5 Astral Dust' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Build Recruitment Hall · 5 Essence · 5 Astral Dust' }));
    await screen.findByRole('button', { name: 'Recruitment Hall · Level 1' });
  });

  it('shows an in-flight answer through tab switches, locks choices, and clears the indicator on completion', async () => {
    let finish!: (result: AnswerResult) => void;
    vi.mocked(submitServerAnswer).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Learn' }));
    await startJourney('Physics');
    fireEvent.click(await screen.findByRole('button', { name: /It changes velocity/i }));
    expect(screen.getByText('Checking your answer…')).toBeInTheDocument();
    expect(screen.getByTestId('option-A')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('option-B')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Change Topic' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Castle · Level 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Learn' }));
    expect(screen.getByText('Checking your answer…')).toBeInTheDocument();
    expect(screen.getByTestId('option-B')).toBeDisabled();
    await act(async () => finish(answered));
    expect(screen.queryByText('Checking your answer…')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Collect' })).toBeEnabled();
    expect(submitServerAnswer).toHaveBeenCalledTimes(1);
  });

  it('allows a failed answer submission to be retried without earning twice', async () => {
    vi.mocked(submitServerAnswer).mockRejectedValueOnce(new Error('Connection interrupted. Select your answer again.'));
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Learn' }));
    await startJourney('Physics');
    const option = await screen.findByRole('button', { name: /It changes velocity/i });
    fireEvent.click(option);
    await screen.findByText('Connection interrupted. Select your answer again.');
    expect(screen.queryByText('Checking your answer…')).not.toBeInTheDocument();
    await waitFor(() => expect(option).toBeEnabled());
    expect(loadKingdom(userId).tokens.Physics).toBe(0);
    fireEvent.click(option);
    await screen.findByText('+10 Resources ready to collect!');
    expect(submitServerAnswer).toHaveBeenCalledTimes(2);
    expect(loadKingdom(userId).tokens.Physics).toBe(0); // Server rewards never enter writable browser storage.
  });

  it('replaces an expired question in the same topic without scoring the stale answer', async () => {
    vi.mocked(submitServerAnswer).mockRejectedValueOnce(learningPayloadFailure('Question has expired'));
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Learn' }));
    await startJourney('Physics');
    const option = await screen.findByRole('button', { name: /It changes velocity/i });
    fireEvent.click(option);
    await screen.findByText('Ready for a fresh question?');
    expect(screen.queryByText(/Select your answer again to retry/)).not.toBeInTheDocument();
    expect(option).toBeDisabled();
    fireEvent.click(option);
    expect(submitServerAnswer).toHaveBeenCalledTimes(1);
    expect(loadKingdom(userId).tokens.Physics).toBe(0);

    // A temporary generation failure keeps the expired answers disabled and recovery available.
    vi.mocked(practiceJourney).mockRejectedValueOnce(new LearningRequestError('Please retry shortly.'));
    fireEvent.click(screen.getByRole('button', { name: 'Get a fresh question' }));
    await screen.findByText('Please retry shortly.');
    expect(option).toBeDisabled();
    const fresh = { ...question, id: 'fresh-question', questionText: 'Why does acceleration change velocity?' };
    vi.mocked(practiceJourney).mockResolvedValueOnce(fresh);
    fireEvent.click(screen.getByRole('button', { name: 'Get a fresh question' }));
    await screen.findByText(fresh.questionText);
    expect(practiceJourney).toHaveBeenLastCalledWith('Physics');
    expect(screen.queryByText('Ready for a fresh question?')).not.toBeInTheDocument();
    vi.mocked(submitServerAnswer).mockResolvedValueOnce({ ...answered, question: { ...answered.question, id: fresh.id } });
    fireEvent.click(screen.getByRole('button', { name: /It changes velocity/i }));
    await screen.findByText('+10 Resources ready to collect!');
    expect(submitServerAnswer).toHaveBeenLastCalledWith('fresh-question', 0);
    expect(loadKingdom(userId).tokens.Physics).toBe(0); // Server rewards never enter writable browser storage.
  });

  it('ignores a late expiry rejection after switching questions', async () => {
    let reject!: (error: Error) => void;
    vi.mocked(submitServerAnswer).mockImplementationOnce(() => new Promise((_, r) => { reject = r; }));
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Learn' }));
    await startJourney('Physics');
    fireEvent.click(await screen.findByRole('button', { name: /It changes velocity/i }));
    fireEvent.click(screen.getByTitle('Return to home / choose topic'));
    vi.mocked(practiceJourney).mockResolvedValueOnce({ ...question, id: 'new-question', questionText: 'A new question' });
    await startJourney('Physics');
    await screen.findByText('A new question');
    await act(async () => { reject(learningPayloadFailure('Question has expired')); });
    expect(screen.queryByText('Ready for a fresh question?')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /It changes velocity/i })).toBeEnabled();
  });

  it('recovers a late verified answer so its reward cannot be bypassed', async () => {
    let resolve!: (result: AnswerResult) => void;
    vi.mocked(submitServerAnswer).mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Learn' }));
    await startJourney('Physics');
    fireEvent.click(await screen.findByRole('button', { name: /It changes velocity/i }));
    fireEvent.click(screen.getByTitle('Return to home / choose topic'));
    vi.mocked(practiceJourney).mockResolvedValueOnce({ ...question, id: 'next-server-id', questionText: 'A newer question?' });
    await startJourney('Physics');
    await screen.findByText('A newer question?');
    await act(async () => { resolve(answered); });
    expect(screen.queryByText('A newer question?')).not.toBeInTheDocument();
    expect(screen.getByText('Why does force change motion?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Collect' })).toBeInTheDocument();
    expect(loadKingdom(userId).tokens.Physics).toBe(0); // Server rewards never enter writable browser storage.
  });
});
