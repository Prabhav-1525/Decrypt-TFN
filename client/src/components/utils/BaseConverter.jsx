import { useMemo, useState } from "react";

function toBase(value, base) {
  if (Number.isNaN(value)) return "";
  return value.toString(base);
}

function parseValue(input, base) {
  const trimmed = `${input}`.trim();
  if (!trimmed) return NaN;
  return parseInt(trimmed, base);
}

function primeFactors(n) {
  const result = [];
  let num = Math.abs(n);
  let divisor = 2;
  while (num >= 2) {
    if (num % divisor === 0) {
      result.push(divisor);
      num /= divisor;
    } else {
      divisor += 1;
    }
  }
  return result;
}

function gcd(a, b) {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    [x, y] = [y, x % y];
  }
  return x;
}

function lcm(a, b) {
  if (a === 0 || b === 0) return 0;
  return Math.abs(a * b) / gcd(a, b);
}

export default function BaseConverter({ onCopy, utilityKey }) {
  const [input, setInput] = useState("");
  const [fromBase, setFromBase] = useState(10);
  const [modA, setModA] = useState("");
  const [modB, setModB] = useState("");
  const [modN, setModN] = useState("");

  const parsed = useMemo(() => parseValue(input, Number(fromBase)), [input, fromBase]);

  const converted = useMemo(
    () => ({
      bin: toBase(parsed, 2),
      oct: toBase(parsed, 8),
      dec: Number.isNaN(parsed) ? "" : parsed.toString(10),
      hex: toBase(parsed, 16)
    }),
    [parsed]
  );

  const factors = useMemo(() => {
    if (Number.isNaN(parsed) || parsed < 2) return [];
    return primeFactors(parsed);
  }, [parsed]);

  const modularResult = useMemo(() => {
    const a = Number(modA);
    const b = Number(modB);
    const n = Number(modN);
    if (Number.isNaN(a) || Number.isNaN(b) || Number.isNaN(n) || n === 0) return "";
    return `${(a + b) % n} (a+b mod n), ${(a * b) % n} (a*b mod n)`;
  }, [modA, modB, modN]);

  const handleCopy = (value) => {
    navigator.clipboard?.writeText(value);
    onCopy?.(value);
  };

  return (
    <div>
      <div className="utility-header">
        <h3>
          {utilityKey === "prime-factor"
            ? "Prime Factorizer"
            : utilityKey === "mod-calc"
            ? "Modular Arithmetic"
            : "Base Converter"}
        </h3>
      </div>
      <div className="utility-grid">
        <label>
          <span className="eyebrow">Input</span>
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="e.g., FF" />
        </label>
        <label>
          <span className="eyebrow">Base</span>
          <select value={fromBase} onChange={(e) => setFromBase(e.target.value)} className="select">
            <option value={2}>Binary</option>
            <option value={8}>Octal</option>
            <option value={10}>Decimal</option>
            <option value={16}>Hex</option>
          </select>
        </label>
      </div>
      <div className="conversion-grid">
        <div className="conversion-row">
          <strong>Binary</strong>
          <span className="mono">{converted.bin || "—"}</span>
          <button className="btn btn-muted" type="button" onClick={() => handleCopy(converted.bin)}>
            Copy
          </button>
        </div>
        <div className="conversion-row">
          <strong>Octal</strong>
          <span className="mono">{converted.oct || "—"}</span>
          <button className="btn btn-muted" type="button" onClick={() => handleCopy(converted.oct)}>
            Copy
          </button>
        </div>
        <div className="conversion-row">
          <strong>Decimal</strong>
          <span className="mono">{converted.dec || "—"}</span>
          <button className="btn btn-muted" type="button" onClick={() => handleCopy(converted.dec)}>
            Copy
          </button>
        </div>
        <div className="conversion-row">
          <strong>Hex</strong>
          <span className="mono">{converted.hex || "—"}</span>
          <button className="btn btn-muted" type="button" onClick={() => handleCopy(converted.hex)}>
            Copy
          </button>
        </div>
      </div>

      <div className="subsection">
        <h4>Prime Factors</h4>
        <p className="muted">{factors.length ? factors.join(" × ") : "—"}</p>
      </div>

      <div className="subsection">
        <h4>GCD / LCM</h4>
        <div className="utility-grid">
          <input
            placeholder="a"
            value={modA}
            onChange={(e) => setModA(e.target.value)}
            className="mono"
          />
          <input
            placeholder="b"
            value={modB}
            onChange={(e) => setModB(e.target.value)}
            className="mono"
          />
        </div>
        <p className="muted">
          gcd: {!Number.isNaN(Number(modA)) && !Number.isNaN(Number(modB)) ? gcd(Number(modA), Number(modB)) : "—"} | lcm:{" "}
          {!Number.isNaN(Number(modA)) && !Number.isNaN(Number(modB)) ? lcm(Number(modA), Number(modB)) : "—"}
        </p>
      </div>

      <div className="subsection">
        <h4>Mod Calc (a±b mod n)</h4>
        <div className="utility-grid">
          <input placeholder="a" value={modA} onChange={(e) => setModA(e.target.value)} className="mono" />
          <input placeholder="b" value={modB} onChange={(e) => setModB(e.target.value)} className="mono" />
          <input placeholder="n" value={modN} onChange={(e) => setModN(e.target.value)} className="mono" />
        </div>
        <p className="muted">{modularResult || "—"}</p>
      </div>
    </div>
  );
}
