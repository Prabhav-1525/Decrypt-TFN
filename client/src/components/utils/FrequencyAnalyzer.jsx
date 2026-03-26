import { useMemo, useState } from "react";

export default function FrequencyAnalyzer() {
  const [text, setText] = useState("");

  const frequencies = useMemo(() => {
    const counts = Array.from({ length: 26 }, () => 0);
    for (const ch of text.toLowerCase()) {
      const idx = ch.charCodeAt(0) - 97;
      if (idx >= 0 && idx < 26) {
        counts[idx] += 1;
      }
    }
    const total = counts.reduce((a, b) => a + b, 0) || 1;
    return counts.map((c) => Math.round((c / total) * 1000) / 10);
  }, [text]);

  return (
    <div>
      <div className="utility-header">
        <h3>Frequency Analysis</h3>
      </div>
      <textarea
        className="utility-textarea"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste ciphertext..."
      />
      <div className="freq-grid">
        {frequencies.map((pct, idx) => {
          const letter = String.fromCharCode(65 + idx);
          return (
            <div key={letter} className="freq-item">
              <span>{letter}</span>
              <div className="freq-bar" style={{ height: `${pct * 1.2}px` }} />
              <small className="muted">{pct}%</small>
            </div>
          );
        })}
      </div>
    </div>
  );
}
