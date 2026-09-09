import { fireEvent, screen, waitFor } from '@testing-library/react';
/** Start through the real topic picker while economy tests stub generation. */
export async function startJourney(topic = 'Physics') {
    const start = await screen.findByRole('button', { name: `Choose topic ${topic}` });
    await waitFor(() => { if (start.hasAttribute('disabled')) throw new Error('Learning is not ready yet.'); });
    fireEvent.click(start);
}
