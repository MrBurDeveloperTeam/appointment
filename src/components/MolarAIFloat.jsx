import {createAppointmentMolarAIFloat} from '@mrburdeveloperteam/pet-function/apps/appointment';
import {supabase} from '../lib/supabaseClient';
const MolarAIFloat=createAppointmentMolarAIFloat({supabase,chatWithMolarAI,chatWithGroundedAppointmentFacts,routeAppointmentCapability});
export default MolarAIFloat;
