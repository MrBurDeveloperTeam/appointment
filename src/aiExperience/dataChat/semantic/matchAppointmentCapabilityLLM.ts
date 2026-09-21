import {createAppointmentCapabilityMatcher} from '@mrburdeveloperteam/pet-function/apps/appointment';
import {routeAppointmentCapability} from '../../../services/geminiService';
export const matchAppointmentCapabilityLLM=createAppointmentCapabilityMatcher(routeAppointmentCapability);
