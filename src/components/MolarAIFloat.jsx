import { useState, useRef, useEffect } from 'react';
import { MessageCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import MolarChat from './MolarChat';
import { chatWithMolarAI } from '../services/geminiService';
import { supabase } from '../lib/supabaseClient';

/**
 * Self-contained floating Molar AI button + chat panel.
 * Drop this anywhere in the layout.
 */
export default function MolarAIFloat({ userContext, disabled = false, onPetToggle }) {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatHistory, setChatHistory] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef(null);
  const [isHovered, setIsHovered] = useState(false);
  const [badgeText, setBadgeText] = useState('Meow! 🐾');

  useEffect(() => {
    const texts = disabled 
      ? ['Log In', 'Get Started']
      : ['Ask Me', 'Try Me!', 'SNAI'];
    
    let i = 0;
    setBadgeText(texts[0]);

    const interval = setInterval(() => {
      i = (i + 1) % texts.length;
      setBadgeText(texts[i]);
    }, 2000);
    return () => clearInterval(interval);
  }, [disabled]);

  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    if (disabled) return;
    const msg = chatInput.trim();
    if (!msg || isChatLoading) return;

    setChatInput('');
    setChatHistory(prev => [...prev, { role: 'user', parts: [{ text: msg }] }]);
    setIsChatLoading(true);

    try {
      let response = null;

      // 1. Check custom responses first
      const { data: apps } = await supabase
        .from('aiboard_response_target_apps')
        .select('response_id')
        .in('app_name', ['Appointment', 'All']);

      if (apps && apps.length > 0) {
        const responseIds = apps.map(a => a.response_id);
        const { data: keywords } = await supabase
          .from('aiboard_response_keywords')
          .select('keyword, response_id')
          .in('response_id', responseIds);

        if (keywords && keywords.length > 0) {
          const matchedKeyword = keywords.find(k => msg.toLowerCase().includes(k.keyword.toLowerCase()));

          if (matchedKeyword) {
            const { data: respData } = await supabase
              .from('aiboard_responses')
              .select('response')
              .eq('id', matchedKeyword.response_id)
              .single();

            if (respData) {
              response = respData.response;
            }
          }
        }
      }

      // 2. Fallback to Gemini
      if (!response) {
        response = await chatWithMolarAI(chatHistory, msg, userContext || '');
      }
      
      // Parse actions from backticks if present
      let cleanResponse = response;
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) || response.match(/```\s*(\{[\s\S]*?\})\s*```/);
      
      if (jsonMatch) {
         try {
            const actionObj = JSON.parse(jsonMatch[1]);
            cleanResponse = response.replace(jsonMatch[0], '').trim();
            
            if (actionObj.action && window.__MOLAR_ACTIONS__) {
               const handlers = window.__MOLAR_ACTIONS__;
               const { action, data, id } = actionObj;
               
               console.log('[MolarAI] Executing action:', action, data);
               
               switch(action) {
                  case 'ADD_APPOINTMENT': handlers.addAppointment?.(data); break;
                  case 'UPDATE_APPOINTMENT': handlers.updateAppointment?.(id, data); break;
                  case 'ADD_STAFF': handlers.addStaff?.(data); break;
                  case 'ADD_ROOM': handlers.addRoom?.(data); break;
                  case 'ADD_TREATMENT': handlers.addTreatment?.(data); break;
                  case 'ADD_HOLIDAY': handlers.addHoliday?.(data); break;
                  case 'ADD_PATIENT': handlers.addPatient?.(data); break;
                  default: console.warn('[MolarAI] Unknown action:', action);
               }
            }
         } catch (e) {
            console.error('[MolarAI] Action parse failed:', e);
         }
      }

      setChatHistory(prev => [...prev, { role: 'model', parts: [{ text: cleanResponse || "SNAI: Action executed." }] }]);
    } catch (error) {
      setChatHistory(prev => [...prev, { role: 'model', parts: [{ text: "SNAI Error: Unable to process request." }] }]);
    } finally {
      setIsChatLoading(false);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  };

  const handleOpenChat = () => {
    if (disabled) return;
    setIsChatOpen(true);
  };

  const handleClearChat = () => setChatHistory([]);

  return (
    <>
      {/* Floating trigger button - SuperApp Style */}
      {!isChatOpen && (
        <div className="fixed bottom-6 right-6 z-[60] flex flex-col items-center group">
          <div className="relative flex items-center justify-center">
            <div className="absolute -top-2 left-1/2 -translate-x-1/2 z-[70] pointer-events-none">
              <AnimatePresence mode="wait">
                <motion.div
                  key={badgeText}
                  initial={{ opacity: 0, y: 5, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -5, scale: 0.9 }}
                  className="bg-white text-emerald-500 text-[10px] sm:text-[12px] font-bold tracking-wider px-2 py-0.5 rounded-full shadow-lg shadow-emerald-500/20 whitespace-nowrap"
                >
                  {badgeText}
                </motion.div>
              </AnimatePresence>
            </div>
            <button
              onClick={() => setIsChatOpen(true)}
              disabled={disabled}
              className={`w-16 h-16 rounded-full flex items-center justify-center text-white shadow-lg hover:scale-105 hover:shadow-xl transition-all shadow-[#1F7A6F]/30 relative overflow-hidden ${disabled ? 'bg-slate-300 grayscale cursor-not-allowed opacity-70' : 'bg-[#1F7A6F]'}`}
            >
              
              <img 
                src="/images/ai_logo.png" 
                alt="Molar AI" 
                className={`w-10 h-10 object-contain drop-shadow-sm transition-transform ${disabled ? 'brightness-80' : ''}`} 
              />
            </button>
          </div>
        </div>
      )}

      <MolarChat
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        chatHistory={chatHistory}
        isChatLoading={isChatLoading}
        chatInput={chatInput}
        setChatInput={setChatInput}
        onSendMessage={handleSendMessage}
        onClearChat={handleClearChat}
        onPetToggle={onPetToggle}
        chatEndRef={chatEndRef}
      />


    </>
  );
}
