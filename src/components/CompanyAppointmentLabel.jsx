// One identity treatment across all schedule views; color is supplementary to text.
export default function CompanyAppointmentLabel({ appointment }) {
  const identity = appointment.workspaceOwnerUserId || appointment.clinicId || appointment.companyName || '';
  const tone = [...identity].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 0) % 5;
  const name = appointment.companyName || 'Company workspace';
  return (
    <span className={`company-appointment-label company-appointment-label--${tone}`} title={`Company: ${name}`}>
      <span className="company-appointment-label__badge">Company</span>
      <span className="company-appointment-label__name">{name}</span>
    </span>
  );
}
