import { act as flush, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProductionPanel } from '../app/components/ProductionPanel';
import { ResourceBar } from '../components/game/ResourceBar';
import { applyAction, newKingdom } from '../lib/kingdom/game';

const originalAnimate = HTMLElement.prototype.animate;
afterEach(() => {
    HTMLElement.prototype.animate = originalAnimate;
});

describe('offline reward collection', () => {
    it('keeps the collection source visible until its balance animation finishes', async () => {
        const state = newKingdom();
        const paid = applyAction(state, { type: 'collect-production' });
        let finish!: () => void;
        const finished = new Promise<void>(resolve => {
            finish = resolve;
        });
        HTMLElement.prototype.animate = vi.fn(() => ({ finished }) as unknown as Animation);
        const view = render(<><ResourceBar state={state} /><ProductionPanel state={state} unavailable={false} act={vi.fn(async () => true)} /></>);
        fireEvent.click(screen.getByRole('button', { name: 'Collect all' }));
        await waitFor(() => expect(screen.getByRole('button', { name: 'Collecting…' })).toBeDisabled());
        view.rerender(<><ResourceBar state={paid} /><ProductionPanel state={paid} unavailable={false} act={vi.fn(async () => true)} /></>);
        expect(screen.getByRole('button', { name: 'Collecting…' })).toBeInTheDocument();
        await flush(async () => {
            finish();
        });
        await waitFor(() => expect(screen.queryByRole('button', { name: 'Collect all' })).not.toBeInTheDocument());
    });

    it('does not animate a failed claim', async () => {
        HTMLElement.prototype.animate = vi.fn();
        render(<ProductionPanel state={newKingdom()} unavailable={false} act={vi.fn(async () => false)} />);
        fireEvent.click(screen.getByRole('button', { name: 'Collect all' }));
        await waitFor(() => expect(screen.getByRole('button', { name: 'Collect all' })).toBeEnabled());
        expect(HTMLElement.prototype.animate).not.toHaveBeenCalled();
    });
});
