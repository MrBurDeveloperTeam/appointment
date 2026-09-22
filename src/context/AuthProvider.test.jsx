import React from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
const mocks = vi.hoisted(() => ({ access: vi.fn(), clinic: vi.fn(), profile: vi.fn() }));
vi.mock('../services/appointmentAccess', () => ({ getAppointmentAccess: mocks.access }));
vi.mock('../services/api', () => ({ api: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../data', () => ({ default: { getActiveClinicId: () => 'stale-clinic', setActiveClinicId: mocks.clinic } }));
vi.mock('../lib/supabaseClient', () => ({ supabase: { auth: {
  getSession: async () => ({ data: { session: { user: { id: 'member' } } } }),
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
}, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.profile }) }) }) } }));
import { AuthProvider, useAuth } from './AuthProvider';
function Probe() { const a = useAuth(); return <div>{a.loading ? 'loading' : a.error || `${a.user.id}:${a.activeClinicId}`}</div>; }
beforeEach(() => { cleanup(); vi.clearAllMocks(); mocks.profile.mockResolvedValue({ data: { user_id: 'member', account_type: 'individual', clinic_id: 'personal-clinic' } }); });
it('uses the resolved company clinic while keeping the authenticated member identity', async () => {
  mocks.access.mockResolvedValue({ clinicId: 'company-clinic' });
  render(<AuthProvider><Probe /></AuthProvider>);
  await screen.findByText('member:company-clinic');
  expect(mocks.clinic).toHaveBeenCalledWith('company-clinic');
  expect(mocks.clinic).not.toHaveBeenCalledWith('personal-clinic');
});
it('clears the previous clinic and fails without falling back when resolution fails', async () => {
  mocks.access.mockRejectedValue(new Error('Company access denied'));
  render(<AuthProvider><Probe /></AuthProvider>);
  await screen.findByText('Company access denied');
  expect(mocks.clinic).toHaveBeenLastCalledWith(null);
  expect(mocks.clinic).not.toHaveBeenCalledWith('personal-clinic');
});
it('uses the personal clinic returned by the Worker', async () => {
  mocks.access.mockResolvedValue({ clinicId: 'personal-clinic' });
  render(<AuthProvider><Probe /></AuthProvider>);
  await screen.findByText('member:personal-clinic');
});
it('does not use the profile clinic when the Worker returns no clinic', async () => {
  mocks.access.mockResolvedValue({ clinicId: null });
  render(<AuthProvider><Probe /></AuthProvider>);
  await screen.findByText('The selected workspace has no appointment clinic.');
  expect(mocks.clinic).toHaveBeenLastCalledWith(null);
  expect(mocks.clinic).not.toHaveBeenCalledWith('personal-clinic');
});
