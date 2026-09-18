import {createAppointmentsVirtualPet} from '@mrburdeveloperteam/pet-function/apps/appointment';
import {supabase} from '../lib/supabaseClient';
import {appointmentsPetRepository} from './appointmentsPetRepository';
const AppointmentsVirtualPet=createAppointmentsVirtualPet(supabase,appointmentsPetRepository);
export default AppointmentsVirtualPet;
