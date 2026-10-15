import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

const LIST_MAX_HEIGHT = 6 * 44 + 8; // 6 rows, then scroll

/**
 * Autocomplete for picking ONE option from a fixed list (dentist, room, ...).
 *
 * Unlike AutocompleteInput (free text), the value is always one of `options`:
 * typing only filters the list, and the field snaps back to the selected
 * option's label if the user leaves without choosing.
 *
 * options: [{ value, label, leading?, trailing?, meta? }]
 *   leading  - node shown before the label (avatar, color dot)
 *   trailing - node shown after the label in the list and in the closed field
 *              (availability dot)
 *   meta     - short right-aligned text in the list (e.g. "Busy")
 *
 * Keys: ↑/↓ move, Enter picks, Esc closes, Tab closes. Enter never submits the
 * surrounding form from this field.
 */
export default function SelectAutocomplete({
  value,
  onChange,
  options,
  placeholder = 'Search…',
  ariaLabel,
  noMatchText = 'No matches',
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [dirty, setDirty] = useState(false); // has the user typed since opening?
  const [active, setActive] = useState(0);
  const [navigated, setNavigated] = useState(false);
  const [pos, setPos] = useState(null);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const listId = useId();

  const selected = useMemo(
    () => options.find((o) => String(o.value) === String(value ?? '')) || null,
    [options, value]
  );

  const typed = dirty ? query.trim() : '';
  const filtered = useMemo(() => {
    const q = typed.toLowerCase();
    if (!q) return options;
    const starts = [];
    const contains = [];
    for (const o of options) {
      const l = o.label.toLowerCase();
      if (l.startsWith(q) || l.split(/[\s.\-]+/).some((w) => w.startsWith(q))) starts.push(o);
      else if (l.includes(q)) contains.push(o);
    }
    return [...starts, ...contains];
  }, [options, typed]);

  const close = () => {
    setOpen(false);
    setDirty(false);
    setQuery('');
  };

  // Start on the current selection when the list opens, on the best match
  // while filtering.
  useEffect(() => {
    if (!open) return;
    if (typed) { setActive(0); setNavigated(false); return; }
    const i = filtered.findIndex((o) => String(o.value) === String(value ?? ''));
    setActive(i < 0 ? 0 : i);
    setNavigated(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, typed]);

  // The modal has a transform + overflow:hidden (which would re-anchor and
  // clip a fixed child), so the list is portaled to <body> and positioned from
  // the input's screen rect, flipping upward when there isn't room below.
  useLayoutEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const el = wrapRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const below = window.innerHeight - r.bottom;
      const up = below < Math.min(LIST_MAX_HEIGHT, 160) && r.top > below;
      setPos({
        left: r.left,
        width: r.width,
        ...(up
          ? { bottom: window.innerHeight - r.top + 4, maxHeight: Math.min(LIST_MAX_HEIGHT, r.top - 12) }
          : { top: r.bottom + 4, maxHeight: Math.min(LIST_MAX_HEIGHT, below - 12) }),
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, filtered.length]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (!wrapRef.current?.contains(e.target) && !listRef.current?.contains(e.target)) close();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open, pos]);

  const openList = () => {
    if (!open) { setDirty(false); setQuery(''); }
    setOpen(true);
  };

  const pick = (opt) => {
    onChange?.(opt.value);
    close();
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) { openList(); return; }
      setNavigated(true);
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) { openList(); return; }
      setNavigated(true);
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault(); // never submit the appointment from this field
      if (!open) { openList(); return; }
      if (filtered.length > 0 && (dirty || navigated)) pick(filtered[active]);
      else close();
    } else if (e.key === 'Escape' && open) {
      e.stopPropagation(); // close the list, not the whole modal
      close();
    } else if (e.key === 'Tab') {
      close();
    }
  };

  const renderLabel = (label) => {
    const i = typed ? label.toLowerCase().indexOf(typed.toLowerCase()) : -1;
    if (i < 0) return label;
    return (
      <>
        {label.slice(0, i)}
        <strong className="ac-match">{label.slice(i, i + typed.length)}</strong>
        {label.slice(i + typed.length)}
      </>
    );
  };

  return (
    <div ref={wrapRef} className="ac-wrap ac-select">
      {selected?.leading && <span className="ac-lead">{selected.leading}</span>}
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={open && filtered[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        spellCheck={false}
        className={`form-input ac-input ${selected?.leading ? 'has-lead' : ''} ${selected?.trailing && !dirty ? 'has-trail' : ''}`}
        value={dirty ? query : (selected ? selected.label : '')}
        placeholder={placeholder}
        onFocus={(e) => { openList(); e.target.select(); }}
        onClick={openList}
        onChange={(e) => {
          setDirty(true);
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
      />
      {selected?.trailing && !dirty && <span className="ac-trail">{selected.trailing}</span>}
      <ChevronDown className={`ac-icon ac-icon-right ${open ? 'open' : ''}`} size={16} />

      {open && pos && createPortal(
        <div ref={listRef} id={listId} className="ac-list" style={pos} role="listbox">
          {filtered.length === 0 && <div className="ac-empty">{noMatchText}</div>}
          {filtered.map((opt, idx) => {
            const isSelected = String(opt.value) === String(value ?? '');
            return (
              <button
                key={String(opt.value)}
                id={`${listId}-${idx}`}
                type="button"
                role="option"
                aria-selected={isSelected}
                data-idx={idx}
                className={`ac-option ac-select-option ${idx === active ? 'active' : ''}`}
                onMouseEnter={() => setActive(idx)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(opt)}
              >
                {opt.leading && <span className="ac-opt-lead">{opt.leading}</span>}
                <span className="ac-option-label">{renderLabel(opt.label)}</span>
                {opt.meta && <span className="ac-meta">{opt.meta}</span>}
                {opt.trailing && <span className="ac-opt-trail">{opt.trailing}</span>}
                {isSelected && <Check size={16} className="ac-check" />}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}
