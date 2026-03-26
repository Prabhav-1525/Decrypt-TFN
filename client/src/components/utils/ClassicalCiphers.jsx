import { useMemo, useState } from "react";

const CUES = [
  { name: "Vigenère", hint: "Repeating key; try Kasiski / frequency on key length." },
  { name: "Caesar/ROT", hint: "Uniform shift; alphabet preserved." },
  { name: "Baconian", hint: "Binary A/B pattern of length 5." },
  { name: "Playfair", hint: "Digraphs; no letter repeats in a pair; I/J merged." },
  { name: "Polybius", hint: "Digits pairs (e.g., 11-55 grid) or letters A-F." }
];

function playfairDecode(text, key) {
  if (!key) return text;
  const alphabet = Array.from(new Set(key.toLowerCase().replace(/j/g, "i") + "abcdefghiklmnopqrstuvwxyz"));
  const grid = [];
  for (let i = 0; i < 25; i += 5) {
    grid.push(alphabet.slice(i, i + 5));
  }
  const find = (char) => {
    for (let r = 0; r < 5; r += 1) {
      const c = grid[r].indexOf(char);
      if (c !== -1) return { r, c };
    }
    return null;
  };
  const pairs = text.toLowerCase().replace(/j/g, "i").match(/.{1,2}/g) || [];
  return pairs
    .map((pair) => {
      if (pair.length < 2) return pair;
      const p1 = find(pair[0]);
      const p2 = find(pair[1]);
      if (!p1 || !p2) return pair;
      if (p1.r === p2.r) {
        return grid[p1.r][(p1.c + 4) % 5] + grid[p2.r][(p2.c + 4) % 5];
      }
      if (p1.c === p2.c) {
        return grid[(p1.r + 4) % 5][p1.c] + grid[(p2.r + 4) % 5][p2.c];
      }
      return grid[p1.r][p2.c] + grid[p2.r][p1.c];
    })
    .join("");
}

export default function ClassicalCiphers({ onCopy }) {
  const [ciphertext, setCiphertext] = useState("");
  const [playfairKey, setPlayfairKey] = useState("keyword");

  const detected = useMemo(() => {
    if (/^[01 ]{5,}$/.test(ciphertext)) return "Baconian / Binary";
    if (/^[0-9]{2}(\s|,|$)/.test(ciphertext)) return "Polybius grid";
    if (ciphertext.match(/[A-Z]{3,}/) && new Set(ciphertext).size < 10) return "Substitution / Monoalphabetic";
    return "Unknown";
  }, [ciphertext]);

  const playfair = useMemo(() => playfairDecode(ciphertext, playfairKey), [ciphertext, playfairKey]);

  const copy = (value) => {
    navigator.clipboard?.writeText(value);
    onCopy?.(value);
  };

  return (
    <div>
      <div className="utility-header">
        <h3>Classical Cipher Aids</h3>
        <button className="btn btn-outline" type="button" onClick={() => copy(playfair)}>
          Copy Playfair Decode
        </button>
      </div>
      <textarea
        className="utility-textarea"
        value={ciphertext}
        onChange={(e) => setCiphertext(e.target.value)}
        placeholder="Ciphertext for quick cues..."
      />
      <p className="muted">Heuristic guess: {detected}</p>
      <div className="subsection">
        <h4>Playfair Decoder</h4>
        <input value={playfairKey} onChange={(e) => setPlayfairKey(e.target.value)} />
        <pre className="asset-preview">{playfair}</pre>
      </div>
      <div className="subsection">
        <h4>Common Patterns</h4>
        <ul className="muted">
          {CUES.map((c) => (
            <li key={c.name}>
              <strong>{c.name}:</strong> {c.hint}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
