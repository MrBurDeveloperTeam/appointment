import { Flag } from 'lucide-react';

export default function PatientFlag({ className = '' }) {
  return (
    <Flag
      className={`patient-flag-icon${className ? ` ${className}` : ''}`}
      size={16}
      fill="currentColor"
      aria-label="Flagged patient"
    />
  );
}
