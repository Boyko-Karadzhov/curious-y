import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import App from '../App';
import { Navbar } from '../components/layout/Navbar';
import { ConceptsModal } from '../components/concepts/ConceptsModal';
import { SettingsModal } from '../components/settings/SettingsModal';
import { HistoryModal } from '../components/history/HistoryModal';
import { AuthProvider } from '../context/AuthContext';
import { SettingsProvider } from '../context/SettingsContext';
import {
  saveUserConcept,
  getUserConcepts,
  saveQuestion,
  getQuestionHistory,
  saveChatMessage,
  getChatMessages,
  cacheSubtopicsForTopic,
  getCachedSubtopics,
  resetUserProgress,
  clearQuestionHistory,
  clearChatMessages,
  clearUserConcepts,
} from '../services/database';
import { Concept, Question } from '../types';
import { createDefaultReasoningTrack } from '../lib/concepts/mastery';

describe('Reset Progress Functionality', () => {
  const testUserId = 'test-reset-user-123';

  beforeEach(() => {
    localStorage.clear();
  });

  describe('Database Service Functions', () => {
    it('clears question history, chat messages, concepts, and cached subtopics with resetUserProgress', async () => {
      // 1. Seed concept
      const concept: Concept = {
        canonicalName: "Newton's second law",
        definition: 'F = ma',
        aliases: [],
        topics: { Physics: 1.0 },
        prerequisites: [],
        mastery: 'proficient',
        reasoningTrack: { ...createDefaultReasoningTrack(), directInference: 3 },
      };
      await saveUserConcept(testUserId, concept);

      // 2. Seed question
      const question: Question = {
        id: '11111111-1111-4111-8111-111111111111',
        topic: 'Physics',
        subtopic: 'Mechanics',
        questionText: 'Why do objects accelerate when force is applied?',
        options: ['A', 'B', 'C', 'D'],
        correctIndex: 0,
        selectedIndex: 0,
        isCorrect: true,
        explanation: 'Newton second law.',
      };
      await saveQuestion(testUserId, question);

      // 3. Seed chat message
      await saveChatMessage(testUserId, question.id!, 'user', 'Can you elaborate?');

      // 4. Seed subtopics cache
      cacheSubtopicsForTopic(testUserId, 'Physics', ['Mechanics', 'Thermodynamics']);

      // Verify data is present
      expect((await getUserConcepts(testUserId)).length).toBe(1);
      expect((await getQuestionHistory(testUserId)).length).toBe(1);
      expect((await getChatMessages(testUserId, question.id!)).length).toBe(1);
      expect(getCachedSubtopics(testUserId)['Physics']).toBeDefined();

      // Execute resetUserProgress
      await resetUserProgress(testUserId);

      // Verify everything is cleared
      expect(await getUserConcepts(testUserId)).toEqual([]);
      expect(await getQuestionHistory(testUserId)).toEqual([]);
      expect(await getChatMessages(testUserId, question.id!)).toEqual([]);
      expect(getCachedSubtopics(testUserId)['Physics']).toBeUndefined();
    });

    it('clearQuestionHistory removes only question history', async () => {
      const question: Question = {
        id: '22222222-2222-4222-8222-222222222222',
        topic: 'Chemistry',
        questionText: 'Why do atoms bond?',
        options: ['A', 'B', 'C', 'D'],
        correctIndex: 1,
        selectedIndex: 1,
        isCorrect: true,
        explanation: 'Electronegativity.',
      };
      await saveQuestion(testUserId, question);
      expect((await getQuestionHistory(testUserId)).length).toBe(1);

      await clearQuestionHistory(testUserId);
      expect(await getQuestionHistory(testUserId)).toEqual([]);
    });

    it('clearChatMessages removes chat messages', async () => {
      const qId = '33333333-3333-4333-8333-333333333333';
      await saveChatMessage(testUserId, qId, 'user', 'Hello AI');
      expect((await getChatMessages(testUserId, qId)).length).toBe(1);

      await clearChatMessages(testUserId);
      expect(await getChatMessages(testUserId, qId)).toEqual([]);
    });

    it('clearUserConcepts removes concepts', async () => {
      const concept: Concept = {
        canonicalName: 'Energy',
        definition: 'Capacity to do work',
        aliases: [],
        topics: { Physics: 1.0 },
        prerequisites: [],
        mastery: 'learning',
        reasoningTrack: createDefaultReasoningTrack(),
      };
      await saveUserConcept(testUserId, concept);
      expect((await getUserConcepts(testUserId)).length).toBe(1);

      await clearUserConcepts(testUserId);
      expect(await getUserConcepts(testUserId)).toEqual([]);
    });
  });

  describe('Navbar Component', () => {
    it('renders Reset Progress button when onResetProgress prop is provided', () => {
      const onReset = vi.fn();
      render(
        <AuthProvider>
          <SettingsProvider>
            <Navbar
              onOpenSettings={vi.fn()}
              onOpenHistory={vi.fn()}
              onResetProgress={onReset}
            />
          </SettingsProvider>
        </AuthProvider>
      );

      const resetBtn = screen.getByRole('button', { name: /Reset Progress/i });
      expect(resetBtn).toBeInTheDocument();

      fireEvent.click(resetBtn);
      expect(onReset).toHaveBeenCalledTimes(1);
    });
  });

  describe('ConceptsModal Component', () => {
    it('renders Reset Progress button and resets concepts on click', async () => {
      // Seed user and concept in localStorage
      localStorage.setItem(
        'curious_y_demo_user',
        JSON.stringify({
          id: testUserId,
          email: 'test@example.com',
          user_metadata: { full_name: 'Concept Learner' },
        })
      );

      const concept: Concept = {
        canonicalName: 'Calculus',
        definition: 'Study of continuous change.',
        aliases: [],
        topics: { 'Mathematics & Logic': 1.0 },
        prerequisites: [],
        mastery: 'mastered',
        reasoningTrack: { ...createDefaultReasoningTrack(), directInference: 5 },
      };
      await saveUserConcept(testUserId, concept);

      const onResetMock = vi.fn().mockImplementation(async () => {
        await resetUserProgress(testUserId);
      });

      render(
        <AuthProvider>
          <SettingsProvider>
            <ConceptsModal
              isOpen={true}
              onClose={vi.fn()}
              onResetProgress={onResetMock}
            />
          </SettingsProvider>
        </AuthProvider>
      );

      // Verify concept renders in modal
      await waitFor(() => {
        expect(screen.getByText('Calculus')).toBeInTheDocument();
      });

      // Find and click Reset Progress button
      const resetBtn = screen.getByRole('button', { name: /Reset Progress/i });
      expect(resetBtn).toBeInTheDocument();
      fireEvent.click(resetBtn);

      await waitFor(() => {
        expect(onResetMock).toHaveBeenCalled();
        expect(screen.queryByText('Calculus')).not.toBeInTheDocument();
        expect(screen.getByText(/No concepts built yet/i)).toBeInTheDocument();
      });

      // Verify concepts in storage are empty
      expect(await getUserConcepts(testUserId)).toEqual([]);
    });
  });

  describe('SettingsModal Component', () => {
    it('renders Learning Progress section with Reset Progress button and resets progress on click', async () => {
      localStorage.setItem(
        'curious_y_demo_user',
        JSON.stringify({
          id: testUserId,
          email: 'test@example.com',
          user_metadata: { full_name: 'Settings Learner' },
        })
      );

      const onResetMock = vi.fn().mockImplementation(async () => {
        await resetUserProgress(testUserId);
      });

      render(
        <AuthProvider>
          <SettingsProvider>
            <SettingsModal
              isOpen={true}
              onClose={vi.fn()}
              onResetProgress={onResetMock}
            />
          </SettingsProvider>
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByText(/Learning Progress/i)).toBeInTheDocument();
      });

      const resetBtn = screen.getByRole('button', { name: /Reset Progress/i });
      expect(resetBtn).toBeInTheDocument();
      fireEvent.click(resetBtn);

      await waitFor(() => {
        expect(onResetMock).toHaveBeenCalled();
        expect(screen.getByText(/Reset!/i)).toBeInTheDocument();
      });
    });
  });

  describe('HistoryModal Component', () => {
    it('renders Reset Progress button and clears history on click', async () => {
      localStorage.setItem(
        'curious_y_demo_user',
        JSON.stringify({
          id: testUserId,
          email: 'test@example.com',
          user_metadata: { full_name: 'History Learner' },
        })
      );

      const question: Question = {
        id: '44444444-4444-4444-8444-444444444444',
        topic: 'History',
        questionText: 'Why did the Bronze Age collapse?',
        options: ['Option 1', 'Option 2', 'Option 3', 'Option 4'],
        correctIndex: 0,
        selectedIndex: 0,
        isCorrect: true,
        explanation: 'Multiple interconnected systems collapsed.',
      };
      await saveQuestion(testUserId, question);

      const onResetMock = vi.fn().mockImplementation(async () => {
        await resetUserProgress(testUserId);
      });

      render(
        <AuthProvider>
          <SettingsProvider>
            <HistoryModal
              isOpen={true}
              onClose={vi.fn()}
              onResetProgress={onResetMock}
            />
          </SettingsProvider>
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByText(/Why did the Bronze Age collapse\?/i)).toBeInTheDocument();
      });

      const resetBtn = screen.getByRole('button', { name: /Reset Progress/i });
      expect(resetBtn).toBeInTheDocument();
      fireEvent.click(resetBtn);

      await waitFor(() => {
        expect(onResetMock).toHaveBeenCalled();
        expect(screen.queryByText(/Why did the Bronze Age collapse\?/i)).not.toBeInTheDocument();
        expect(screen.getByText(/No questions found/i)).toBeInTheDocument();
      });

      expect(await getQuestionHistory(testUserId)).toEqual([]);
    });
  });

  describe('App Full Integration', () => {
    it('resets user progress when clicking Reset Progress from Navbar in App', async () => {
      render(
        <AuthProvider>
          <SettingsProvider>
            <App />
          </SettingsProvider>
        </AuthProvider>
      );

      // Log in as demo user
      await waitFor(() => {
        expect(screen.getByText(/Try Explorer Demo/i)).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText(/Try Explorer Demo/i));

      // Home dashboard renders
      await waitFor(() => {
        expect(screen.getByText(/What do you want to explore\?/i)).toBeInTheDocument();
      });

      // Find Reset Progress button in Navbar
      const resetBtn = screen.getByRole('button', { name: /Reset Progress/i });
      expect(resetBtn).toBeInTheDocument();

      fireEvent.click(resetBtn);

      // Should return to/maintain clean home dashboard
      await waitFor(() => {
        expect(screen.getByText(/What do you want to explore\?/i)).toBeInTheDocument();
      });
    });
  });
});
