import { beforeEach, describe, expect, it } from 'vitest';
import { captureWorkspaceFromUrl, getWorkspaceHeaders } from './workspaceContext';

describe('Appointment workspace launch', () => {
  beforeEach(() => { sessionStorage.clear(); window.history.replaceState({}, '', '/'); });
  it('captures a company while preserving SSO and other URL data', () => {
    window.history.replaceState({}, '', '/?workspace_type=company&workspace_owner_id=company-owner&sso_token=test-token#calendar');
    captureWorkspaceFromUrl();
    expect(getWorkspaceHeaders()).toEqual({ 'X-Snabbb-Workspace-Type': 'company', 'X-Snabbb-Workspace-User-Id': 'company-owner' });
    expect(location.search).toBe('?sso_token=test-token');
    expect(location.hash).toBe('#calendar');
    captureWorkspaceFromUrl();
    expect(getWorkspaceHeaders()['X-Snabbb-Workspace-User-Id']).toBe('company-owner');
  });
  it('explicit personal launch clears the previous company', () => {
    window.history.replaceState({}, '', '/?workspace_type=company&workspace_owner_id=owner');
    captureWorkspaceFromUrl();
    window.history.replaceState({}, '', '/?workspace_type=personal');
    captureWorkspaceFromUrl();
    expect(getWorkspaceHeaders()).toEqual({ 'X-Snabbb-Workspace-Type': 'personal' });
  });
  it('does not reuse an old company for a malformed company launch', () => {
    sessionStorage.setItem('snabbb.appointment.workspaceOwnerUserId', 'old-owner');
    window.history.replaceState({}, '', '/?workspace_type=company');
    captureWorkspaceFromUrl();
    expect(() => getWorkspaceHeaders()).toThrow('select a company workspace');
  });
});
