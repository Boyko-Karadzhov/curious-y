import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JourneyExplorer } from '../components/concepts/JourneyExplorer';
import { getKnowledgeGraph } from '../services/backend';
import { DIMENSION_ORDER, DIMENSIONS, type JourneyView, type VisibleNode } from '../../supabase/functions/_shared/journey';
import { REASONING_COMPLEXITIES } from '../../supabase/functions/_shared/reasoning';

vi.mock('../services/backend', () => ({ getKnowledgeGraph: vi.fn() }));

function concept(id: string, title: string): VisibleNode {
    return {
        id,
        title,
        topic: 'Physics',
        kind: 'concept',
        requires: [],
        progress: {},
        status: 'discovered',
        rusty: false,
        target: {
            nodeId: id,
            kind: 'dimension',
            dimension: 'intuition'
        }
    };
}

let graph: JourneyView;
const mount = () => render(<JourneyExplorer userId="notebook-test" isDemo={false} topic="Physics" revision={0} knowledgeOnly onTopic={vi.fn()} onStart={vi.fn()} />);

describe('Concept notebook', () => {
    beforeEach(() => {
        graph = {
            id: 'knowledge',
            title: 'Knowledge',
            nodes: [concept('motion', 'Motion'), concept('force', 'Force')],
            frontiers: []
        };
        vi.mocked(getKnowledgeGraph).mockImplementation(async () => graph);
    });

    it('shows seven empty dimensions and separate reasoning progress', async () => {
        mount();
        const details = await screen.findByRole('complementary', { name: 'Concept details' });
        expect(within(details).getByText('0 / 7 collected')).toBeInTheDocument();
        const index = within(details).getByRole('navigation', { name: 'Dimensions of understanding' });
        for (const dimension of DIMENSION_ORDER) {
            expect(within(index).getByRole('link', { name: `${DIMENSIONS[dimension].label}: Not collected yet` })).toBeInTheDocument();
            expect(within(within(details).getByRole('region', { name: DIMENSIONS[dimension].label })).getByText(/No insight collected yet/)).toBeInTheDocument();
        }

        expect(within(details).getByRole('region', { name: 'Reasoning challenges' })).toHaveTextContent('0 / 7');
    });

    it('keeps insights in their own dimensions and distinguishes collected, confirmed and missing content', async () => {
        graph.nodes[0].progress = {
            intuition: {
                attempts: 1,
                successes: 1,
                entry: 'Motion means a change in **position**.'
            },
            precision: {
                attempts: 1,
                successes: 1,
                entry: 'Speed is distance divided by time: $v = d/t$.'
            },
            boundaries: {
                attempts: 1,
                successes: 0
            },
        };
        mount();
        const details = await screen.findByRole('complementary', { name: 'Concept details' });
        expect(within(details).getByText('2 / 7 collected')).toBeInTheDocument();
        const intuition = within(details).getByRole('region', { name: 'Intuition' });
        expect(within(intuition).getByText('position')).toBeInTheDocument();
        expect(within(intuition).getByText('Completed')).toBeInTheDocument();
        expect(within(intuition).queryByText(/Speed is distance/)).not.toBeInTheDocument();
        const precision = within(details).getByRole('region', { name: 'Precision & math' });
        expect(within(precision).getByText('Completed')).toBeInTheDocument();
        expect(precision.querySelector('.katex')).toBeInTheDocument();
        expect(within(within(details).getByRole('region', { name: 'Limits & extremes' })).getByText('Not collected yet')).toBeInTheDocument();
        const target = within(details).getByRole('region', { name: 'How we know' });
        target.scrollIntoView = vi.fn();
        fireEvent.click(within(details).getByRole('link', { name: 'How we know: Not collected yet' }));
        expect(target.scrollIntoView).toHaveBeenCalled();
        expect(target).toHaveFocus();
    });

    it('collapses from the arrow or background, retains selection, and reopens from a node or list', async () => {
        mount();
        const details = await screen.findByRole('complementary', { name: 'Concept details' });
        expect(within(details).getByRole('heading', { name: 'Motion' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Collapse concept page' }));
        expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Show concept page' })).toHaveFocus();
        expect(screen.getByRole('button', { name: /Motion, Ready to explore/ })).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(screen.getByRole('button', { name: /Force, Ready to explore/ }));
        expect(within(screen.getByRole('complementary')).getByRole('heading', { name: 'Force' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
        expect(screen.getByRole('complementary')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('region', { name: /Draggable concept map/ }));
        expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Show concept page' }));
        expect(within(screen.getByRole('complementary')).getByRole('heading', { name: 'Force' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Hide concept page' }));
        fireEvent.click(screen.getByRole('button', { name: 'List view' }));
        fireEvent.click(within(screen.getByLabelText('Revealed concepts')).getByRole('button', { name: /Motion/ }));
        expect(within(screen.getByRole('complementary')).getByRole('heading', { name: 'Motion' })).toBeInTheDocument();
    });

    it('shows reasoning completion separately from the seven collected dimensions', async () => {
        for (const dimension of DIMENSION_ORDER) {
            graph.nodes[0].progress[dimension] = {
                attempts: 1,
                successes: 1,
                entry: `Earned ${dimension} insight.`
            };
        }

        for (const complexity of REASONING_COMPLEXITIES) {
            graph.nodes[0].progress[complexity] = {
                attempts: 1,
                successes: 1
            };
        }

        graph.nodes[0].status = 'mastered';
        mount();
        const details = await screen.findByRole('complementary', { name: 'Concept details' });
        expect(within(details).getByText('7 / 7 collected')).toBeInTheDocument();
        const reasoning = within(details).getByRole('region', { name: 'Reasoning challenges' });
        expect(within(reasoning).getByText('7 / 7')).toBeInTheDocument();
        expect(reasoning.querySelectorAll('.earned')).toHaveLength(7);
        expect(within(details).getByRole('progressbar')).toHaveAttribute('value', '100');
    });
});
