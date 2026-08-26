import React, { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { X, Send, Zap, ShieldCheck, AlertCircle, BarChart3, RefreshCcw, Mail } from 'lucide-react';
import * as Icons from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

const DynamicIcon = ({ name, ...props }) => {
    const IconComponent = Icons[name] || Icons.Zap;
    return <IconComponent {...props} />;
};

// --- Text Extraction for Logic ---
const getText = (node) => {
    if (!node) return "";
    if (typeof node === "string" || typeof node === "number") return String(node);
    if (Array.isArray(node)) return node.map(getText).join("");
    if (node.props && node.props.children) return getText(node.props.children);
    return "";
};

// --- Custom Markdown Components (Matched to SuperApp) ---
const MARKDOWN_COMPONENTS = {
    strong: ({ node, ...props }) => {
        const text = getText(props.children);
        const isExpired = text.includes('(EXP)');
        const isSoon = text.includes('(SOON)');
        return (
            <strong
                className={`font-semibold ${isExpired ? 'text-rose-700' :
                    isSoon ? 'text-amber-700' :
                        'text-slate-800'
                    }`}
                {...props}
            />
        );
    },
    table: ({ node, ...props }) => (
        <div className="my-4 overflow-hidden rounded-xl border border-slate-200 bg-white/60 shadow-sm w-full max-w-full">
            <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent">
                <table className="w-full text-left text-xs border-collapse" {...props} />
            </div>
        </div>
    ),
    thead: ({ node, ...props }) => <thead className="bg-slate-50/80 border-b border-slate-200" {...props} />,
    th: ({ node, ...props }) => <th className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider text-[10px]" {...props} />,
    tr: ({ node, ...props }) => (
        <tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors" {...props} />
    ),
    td: ({ node, ...props }) => {
        const cellText = getText(props.children);
        const isExpired = cellText.includes('(EXP)');
        const isSoon = cellText.includes('(SOON)');
        return (
            <td
                className={`px-4 py-3 text-xs font-medium whitespace-nowrap ${isExpired ? 'text-rose-600 font-semibold' :
                    isSoon ? 'text-amber-600 font-semibold' :
                        'text-slate-600'
                    }`}
                {...props}
            />
        );
    },
    p: ({ node, ...props }) => <p className="mb-2 last:mb-0 leading-relaxed" {...props} />,
    ul: ({ node, ...props }) => <ul className="list-disc pl-4 mb-2 space-y-1 text-slate-700" {...props} />,
    li: ({ node, ...props }) => <li className="pl-1 marker:text-emerald-500" {...props} />
};

const MemoizedMessage = React.memo(({ text, isUser }) => {
    const chatComponents = {
        ...MARKDOWN_COMPONENTS,
        strong: ({ node, ...props }) => {
            const content = getText(props.children);
            const isExpired = content.includes('(EXP)');
            const isSoon = content.includes('(SOON)');
            return (
                <strong
                    className={`font-bold ${isExpired ? 'text-rose-700' :
                        isSoon ? 'text-amber-700' :
                            isUser ? 'text-white' : 'text-slate-900'
                        }`}
                    {...props}
                />
            );
        },
        p: ({ node, ...props }) => <p className={`mb-1.5 last:mb-0 leading-relaxed ${isUser ? 'text-white' : 'text-slate-700'}`} {...props} />,
        ul: ({ node, ...props }) => <ul className={`list-disc pl-4 mb-2 space-y-1 ${isUser ? 'text-white/90' : 'text-slate-600'}`} {...props} />,
        li: ({ node, ...props }) => <li className={`pl-1 ${isUser ? 'marker:text-white/60' : 'marker:text-emerald-500'}`} {...props} />,
        td: ({ node, ...props }) => {
            const cellText = getText(props.children);
            const isExpired = cellText.includes('(EXP)');
            const isSoon = cellText.includes('(SOON)');
            return (
                <td
                    className={`px-4 py-3 text-xs font-medium whitespace-nowrap ${isExpired ? 'text-rose-600 font-bold' :
                        isSoon ? 'text-amber-600 font-bold' :
                            isUser ? 'text-white' : 'text-slate-600'
                        }`}
                    {...props}
                />
            );
        },
    };

    return (
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={chatComponents}>
            {text}
        </ReactMarkdown>
    );
});

export default function MolarChat({ isOpen, onClose, chatHistory, isChatLoading, chatInput, setChatInput, onSendMessage, onClearChat, onPetToggle, chatEndRef }) {
    const inputRef = useRef(null);
    const [config, setConfig] = React.useState({
        title: 'Appointment Simulator',
        subtitle: 'Ready to assist with appointments, clinic operations, and staff metrics.'
    });
    const [prompts, setPrompts] = React.useState([]);

    useEffect(() => {
        const fetchSimConfig = async () => {
            try {
                const { data: configs } = await supabase
                    .from('aiboard_simulator_configs')
                    .select('id, title, subtitle')
                    .eq('module_name', 'Appointment')
                    .limit(1);

                if (configs && configs.length > 0) {
                    setConfig({
                        title: configs[0].title,
                        subtitle: configs[0].subtitle || 'Ready to assist with appointments, clinic operations, and staff metrics.',
                    });

                    const { data: promptData } = await supabase
                        .from('aiboard_simulator_prompts')
                        .select('text, icon_name, sort_order')
                        .eq('config_id', configs[0].id)
                        .order('sort_order', { ascending: true });

                    if (promptData && promptData.length > 0) {
                        setPrompts(promptData);
                    } else {
                        setPrompts([
                            { text: "Check today's appointments", icon_name: 'Zap' },
                            { text: "Manage pending requests", icon_name: 'ShieldCheck' },
                            { text: "View clinic alerts", icon_name: 'AlertCircle' },
                            { text: "Clinic performance", icon_name: 'BarChart3' },
                        ]);
                    }
                } else {
                    setPrompts([
                        { text: "Check today's appointments", icon_name: 'Zap' },
                        { text: "Manage pending requests", icon_name: 'ShieldCheck' },
                        { text: "View clinic alerts", icon_name: 'AlertCircle' },
                        { text: "Clinic performance", icon_name: 'BarChart3' },
                    ]);
                }
            } catch (err) {
                console.error("Error fetching sim configs:", err);
            }
        };

        if (isOpen) {
            fetchSimConfig();
        }
    }, [isOpen]);

    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <>
            {/* Backdrop for mobile */}
            <div className="fixed inset-0 bg-slate-900/10 backdrop-blur-[2px] z-[9998] md:hidden" onClick={onClose} />

            {/* Main Capsule Container */}
            <div className="fixed bottom-4 right-4 md:bottom-6 md:right-6 w-[90vw] md:w-[400px] h-[70vh] md:h-[600px] max-h-[85vh] flex flex-col font-sans z-[9999] overflow-hidden rounded-[1.5rem] shadow-2xl shadow-slate-400/60 border border-white/40 bg-white/80 backdrop-blur-2xl ring-1 ring-slate-900/5">

                {/* Background Ambience */}
                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                    <div className="absolute top-[-10%] right-[-10%] w-[350px] h-[350px] bg-emerald-100/50 rounded-full blur-[80px] animate-pulse-slow mix-blend-multiply"></div>
                    <div className="absolute bottom-[-10%] left-[-10%] w-[300px] h-[300px] bg-teal-100/50 rounded-full blur-[60px] animate-pulse-slow delay-1000 mix-blend-multiply"></div>
                    <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.2] mix-blend-overlay"></div>
                </div>

                {/* Header - SN-AI Style */}
                <div className="flex items-center justify-between px-5 py-2 relative z-10 border-b border-slate-200 bg-white">
                    {/* Logo/Title */}
                    <div className="flex items-center">
                        <span className="text-[22px] font-extrabold tracking-normal" style={{ color: '#2A9D8F' }}>SN</span>
                        <span className="text-[22px] font-extrabold tracking-normal text-black">AI</span>
                    </div>

                    {/* Header Actions */}
                    <div className="flex items-center gap-1">
                        {/* Virtual Pet Button */}
                        {onPetToggle && (
                            <button
                                onClick={onPetToggle}
                                className="p-1 px-2 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 rounded-lg transition-all"
                                title="Virtual Pet"
                            >
                                <span className="text-xl">🐾</span>
                            </button>
                        )}

                        {/* Clear Chat Button */}
                        <button
                            onClick={onClearChat}
                            className="p-1 text-slate-400 hover:text-emerald-500 transition-all mr-1"
                            title="Clear conversation"
                            aria-label="Clear conversation"
                        >
                            <RefreshCcw className="w-5 h-5" />
                        </button>

                        {/* Close Button */}
                        <button
                            onClick={onClose}
                            className="p-1 text-slate-400 hover:text-emerald-500 transition-all"
                            aria-label="Close chat"
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                </div>

                {/* Messages Area */}
                <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-3 scroll-smooth scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent relative z-10">
                    {chatHistory.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full text-center pt-5 pb-12 animate-in fade-in zoom-in-95 duration-700">
                            
                            {config.title && (
                                <h3 className="text-slate-700 text-lg font-bold mb-2 max-w-[280px] leading-tight">
                                    {config.title}
                                </h3>
                            )}
                            <p className="text-slate-600 text-sm max-w-[320px] leading-relaxed mb-6 font-normal">
                                {config.subtitle}
                            </p>

                            <div className="grid grid-cols-1 gap-2.5 w-full max-w-[340px]">
                                {prompts.map((p, idx) => (
                                    <button key={idx} onClick={() => setChatInput(p.text)} className="group flex items-center gap-3 w-full p-3 rounded-2xl bg-white border border-slate-100 hover:border-emerald-200 hover:bg-emerald-50/30 transition-all shadow-sm hover:shadow-md text-left">
                                        <div className="w-9 h-9 rounded-xl bg-emerald-100/50 flex items-center justify-center group-hover:scale-110 transition-all duration-300 shadow-sm border border-emerald-50">
                                            <DynamicIcon name={p.icon_name} className="w-5 h-5 text-emerald-600" />
                                        </div>
                                        <span className="text-[14px] font-semibold text-slate-700 group-hover:text-emerald-800 leading-tight">{p.text}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="space-y-5 pb-0">
                        {chatHistory.map((msg, idx) => {
                            const isUser = msg.role === 'user';
                            return (
                                <div key={idx} className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-500`}>
                                    <div className={`max-w-[100%] relative ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
                                        <div className={`px-4 py-2 text-sm leading-relaxed backdrop-blur-sm shadow-sm border max-w-full overflow-hidden ${isUser
                                            ? 'bg-emerald-600 border-transparent text-white rounded-[1.2rem] rounded-br-sm shadow-md shadow-emerald-500/20'
                                            : 'bg-slate-100/70 text-slate-700 border-slate-200/80 rounded-[1.2rem] rounded-tl-sm'
                                            }`}>
                                            <MemoizedMessage text={msg.parts[0].text} isUser={isUser} />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                        {isChatLoading && (
                            <div className="flex justify-start animate-in fade-in duration-300">
                                <style>{`
                                    @keyframes smallBounce {
                                        0%, 100% { transform: translateY(0); }
                                        50% { transform: translateY(-2px); }
                                    }
                                    .animate-small-bounce {
                                        animation: smallBounce 1s infinite ease-in-out;
                                    }
                                `}</style>
                                <div className="px-5 py-3.5 bg-slate-100/70 border border-slate-200/80 rounded-[1.2rem] rounded-tl-sm flex gap-2 items-center shadow-sm">
                                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-small-bounce" style={{ animationDelay: '-0.3s' }}></div>
                                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-small-bounce" style={{ animationDelay: '-0.15s' }}></div>
                                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-small-bounce"></div>
                                </div>
                            </div>
                        )}
                        <div ref={chatEndRef} />
                    </div>
                </div>

                {/* Persistent support shortcut */}
                <div className="px-3 pt-1 relative z-20">
                    <a
                        href="https://mail.google.com/mail/?view=cm&amp;fs=1&amp;to=support%40snabbb.com&amp;su=Customer%20Inquiry"
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Email support at support@snabbb.com"
                        className="appointment-support-link group flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-all duration-200 focus-visible:outline-none active:scale-[0.99]"
                    >
                        <span className="appointment-support-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-transform duration-200 group-hover:scale-105">
                            <Mail className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className="appointment-support-title block text-sm font-semibold">
                                Email Support
                            </span>
                            <span className="appointment-support-meta block truncate text-xs">
                                Contact support@snabbb.com
                            </span>
                        </span>
                    </a>
                </div>

                {/* Footer Input Area - Neumorphic Design */}
                <div className="p-3 relative z-20">
                    <form noValidate onSubmit={onSendMessage} className="relative w-full max-w-xl mx-auto">
                        <div
                            className="
                            relative flex items-center gap-0 p-1.5 rounded-full transition-all duration-300 ease-out
                            bg-slate-100
                            shadow-[inset_2px_2px_5px_rgba(148,163,184,0.25),inset_0px_-3px_6px_rgba(148,163,184,0.15),inset_-3px_-3px_7px_rgba(255,255,255,1)]
                            ring-1 ring-white/60 border border-slate-300/70
                            focus-within:shadow-[inset_3px_3px_6px_rgba(148,163,184,0.35),inset_0px_-4px_8px_rgba(148,163,184,0.25),inset_-3px_-3px_6px_rgba(255,255,255,1)]
                            focus-within:ring-2 focus-within:ring-emerald-500/20 focus-within:border-emerald-500/50
                            "
                        >
                            <input
                                ref={inputRef}
                                className="
                                flex-1 bg-transparent border-0 px-3 py-2 text-sm text-slate-800
                                placeholder:text-slate-400/70 font-medium tracking-wide
                                focus:outline-none focus:ring-0
                            "
                                placeholder="Ask SNAI..."
                                value={chatInput}
                                onChange={(e) => setChatInput(e.target.value)}
                            />

                            <button
                                type="submit"
                                disabled={!chatInput.trim() || isChatLoading}
                                className={`
                                p-2.5 rounded-full flex items-center justify-center transition-all duration-300 ease-out
                                ${chatInput.trim() && !isChatLoading
                                        ? 'bg-emerald-500 text-white shadow-[3px_3px_6px_rgba(16,185,129,0.4),-2px_-2px_5px_rgba(255,255,255,0.8)] hover:scale-105 hover:bg-emerald-400 active:scale-95 active:shadow-[inset_2px_2px_5px_rgba(0,0,0,0.1)]'
                                        : 'bg-slate-200/50 text-slate-400 cursor-not-allowed shadow-none'
                                    }
                            `}
                            >
                                <Send className="w-4 h-4" />
                            </button>
                        </div>
                    </form>
                </div>

                {/* Custom Animations */}
                <style>{`
                    .animate-pulse-slow {
                        animation: pulse 6s cubic-bezier(0.4, 0, 0.6, 1) infinite;
                    }
                    @keyframes pulse {
                        0%, 100% { opacity: 1; }
                        50% { opacity: 0.5; }
                    }
                `}</style>
            </div>
        </>
    );
}
