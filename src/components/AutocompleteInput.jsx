import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Plus, Search } from 'lucide-react';

const LIST_MAX_HEIGHT = 240;

/**
 * Text input with a styled suggestion list.
 *
 * With `multiple`, `value` is a comma-separated string (e.g. "Glove, Mask");
 * suggestions apply to the item being typed after the last comma, items that
 * are already in the list are hidden, and picking one appends ", " so the next
 * item can be typed straight away. Free text is always accepted: typing a name
 * that isn't in `options` offers an "Add “…”" row.
 *
 * Keys: ↑/↓ move, Enter picks, Esc closes.
 */
export default function AutocompleteInput({
  value,
  onChange,
  options,
  placeholder,
  multiple = false,
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState(null);
  // Filtering only starts once the user types in this open session. Just opening
  // a field that already has a value must list every option, not only matches.
  const [dirty, setDirty] = useState(false);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Split the field into the already-chosen items and the one being typed.
  const { head, typed, chosen } = useMemo(() => {
    if (!multiple) return { head: '', typed: dirty ? value.trim() : '', chosen: [] };
    const trimmed = value.trim();
    // Not typing yet: everything in the field counts as chosen and the next
    // pick is appended after it (instead of replacing the last item).
    if (!dirty) {
      return {
        head: trimmed && !trimmed.endsWith(',') ? `${trimmed},` : trimmed,
        typed: '',
        chosen: trimmed.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
      };
    }
    const i = value.lastIndexOf(',');
    const headPart = i >= 0 ? value.slice(0, i + 1) : '';
    return {
      head: headPart,
      typed: (i >= 0 ? value.slice(i + 1) : value).trim(),
      chosen: headPart.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
    };
  }, [value, multiple, dirty]);

  const filtered = useMemo(() => {
    const q = typed.toLowerCase();
    const pool = options.filter((o) => !chosen.includes(o.toLowerCase()));
    if (!q) return pool;
    const starts = [];
    const contains = [];
    for (const o of pool) {
      const l = o.toLowerCase();
      if (l.startsWith(q) || l.split(/[\s-]+/).some((w) => w.startsWith(q))) starts.push(o);
      else if (l.includes(q)) contains.push(o);
    }
    return [...starts, ...contains];
  }, [options, typed, chosen]);

  const canCreate =
    typed.length > 0 &&
    !options.some((o) => o.toLowerCase() === typed.toLowerCase()) &&
    !chosen.includes(typed.toLowerCase());
  const rowCount = filtered.length + (canCreate ? 1 : 0);

  useEffect(() => { setActive(0); }, [typed, open]);

  // The modal has a transform + overflow:hidden (which would re-anchor and
  // clip a fixed child), so the list is portaled to <body> and positioned from
  // the input's screen rect, flipping upward when there isn't room below.
  useLayoutEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const el = inputRef.current;
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
  }, [open, rowCount]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (!wrapRef.current?.contains(e.target) && !listRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const openList = () => {
    if (!open) setDirty(false);
    setOpen(true);
  };

  const pick = (name) => {
    if (multiple) {
      const prefix = head ? `${head.replace(/\s+$/, '')} ` : '';
      setDirty(true);
      onChange(`${prefix}${name}, `);
      setOpen(true);
      inputRef.current?.focus();
    } else {
      onChange(name);
      setOpen(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      openList();
      setActive((a) => Math.min(a + 1, rowCount - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter' && open && rowCount > 0 && typed) {
      e.preventDefault();
      pick(active < filtered.length ? filtered[active] : typed);
    } else if (e.key === 'Escape' && open) {
      e.stopPropagation();
      setOpen(false);
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
    <div ref={wrapRef} className="ac-wrap">
      <Search className="ac-icon ac-icon-left" size={16} />
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        autoComplete="off"
        className="form-input ac-input"
        value={value}
        placeholder={placeholder}
        onFocus={openList}
        onClick={openList}
        onChange={(e) => { setDirty(true); onChange(e.target.value); setOpen(true); }}
        onKeyDown={onKeyDown}
      />
      <ChevronDown className={`ac-icon ac-icon-right ${open ? 'open' : ''}`} size={16} />

      {open && rowCount > 0 && pos && createPortal(
        <div ref={listRef} className="ac-list" style={pos} role="listbox">
          {filtered.map((opt, idx) => {
            const selected = chosen.includes(opt.toLowerCase()) || opt === value;
            return (
              <button
                key={opt}
                type="button"
                role="option"
                aria-selected={selected}
                data-idx={idx}
                className={`ac-option ${idx === active ? 'active' : ''}`}
                onMouseEnter={() => setActive(idx)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(opt)}
              >
                <span className="ac-option-label">{renderLabel(opt)}</span>
                {selected && <Check size={16} className="ac-check" />}
              </button>
            );
          })}
          {canCreate && (
            <button
              type="button"
              role="option"
              data-idx={filtered.length}
              className={`ac-option ac-create ${filtered.length > 0 ? 'with-divider' : ''} ${active === filtered.length ? 'active' : ''}`}
              onMouseEnter={() => setActive(filtered.length)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(typed)}
            >
              <Plus size={16} />
              <span className="ac-option-label">Add “{typed}”</span>
            </button>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
