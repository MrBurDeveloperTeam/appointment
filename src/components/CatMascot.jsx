import {AppointmentCatMascot} from '@mrburdeveloperteam/pet-function/apps/appointment';
import {supabase} from '../lib/supabaseClient';
export default function CatMascot(props){return <AppointmentCatMascot {...props} supabase={supabase}/>;}
