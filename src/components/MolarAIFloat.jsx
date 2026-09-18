import {createAppointmentMolarAIFloat} from '@mrburdeveloperteam/pet-function/apps/appointment';
import {supabase} from '../lib/supabaseClient';
import {chatWithMolarAI,chatWithGroundedAppointmentFacts,routeAppointmentCapability} from '../services/geminiService';
const MolarAIFloat=createAppointmentMolarAIFloat({supabase,chatWithMolarAI,chatWithGroundedAppointmentFacts,routeAppointmentCapability});
export default MolarAIFloat;
