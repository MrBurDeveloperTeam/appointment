const TYPE_KEY = 'snabbb.appointment.workspaceType';
const OWNER_KEY = 'snabbb.appointment.workspaceOwnerUserId';

export function captureWorkspaceFromUrl() {
  const url = new URL(window.location.href);
  const type = url.searchParams.get('workspace_type');
  const ownerId = url.searchParams.get('workspace_owner_id');
  if (type !== 'personal' && type !== 'company') return;

  sessionStorage.setItem(TYPE_KEY, type);
  if (type === 'company' && ownerId) {
    sessionStorage.setItem(OWNER_KEY, ownerId);
  } else {
    sessionStorage.removeItem(OWNER_KEY);
  }
  url.searchParams.delete('workspace_type');
  url.searchParams.delete('workspace_owner_id');
  window.history.replaceState(window.history.state, document.title,
    `${url.pathname}${url.search}${url.hash}`);
}

export function getWorkspaceType() {
  return sessionStorage.getItem(TYPE_KEY) === 'company' ? 'company' : 'personal';
}

export function getWorkspaceHeaders() {
  const type = getWorkspaceType();
  const ownerId = sessionStorage.getItem(OWNER_KEY);
  if (type === 'company' && !ownerId) {
    throw new Error('Please select a company workspace in Snabbb and reopen Appointment.');
  }
  return {
    'X-Snabbb-Workspace-Type': type,
    ...(type === 'company' ? { 'X-Snabbb-Workspace-User-Id': ownerId } : {}),
  };
}

export function getWorkspaceCacheKey() {
  return `${getWorkspaceType()}:${sessionStorage.getItem(OWNER_KEY) || ''}`;
}
