import { useQuery } from "@tanstack/react-query";
import { fetchSupabaseProfile } from '../services/fetchSupabaseProfile';

export const useSupabaseProfile = () => {
  return useQuery({
    queryKey: ["supabaseProfile"],
    queryFn: fetchSupabaseProfile,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};
