import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { generateServerQuestion, submitServerAnswer, AnswerResult, getServerKingdom, commandServerKingdom, getServerPendingReward, collectServerReward } from '../services/backend';
import { loadKingdom } from '../lib/kingdom/storage';
import { newKingdom, applyAction, type KingdomSnapshot } from '../lib/kingdom/game';
import { createInitialGameState } from '../game/economy';
import { Question } from '../types';
import { LearningRequestError, learningPayloadFailure, missingGeminiKey } from '../services/learningErrors';

const userId = '11111111-1111-4111-8111-111111111111';
const session = vi.hoisted(() => ({ user: { id: '11111111-1111-4111-8111-111111111111', user_metadata: {} }, loading: false, isDemoUser: false }));
const preferences = vi.hoisted(() => ({ settings: { apiKey: '', hasApiKey: true }, loading: false, error: null as string | null }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => session }));
vi.mock('../context/SettingsContext', () => ({ useSettings: () => preferences }));
vi.mock('../services/backend', () => ({ generateServerQuestion: vi.fn(), submitServerAnswer: vi.fn(), getServerKingdom: vi.fn(), commandServerKingdom: vi.fn(), getServerPendingReward: vi.fn(), collectServerReward: vi.fn() }));
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
