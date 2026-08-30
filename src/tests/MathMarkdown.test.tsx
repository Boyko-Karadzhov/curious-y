import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MathMarkdown } from '../components/common/MathMarkdown';

describe('MathMarkdown Component', () => {
  it('renders standard markdown text and bold elements', () => {
    render(<MathMarkdown content="This is **important** physics intuition." />);
    expect(screen.getByText(/important/i)).toBeInTheDocument();
    expect(screen.getByText(/physics intuition/i)).toBeInTheDocument();
  });

  it('renders inline code blocks properly', () => {
    render(<MathMarkdown content="Check the `velocity = d/t` equation." />);
    expect(screen.getByText('velocity = d/t')).toBeInTheDocument();
  });

  it('renders LaTeX formulas without crashing', () => {
    const { container } = render(
      <MathMarkdown content="Einstein discovered that $E = mc^2$ and force is given by $$F = ma$$." />
    );
    expect(container).toBeInTheDocument();
    // KaTeX wraps math in .katex elements
    const katexElements = container.querySelectorAll('.katex');
    expect(katexElements.length).toBeGreaterThan(0);
  });
});
