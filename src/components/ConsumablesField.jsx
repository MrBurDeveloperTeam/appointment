import { X } from 'lucide-react';
import AutocompleteInput from './AutocompleteInput';

/**
 * Consumables for a treatment: a search/add box plus one row per chosen item
 * with its own quantity, UOM and "Disposable" checkbox.
 *
 * rows:        [{ name, qty, uom, disposable }]
 * stock:       result of buildStock(), or null when inventory stock could not be
 *              loaded (then no limit is enforced).
 * uomOptions:  lowercase units to choose from (taken from inventory).
 *
 * Stock is tracked per item name AND unit (no conversion between units), so a
 * row asking for "BOX" is only capped by BOX stock.
 */

const norm = (v) => String(v || '').trim().toLowerCase();

/** [{ name, uom, qty }] from the backend -> lookup maps (null stays null). */
export const buildStock = (list) => {
  if (!Array.isArray(list)) return null;
  const byKey = new Map();
  const byName = new Map();
  list.forEach((r) => {
    const n = norm(r.name);
    const u = norm(r.uom);
    byKey.set(`${n}|${u}`, (byKey.get(`${n}|${u}`) || 0) + r.qty);
    byName.set(n, [...(byName.get(n) || []), { uom: u, qty: r.qty }]);
  });
  return { byKey, byName };
};

/** Max quantity a row may ask for (Infinity = unknown / unlimited). */
export const stockLimit = (stock, name, uom) => {
  if (!stock) return Infinity;
  const n = norm(name);
  const u = norm(uom);
  const qty = u
    ? stock.byKey.get(`${n}|${u}`) || 0
    : (stock.byName.get(n) || []).reduce((sum, r) => sum + r.qty, 0);
  return Math.max(0, Math.floor(qty));
};

const label = (uom) => (uom ? uom.toUpperCase() : '—');

export default function ConsumablesField({ rows, onChange, options, stock, uomOptions = ['pcs', 'box'] }) {
  const update = (index, patch) =>
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  // New rows default to the unit inventory holds the most of for that item.
  const defaultUom = (name) => {
    const list = (stock?.byName.get(norm(name)) || []).filter((r) => r.uom);
    if (list.length) return [...list].sort((a, b) => b.qty - a.qty)[0].uom;
    return uomOptions[0] || 'pcs';
  };

  const add = (name) => {
    const n = name.trim();
    if (!n || rows.some((r) => norm(r.name) === norm(n))) return;
    onChange([...rows, { name: n, qty: 1, uom: defaultUom(n), disposable: false }]);
  };

  const setQty = (index, raw, max) => {
    if (raw === '') { update(index, { qty: '' }); return; }
    let n = Math.floor(Number(raw));
    if (!Number.isFinite(n)) return;
    if (n < 1) n = 1;
    if (Number.isFinite(max) && n > max) n = max;
    update(index, { qty: n });
  };

  const setUom = (index, row, uom) => {
    const max = stockLimit(stock, row.name, uom);
    const qty = Number(row.qty) || 1;
    update(index, { uom, qty: Number.isFinite(max) ? Math.max(1, Math.min(qty, max || 1)) : qty });
  };

  const meta = (name) => {
    if (!stock) return null;
    const have = (stock.byName.get(norm(name)) || []).filter((r) => r.qty > 0);
    return have.length ? have.map((r) => `${Math.floor(r.qty)} ${label(r.uom)}`).join(' · ') : 'Not in inventory';
  };

  return (
    <div className="cons-field">
      <AutocompleteInput
        picker
        options={options}
        exclude={rows.map((r) => r.name)}
        onPick={add}
        renderMeta={meta}
        placeholder="Search or add consumables..."
      />

      {rows.length > 0 && (
        <div className="cons-rows">
          <div className="cons-row cons-head">
            <span>Item</span>
            <span>Qty</span>
            <span>UOM</span>
            <span>Disposable</span>
            <span />
          </div>
          {rows.map((row, index) => {
            const max = stockLimit(stock, row.name, row.uom);
            const noStock = Number.isFinite(max) && max <= 0;
            const over = Number.isFinite(max) && max > 0 && Number(row.qty) > max;
            const inOtherUnit = noStock && (stock?.byName.get(norm(row.name)) || []).some((r) => r.qty > 0);
            const unitText = row.uom ? ` ${label(row.uom)}` : '';
            const units = row.uom && !uomOptions.includes(row.uom) ? [...uomOptions, row.uom] : uomOptions;
            return (
              <div className="cons-row" key={row.name}>
                <span className="cons-name">
                  <span className="cons-name-text" title={row.name}>{row.name}</span>
                  {stock && (
                    <small className={`cons-stock ${noStock || over ? 'warn' : ''}`}>
                      {noStock
                        ? (inOtherUnit ? `No${unitText} in stock` : 'Not in inventory')
                        : over
                          ? `Only ${max}${unitText} in stock`
                          : `${max}${unitText} in stock`}
                    </small>
                  )}
                </span>
                <input
                  type="number"
                  className="form-input cons-qty"
                  min={1}
                  max={Number.isFinite(max) ? max : undefined}
                  step={1}
                  inputMode="numeric"
                  disabled={noStock}
                  value={noStock ? 1 : row.qty}
                  onChange={(e) => setQty(index, e.target.value, max)}
                  onBlur={() => { if (row.qty === '' || Number(row.qty) < 1) update(index, { qty: 1 }); }}
                  aria-label={`Quantity of ${row.name}`}
                />
                <select
                  className="form-select cons-uom"
                  value={row.uom || ''}
                  onChange={(e) => setUom(index, row, e.target.value)}
                  aria-label={`Unit of ${row.name}`}
                >
                  {!row.uom && <option value="">—</option>}
                  {units.map((u) => (
                    <option key={u} value={u}>{label(u)}</option>
                  ))}
                </select>
                <label className="cons-disposable">
                  <input
                    type="checkbox"
                    checked={Boolean(row.disposable)}
                    onChange={(e) => update(index, { disposable: e.target.checked })}
                    aria-label={`${row.name} is disposable`}
                  />
                </label>
                <button
                  type="button"
                  className="cons-remove"
                  onClick={() => onChange(rows.filter((_, i) => i !== index))}
                  aria-label={`Remove ${row.name}`}
                >
                  <X size={16} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
