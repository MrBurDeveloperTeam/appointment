import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import SelectAutocomplete from './SelectAutocomplete';

const OPTIONS = [
  { value: '', label: 'Unassigned' },
  { value: 1, label: 'DR. JOHN', meta: 'Available' },
  { value: 2, label: 'KENNY', meta: 'Busy' },
  { value: 3, label: 'Dr. Sarah Lim' },
  { value: 4, label: 'Amir' }, { value: 5, label: 'Bela' }, { value: 6, label: 'Chen' }, { value: 7, label: 'Dewi' },
];
function Harness({ initial = 1, onSubmit = () => {}, onEsc = () => {} }) {
  const [v, setV] = useState(initial);
  return (
    <div onKeyDown={(e) => e.key === 'Escape' && onEsc()}>
      <form onSubmit={(e) => { e.preventDefault(); onSubmit(v); }}>
        <SelectAutocomplete ariaLabel="Dentist" value={v} onChange={setV} options={OPTIONS} />
        <output data-testid="val">{String(v)}</output>
      </form>
    </div>
  );
}
afterEach(cleanup);
const input = () => screen.getByRole('combobox', { name: 'Dentist' });
const opts = () => within(screen.getByRole('listbox')).getAllByRole('option').map((o) => o.textContent);

describe('SelectAutocomplete', () => {
  it('shows the selected label when closed and no list', () => {
    render(<Harness />);
    expect(input().value).toBe('DR. JOHN');
    expect(screen.queryByRole('listbox')).toBeNull();
  });
  it('opens on focus with ALL options (not filtered by the selected label)', () => {
    render(<Harness />);
    fireEvent.focus(input());
    expect(opts().length).toBe(OPTIONS.length);
    expect(screen.getByRole('option', { selected: true }).textContent).toContain('DR. JOHN');
  });
  it('filters as you type, word-start matches first', () => {
    render(<Harness />);
    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: 'sar' } });
    expect(opts()).toEqual(['Dr. Sarah Lim']);
    fireEvent.change(input(), { target: { value: 'dr' } });
    expect(opts().map((t) => t.replace(/Available|Busy/, ''))).toEqual(['DR. JOHN', 'Dr. Sarah Lim']);
  });
  it('shows an empty state when nothing matches', () => {
    render(<Harness />);
    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: 'zzz' } });
    expect(screen.getByText('No matches')).toBeTruthy();
  });
  it('picks with click and closes', () => {
    render(<Harness />);
    fireEvent.focus(input());
    fireEvent.click(screen.getByRole('option', { name: /KENNY/ }));
    expect(screen.getByTestId('val').textContent).toBe('2');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(input().value).toBe('KENNY');
  });
  it('type + Enter picks the best match and does NOT submit the form', () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: 'ken' } });
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(screen.getByTestId('val').textContent).toBe('2');
    expect(onSubmit).not.toHaveBeenCalled();
  });
  it('arrow keys move and Enter picks', () => {
    render(<Harness initial={1} />);
    fireEvent.focus(input());           // active starts on selected (index 1)
    fireEvent.keyDown(input(), { key: 'ArrowDown' });
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(screen.getByTestId('val').textContent).toBe('2');
  });
  it('Enter with no typing/navigation just closes, keeps value', () => {
    render(<Harness />);
    fireEvent.focus(input());
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByTestId('val').textContent).toBe('1');
  });
  it('Escape closes the list only (does not bubble to the modal) and reverts typed text', () => {
    const onEsc = vi.fn();
    render(<Harness onEsc={onEsc} />);
    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: 'ken' } });
    fireEvent.keyDown(input(), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(input().value).toBe('DR. JOHN');
    expect(onEsc).not.toHaveBeenCalled();
    fireEvent.keyDown(input(), { key: 'Escape' }); // list already closed -> bubbles
    expect(onEsc).toHaveBeenCalledTimes(1);
  });
  it('clicking outside reverts to the selected label', () => {
    render(<Harness />);
    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: 'ken' } });
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(input().value).toBe('DR. JOHN');
    expect(screen.getByTestId('val').textContent).toBe('1');
  });
  it('can choose Unassigned (empty-string value)', () => {
    render(<Harness />);
    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: 'un' } });
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(screen.getByTestId('val').textContent).toBe('');
    expect(input().value).toBe('Unassigned');
  });
  it('numeric/string ids compare loosely (ids from DB may be strings)', () => {
    render(<Harness initial={'2'} />);
    expect(input().value).toBe('KENNY');
  });
});
