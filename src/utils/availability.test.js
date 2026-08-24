import { describe, it, expect } from 'vitest';
import {
  toMinutes,
  intervalsOverlap,
  countOverlapping,
  isSlotFull,
  filterAvailableSlots,
  findAppointmentConflicts,
  filterAvailableSlotsByDentist,
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

describe('findAppointmentConflicts', () => {
  const existing = [
    { id: 'a1', date: '2026-06-29', startTime: '09:00', endTime: '09:30', duration: 30, status: 'confirmed' },
    { id: 'a2', date: '2026-06-29', startTime: '10:00', endTime: null, duration: 60, status: 'confirmed' },
    { id: 'a3', date: '2026-06-29', startTime: '09:00', endTime: '09:30', duration: 30, status: 'cancelled' },
    { id: 'a4', date: '2026-06-30', startTime: '09:00', endTime: '09:30', duration: 30, status: 'confirmed' },
  ];

  it('flags an overlapping appointment on the same date', () => {
    const c = findAppointmentConflicts({ date: '2026-06-29', startTime: '09:00', duration: 30 }, existing);
    expect(c.map((x) => x.id)).toEqual(['a1']);
  });

  it('uses duration when endTime is null', () => {
    const c = findAppointmentConflicts({ date: '2026-06-29', startTime: '10:30', duration: 15 }, existing);
    expect(c.map((x) => x.id)).toEqual(['a2']); // 10:00 + 60 = 11:00 covers 10:30-10:45
  });

  it('ignores cancelled and no-show appointments', () => {
    const c = findAppointmentConflicts({ date: '2026-06-29', startTime: '09:00', duration: 30 }, existing);
    expect(c.find((x) => x.id === 'a3')).toBeUndefined();
  });

  it('ignores a different date', () => {
    const c = findAppointmentConflicts({ date: '2026-06-28', startTime: '09:00', duration: 30 }, existing);
    expect(c).toEqual([]);
  });

  it('excludes the appointment being edited (ignoreId)', () => {
    const c = findAppointmentConflicts({ date: '2026-06-29', startTime: '09:00', duration: 30 }, existing, 'a1');
    expect(c).toEqual([]);
  });

  it('returns empty when no times overlap', () => {
    const c = findAppointmentConflicts({ date: '2026-06-29', startTime: '12:00', duration: 30 }, existing);
    expect(c).toEqual([]);
  });
});

describe('filterAvailableSlotsByDentist', () => {
  const slots = ['09:00', '09:30', '10:00'];
  const busyMulti = [
    { start_time: '09:00', end_time: '09:30', dentist_id: 'd1' },
    { start_time: '09:00', end_time: '09:30', dentist_id: 'd2' },
  ];

  it('specific dentist: blocks only that dentist\'s overlap', () => {
    // d1 is busy 09:00-09:30; d1 should lose 09:00 but keep 09:30/10:00
    expect(filterAvailableSlotsByDentist(slots, 30, busyMulti, 2, 'd1'))
      .toEqual(['09:30', '10:00']);
  });

  it('specific dentist: free when only OTHER dentists are busy', () => {
    // d3 not in busy -> all slots free
    expect(filterAvailableSlotsByDentist(slots, 30, busyMulti, 2, 'd3'))
      .toEqual(['09:00', '09:30', '10:00']);
  });

  it('Any: slot full only when overlap count >= dentistCount', () => {
    // 2 dentists busy at 09:00, capacity 2 -> 09:00 full; others free
    expect(filterAvailableSlotsByDentist(slots, 30, busyMulti, 2, null))
      .toEqual(['09:30', '10:00']);
  });

  it('Any: slot still free when fewer busy than dentistCount', () => {
    // capacity 3, only 2 busy -> 09:00 still free
    expect(filterAvailableSlotsByDentist(slots, 30, busyMulti, 3, ''))
      .toEqual(['09:00', '09:30', '10:00']);
  });

  it('specific dentist: null-dentist legacy range does not block a named dentist', () => {
    const legacy = [{ start_time: '09:00', end_time: '09:30', dentist_id: null }];
    expect(filterAvailableSlotsByDentist(slots, 30, legacy, 2, 'd1'))
      .toEqual(['09:00', '09:30', '10:00']);
  });
});
