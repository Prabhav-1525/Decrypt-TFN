import { useMemo, useState } from "react";

export default function LogicHelpers({ onCopy }) {
  const [rows, setRows] = useState(5);
  const [cols, setCols] = useState(5);
  const [expression, setExpression] = useState("A && B");

  const grid = useMemo(() => {
    return Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0));
  }, [rows, cols]);

  const truthTable = useMemo(() => {
    const combos = [
      { A: false, B: false },
      { A: false, B: true },
      { A: true, B: false },
      { A: true, B: true }
    ];
    return combos.map((combo) => {
      let result = false;
      try {
        // eslint-disable-next-line no-new-func
        const fn = new Function("A", "B", `return ${expression};`);
        result = Boolean(fn(combo.A, combo.B));
      } catch {
        result = false;
      }
      return { ...combo, result };
    });
  }, [expression]);

  const copyTable = () => {
    const lines = truthTable.map((r) => `${r.A ? 1 : 0} ${r.B ? 1 : 0} => ${r.result ? 1 : 0}`).join("\n");
    navigator.clipboard?.writeText(lines);
    onCopy?.(lines);
  };

  return (
    <div>
      <div className="utility-header">
        <h3>Logic Helpers</h3>
        <button className="btn btn-outline" type="button" onClick={copyTable}>
          Copy Table
        </button>
      </div>
      <div className="utility-grid">
        <label>
          <span className="eyebrow">Grid Rows</span>
          <input type="number" value={rows} onChange={(e) => setRows(Number(e.target.value) || 1)} />
        </label>
        <label>
          <span className="eyebrow">Grid Cols</span>
          <input type="number" value={cols} onChange={(e) => setCols(Number(e.target.value) || 1)} />
        </label>
      </div>
      <div className="grid-preview">
        {grid.map((row, rIdx) => (
          <div key={rIdx} className="grid-row">
            {row.map((_, cIdx) => (
              <span key={cIdx} className="grid-cell">
                {rIdx},{cIdx}
              </span>
            ))}
          </div>
        ))}
      </div>

      <div className="subsection">
        <h4>Truth Table</h4>
        <input value={expression} onChange={(e) => setExpression(e.target.value)} className="mono" />
        <div className="truth-table">
          {truthTable.map((row, idx) => (
            <div key={idx} className="truth-row">
              <span className="mono">{row.A ? "1" : "0"}</span>
              <span className="mono">{row.B ? "1" : "0"}</span>
              <span className="mono result">{row.result ? "1" : "0"}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
