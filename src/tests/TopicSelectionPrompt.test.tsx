import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TopicSelectionPrompt } from '../components/home/TopicSelectionPrompt';
import { TOPICS } from '../types';

describe('TopicSelectionPrompt Component', () => {
  it('renders the header title, subtitle, and badge', () => {
    render(<TopicSelectionPrompt onSelectTopic={vi.fn()} />);

    expect(screen.getByText(/Curious-Y Microlearning/i)).toBeInTheDocument();
    expect(screen.getByText(/What do you want to explore\?/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Select a topic to test and expand your mental models/i)
    ).toBeInTheDocument();
  });

  it('renders the Surprise Me (Random) card and triggers onSelectTopic(undefined) on click', () => {
    const handleSelect = vi.fn();
    render(<TopicSelectionPrompt onSelectTopic={handleSelect} />);

    const randomCard = screen.getByLabelText(/Select random topic/i);
    expect(randomCard).toBeInTheDocument();
    expect(screen.getByText(/Surprise Me \(Random\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Choose Random/i)).toBeInTheDocument();

    fireEvent.click(randomCard);
    expect(handleSelect).toHaveBeenCalledTimes(1);
    expect(handleSelect).toHaveBeenCalledWith(undefined);
  });

  it('supports keyboard navigation on the Random card', () => {
    const handleSelect = vi.fn();
    render(<TopicSelectionPrompt onSelectTopic={handleSelect} />);

    const randomCard = screen.getByLabelText(/Select random topic/i);
    fireEvent.keyDown(randomCard, { key: 'Enter', code: 'Enter' });
    expect(handleSelect).toHaveBeenCalledWith(undefined);

    fireEvent.keyDown(randomCard, { key: ' ', code: 'Space' });
    expect(handleSelect).toHaveBeenCalledTimes(2);
  });

  it('renders all 8 knowledge domain topics', () => {
    render(<TopicSelectionPrompt onSelectTopic={vi.fn()} />);

    expect(screen.getByText(/Topics: Choose a Subject/i)).toBeInTheDocument();
    expect(screen.getByText(/8 Knowledge Domains/i)).toBeInTheDocument();

    TOPICS.forEach((topic) => {
      expect(screen.getByRole('button', { name: new RegExp(`Choose topic ${topic}`, 'i') })).toBeInTheDocument();
      expect(screen.getByText(topic)).toBeInTheDocument();
    });
  });

  it('triggers onSelectTopic with the chosen topic when clicked', () => {
    const handleSelect = vi.fn();
    render(<TopicSelectionPrompt onSelectTopic={handleSelect} />);

    const chemButton = screen.getByRole('button', { name: /Choose topic Chemistry/i });
    fireEvent.click(chemButton);

    expect(handleSelect).toHaveBeenCalledTimes(1);
    expect(handleSelect).toHaveBeenCalledWith('Chemistry');

    const csButton = screen.getByRole('button', { name: /Choose topic Computer Science/i });
    fireEvent.click(csButton);

    expect(handleSelect).toHaveBeenCalledTimes(2);
    expect(handleSelect).toHaveBeenCalledWith('Computer Science');
  });

  it('disables all topic buttons and prevents triggering when isLoading is true', () => {
    const handleSelect = vi.fn();
    render(<TopicSelectionPrompt onSelectTopic={handleSelect} isLoading={true} />);

    const physicsButton = screen.getByRole('button', { name: /Choose topic Physics/i });
    expect(physicsButton).toBeDisabled();

    fireEvent.click(physicsButton);
    expect(handleSelect).not.toHaveBeenCalled();

    const randomCard = screen.getByLabelText(/Select random topic/i);
    fireEvent.click(randomCard);
    expect(handleSelect).not.toHaveBeenCalled();
  });
});
