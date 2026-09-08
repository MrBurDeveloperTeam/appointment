import { beforeEach, describe, expect, it, vi } from 'vitest';
const { client, query } = vi.hoisted(() => {
  const query = { select: vi.fn(), eq: vi.fn(), single: vi.fn(), update: vi.fn(), delete: vi.fn() };
  return { query, client: { from: vi.fn(() => query) } };
});
vi.mock('../lib/supabaseClient', () => ({ supabase: client }));
import { updateAppointment, deleteAppointment } from './datastore.supabase.appointments';
beforeEach(() => {
  vi.clearAllMocks();
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query);
  query.single.mockResolvedValue({ data: { date: '2000-01-01', start_time: '10:00' }, error: null });
});
describe('past appointment mutations', () => {
  it('rejects moving a persisted past appointment into the future', async () => {
    await expect(updateAppointment('a', { date: '2099-01-01' })).rejects.toThrow('read-only');
    expect(query.update).not.toHaveBeenCalled();
  });
  it('rejects deletion before issuing a write', async () => {
    await expect(deleteAppointment('a')).rejects.toThrow('read-only');
    expect(query.delete).not.toHaveBeenCalled();
  });
});
