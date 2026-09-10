import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PatientsView from './PatientsView';

describe('PatientsView search', () => {
  it('queries the server and renders matching patients', async () => {
    const searchPatients = vi.fn().mockResolvedValue([
      { id: 'patient-1', name: 'Yasmin Test', email: 'yasmin@example.test' },
    ]);

    render(
      <PatientsView
        patients={[]}
        appointments={[]}
        dentists={[]}
        treatments={[]}
        onNew={vi.fn()}
        onEdit={vi.fn()}
        searchPatients={searchPatients}
        importPatients={vi.fn()}
      />
    );

    fireEvent.change(screen.getByPlaceholderText('Search patients...'), {
      target: { value: 'yasmin' },
    });

    await waitFor(() => expect(searchPatients).toHaveBeenCalledWith('yasmin'));
    expect(await screen.findByText('Yasmin Test')).toBeTruthy();
  });

  it('shows a query error instead of incorrectly claiming there are no patients', async () => {
    const searchPatients = vi.fn().mockRejectedValue(new Error('Database unavailable'));

    render(
      <PatientsView
        patients={[]}
        appointments={[]}
        dentists={[]}
        treatments={[]}
        onNew={vi.fn()}
        onEdit={vi.fn()}
        searchPatients={searchPatients}
        importPatients={vi.fn()}
      />
    );

    fireEvent.change(screen.getByPlaceholderText('Search patients...'), {
      target: { value: 'patient' },
    });

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Search failed: Database unavailable'
    );
  });
});
