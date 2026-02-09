

import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, addDays, isSameMonth } from 'date-fns';
import { toISODate } from './date';

export function buildMonthGrid(currentDate) {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);

  const days = eachDayOfInterval({ start: startDate, end: endDate });

  return days.map(day => ({
    date: day,
    inMonth: isSameMonth(day, monthStart),
  }));
}

export function buildHolidayMap(holidays) {
  const map = {};
  holidays.forEach((h) => {
    // holidays should be YYYY-MM-DD strings. 
    // If they are valid ISO strings, "new Date(h.startDate)" works, but "parseISO" is safer for just strings.
    // However, for holidays which are often just dates without times, simple string handling or robust parsing is needed.
    // Let's assume h.startDate is YYYY-MM-DD.

    // We need to iterate days.
    const start = new Date(h.startDate);
    let end = new Date(h.endDate || h.startDate);

    // Safety check if dates are valid
    if (isNaN(start.getTime())) return;
    if (isNaN(end.getTime())) end = start;

    let current = start;
    while (current <= end) {
      map[toISODate(current)] = h;
      current = addDays(current, 1);
    }
  });
  return map;
}
