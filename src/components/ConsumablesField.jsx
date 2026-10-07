import { X } from 'lucide-react';
import AutocompleteInput from './AutocompleteInput';

/**
 * Consumables for a treatment: a search/add box plus one row per chosen item
 * with its own quantity and "Disposable" checkbox.
 *
 * rows:    [{ name, qty, disposable }]
 * stock:   Map(lowercased name -> quantity in inventory), or null when stock
 *          could not be loaded (then no limit is enforced). A name missing from
 *          a loaded map is "not in inventory": quantity is fixed at 1.
 */
export const stockLimit = (stock, name) => {
  if (!stock) return Infinity;
  return Math.max(0, Math.floor(stock.get(String(name).trim().toLowerCase()) ?? 0));
};

export default function ConsumablesField({ rows, onChange, options, stock }) {
  const update = (index, patch) =>
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  const add = (name) => {
    const n = name.trim();
    if (!n || rows.some((r) => r.name.toLowerCase() === n.toLowerCase())) return;
    onChange([...rows, { name: n, qty: 1, disposable: false }]);
  };

  const setQty = (index, raw, max) => {
    if (raw === '') { update(index, { qty: '' }); return; }
    let n = Math.floor(Number(raw));
    if (!Number.isFinite(n)) return;
    if (n < 1) n = 1;
    if (Number.isFinite(max) && n > max) n = max;
    update(index, { qty: n });
  };

  const meta = (name) => {
    if (!stock) return null;
    const max = stockLimit(stock, name);
    return max > 0 ? `${max} in stock` : 'Not in inventory';
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
            <span>Disposable</span>
            <span />
          </div>
          {rows.map((row, index) => {
            const max = stockLimit(stock, row.name);
            const noStock = Number.isFinite(max) && max <= 0;
            const over = Number.isFinite(max) && max > 0 && Number(row.qty) > max;
            return (
              <div className="cons-row" key={row.name}>
                <span className="cons-name">
                  <span className="cons-name-text" title={row.name}>{row.name}</span>
                  {stock && (
                    <small className={`cons-stock ${noStock || over ? 'warn' : ''}`}>
                      {noStock ? 'Not in inventory' : over ? `Only ${max} in stock` : `${max} in stock`}
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
