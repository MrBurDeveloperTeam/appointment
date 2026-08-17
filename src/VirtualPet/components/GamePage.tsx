import React, { useEffect, useState, useRef } from 'react';
import { useGameState } from '../hooks/useGameState';
import { supabase } from '../../lib/supabaseClient';
import { ArrowLeft } from 'lucide-react';

const GAME_CONFIG: Record<string, { title: string; url: string; icon: string; gradient: string }> = {
    flappy: {
        title: 'Flappy Cat',
        url: '/games/flappy-cat/index.html?v=20260731-12',
        icon: '🕊️',
        gradient: 'from-yellow-400 to-orange-500'
    },
    paccat: {
        title: 'Pac-Cat',
        url: '/games/pac-cat/index.html',
        icon: '👻',
        gradient: 'from-blue-400 to-indigo-600'
    },
    tetris: {
        title: 'Tetris',
        url:
            '/games/tetris/index.html?v=20260730-10',
        icon: '🧱',
        gradient:
            'from-red-400 to-pink-600'
    },
    meowdoku: {
        title: 'Meowdoku',
        url: '/games/meowdoku/index.html?v=20260817-meowdoku-1',
        icon: '🐱',
        gradient: 'from-blue-400 to-indigo-600'
    }
};

/**
 * Animated number component for the "increase" effect
 */
const AnimatedCounter: React.FC<{ value: number }> = ({ value }) => {
    const [displayValue, setDisplayValue] = useState(value);
    const frameRef = useRef<number>(0);
    const startValue = useRef(value);
    const endValue = useRef(value);
    const startTime = useRef(0);
    const duration = 3000; // 1 second animation

    useEffect(() => {
        if (value === displayValue) return;

        // Reset animation state
        startValue.current = displayValue;
        endValue.current = value;
        startTime.current = performance.now();

        const animate = (now: number) => {
            const elapsed = now - startTime.current;
            const progress = Math.min(elapsed / duration, 1);

            // Ease out cubic
            const easedProgress = 1 - Math.pow(1 - progress, 3);

            const current = Math.floor(startValue.current + (endValue.current - startValue.current) * easedProgress);
            setDisplayValue(current);

            if (progress < 1) {
                frameRef.current = requestAnimationFrame(animate);
            }
        };

        frameRef.current = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(frameRef.current);
    }, [value]);

    return <span>{String(displayValue)}</span>;
};

interface GamePageProps {
    gameId: string;
    onClose: () => void;
}

export const GamePage: React.FC<GamePageProps> = ({ gameId, onClose }) => {
    const [isLoading, setIsLoading] = useState(true);
    const { stats, setStats } = useGameState();
    const [sessionCoins, setSessionCoins] = useState(0);
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const meowdokuUserIdRef = useRef<string | null>(null);

    const postToGame = (message: Record<string, unknown>) => {
        iframeRef.current?.contentWindow?.postMessage(message, window.location.origin);
    };

    const sendMeowdokuProgress = (progress: {
        unlocked_level: number;
        completed_modes: Record<string, unknown>;
    }) => {
        postToGame({ type: 'MEOWDOKU_PROGRESS', progress });
    };

    const sendUnlockedAchievements = (value: unknown) => {
        const achievements = Array.isArray(value) ? value : [];
        if (achievements.length > 0) {
            postToGame({
                type: 'MEOWDOKU_ACHIEVEMENTS_UNLOCKED',
                achievements
            });
        }
    };

    const loadMeowdokuAchievements = async () => {
        if (!meowdokuUserIdRef.current) return;
        const { data, error } = await supabase.rpc('meowdoku_get_achievements');
        postToGame(error
            ? { type: 'MEOWDOKU_ACHIEVEMENTS_ERROR', message: error.message }
            : { type: 'MEOWDOKU_ACHIEVEMENTS', achievements: data });
    };

    const loadMeowdokuCheckIn = async () => {
        if (!meowdokuUserIdRef.current) return;
        const { data, error } = await supabase.rpc('meowdoku_get_check_in');
        postToGame(error
            ? { type: 'MEOWDOKU_CHECK_IN_ERROR', message: error.message }
            : { type: 'MEOWDOKU_CHECK_IN', checkIn: data });
    };

    const loadMeowdokuProgress = async () => {
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) {
            meowdokuUserIdRef.current = null;
            postToGame({ type: 'MEOWDOKU_PROGRESS_LOCAL_ONLY' });
            return false;
        }

        meowdokuUserIdRef.current = user.id;
        const { data, error } = await supabase.rpc('meowdoku_get_mode_progress');
        if (error) {
            console.error('Unable to load Meowdoku progress:', error);
            postToGame({ type: 'MEOWDOKU_PROGRESS_LOCAL_ONLY' });
            return true;
        }

        const progress = Array.isArray(data) ? data[0] : data;
        sendMeowdokuProgress({
            unlocked_level: Math.max(1, Math.min(60, Number(progress?.unlocked_level) || 1)),
            completed_modes: progress?.completed_modes && typeof progress.completed_modes === 'object'
                ? progress.completed_modes as Record<string, unknown>
                : {}
        });
        return true;
    };

    const initializeMeowdoku = async () => {
        const hasAuthenticatedUser = await loadMeowdokuProgress();
        if (!hasAuthenticatedUser) return;
        await Promise.all([
            loadMeowdokuCheckIn(),
            loadMeowdokuAchievements()
        ]);
    };

    const saveMeowdokuProgress = async (payload: {
        completed_level?: unknown;
        mode?: unknown;
        score?: unknown;
        mistakes?: unknown;
        time_seconds?: unknown;
        hints_used?: unknown;
        lives_remaining?: unknown;
    }) => {
        if (!meowdokuUserIdRef.current) return;
        const completedLevel = Math.max(1, Math.min(60, Math.floor(Number(payload.completed_level) || 0)));
        if (!completedLevel) return;
        const mode = String(payload.mode || '').toLowerCase();
        if (!['easy', 'medium', 'hard', 'hell'].includes(mode)) return;

        const { data, error } = await supabase.rpc('meowdoku_complete_mode_with_achievements', {
            p_level_number: completedLevel,
            p_mode: mode,
            p_score: Math.max(0, Math.floor(Number(payload.score) || 0)),
            p_mistakes: Math.max(0, Math.floor(Number(payload.mistakes) || 0)),
            p_time_seconds: Math.max(0, Math.floor(Number(payload.time_seconds) || 0)),
            p_hints_used: Math.max(0, Math.floor(Number(payload.hints_used) || 0)),
            p_lives_remaining: Math.max(1, Math.min(3, Math.floor(Number(payload.lives_remaining) || 3)))
        });

        if (error) {
            console.error('Unable to save Meowdoku progress:', error);
            return;
        }
        const result = Array.isArray(data) ? data[0] : data;
        sendUnlockedAchievements(result?.new_achievements);
        await Promise.all([
            loadMeowdokuProgress(),
            loadMeowdokuAchievements()
        ]);
    };

    const recordMeowdokuCatFound = async (payload: {
        level?: unknown;
        cat_index?: unknown;
    }) => {
        if (!meowdokuUserIdRef.current) return;
        const { data, error } = await supabase.rpc('meowdoku_record_cat_found', {
            p_level_number: Math.max(1, Math.min(60, Math.floor(Number(payload.level) || 1))),
            p_cat_index: Math.max(0, Math.floor(Number(payload.cat_index) || 0))
        });
        if (error) {
            console.error('Unable to save Meowdoku cat discovery:', error);
            return;
        }
        const result = Array.isArray(data) ? data[0] : data;
        sendUnlockedAchievements(result?.new_achievements);
        await loadMeowdokuAchievements();
    };

    const claimMeowdokuCheckIn = async () => {
        if (!meowdokuUserIdRef.current) return;
        const { data, error } = await supabase.rpc('meowdoku_claim_check_in');
        if (error) {
            postToGame({ type: 'MEOWDOKU_CHECK_IN_ERROR', message: error.message });
            return;
        }
        const result = Array.isArray(data) ? data[0] : data;
        if (result?.coins != null) {
            setStats(previous => ({
                ...previous,
                coins: Number(result.coins) || previous.coins || 0
            }));
        }
        postToGame({ type: 'MEOWDOKU_CHECK_IN_CLAIMED', checkIn: result });
        sendUnlockedAchievements(result?.new_achievements);
        await loadMeowdokuAchievements();
    };

    // Sync score from games
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (
                event.origin !== window.location.origin ||
                event.source !== iframeRef.current?.contentWindow
            ) return;

            if (gameId === 'meowdoku') {
                if (event.data?.type === 'MEOWDOKU_READY') {
                    postToGame({
                        type: 'MEOWDOKU_WALLET',
                        coins: stats.coins || 0
                    });
                    void initializeMeowdoku();
                }

                if (event.data?.type === 'MEOWDOKU_SAVE_PROGRESS') {
                    void saveMeowdokuProgress(event.data.progress || {});
                }

                if (event.data?.type === 'MEOWDOKU_CAT_FOUND') {
                    void recordMeowdokuCatFound(event.data || {});
                }

                if (event.data?.type === 'MEOWDOKU_GET_CHECK_IN') {
                    void loadMeowdokuCheckIn();
                }

                if (event.data?.type === 'MEOWDOKU_CLAIM_CHECK_IN') {
                    void claimMeowdokuCheckIn();
                }

                if (event.data?.type === 'MEOWDOKU_GET_ACHIEVEMENTS') {
                    void loadMeowdokuAchievements();
                }

                if (event.data?.type === 'MEOWDOKU_SPEND_COINS') {
                    const amount = Math.max(0, Math.floor(Number(event.data.amount) || 0));
                    const requestId = String(event.data.requestId || '');
                    if (amount > 0 && (stats.coins || 0) >= amount) {
                        setStats(previous => ({
                            ...previous,
                            coins: Math.max(0, (previous.coins || 0) - amount)
                        }));
                        postToGame({
                            type: 'MEOWDOKU_SPEND_RESULT',
                            requestId,
                            ok: true
                        });
                    } else {
                        postToGame({
                            type: 'MEOWDOKU_SPEND_RESULT',
                            requestId,
                            ok: false
                        });
                    }
                }

                if (event.data?.type === 'MEOWDOKU_REWARD') {
                    const reward = Math.max(
                        0,
                        Math.min(1000, Math.floor(Number(event.data.coins) || 0))
                    );
                    if (reward > 0) {
                        setStats(previous => ({
                            ...previous,
                            coins: (previous.coins || 0) + reward,
                            happiness: Math.min(100, (previous.happiness || 0) + 15)
                        }));
                    }
                }

                return;
            }

            // Update temporary display score
            if (event.data?.type === 'GAME_SCORE_UPDATE') {
                const totalScore = event.data.score || 0;
                setSessionCoins(Math.floor(totalScore / 100));
            }

            // Persistence: Only add to official total when game ends
            if (event.data?.type === 'GAME_OVER') {
                const totalScore = event.data.score || 0;
                const reward = Math.floor(totalScore / 100);

                if (reward > 0) {
                    setStats(prev => ({
                        ...prev,
                        coins: (prev.coins || 0) + reward,
                        happiness: Math.min(100, (prev.happiness || 0) + 15)
                    }));
                }
                setSessionCoins(0); // Clear pending
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [gameId, setStats, stats.coins]);

    // Prevent the parent document from scrolling while a game is open
    useEffect(() => {
        const html = document.documentElement;
        const body = document.body;

        const previousHtmlOverflow =
            html.style.overflow;

        const previousHtmlOverscroll =
            html.style.overscrollBehavior;

        const previousBodyOverflow =
            body.style.overflow;

        const previousBodyOverscroll =
            body.style.overscrollBehavior;

        html.style.overflow = 'hidden';
        html.style.overscrollBehavior = 'none';

        body.style.overflow = 'hidden';
        body.style.overscrollBehavior = 'none';

        return () => {
            html.style.overflow =
                previousHtmlOverflow;

            html.style.overscrollBehavior =
                previousHtmlOverscroll;

            body.style.overflow =
                previousBodyOverflow;

            body.style.overscrollBehavior =
                previousBodyOverscroll;
        };
    }, []);

    if (!gameId || !GAME_CONFIG[gameId]) {
        onClose();
        return null;
    }

    const config = GAME_CONFIG[gameId];

    return (
        <div className="fixed inset-0 z-50 h-[100dvh] w-[100dvw] overflow-hidden bg-[#071225]" style={{ fontFamily: "'Fredoka', sans-serif" }}>
            {/* Container - Full Screen */}
            <div className="relative h-full w-full overflow-hidden animate-in zoom-in-95 fade-in duration-300">

                {/* Back to Virtual Pet */}
                <button
                    type="button"
                    onClick={onClose}
                    className="absolute z-[60] flex h-10 w-10 items-center justify-center rounded-full border-2 border-white/10 bg-black/40 text-white/80 shadow-lg backdrop-blur-sm transition-all hover:scale-110 hover:bg-black/80 hover:text-white active:scale-95 sm:h-12 sm:w-12"
                    style={{
                        top: 'max(0.75rem, env(safe-area-inset-top, 0px))',
                        left: 'max(0.75rem, env(safe-area-inset-left, 0px))',
                    }}
                    title="Back to Virtual Pet"
                    aria-label="Back to Virtual Pet"
                >
                    <ArrowLeft className="h-5 w-5 sm:h-6 sm:w-6" />
                </button>
                
                {/* Top UI Area */}
                <div
                    className="pointer-events-none absolute z-[60] flex flex-col items-end gap-2"
                    style={{
                        top: 'max(0.75rem, env(safe-area-inset-top, 0px))',
                        right: 'max(0.75rem, env(safe-area-inset-right, 0px))',
                    }}
                >
                    <div className="pointer-events-auto flex max-w-[calc(100vw-1.5rem)] flex-wrap items-center justify-end gap-1.5 sm:gap-2">
                        {/* Session Progress (Pending Coins) */}
                        {sessionCoins > 0 && (
                            <div className="flex items-center gap-1 rounded-full border border-yellow-500/20 bg-yellow-500/10 px-2 py-1.5 text-yellow-400 shadow-sm backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-300 sm:gap-1.5 sm:px-3">
                                <span className="hidden text-[10px] font-black uppercase tracking-wider opacity-70 sm:inline">
                                    Coins
                                </span>

                                <span className="text-xs font-black tracking-widest sm:text-sm">
                                    +{sessionCoins}
                                </span>
                            </div>
                        )}

                        {/* Accumulated Score Indicator (Persistent Wallet) */}
                        <div className="flex items-center gap-1 rounded-full border border-white/10 bg-black/40 px-2.5 py-1.5 text-white shadow-lg ring-1 ring-white/5 backdrop-blur-md transition-all duration-500 sm:gap-2 sm:px-4 sm:py-2.5">
                            <span className="text-sm sm:text-xl">💰</span>

                            <span className="min-w-[3ch] text-right text-xs font-black tracking-widest sm:text-lg">
                                <AnimatedCounter value={stats.coins || 0} />
                            </span>
                        </div>

                        {/* Floating Close Button */}
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white/10 bg-black/40 text-white/70 shadow-lg backdrop-blur-sm transition-all hover:scale-110 hover:bg-black/80 hover:text-white active:scale-95 sm:h-12 sm:w-12"
                            title="Exit Game"
                            aria-label="Exit game"
                        >
                            <span className="mb-0.5 text-lg font-bold leading-none sm:mb-1 sm:text-2xl">×</span>
                        </button>
                    </div>
                </div>

                {/* Game Iframe Wrapper */}
                <div className="absolute inset-0 overflow-hidden bg-[#071225]">
                    {isLoading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-slate-900 z-10">
                            <div className="flex flex-col items-center gap-4">
                                <div className="w-16 h-16 border-4 border-white/20 border-t-white rounded-full animate-spin" />
                                <span className="text-white/60 text-sm">Loading {config.title}...</span>
                            </div>
                        </div>
                    )}

                    <iframe
                        ref={iframeRef}
                        src={config.url}
                        className="block h-full w-full overflow-hidden border-0"
                        title={config.title}
                        onLoad={() => setIsLoading(false)}
                        allow="autoplay; fullscreen; screen-wake-lock"
                        allowFullScreen
                        scrolling="no"
                    />
                </div>
            </div>
        </div>
    );
};



