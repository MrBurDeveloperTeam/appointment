import { createAppointmentSNAIService } from '@mrburdeveloperteam/pet-function/apps/appointment';
import { supabase } from '../lib/supabaseClient';
export const { chatWithMolarAI, chatWithGroundedAppointmentFacts, routeAppointmentCapability } = createAppointmentSNAIService(supabase);
