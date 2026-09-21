import {createAppointmentsPetRepository} from '@mrburdeveloperteam/pet-function/apps';
import {supabase} from '../lib/supabaseClient';
export const appointmentsPetRepository=createAppointmentsPetRepository(supabase);
