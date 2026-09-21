import { describe, expect, it } from 'vitest';
import { hasClinicalAlertValue } from './clinicalAlerts';

describe('patient clinical alerts', () => {
  it.each(['', null, 'None', 'nothing', 'N/A', 'none known', 'No allergies', 'No medical conditions.'])(
    'does not flag an empty clinical value: %s',
    (value) => {
      expect(hasClinicalAlertValue(value)).toBe(false);
    }
  );

  it.each(['Penicillin', 'Asthma', 'Type 2 diabetes'])(
    'still flags a meaningful clinical value: %s',
    (value) => {
      expect(hasClinicalAlertValue(value)).toBe(true);
    }
  );
});
