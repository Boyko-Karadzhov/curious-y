import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { ConceptsModal } from '../components/concepts/ConceptsModal';
import { AuthProvider } from '../context/AuthContext';
import { saveUserConcept } from '../services/database';
import { Concept } from '../types';
import { createDefaultReasoningTrack } from '../lib/concepts/mastery';

describe('ConceptsModal UI & Reclassification', () => {
  const testUserId = 'test-modal-user-999';

  beforeEach(() => {
    localStorage.clear();
    // Mock user in auth
    const authData = {
      id: testUserId,
      email: 'test@example.com',
      user_metadata: { full_name: 'Modal Learner' },
    };
    localStorage.setItem('curious_y_demo_user', JSON.stringify(authData));
  });

  it('renders concepts with multi-topic badges and primary topic indicator', async () => {
    const concept: Concept = {
      canonicalName: 'Velocity',
      definition: 'Vector quantity of motion',
      aliases: [],
      topics: { 'Physics': 0.8, 'Mathematics & Logic': 0.2 },
      prerequisites: [],
      mastery: 'learning',
      reasoningTrack: createDefaultReasoningTrack(),
    };
    await saveUserConcept(testUserId, concept);

    render(
      <AuthProvider>
        <ConceptsModal isOpen={true} onClose={() => {}} />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Velocity')).toBeInTheDocument();
    });

    // Check that both topic badges are rendered with percentages
    expect(screen.getAllByText(/Physics/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/80%/)).toBeInTheDocument();
    expect(screen.getAllByText(/Mathematics & Logic/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/20%/)).toBeInTheDocument();
  });

  it('renders Reclassify Topics button and triggers reclassification', async () => {
    const concept: Concept = {
      canonicalName: 'Fluid dynamics',
      definition: 'Flow of liquids and gases',
      aliases: [],
      topics: { 'Earth & Space': 1.0 },
      prerequisites: [],
      mastery: 'learning',
      reasoningTrack: createDefaultReasoningTrack(),
    };
    await saveUserConcept(testUserId, concept);

    render(
      <AuthProvider>
        <ConceptsModal isOpen={true} onClose={() => {}} />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Fluid dynamics')).toBeInTheDocument();
    });

    const reclassifyBtn = screen.getByRole('button', { name: /Reclassify Topics/i });
    expect(reclassifyBtn).toBeInTheDocument();

    fireEvent.click(reclassifyBtn);

    await waitFor(() => {
      // Reclassification should have distributed into Physics (80%) and Earth & Space (20%)
      expect(screen.getAllByText(/Physics/).length).toBeGreaterThanOrEqual(2);
      expect(screen.getByText(/80%/)).toBeInTheDocument();
      expect(screen.getByText(/20%/)).toBeInTheDocument();
    });
  });
});
