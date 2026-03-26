import { useMemo, useState } from "react";

function bitwiseOp(a, b, type) {
  const x = parseInt(a || "0", 2);
  const y = parseInt(b || "0", 2);
  switch (type) {
    case "and":
      return (x & y).toString(2);
    case "or":
      return (x | y).toString(2);
    case "xor":
      return (x ^ y).toString(2);
    case "not":
      // Force unsigned representation to keep 32-bit mask readable in binary.
      return (~x >>> 0).toString(2);
    default:
      return "";
  }
}

function binaryToAscii(bin) {
  return bin
    .trim()
    .split(/\s+/)
    .map((b) => String.fromCharCode(parseInt(b, 2)))
    .join("");
}

function switchEndianness(hex) {
  const clean = hex.replace(/[^0-9a-f]/gi, "");
  const bytes = clean.match(/.{1,2}/g) || [];
  return bytes.reverse().join(" ");
}

export default function BitwiseSuite({ onCopy, utilityKey }) {
  const [a, setA] = useState("1010");
  const [b, setB] = useState("0101");
  const [binAscii, setBinAscii] = useState("01001000 01101001");
  const [hexEndian, setHexEndian] = useState("12 34 56 78");

  const results = useMemo(
    () => ({
      and: bitwiseOp(a, b, "and"),
      or: bitwiseOp(a, b, "or"),
      xor: bitwiseOp(a, b, "xor"),
      notA: bitwiseOp(a, "0", "not")
    }),
    [a, b]
  );

  const ascii = useMemo(() => binaryToAscii(binAscii), [binAscii]);
  const endian = useMemo(() => switchEndianness(hexEndian), [hexEndian]);

  const copy = (value) => {
    navigator.clipboard?.writeText(value);
    onCopy?.(value);
  };

  const title =
    utilityKey === "binary-to-ascii"
      ? "Binary → ASCII"
      : utilityKey === "endianness-converter"
      ? "Endianness Converter"
      : "Bitwise Ops";

  return (
    <div>
      <div className="utility-header">
        <h3>{title}</h3>
      </div>
      <div className="utility-grid">
        <label>
          <span className="eyebrow">A (binary)</span>
          <input value={a} onChange={(e) => setA(e.target.value)} className="mono" />
        </label>
        <label>
          <span className="eyebrow">B (binary)</span>
          <input value={b} onChange={(e) => setB(e.target.value)} className="mono" />
        </label>
      </div>
      <div className="conversion-grid">
        <div className="conversion-row">
          <strong>AND</strong>
          <span className="mono">{results.and}</span>
          <button className="btn btn-muted" type="button" onClick={() => copy(results.and)}>
            Copy
          </button>
        </div>
        <div className="conversion-row">
          <strong>OR</strong>
          <span className="mono">{results.or}</span>
          <button className="btn btn-muted" type="button" onClick={() => copy(results.or)}>
            Copy
          </button>
        </div>
        <div className="conversion-row">
          <strong>XOR</strong>
          <span className="mono">{results.xor}</span>
          <button className="btn btn-muted" type="button" onClick={() => copy(results.xor)}>
            Copy
          </button>
        </div>
        <div className="conversion-row">
          <strong>NOT A</strong>
          <span className="mono">{results.notA}</span>
          <button className="btn btn-muted" type="button" onClick={() => copy(results.notA)}>
            Copy
          </button>
        </div>
      </div>

      <div className="subsection">
        <h4>Binary → ASCII</h4>
        <textarea
          className="utility-textarea"
          value={binAscii}
          onChange={(e) => setBinAscii(e.target.value)}
          placeholder="01001000 01101001"
        />
        <p className="mono">{ascii}</p>
      </div>

      <div className="subsection">
        <h4>Endianness Swap (hex bytes)</h4>
        <input
          value={hexEndian}
          onChange={(e) => setHexEndian(e.target.value)}
          className="mono"
          placeholder="12 34 56 78"
        />
        <p className="mono">{endian}</p>
        <button className="btn btn-muted" type="button" onClick={() => copy(endian)}>
          Copy swapped
        </button>
      </div>
    </div>
  );
}
