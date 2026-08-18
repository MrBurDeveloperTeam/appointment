const DENTAL_CHARTING_URL = import.meta.env.VITE_DENTAL_CHARTING_URL || 'https://dental-charting.snabbb.com';

export function dentalChartingUrl(params = {}) {
  const url = new URL(DENTAL_CHARTING_URL);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
}
