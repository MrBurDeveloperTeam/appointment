import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
    toISODate,
    todayISO,
    formatMonthTitle,
    formatDayLong,
    sameDate,
    startOfMonth,
    endOfMonth
} from './date';

describe('Date Utils', () => {
    beforeEach(() => {
        // Lock time to 2023-10-15T12:00:00Z for consistent testing
        vi.useFakeTimers();
        const date = new Date(2023, 9, 15, 12); // Month is 0-indexed: 9 = Oct
        vi.setSystemTime(date);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('toISODate formats correctly', () => {
        const d = new Date(2023, 0, 1); // Jan 1 2023
        expect(toISODate(d)).toBe('2023-01-01');
    });

    it('todayISO returns current date string', () => {
        expect(todayISO()).toBe('2023-10-15');
    });

    it('formatMonthTitle formats Month Year', () => {
        const d = new Date(2023, 9, 1);
        expect(formatMonthTitle(d)).toBe('October 2023');
    });

    it('formatDayLong formats Day, Mon DD', () => {
        const d = new Date(2023, 9, 15); // Oct 15 2023 is a Sunday
        expect(formatDayLong(d)).toBe('Sunday, Oct 15');
    });

    it('sameDate compares correctly', () => {
        const d1 = new Date(2023, 9, 15, 10, 0);
        const d2 = new Date(2023, 9, 15, 14, 30);
        const d3 = new Date(2023, 9, 16);

        expect(sameDate(d1, d2)).toBe(true);
        expect(sameDate(d1, d3)).toBe(false);
    });

    it('re-exports date-fns helpers', () => {
        const start = startOfMonth(new Date(2023, 9, 15));
        expect(toISODate(start)).toBe('2023-10-01');
    });
});
