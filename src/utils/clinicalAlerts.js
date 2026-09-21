const EMPTY_CLINICAL_VALUES = new Set([
  '',
  'none',
  'nothing',
  'no',
  'nil',
  'n/a',
  'na',
  'not applicable',
  'none known',
  'nothing known',
  'no known allergies',
  'no allergies',
  'no known medical conditions',
  'no medical conditions',
]);

export const hasClinicalAlertValue = (value) => {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[.!]+$/g, '')
    .trim();

  return !EMPTY_CLINICAL_VALUES.has(normalized);
};
