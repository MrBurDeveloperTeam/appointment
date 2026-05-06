import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { PetStats, PetColor, RoomType, FoodItem } from '../types';
import { INITIAL_STATS, XP_TO_LEVEL_UP, INITIAL_INVENTORY, FOOD_ITEMS } from '../constants';
import { supabase } from '../../lib/supabaseClient';


interface GameStateContextType {
    stats: PetStats;
    setStats: React.Dispatch<React.SetStateAction<PetStats>>;
    petName: string;
    setPetName: (name: string) => void;
    petColor: PetColor;
    setPetColor: (color: PetColor) => void;
    currentRoom: RoomType;
    setCurrentRoom: (room: RoomType) => void;
    isSleeping: boolean;
    setIsSleeping: (is: boolean) => void;
    isEating: boolean;
    setIsEating: (is: boolean) => void;
    isPlaying: boolean;
    setIsPlaying: (is: boolean) => void;
    inventory: Record<string, number>;
    buyItem: (itemId: string, price: number) => boolean;
    consumeItem: (itemId: string) => void;
    addXP: (amount: number) => void;
    activeBallId: string;
    setActiveBallId: (id: string) => void;
    foodItems: FoodItem[];
    isFoodLoading: boolean;
    currencyCode: string;
    currencyRate: number;
}

const GameStateContext = createContext<GameStateContextType | undefined>(undefined);

export const GameStateProvider: React.FC<{ children: React.ReactNode; currencyCode?: string }> = ({ children, currencyCode: initialCurrencyCode = 'USD' }) => {
    const [userId, setUserId] = useState<string | null>(null);
    const [stats, setStats] = useState<PetStats>(INITIAL_STATS);
    const [petName, setPetName] = useState("Molar");
    const [petColor, setPetColor] = useState<PetColor>(PetColor.POTATO);
    const [currentRoom, setCurrentRoom] = useState<RoomType>(RoomType.KITCHEN);
    const [inventory, setInventory] = useState<Record<string, number>>(INITIAL_INVENTORY);
    const [isSleeping, setIsSleeping] = useState(false);
    const [isEating, setIsEating] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [activeBallId, setActiveBallId] = useState<string>('ball_red');
    const [foodItems, setFoodItems] = useState<FoodItem[]>(FOOD_ITEMS);
    const [isFoodLoading, setIsFoodLoading] = useState(true);
    const [currencyCode, setCurrencyCode] = useState(initialCurrencyCode);
    const [currencyRate, setCurrencyRate] = useState(1);

    const isHydrated = useRef(false);
    const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Fetch shop items from Supabase
    useEffect(() => {
        const fetchFoodItems = async () => {
            setIsFoodLoading(true);
            try {
                const { data, error } = await supabase
                    .from('aiboard_pricing_items')
                    .select('item_id, name, emoji, category_id, base_price_usd, hunger, happiness, unlock_level')
                    .order('unlock_level', { ascending: true });

                if (data && !error && data.length > 0) {
                    const mapped: FoodItem[] = data.map(row => ({
                        id: row.item_id,
                        icon: row.emoji || '🍽️',
                        label: row.name,
                        hunger: row.hunger ?? 10,
                        happiness: row.happiness ?? 0,
                        xp: Math.max(1, Math.round((row.hunger ?? 10) / 2)),
                        price: parseFloat(row.base_price_usd) || 0,
                        category: row.category_id
                            ? row.category_id.charAt(0).toUpperCase() + row.category_id.slice(1)
                            : 'Other',
                        levelReq: row.unlock_level ?? 1,
                    }));
                    setFoodItems(mapped);
                }
            } catch (err) {
                console.error('Failed to load shop items:', err);
            } finally {
                setIsFoodLoading(false);
            }
        };

        fetchFoodItems();
    }, []);

    // Fetch currency rate from Supabase when currencyCode changes
    useEffect(() => {
        const fetchRate = async () => {
            if (!initialCurrencyCode || initialCurrencyCode === 'USD') {
                setCurrencyCode('USD');
                setCurrencyRate(1);
                return;
            }
            try {
                const { data, error } = await supabase
                    .from('aiboard_pricing_currencies')
                    .select('currency_code, rate')
                    .eq('currency_code', initialCurrencyCode)
                    .maybeSingle();

                if (data && !error) {
                    setCurrencyCode(data.currency_code);
                    setCurrencyRate(parseFloat(data.rate));
                    console.log(`[Currency] ${data.currency_code} rate: ${data.rate}`);
                } else {
                    // Fallback to USD if not found
                    setCurrencyCode('USD');
                    setCurrencyRate(1);
                }
            } catch (err) {
                console.warn('[Currency] Failed to fetch rate:', err);
                setCurrencyCode('USD');
                setCurrencyRate(1);
            }
        };
        fetchRate();
    }, [initialCurrencyCode]);

    // Initial Auth & Data Load - Modified for SuperApp
    useEffect(() => {
        const init = async () => {
            let currentUserId: string | null = null;
            try {
                const { data: sessionData } = await supabase.auth.getSession();
                if (sessionData?.session?.user) {
                    currentUserId = sessionData.session.user.id;
                    setUserId(currentUserId);
                }
            } catch (err) {
                console.error("Auth error", err);
            }

            // Load from localStorage as fallback
            const savedStats = localStorage.getItem('pet_stats');
            const savedName = localStorage.getItem('pet_name');
            const savedColor = localStorage.getItem('pet_color');
            const savedInv = localStorage.getItem('pet_inventory');
            const savedLastSavedAt = localStorage.getItem('pet_last_saved_at');

            let loadedStats: PetStats | null = savedStats ? JSON.parse(savedStats) : null;

            // Apply offline decay based on elapsed time since last save
            if (loadedStats && savedLastSavedAt) {
                const elapsedMs = Date.now() - new Date(savedLastSavedAt).getTime();
                const elapsedSecs = Math.max(0, elapsedMs / 1000);
                // Decay rates per second (matching the live game loop: per 5s tick rates)
                loadedStats = {
                    ...loadedStats,
                    hunger:    Math.max(0, loadedStats.hunger    - 0.01  * elapsedSecs),
                    energy:    Math.max(0, loadedStats.energy    - 0.005 * elapsedSecs),
                    hygiene:   Math.max(0, loadedStats.hygiene   - 0.004 * elapsedSecs),
                    happiness: Math.max(0, loadedStats.happiness - 0.006 * elapsedSecs),
                };
                console.log(`[VirtualPet] Applied ${Math.round(elapsedSecs)}s of offline decay`);
            }

            if (loadedStats) setStats(loadedStats);
            if (savedName) setPetName(savedName);
            if (savedColor) setPetColor(savedColor as PetColor);
            const savedBall = localStorage.getItem('pet_active_ball');
            if (savedBall) setActiveBallId(savedBall);
            if (savedInv) setInventory(JSON.parse(savedInv));

            // Load from Supabase if logged in (overriding localStorage)
            if (currentUserId) {
                try {
                    const { data: petData, error: petErr } = await supabase
                        .from('inventory_pet')
                        .select('*')
                        .eq('user_id', currentUserId)
                        .maybeSingle();

                    if (petData && !petErr) {
                        // Apply offline decay using Supabase updated_at timestamp
                        const savedAt = petData.updated_at ? new Date(petData.updated_at).getTime() : null;
                        const elapsedSecs = savedAt ? Math.max(0, (Date.now() - savedAt) / 1000) : 0;

                        const baseStats = {
                            hunger: petData.hunger ?? INITIAL_STATS.hunger,
                            energy: petData.energy ?? INITIAL_STATS.energy,
                            happiness: petData.happiness ?? INITIAL_STATS.happiness,
                            hygiene: petData.hygiene ?? INITIAL_STATS.hygiene,
                            level: petData.level ?? INITIAL_STATS.level,
                            xp: petData.xp ?? INITIAL_STATS.xp,
                            coins: petData.coins ?? INITIAL_STATS.coins
                        };

                        const decayedStats: PetStats = elapsedSecs > 0 ? {
                            ...baseStats,
                            hunger:    Math.max(0, baseStats.hunger    - 0.01  * elapsedSecs),
                            energy:    Math.max(0, baseStats.energy    - 0.005 * elapsedSecs),
                            hygiene:   Math.max(0, baseStats.hygiene   - 0.004 * elapsedSecs),
                            happiness: Math.max(0, baseStats.happiness - 0.006 * elapsedSecs),
                        } : baseStats;

                        if (elapsedSecs > 0) {
                            console.log(`[VirtualPet] Applied ${Math.round(elapsedSecs)}s of offline decay (Supabase)`);
                        }

                        setStats(decayedStats);
                        if (petData.pet_name) setPetName(petData.pet_name);
                        if (petData.pet_color) setPetColor(petData.pet_color as PetColor);
                        if (petData.active_ball_id) setActiveBallId(petData.active_ball_id);
                    }

                    const { data: invData, error: invErr } = await supabase
                        .from('pet_inventory')
                        .select('item_id, quantity')
                        .eq('user_id', currentUserId);

                    if (invData && !invErr && invData.length > 0) {
                        const newInv: Record<string, number> = {};
                        invData.forEach(row => {
                            newInv[row.item_id] = row.quantity;
                        });
                        setInventory(newInv);
                    }
                } catch (err) {
                    console.error("Failed to load from supabase", err);
                }
            }
            
            isHydrated.current = true;
        };

        init();
    }, []);

    // Sync to Supabase / LocalStorage
    useEffect(() => {
        if (!isHydrated.current) return;

        if (saveTimeout.current) clearTimeout(saveTimeout.current);

        saveTimeout.current = setTimeout(async () => {
            localStorage.setItem('pet_stats', JSON.stringify(stats));
            localStorage.setItem('pet_name', petName);
            localStorage.setItem('pet_color', petColor);
            localStorage.setItem('pet_active_ball', activeBallId);
            localStorage.setItem('pet_inventory', JSON.stringify(inventory));
            localStorage.setItem('pet_last_saved_at', new Date().toISOString());

            if (userId) {
                try {
                    await supabase.from('inventory_pet').upsert({
                        user_id: userId,
                        pet_name: petName,
                        pet_color: petColor,
                        hunger: stats.hunger,
                        energy: stats.energy,
                        happiness: stats.happiness,
                        hygiene: stats.hygiene,
                        level: stats.level,
                        xp: stats.xp,
                        coins: stats.coins,
                        is_sleeping: isSleeping,
                        active_ball_id: activeBallId,
                        updated_at: new Date().toISOString()
                    });

                    // Fast full sync for pet_inventory: delete all & re-insert
                    await supabase.from('pet_inventory').delete().eq('user_id', userId);
                    
                    const invRows = Object.entries(inventory).map(([itemId, qty]) => ({
                        user_id: userId,
                        item_id: itemId,
                        quantity: qty
                    }));

                    if (invRows.length > 0) {
                        await supabase.from('pet_inventory').insert(invRows);
                    }
                } catch (e) {
                    console.error("Failed to sync to Supabase", e);
                }
            }
        }, 2000); // 2 second debounce

        return () => {
            if (saveTimeout.current) clearTimeout(saveTimeout.current);
        };
    }, [stats, petName, petColor, inventory, isSleeping, activeBallId, userId]);

    // Game Loop (Stats decay)
    useEffect(() => {
        const timer = setInterval(() => {
            setStats(prev => {
                if (isSleeping) {
                    return {
                        ...prev,
                        energy: Math.min(100, prev.energy + 2),
                        hunger: Math.max(0, prev.hunger - 0.2),
                        hygiene: Math.max(0, prev.hygiene - 0.1)
                    };
                } else {
                    return {
                        ...prev,
                        hunger: Math.max(0, prev.hunger - 0.05),
                        energy: Math.max(0, prev.energy - 0.025),
                        hygiene: Math.max(0, prev.hygiene - 0.02),
                        happiness: Math.max(0, prev.happiness - 0.03)
                    };
                }
            });
        }, 5000); // Slower decay for background sync

        return () => clearInterval(timer);
    }, [isSleeping]);

    const addXP = (amount: number) => {
        setStats(prev => {
            let newXP = prev.xp + amount;
            let newLevel = prev.level;
            let newCoins = prev.coins;
            if (newXP >= XP_TO_LEVEL_UP) {
                newXP -= XP_TO_LEVEL_UP;
                newLevel += 1;
                newCoins = (prev.coins || 0) + 50;
                return {
                    ...prev,
                    level: newLevel,
                    xp: newXP,
                    happiness: 100,
                    energy: 100,
                    coins: newCoins
                };
            }
            return { ...prev, xp: newXP, level: newLevel };
        });
    };

    const buyItem = (itemId: string, price: number) => {
        if (stats.coins >= price) {
            setStats(prev => ({ ...prev, coins: prev.coins - price }));
            setInventory(prev => ({
                ...prev,
                [itemId]: (prev[itemId] || 0) + 1
            }));
            return true;
        }
        return false;
    };

    const consumeItem = (itemId: string) => {
        setInventory(prev => {
            const current = prev[itemId] || 0;
            if (current <= 1) {
                const newState = { ...prev };
                delete newState[itemId];
                return newState;
            }
            return { ...prev, [itemId]: current - 1 };
        });
    };

    return (
        <GameStateContext.Provider value={{
            stats, setStats,
            petName, setPetName,
            petColor, setPetColor,
            currentRoom, setCurrentRoom,
            isSleeping, setIsSleeping,
            isEating, setIsEating,
            isPlaying, setIsPlaying,
            inventory,
            buyItem,
            consumeItem,
            addXP,
            activeBallId,
            setActiveBallId,
            foodItems,
            isFoodLoading,
            currencyCode,
            currencyRate,
        }}>
            {children}
        </GameStateContext.Provider>
    );
};

export const useGameState = () => {
    const context = useContext(GameStateContext);
    if (context === undefined) {
        throw new Error('useGameState must be used within a GameStateProvider');
    }
    return context;
};
