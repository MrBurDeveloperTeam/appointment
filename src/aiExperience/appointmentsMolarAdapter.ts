import {createAppointmentsMolarAdapter as createSharedAdapter} from '@mrburdeveloperteam/pet-function/apps/appointment';
import type {AppointmentsMolarAdapterDeps} from '@mrburdeveloperteam/pet-function/apps/appointment';
import {supabase} from '../lib/supabaseClient';
import {chatWithMolarAI,chatWithGroundedAppointmentFacts,routeAppointmentCapability} from '../services/geminiService';
export function createAppointmentsMolarAdapter(deps:Omit<AppointmentsMolarAdapterDeps,'supabase'|'chatWithMolarAI'|'chatWithGroundedAppointmentFacts'|'routeAppointmentCapability'>){
 return createSharedAdapter({...deps,supabase,chatWithMolarAI,chatWithGroundedAppointmentFacts,routeAppointmentCapability});
}
