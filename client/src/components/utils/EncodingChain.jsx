import { useMemo, useState } from "react";

function safeDecode(fn, value) {
  try {
    return fn(value);
  } catch {
    return "(invalid)";
  }
}

function decodeHex(str) {
  const clean = str.replace(/[^0-9a-f]/gi, "");
  const bytes = clean.match(/.{1,2}/g) || [];
  return String.fromCharCode(...bytes.map((b) => parseInt(b, 16)));
}

function binaryToText(bin) {
  const parts = bin.replace(/[^01]/g, " ").trim().split(/\s+/);
  return parts.map((p) => String.fromCharCode(parseInt(p, 2))).join("");
}

function htmlEntities(str) {
  if (typeof document === "undefined") return str;
  const el = document.createElement("textarea");
  el.innerHTML = str;
  return el.value;
}

export default function EncodingChain({ onCopy }) {
  const [input, setInput] = useState("");
  const [chain, setChain] = useState("auto");

  const output = useMemo(() => {
    const text = input.trim();
    if (!text) return "";
    if (chain === "auto") {
      // Try common decoders in order.
      const attempts = [
        () => atob(text),
        () => decodeHex(text),
        () => decodeURIComponent(text),
        () => htmlEntities(text),
        () => binaryToText(text)
      ];
      for (const fn of attempts) {
        const result = safeDecode(fn, text);
        if (result !== "(invalid)") return result;
      }
      return "(no decoder matched)";
    }
    switch (chain) {
      case "base64":
        return safeDecode(atob, text);
      case "hex":
        return safeDecode(decodeHex, text);
      case "url":
        return safeDecode(decodeURIComponent, text);
      case "html":
        return htmlEntities(text);
      case "binary":
        return safeDecode(binaryToText, text);
      default:
        return text;
    }
  }, [input, chain]);

  const handleCopy = () => {
    navigator.clipboard?.writeText(output);
    onCopy?.(output);
  };

  return (
    <div>
      <div className="utility-header">
        <h3>Chained Decoder</h3>
        <div className="utility-actions">
          <button className="btn btn-outline" type="button" onClick={handleCopy}>
            Copy Output
          </button>
        </div>
      </div>
      <textarea
        className="utility-textarea"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Paste encoded text..."
      />
      <div className="utility-grid">
        <label>
          <span className="eyebrow">Mode</span>
          <select className="select" value={chain} onChange={(e) => setChain(e.target.value)}>
            <option value="auto">Auto-detect</option>
            <option value="base64">Base64</option>
            <option value="hex">Hex → ASCII</option>
            <option value="url">URL decode</option>
            <option value="html">HTML entities</option>
            <option value="binary">Binary → ASCII</option>
          </select>
        </label>
      </div>
      <div className="output-block">
        <span className="eyebrow">Output</span>
        <pre className="asset-preview">{output}</pre>
      </div>
    </div>
  );
}
