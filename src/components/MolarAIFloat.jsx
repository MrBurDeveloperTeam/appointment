import { useEffect, useMemo, useState } from 'react';
import { SharedMolarAI } from '@mrburdeveloperteam/molar-experience/ai';
import { supabase } from '../lib/supabaseClient';
import { createAppointmentsMolarAdapter } from '../aiExperience/appointmentsMolarAdapter';

// PHASE 8D (Molar AI migration): thin host wrapper around
// `@mrburdeveloperteam/molar-experience/ai`'s <SharedMolarAI>. Generic chat
// lifecycle (open/closed, history, input draft, loading, empty-submit/
// duplicate-submit guards, clear, auto-scroll, Markdown, floating trigger +
// panel presentation) is now entirely owned by the shared package — ported
// byte-identical from this file's own pre-8D `MolarAIFloat.jsx`/
// `MolarChat.jsx` (confirmed via reading the installed `dist/ai.js`
// directly). Every actual response — General Chat, Data Chat, Gemini calls,
// the live `window.__MOLAR_ACTIONS__` action parser/dispatcher — is
// entirely local, in `../aiExperience/appointmentsMolarAdapter.ts`.
export default function MolarAIFloat({
  userContext,
  disabled = false,
  onPetToggle,
  appointments = [],
  rooms = [],
  appointmentDataStatus = 'loading',
  loadedAppointmentRange = null,
}) {
  // Empty-state content (title/subtitle/prompts) — KNOWN, ACCEPTED TIMING
  // SEAM (same pattern established across every prior app's Molar AI
  // migration in this series): the pre-8D `MolarChat.jsx` fetched this only
  // when the panel opened (`if (isOpen) fetchSimConfig()`); this fetches
  // once on mount instead, since `SharedMolarAI` has no panel-open lifecycle
  // hook exposed to the host. One extra harmless read query per mount,
  // never changes what's displayed.
  const [emptyState, setEmptyState] = useState({
    title: 'Appointment Simulator',
    subtitle: 'Ready to assist with appointments, clinic operations, and staff metrics.',
    prompts: [
      { label: "Check today's appointments", iconName: 'Zap' },
      { label: 'Manage pending requests', iconName: 'ShieldCheck' },
      { label: 'View clinic alerts', iconName: 'AlertCircle' },
      { label: 'Clinic performance', iconName: 'BarChart3' },
    ],
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: configs } = await supabase
          .from('aiboard_simulator_configs')
          .select('id, title, subtitle')
          .eq('module_name', 'Appointment')
          .limit(1);

        if (!configs || configs.length === 0) return;

        const { data: promptData } = await supabase
          .from('aiboard_simulator_prompts')
          .select('text, icon_name, sort_order')
          .eq('config_id', configs[0].id)
          .order('sort_order', { ascending: true });

        if (cancelled) return;

        setEmptyState((prev) => ({
          title: configs[0].title,
          subtitle: configs[0].subtitle || 'Ready to assist with appointments, clinic operations, and staff metrics.',
          prompts:
            promptData && promptData.length > 0
              ? promptData.map((p) => ({ label: p.text, iconName: p.icon_name }))
              : prev.prompts,
        }));
      } catch (err) {
        console.error('Error fetching sim configs:', err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const adapter = useMemo(
    () =>
      createAppointmentsMolarAdapter({
        userContext: userContext || '',
        appointments,
        rooms,
        appointmentDataStatus,
        loadedAppointmentRange,
      }),
    [userContext, appointments, rooms, appointmentDataStatus, loadedAppointmentRange]
  );

  return (
    <SharedMolarAI
      adapter={adapter}
      disabled={disabled}
      onPetToggle={onPetToggle}
      emptyState={emptyState}
    />
  );
}
