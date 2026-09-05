import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { generateServerQuestion, submitServerAnswer, AnswerResult } from '../services/backend';
import { loadKingdom } from '../lib/kingdom/storage';
import { createInitialGameState } from '../game/economy';
import { Question } from '../types';
import { LearningRequestError, learningPayloadFailure, missingGeminiKey } from '../services/learningErrors';

const userId = '11111111-1111-4111-8111-111111111111';
const session = vi.hoisted(() => ({ user: { id: '11111111-1111-4111-8111-111111111111', user_metadata: {} }, loading: false, isDemoUser: false }));
const preferences = vi.hoisted(() => ({ settings: { apiKey: '', hasApiKey: true }, loading: false, error: null as string | null }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => session }));
vi.mock('../context/SettingsContext', () => ({ useSettings: () => preferences }));
vi.mock('../services/backend', () => ({ generateServerQuestion: vi.fn(), submitServerAnswer: vi.fn() }));
vi.mock('../services/database', async importOriginal => ({
  ...await importOriginal<typeof import('../services/database')>(),
  getQuestionHistory: vi.fn().mockResolvedValue([]), getChatMessages: vi.fn().mockResolvedValue([]),
}));
const question: Question = { id: 'server-issued-question', topic: 'Physics', questionText: 'Why does force change motion?',
  options: ['It changes velocity', 'It removes mass', 'It stops time', 'It removes gravity'], correctIndex: -1, explanation: '' };
const answered: AnswerResult = {
  question: { ...question, selectedIndex: 0, correctIndex: 0, isCorrect: true, explanation: 'Force produces acceleration.' },
  stats: createInitialGameState(),
  reward: { id: 'legacy-server-reward', gold: 32, keys: 1, totalKnowledge: 20, multiplier: 1, multiplierLabel: 'Learning', correct: true, lines: [{ key: 'force', amount: 20 }] },
};

describe('Merged server learning → Phase I journey', () => {
  beforeEach(() => {
    localStorage.clear(); vi.clearAllMocks();
    preferences.settings.hasApiKey = true;
    preferences.loading = false;
    preferences.error = null;
    vi.mocked(generateServerQuestion).mockResolvedValue(question);
    vi.mocked(submitServerAnswer).mockResolvedValue(answered);
  });

  it('checks for a saved key before offering live questions', () => {
    preferences.settings.hasApiKey = false;
    render(<App />);
    expect(screen.getByText('Add your Gemini key to get started')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Choose topic Physics/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Configure Gemini Settings' }));
    expect(screen.getByLabelText(/Gemini API Key/i)).toBeInTheDocument();
    expect(generateServerQuestion).not.toHaveBeenCalled();
  });

  it('offers Settings when the server finds a missing key despite cached key status', async () => {
    vi.mocked(generateServerQuestion).mockRejectedValueOnce(missingGeminiKey());
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Choose topic Physics/i }));
    await screen.findByText('Check your Gemini key');
    fireEvent.click(screen.getByRole('button', { name: 'Open Settings' }));
    expect(screen.getByLabelText(/Gemini API Key/i)).toBeInTheDocument();
  });

  it('retries the selected topic after a connection failure', async () => {
    vi.mocked(generateServerQuestion).mockRejectedValueOnce(new LearningRequestError('Check your connection and try again.'));
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Choose topic Physics/i }));
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
    fireEvent.click(screen.getByRole('button', { name: /Choose topic Physics/i }));
    await screen.findByText(question.questionText);
    expect(generateServerQuestion).toHaveBeenCalledWith('Physics');
  });

  it('preserves the server question ID and waits for verification before awarding the local currency', async () => {
    let resolve!: (result: AnswerResult) => void;
    vi.mocked(submitServerAnswer).mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Choose topic Physics/i }));
    const option = await screen.findByRole('button', { name: /It changes velocity/i });
    fireEvent.click(option);
    expect(submitServerAnswer).toHaveBeenCalledWith('server-issued-question', 0);
    expect(loadKingdom(userId).tokens.Physics).toBe(0);
    expect(option).toBeDisabled();
    await act(async () => { resolve(answered); });
    await screen.findByText('+10 Physics tokens earned!');
    expect(loadKingdom(userId).tokens.Physics).toBe(10);
    expect(loadKingdom(userId).gold).toBe(0);
    expect(screen.queryByText(/Archive Key|32 Gold|yield|ranked arena/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Visit Castle' }));
    fireEvent.click(screen.getByRole('button', { name: 'Exchange Physics tokens' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Build Barracks · 20 Gold' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Build Barracks · 20 Gold' }));
    await screen.findByText('Level 1 · Swordsman unlocked');
  });

  it('allows a failed answer submission to be retried without earning twice', async () => {
    vi.mocked(submitServerAnswer).mockRejectedValueOnce(new Error('Connection interrupted. Select your answer again.'));
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Choose topic Physics/i }));
    const option = await screen.findByRole('button', { name: /It changes velocity/i });
    fireEvent.click(option);
    await screen.findByText('Connection interrupted. Select your answer again.');
    await waitFor(() => expect(option).toBeEnabled());
    expect(loadKingdom(userId).tokens.Physics).toBe(0);
    fireEvent.click(option);
    await screen.findByText('+10 Physics tokens earned!');
    expect(submitServerAnswer).toHaveBeenCalledTimes(2);
    expect(loadKingdom(userId).tokens.Physics).toBe(10);
  });

  it('replaces an expired question in the same topic without scoring the stale answer', async () => {
    vi.mocked(submitServerAnswer).mockRejectedValueOnce(learningPayloadFailure('Question has expired'));
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Choose topic Physics/i }));
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
    await screen.findByText('+10 Physics tokens earned!');
    expect(submitServerAnswer).toHaveBeenLastCalledWith('fresh-question', 0);
    expect(loadKingdom(userId).tokens.Physics).toBe(10);
  });

  it('ignores a late expiry rejection after switching questions', async () => {
    let reject!: (error: Error) => void;
    vi.mocked(submitServerAnswer).mockImplementationOnce(() => new Promise((_, r) => { reject = r; }));
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Choose topic Physics/i }));
    fireEvent.click(await screen.findByRole('button', { name: /It changes velocity/i }));
    fireEvent.click(screen.getByTitle('Return to home / choose topic'));
    vi.mocked(generateServerQuestion).mockResolvedValueOnce({ ...question, id: 'new-question', questionText: 'A new question' });
    fireEvent.click(screen.getByRole('button', { name: /Choose topic Physics/i }));
    await screen.findByText('A new question');
    await act(async () => { reject(learningPayloadFailure('Question has expired')); });
    expect(screen.queryByText('Ready for a fresh question?')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /It changes velocity/i })).toBeEnabled();
  });

  it('keeps a late verified answer from replacing a newer question', async () => {
    let resolve!: (result: AnswerResult) => void;
    vi.mocked(submitServerAnswer).mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Choose topic Physics/i }));
    fireEvent.click(await screen.findByRole('button', { name: /It changes velocity/i }));
    fireEvent.click(screen.getByTitle('Return to home / choose topic'));
    vi.mocked(generateServerQuestion).mockResolvedValueOnce({ ...question, id: 'next-server-id', questionText: 'A newer question?' });
    fireEvent.click(screen.getByRole('button', { name: /Choose topic Physics/i }));
    await screen.findByText('A newer question?');
    await act(async () => { resolve(answered); });
    expect(screen.getByText('A newer question?')).toBeInTheDocument();
    expect(screen.queryByText('Why does force change motion?')).not.toBeInTheDocument();
    expect(loadKingdom(userId).tokens.Physics).toBe(10);
  });
});
