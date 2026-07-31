import React, { useEffect, useState, useRef } from 'react';
import { useGameState } from '../hooks/useGameState';

const GAME_CONFIG: Record<string, { title: string; url: string; icon: string; gradient: string }> = {
    flappy: {
        title: 'Flappy Cat',
        url: '/games/flappy-cat/index.html?v=20260731-10',
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
            '/games/tetris/index.html?v=20260730-7',
        icon: '🧱',
        gradient:
            'from-red-400 to-pink-600'
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

    // Sync score from games
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
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
    }, [setStats]);

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
    const isTetris = gameId === 'tetris';

    return (
        <div className="fixed inset-0 z-50 h-[100dvh] w-[100dvw] overflow-hidden bg-black" style={{ fontFamily: "'Fredoka', sans-serif" }}>
            {/* Container - Full Screen */}
            <div className="relative h-full w-full overflow-hidden animate-in zoom-in-95 fade-in duration-300">

                {/* Top UI Area */}
                <div
                    className="absolute z-50 flex flex-col items-end gap-2"
                    style={{
                        top: 'max(1.5rem, env(safe-area-inset-top))',
                        right: 'max(1.5rem, env(safe-area-inset-right))',
                    }}
                >
                    <div className="flex items-center gap-3">
                        {/* Session Progress (Pending Coins) */}
                        {sessionCoins > 0 && (
                            <div className="flex items-center gap-1.5 bg-yellow-500/10 backdrop-blur-md px-3 py-1.5 rounded-full border border-yellow-500/20 shadow-sm text-yellow-400 animate-in fade-in slide-in-from-top-2 duration-300">
                                <span className="text-[10px] font-black uppercase tracking-wider opacity-70">Coins</span>
                                <span className="font-black text-sm tracking-widest">+{sessionCoins}</span>
                            </div>
                        )}

                        {/* Accumulated Score Indicator (Persistent Wallet) */}
                        <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md px-4 py-2.5 rounded-full border border-white/10 shadow-lg text-white transition-all duration-500 ring-1 ring-white/5">
                            <span className="text-xl">💰</span>
                            <span className="font-black text-lg tracking-widest min-w-[3ch] text-right">
                                <AnimatedCounter value={stats.coins || 0} />
                            </span>
                        </div>

                        {/* Floating Close Button */}
                        <button
                            type="button"
                            onClick={onClose}
                            className="w-12 h-12 flex items-center justify-center rounded-full bg-black/40 hover:bg-black/80 text-white/70 hover:text-white border-2 border-white/10 backdrop-blur-sm transition-all hover:scale-110 active:scale-95 shadow-lg"
                            title="Exit Game"
                            aria-label="Exit game"
                        >
                            <span className="text-2xl font-bold leading-none mb-1">×</span>
                        </button>
                    </div>
                </div>

                {/* Game Iframe Wrapper */}
                <div
                    className={
                        isTetris
                            ? 'absolute overflow-hidden bg-black'
                            : 'absolute inset-0 overflow-hidden bg-black'
                    }
                    style={
                        isTetris
                            ? {
                                /*
                                * Reserve the top area for the global Back,
                                * Coin and Close controls.
                                */
                                top:
                                    'max(clamp(4.5rem, 12dvh, 6rem), calc(env(safe-area-inset-top, 0px) + 0.75rem))',

                                right:
                                    'max(0.75rem, env(safe-area-inset-right, 0px))',

                                bottom:
                                    'max(0.75rem, env(safe-area-inset-bottom, 0px))',

                                left:
                                    'max(0.75rem, env(safe-area-inset-left, 0px))',
                            }
                            : undefined
                    }
                >
                    {isLoading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-slate-900 z-10">
                            <div className="flex flex-col items-center gap-4">
                                <div className="w-16 h-16 border-4 border-white/20 border-t-white rounded-full animate-spin" />
                                <span className="text-white/60 text-sm">Loading {config.title}...</span>
                            </div>
                        </div>
                    )}

                    <iframe
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
