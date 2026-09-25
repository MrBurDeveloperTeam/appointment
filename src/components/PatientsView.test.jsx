import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PatientsView from './PatientsView';
import { useState } from 'react';

const { addToast } = vi.hoisted(() => ({ addToast: vi.fn() }));
vi.mock('../context/ToastProvider', () => ({ useToast: () => ({ addToast }) }));

function FlagHarness({ save, initiallyFlagged = false, searchPatients }) {
  const [patients, setPatients] = useState([{ id: 'flag-patient', name: 'Flag Test', is_flagged: initiallyFlagged }]);
  return <PatientsView patients={patients} appointments={[]} dentists={[]} treatments={[]}
    onNew={vi.fn()} onEdit={vi.fn()} searchPatients={searchPatients}
    onFlagChange={async (id, is_flagged) => {
      await save(id, is_flagged);
      const updated = { id, name: 'Flag Test', is_flagged };
      setPatients([updated]);
      return updated;
    }} />;
}

describe('Patient flags', () => {
  it('saves both toggle directions without expanding the row and updates the warning', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    render(<FlagHarness save={save} />);
    fireEvent.click(screen.getByRole('button', { name: 'Flag patient' }));
    await screen.findByRole('button', { name: 'Remove patient flag' });
    expect(save).toHaveBeenCalledWith('flag-patient', true);
    expect(screen.queryByText('Red Flag:')).toBeNull();
    fireEvent.click(screen.getByText('Flag Test'));
    expect(screen.getByText('Red Flag:')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove patient flag' }));
    await screen.findByRole('button', { name: 'Flag patient' });
    expect(save).toHaveBeenLastCalledWith('flag-patient', false);
    expect(screen.queryByText('Red Flag:')).toBeNull();
    expect(screen.getByText('No appointments yet')).toBeTruthy();
  });

  it('prevents duplicate writes and retains the saved flag on failure', async () => {
    let rejectSave;
    const save = vi.fn(() => new Promise((resolve, reject) => { rejectSave = reject; }));
    render(<FlagHarness save={save} initiallyFlagged />);
    const button = screen.getByRole('button', { name: 'Remove patient flag' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(button.disabled).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    rejectSave(new Error('Permission denied'));
    await waitFor(() => expect(button.disabled).toBe(false));
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(addToast).toHaveBeenCalledWith('Permission denied', 'error');
  });

  it('updates a patient displayed in search results', async () => {
    const searchPatients = vi.fn().mockResolvedValue([{ id: 'flag-patient', name: 'Flag Test', is_flagged: false }]);
    render(<FlagHarness save={vi.fn().mockResolvedValue(undefined)} searchPatients={searchPatients} />);
    fireEvent.change(screen.getByPlaceholderText('Search patients...'), { target: { value: 'Flag' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Flag patient' }));
    expect(await screen.findByRole('button', { name: 'Remove patient flag' })).toBeTruthy();
  });
});

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
