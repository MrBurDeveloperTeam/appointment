import { format, parseISO, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, subMonths, isSameMonth, isSameDay, eachDayOfInterval } from 'date-fns';

/**
 * Returns YYYY-MM-DD string
 */
export const toISODate = (date) => {
  return format(date, 'yyyy-MM-dd');
};

/**
 * Returns "Today" as YYYY-MM-DD
 */
export const todayISO = () => format(new Date(), 'yyyy-MM-dd');

/**
 * Formats "September 2023"
 */
export const formatMonthTitle = (date) => format(date, 'MMMM yyyy');

/**
 * Formats "Monday, Sep 21"
 */
export const formatDayLong = (date) => format(date, 'EEEE, MMM d');

/**
 * Checks if two dates are exactly same YYYY-MM-DD
 */
export const sameDate = (d1, d2) => isSameDay(d1, d2);

// Exports for Calendar Grid
export { startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, subMonths, isSameMonth, eachDayOfInterval };
