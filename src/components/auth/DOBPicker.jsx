import { CalendarDays, ChevronDown } from 'lucide-react';
import { useMemo, useState } from 'react';

const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (number) => String(number).padStart(2, '0');

export default function DOBPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const currentYear = new Date().getFullYear();
  const years = useMemo(() => Array.from({ length: 100 }, (_, index) => String(currentYear - index)), [currentYear]);
  const days = month && year ? new Date(Number(year), Number(month), 0).getDate() : 31;
  const complete = Boolean(day && month && year);
  const display = value ? new Intl.DateTimeFormat('en-GB').format(new Date(`${value}T00:00:00`)) : 'dd/mm/yyyy';

  return <div className="auth-date-picker">
    <button type="button" onClick={() => setOpen((current) => !current)} className="auth-date-trigger">
      <CalendarDays size={17} /><span className={value ? '' : 'auth-placeholder'}>{display}</span>
    </button>
    {open && <div className="auth-date-popover">
      <p className="auth-label">Date of birth</p>
      <div className="auth-date-grid">
        <DateSelect label="Day" value={day} onChange={setDay}>{['', ...Array.from({ length: days }, (_, index) => String(index + 1))].map((item) => <option key={item || 'empty'} value={item}>{item ? pad(Number(item)) : '--'}</option>)}</DateSelect>
        <DateSelect label="Month" value={month} onChange={setMonth}>{['', ...months.map((_, index) => String(index + 1))].map((item) => <option key={item || 'empty'} value={item}>{item ? months[Number(item) - 1] : '--'}</option>)}</DateSelect>
        <DateSelect label="Year" value={year} onChange={setYear}>{['', ...years].map((item) => <option key={item || 'empty'} value={item}>{item || '----'}</option>)}</DateSelect>
      </div>
      {complete && <p className="auth-date-preview">{day} {months[Number(month) - 1]} {year}</p>}
      <div className="auth-date-actions"><button type="button" onClick={() => setOpen(false)}>Cancel</button><button type="button" disabled={!complete} onClick={() => { onChange(`${year}-${pad(Number(month))}-${pad(Number(day))}`); setOpen(false); }}>Confirm</button></div>
    </div>}
  </div>;
}

function DateSelect({ label, value, onChange, children }) {
  return <label className="auth-date-select">{label}<span><select value={value} onChange={(event) => onChange(event.target.value)}>{children}</select><ChevronDown size={15} /></span></label>;
}
