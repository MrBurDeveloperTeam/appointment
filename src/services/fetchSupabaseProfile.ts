import { api } from "./api";

export const fetchSupabaseProfile = async () => {
  const res = await api.get('/supabase/user');
  const { supabase_profile } = res.data;
  if (!supabase_profile) {
    return null;
  }
  const user = { user: supabase_profile }
  console.log('user:', user);
  return user;
};
