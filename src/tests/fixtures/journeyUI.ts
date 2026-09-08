import { fireEvent, screen, waitFor } from '@testing-library/react';
import { starterJourney } from '../../../supabase/functions/_shared/journeySeeds';
/** Navigate the real map while economy tests stub only question generation. */
export async function startJourney(topic = 'Physics') {
  const picker = await screen.findByLabelText('Journey topic');
  fireEvent.change(picker, { target: { value: topic } });
  await screen.findByRole('heading', { name: starterJourney(topic).title });
  const start = await screen.findByRole('button', { name: /Make your first guess|Check a fresh example|Try a fresh example|Explore another angle/ });
  await waitFor(() => { if (start.hasAttribute('disabled')) throw new Error('Journey is not ready yet.'); });
  fireEvent.click(start);
}
