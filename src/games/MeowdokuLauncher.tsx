import { SharedMeowdokuLauncher } from '@mrburdeveloperteam/pet-function/pet';
import { supabase } from '../lib/supabaseClient';
import { appointmentsPetRepository } from '../petExperience/appointmentsPetRepository';

export default function MeowdokuLauncher(props: { isOpen: boolean; onClose: () => void; userId: string | null }) {
  return <SharedMeowdokuLauncher {...props} repository={appointmentsPetRepository} rpcClient={supabase} />;
}
