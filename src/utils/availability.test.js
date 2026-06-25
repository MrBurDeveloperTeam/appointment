import { describe, it, expect } from 'vitest';
import {
  toMinutes,
  intervalsOverlap,
  countOverlapping,
  isSlotFull,
  filterAvailableSlots,
} from './availability';

const busy = [
  { start_time: '09:00', end_time: '09:30' },
  { start_time: '09:00', end_time: '10:00' },
];

describe('toMinutes', () => {
  it('parses HH:MM', () => expect(toMinutes('09:30')).toBe(570));
  it('returns null for bad input', () => expect(toMinutes('')).toBeNull());
});

describe('intervalsOverlap (half-open)', () => {
  it('detects overlap', () => expect(intervalsOverlap(540, 570, 555, 600)).toBe(true));
  it('touching edges do not overlap', () => expect(intervalsOverlap(540, 570, 570, 600)).toBe(false));
});

describe('countOverlapping', () => {
  it('counts a 30-min slot at 09:00 against both busy rows', () => {
    expect(countOverlapping(toMinutes('09:00'), 30, busy)).toBe(2);
  });
  it('counts a slot at 09:30 only against the 09:00-10:00 row', () => {
    expect(countOverlapping(toMinutes('09:30'), 30, busy)).toBe(1);
  });
  it('long booking overruns into a later appt', () => {
    const later = [{ start_time: '10:00', end_time: '10:30' }];
    expect(countOverlapping(toMinutes('09:30'), 60, later)).toBe(1); // 09:30-10:30 hits 10:00-10:30
  });
});

describe('isSlotFull', () => {
  it('hidden when overlaps >= capacity', () => {
    expect(isSlotFull('09:00', 30, busy, 2)).toBe(true);
  });
  it('visible when capacity exceeds overlaps', () => {
    expect(isSlotFull('09:00', 30, busy, 3)).toBe(false);
  });
  it('treats capacity below 1 as 1 (floor)', () => {
    const one = [{ start_time: '09:00', end_time: '09:30' }];
    expect(isSlotFull('09:00', 30, one, 0)).toBe(true);
  });
});

describe('filterAvailableSlots', () => {
  it('removes full slots, keeps the rest', () => {
    const candidates = ['09:00', '09:30', '10:00'];
    // capacity 1: 09:00 (2 overlaps) hidden, 09:30 (1 overlap) hidden, 10:00 free
    expect(filterAvailableSlots(candidates, 30, busy, 1)).toEqual(['10:00']);
  });
});
