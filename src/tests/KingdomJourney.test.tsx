import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { AuthProvider } from '../context/AuthContext';
import { SettingsProvider } from '../context/SettingsContext';
import { loadKingdom } from '../lib/kingdom/storage';
import { generateWhyQuestion } from '../lib/llm/factory';

vi.mock('../lib/llm/factory', async importOriginal => ({
  ...await importOriginal<typeof import('../lib/llm/factory')>(),
  generateWhyQuestion: vi.fn(async () => ({ topic: 'Physics', questionText: 'Why does a push accelerate an object?',
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
  await screen.findByText(correct ? '+10 Physics tokens earned!' : '+3 Physics tokens earned!');
}

describe('Playable Phase I journey', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('curious_y_demo_user', JSON.stringify({ id: userId, user_metadata: {}, app_metadata: {} }));
  });
  afterEach(() => { vi.useRealTimers(); });

  it('connects a real answer to exchange, building, deployment, pause, reload and retreat', async () => {
    let app = mount();
    await answer();
    fireEvent.click(screen.getByRole('button', { name: 'Visit Castle' }));
    expect(screen.getAllByText(/cloud sync is not implemented/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Requires Castle 2/ })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /guild|gacha|equipment/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Ranked arena|Silver II|trophies|Archive Key|gems|knowledge yield|Daily orders|11h 42m|00:43/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Exchange Physics tokens' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Build Barracks · 20 Gold' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Build Barracks · 20 Gold' }));
    await screen.findByText('Level 1 · Swordsman unlocked');
    expect(loadKingdom(userId).gold).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Start battle' }));
    await screen.findByRole('button', { name: 'Pause battle' });
    fireEvent.click(screen.getByRole('button', { name: /Deploy Swordsman/ }));
    await waitFor(() => expect(loadKingdom(userId).battle!.fighters.length).toBe(1));
    fireEvent.click(screen.getByRole('button', { name: 'Pause battle' }));
    expect(screen.getByRole('button', { name: /Deploy Swordsman/ })).toBeDisabled();
    const saved = loadKingdom(userId);
    vi.useFakeTimers();
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(loadKingdom(userId)).toEqual(saved);
    vi.useRealTimers();
    app.unmount();
    app = mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Castle · Level 1' }));
    await screen.findByRole('button', { name: 'Resume battle' });
    expect(loadKingdom(userId)).toEqual(saved);
    fireEvent.click(screen.getByRole('button', { name: 'Retreat' }));
    await screen.findByText('Defeat — regroup and grow.');
    expect(loadKingdom(userId).buildings.barracks).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Answer another question' }));
    await screen.findByRole('button', { name: /Choose topic Physics/ });
    app.unmount();
  });

  it('rewards incorrect attempts and does not mint rewards when history is reopened', async () => {
    mount();
    await answer(false);
    await waitFor(() => expect(loadKingdom(userId).tokens.Physics).toBe(3));
    fireEvent.click(screen.getByTitle('View learning history and chats'));
    await waitFor(() => expect(screen.getAllByText('Why does a push accelerate an object?')).toHaveLength(2));
    fireEvent.click(screen.getAllByText('Why does a push accelerate an object?')[1]);
    await waitFor(() => expect(screen.getAllByText('Why does a push accelerate an object?')).toHaveLength(1));
    expect(loadKingdom(userId).tokens.Physics).toBe(3);
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
    expect(within(section).getByText(/Your first army is one correct answer away/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start battle' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Build Barracks · 20 Gold' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Build Archery Range · 30 Gold' })).toBeDisabled();
    expect(screen.getByText('Need 20 more Gold.')).toBeInTheDocument();
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
