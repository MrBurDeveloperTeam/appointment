import { supabase } from '../lib/supabaseClient';
import { getWorkspaceHeaders } from './workspaceContext';

export async function getCompanyDirectory() {
  const headers = getWorkspaceHeaders();
  const ownerId = headers['X-Snabbb-Workspace-User-Id'];
  if (!ownerId) return [];

  const { data: memberships, error: membershipError } = await supabase
    .from('company_members')
    .select('member_user_id')
    .eq('company_owner_user_id', ownerId)
    .eq('status', 'active');
  if (membershipError) throw membershipError;

  const ids = [...new Set((memberships || []).map((row) => row.member_user_id).filter(Boolean))];
  if (!ids.length) return [];

  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('user_id,full_name,name')
    .in('user_id', ids);
  if (profileError) throw profileError;

  const names = new Map((profiles || []).map((profile) => [
    profile.user_id, profile.full_name?.trim() || profile.name?.trim() || '',
  ]));
  // Missing profiles can indicate directory policies have not yet been applied.
  if (ids.some((id) => !names.get(id))) {
    throw new Error('Some company member names are unavailable. Please contact your company administrator or enter a name manually.');
  }
  return ids.map((id) => ({ id, name: names.get(id) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
