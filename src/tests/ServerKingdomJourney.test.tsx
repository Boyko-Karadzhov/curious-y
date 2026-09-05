import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { generateServerQuestion, submitServerAnswer, AnswerResult, getServerKingdom, commandServerKingdom, getServerPendingReward, collectServerReward, getServerGoal, setServerGoal, GoalSnapshot } from '../services/backend';
import { loadKingdom } from '../lib/kingdom/storage';
import { newKingdom, applyAction, type KingdomSnapshot } from '../lib/kingdom/game';
import { createInitialGameState } from '../game/economy';
import { goalStorageKey } from '../lib/kingdom/goals';
import { Question } from '../types';
import { LearningRequestError, learningPayloadFailure, missingGeminiKey } from '../services/learningErrors';

const userId = '11111111-1111-4111-8111-111111111111';
const session = vi.hoisted(() => ({ user: { id: '11111111-1111-4111-8111-111111111111', user_metadata: {} }, loading: false, isDemoUser: false }));
const preferences = vi.hoisted(() => ({ settings: { apiKey: '', hasApiKey: true }, loading: false, error: null as string | null }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => session }));
vi.mock('../context/SettingsContext', () => ({ useSettings: () => preferences }));
vi.mock('../services/backend', () => ({ generateServerQuestion: vi.fn(), submitServerAnswer: vi.fn(), getServerKingdom: vi.fn(), commandServerKingdom: vi.fn(), getServerPendingReward: vi.fn(), collectServerReward: vi.fn(), getServerGoal: vi.fn(), setServerGoal: vi.fn() }));
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
  reward: { id: 'legacy-server-reward', gold: 32, keys: 1, totalKnowledge: 20, multiplier: 1, multiplierLabel: 'Learning', correct: true, lines: [{ key: 'force', amount: 20 }] },
};

describe('Merged server learning → Phase I journey', () => {
  it('isolates preferences on an in-place account switch and restores selection on reload', async () => {
    const app = render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Learn Physics for Force' }));
    await screen.findByText(question.questionText);
    fireEvent.click(screen.getByRole('button', { name: 'Castle · Level 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Set Siege Workshop goal' }));
    await waitFor(() => expect(screen.getByRole('region', { name: 'Current progression goal' })).toHaveTextContent('Build Siege Workshop'));
    session.user.id = '22222222-2222-4222-8222-222222222222';
    app.rerender(<App />);
    await screen.findByRole('button', { name: 'Learn Physics for Force' });
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss goal' }));
    await screen.findByText('Choose a construction or upgrade to guide your learning.');
    session.user.id = userId;
    app.rerender(<App />);
    await screen.findByRole('button', { name: 'Learn Computer Science for Logic Cores' });
    app.unmount();
    localStorage.clear(); // A different device has no browser preference to restore.
    render(<App />);
    await screen.findByRole('button', { name: 'Learn Computer Science for Logic Cores' });
    expect(localStorage.getItem(goalStorageKey(`account:${userId}`))).toBeNull();
    expect(screen.getByRole('region', { name: 'Resources' })).toHaveTextContent('Logic Cores 0');
  });

  it('does not create a default goal from an unavailable Castle or trust a saved preference as currency', async () => {
    localStorage.setItem(goalStorageKey(`account:${userId}`), JSON.stringify({ type: 'building', id: 'barracks', level: 1, gold: 99999, tokens: { Physics: 99999 } }));
    vi.mocked(getServerKingdom).mockRejectedValueOnce(new Error('Castle offline'));
    render(<App />);
    await screen.findByText('Reload Castle to check goal progress.');
    expect(screen.queryByRole('button', { name: 'Learn Physics for Force' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Complete goal:/ })).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Reload Castle' }));
    await screen.findByRole('button', { name: 'Learn Physics for Force' });
    expect(screen.getByRole('region', { name: 'Current progression goal' })).toHaveTextContent('Force: 0 / 10');
    expect(commandServerKingdom).not.toHaveBeenCalled();
  });

  it('routes a goal through the API-key requirement without generating a sample question', async () => {
    preferences.settings.hasApiKey = false;
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Learn Physics for Force' }));
    await screen.findByText('Application Settings');
    expect(generateServerQuestion).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Close modal' }));
    preferences.settings.hasApiKey = true;
    // Settings updates normally trigger a context render.
    fireEvent.click(screen.getByRole('button', { name: 'Learn' }));
    fireEvent.click(screen.getByRole('button', { name: 'Learn Physics for Force' }));
    await screen.findByText(question.questionText);
    expect(generateServerQuestion).toHaveBeenLastCalledWith('Physics');
  });

  it('disables goal shortcuts until the pending reward check can recover', async () => {
    vi.mocked(getServerPendingReward).mockRejectedValueOnce(new Error('Offline'));
    render(<App />);
    await screen.findByText('Could not check your uncollected Resources. Retry to continue.');
    expect(screen.getByRole('button', { name: 'Learn Physics for Force' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry Resources' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Learn Physics for Force' })).toBeEnabled());
    expect(generateServerQuestion).not.toHaveBeenCalled();
  });

  it('does not invent a local goal when the database read fails', async () => {
    vi.mocked(getServerGoal).mockRejectedValueOnce(new Error('Offline'));
    render(<App />);
    await screen.findByText('Your saved goal is unavailable. Retry to continue.');
    expect(screen.getByRole('combobox', { name: 'Choose progression goal' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Learn Physics for Force' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Choose topic Physics/ })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry goal' }));
    await screen.findByRole('button', { name: 'Learn Physics for Force' });
    expect(localStorage.getItem(goalStorageKey(`account:${userId}`))).toBeNull();
  });

  it('waits for committed goal writes and retries a failed dismissal across reload', async () => {
    vi.mocked(setServerGoal).mockRejectedValueOnce(new Error('Connection lost'));
    let app = render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss goal' }));
    await screen.findByText('Could not save your goal. Retry to confirm your selection.');
    expect(screen.getByRole('button', { name: 'Learn Physics for Force' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry goal' }));
    await screen.findByText('Choose a construction or upgrade to guide your learning.');
    expect(setServerGoal).toHaveBeenNthCalledWith(1, null, 0);
    expect(setServerGoal).toHaveBeenNthCalledWith(2, null, 0);
    app.unmount(); localStorage.clear(); app = render(<App />);
    await waitFor(() => expect(screen.getByRole('combobox')).toBeEnabled());
    expect(screen.queryByRole('button', { name: 'Learn Physics for Force' })).not.toBeInTheDocument();
    app.unmount();
  });

  it('refreshes a goal changed on another device and rejects a stale edit', async () => {
    render(<App />);
    await screen.findByRole('button', { name: 'Learn Physics for Force' });
    vi.mocked(getServerGoal).mockResolvedValue({ goal: { type: 'castle', level: 2 }, revision: 1 });
    fireEvent(window, new Event('focus'));
    await screen.findByRole('button', { name: 'Learn Mathematics & Logic for Runes' });
    const conflict = new LearningRequestError('Your goal changed on another device.'); conflict.httpStatus = 409;
    vi.mocked(setServerGoal).mockRejectedValueOnce(conflict);
    vi.mocked(getServerGoal).mockResolvedValue({ goal: { type: 'building', id: 'range', level: 1 }, revision: 2 });
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss goal' }));
    await screen.findByText('Your goal changed on another device. Review it and choose again.');
    expect(screen.getByRole('button', { name: 'Learn Earth & Space for Astral Dust' })).toBeInTheDocument();
    expect(setServerGoal).toHaveBeenCalledOnce();
  });

  it('ignores an old account’s delayed goal save after switching accounts', async () => {
    let resolve!: (value: GoalSnapshot) => void;
    vi.mocked(setServerGoal).mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    const app = render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss goal' }));
    await screen.findByText('Saving your goal…');
    expect(screen.getByRole('button', { name: 'Dismiss goal' })).toBeDisabled();
    session.user.id = '22222222-2222-4222-8222-222222222222'; app.rerender(<App />);
    await screen.findByRole('button', { name: 'Learn Physics for Force' });
    await act(async () => resolve({ goal: null, revision: 1 }));
    expect(screen.getByRole('button', { name: 'Learn Physics for Force' })).toBeInTheDocument();
  });

  it('recovers the server pending reward on refresh and retries a failed collection', async () => {
    vi.mocked(getServerPendingReward).mockResolvedValue(answered.question);
    vi.mocked(collectServerReward).mockRejectedValueOnce(new Error('Connection interrupted. Retry Collect.'));
    const app = render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Collect' }));
    await screen.findByText('Connection interrupted. Retry Collect.');
    expect(screen.queryByRole('button', { name: 'Next Question' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Resources' })).toHaveTextContent('Force 0');
    app.unmount();
    render(<App />);
    const collect = await screen.findByRole('button', { name: 'Collect' });
    fireEvent.click(collect);
    fireEvent.click(collect);
    await screen.findByRole('button', { name: 'Next Question' });
    expect(collectServerReward).toHaveBeenCalledTimes(2);
    expect(collectServerReward).toHaveBeenLastCalledWith(question.id);
    expect(screen.getByRole('region', { name: 'Resources' })).toHaveTextContent('Force 10');
    expect(generateServerQuestion).not.toHaveBeenCalled();
  });

  it('blocks generation while pending rewards cannot be loaded', async () => {
    vi.mocked(getServerPendingReward).mockRejectedValueOnce(new Error('Offline'));
    render(<App />);
    await screen.findByText('Could not check your uncollected Resources. Retry to continue.');
    expect(screen.queryByRole('button', { name: /Choose topic Physics/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry Resources' }));
    await screen.findByRole('button', { name: /Choose topic Physics/i });
    expect(generateServerQuestion).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    localStorage.clear(); vi.clearAllMocks();
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
    vi.mocked(generateServerQuestion).mockResolvedValue(question);
    vi.mocked(submitServerAnswer).mockResolvedValue(answered);
    vi.mocked(getServerPendingReward).mockResolvedValue(null);
    vi.mocked(collectServerReward).mockResolvedValue({ ...answered.kingdom, revision: 2, state: { ...newKingdom(), tokens: { ...newKingdom().tokens, Physics: 10 } } });
    vi.mocked(getServerKingdom).mockResolvedValue({ state: newKingdom(), revision: 0, generation: 0 });
    let server: KingdomSnapshot = { ...structuredClone(answered.kingdom), state: { ...newKingdom(), tokens: { ...newKingdom().tokens, Physics: 10 } } };
    vi.mocked(commandServerKingdom).mockImplementation(async command => {
      server = { ...server, revision: server.revision + 1, state: applyAction(server.state, command) };
      return server;
    });
  });

  it('checks for a saved key before offering live questions', async () => {
    preferences.settings.hasApiKey = false;
    render(<App />);
    expect(await screen.findByText('Add your Gemini key to get started')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Choose topic Physics/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Configure Gemini Settings' }));
    expect(screen.getByLabelText(/Gemini API Key/i)).toBeInTheDocument();
    expect(generateServerQuestion).not.toHaveBeenCalled();
  });

  it('offers Settings when the server finds a missing key despite cached key status', async () => {
    vi.mocked(generateServerQuestion).mockRejectedValueOnce(missingGeminiKey());
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /Choose topic Physics/i }));
    await screen.findByText('Check your Gemini key');
    fireEvent.click(screen.getByRole('button', { name: 'Open Settings' }));
    expect(screen.getByLabelText(/Gemini API Key/i)).toBeInTheDocument();
  });

  it('retries the selected topic after a connection failure', async () => {
    vi.mocked(generateServerQuestion).mockRejectedValueOnce(new LearningRequestError('Check your connection and try again.'));
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /Choose topic Physics/i }));
    await screen.findByText('Couldn’t load a question');
    expect(screen.queryByRole('button', { name: 'Open Settings' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByText(question.questionText);
    expect(generateServerQuestion).toHaveBeenLastCalledWith('Physics');
  });

  it('does not claim the key is missing when its status could not be checked', async () => {
    preferences.settings.hasApiKey = false;
    preferences.error = 'Gemini key status is unavailable.';
    render(<App />);
    expect(screen.queryByText('Add your Gemini key to get started')).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: /Choose topic Physics/i }));
    await screen.findByText(question.questionText);
    expect(generateServerQuestion).toHaveBeenCalledWith('Physics');
  });

  it('preserves the server question ID and waits for verification before awarding the local currency', async () => {
    let resolve!: (result: AnswerResult) => void;
    vi.mocked(submitServerAnswer).mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /Choose topic Physics/i }));
    const option = await screen.findByRole('button', { name: /It changes velocity/i });
    fireEvent.click(option);
    expect(submitServerAnswer).toHaveBeenCalledWith('server-issued-question', 0);
    expect(loadKingdom(userId).tokens.Physics).toBe(0);
    expect(option).toBeDisabled();
    await act(async () => { resolve(answered); });
    await screen.findByText('+10 Force ready to collect!');
    expect(loadKingdom(userId).tokens.Physics).toBe(0); // Server rewards never enter writable browser storage.
    expect(loadKingdom(userId).gold).toBe(0);
    expect(screen.queryByText(/Archive Key|32 Gold|yield|ranked arena/i)).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Resources' })).toHaveTextContent('Force 0');
    fireEvent.click(screen.getByRole('button', { name: 'Collect' }));
    await screen.findByText('+10 Force collected!');
    fireEvent.click(screen.getByRole('button', { name: 'Castle · Level 1' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Build Barracks · 10 Force' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Build Barracks · 10 Force' }));
    await screen.findByText('Level 1 · Swordsman unlocked');
  });

  it('allows a failed answer submission to be retried without earning twice', async () => {
    vi.mocked(submitServerAnswer).mockRejectedValueOnce(new Error('Connection interrupted. Select your answer again.'));
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /Choose topic Physics/i }));
    const option = await screen.findByRole('button', { name: /It changes velocity/i });
    fireEvent.click(option);
    await screen.findByText('Connection interrupted. Select your answer again.');
    await waitFor(() => expect(option).toBeEnabled());
    expect(loadKingdom(userId).tokens.Physics).toBe(0);
    fireEvent.click(option);
    await screen.findByText('+10 Force ready to collect!');
    expect(submitServerAnswer).toHaveBeenCalledTimes(2);
    expect(loadKingdom(userId).tokens.Physics).toBe(0); // Server rewards never enter writable browser storage.
  });

  it('replaces an expired question in the same topic without scoring the stale answer', async () => {
    vi.mocked(submitServerAnswer).mockRejectedValueOnce(learningPayloadFailure('Question has expired'));
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /Choose topic Physics/i }));
    const option = await screen.findByRole('button', { name: /It changes velocity/i });
    fireEvent.click(option);
    await screen.findByText('Ready for a fresh question?');
    expect(screen.queryByText(/Select your answer again to retry/)).not.toBeInTheDocument();
    expect(option).toBeDisabled();
    fireEvent.click(option);
    expect(submitServerAnswer).toHaveBeenCalledTimes(1);
    expect(loadKingdom(userId).tokens.Physics).toBe(0);

    // A temporary generation failure keeps the expired answers disabled and recovery available.
    vi.mocked(generateServerQuestion).mockRejectedValueOnce(new LearningRequestError('Please retry shortly.'));
    fireEvent.click(screen.getByRole('button', { name: 'Get a fresh question' }));
    await screen.findByText('Please retry shortly.');
    expect(option).toBeDisabled();
    const fresh = { ...question, id: 'fresh-question', questionText: 'Why does acceleration change velocity?' };
    vi.mocked(generateServerQuestion).mockResolvedValueOnce(fresh);
    fireEvent.click(screen.getByRole('button', { name: 'Get a fresh question' }));
    await screen.findByText(fresh.questionText);
    expect(generateServerQuestion).toHaveBeenLastCalledWith('Physics');
    expect(screen.queryByText('Ready for a fresh question?')).not.toBeInTheDocument();
    vi.mocked(submitServerAnswer).mockResolvedValueOnce({ ...answered, question: { ...answered.question, id: fresh.id } });
    fireEvent.click(screen.getByRole('button', { name: /It changes velocity/i }));
    await screen.findByText('+10 Force ready to collect!');
    expect(submitServerAnswer).toHaveBeenLastCalledWith('fresh-question', 0);
    expect(loadKingdom(userId).tokens.Physics).toBe(0); // Server rewards never enter writable browser storage.
  });

  it('ignores a late expiry rejection after switching questions', async () => {
    let reject!: (error: Error) => void;
    vi.mocked(submitServerAnswer).mockImplementationOnce(() => new Promise((_, r) => { reject = r; }));
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /Choose topic Physics/i }));
    fireEvent.click(await screen.findByRole('button', { name: /It changes velocity/i }));
    fireEvent.click(screen.getByTitle('Return to home / choose topic'));
    vi.mocked(generateServerQuestion).mockResolvedValueOnce({ ...question, id: 'new-question', questionText: 'A new question' });
    fireEvent.click(await screen.findByRole('button', { name: /Choose topic Physics/i }));
    await screen.findByText('A new question');
    await act(async () => { reject(learningPayloadFailure('Question has expired')); });
    expect(screen.queryByText('Ready for a fresh question?')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /It changes velocity/i })).toBeEnabled();
  });

  it('recovers a late verified answer so its reward cannot be bypassed', async () => {
    let resolve!: (result: AnswerResult) => void;
    vi.mocked(submitServerAnswer).mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /Choose topic Physics/i }));
    fireEvent.click(await screen.findByRole('button', { name: /It changes velocity/i }));
    fireEvent.click(screen.getByTitle('Return to home / choose topic'));
    vi.mocked(generateServerQuestion).mockResolvedValueOnce({ ...question, id: 'next-server-id', questionText: 'A newer question?' });
    fireEvent.click(await screen.findByRole('button', { name: /Choose topic Physics/i }));
    await screen.findByText('A newer question?');
    await act(async () => { resolve(answered); });
    expect(screen.queryByText('A newer question?')).not.toBeInTheDocument();
    expect(screen.getByText('Why does force change motion?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Collect' })).toBeInTheDocument();
    expect(loadKingdom(userId).tokens.Physics).toBe(0); // Server rewards never enter writable browser storage.
  });
});
