import { useState } from "react";

export default function ForensicsHelpers({ onCopy, utilityKey }) {
  const [magic, setMagic] = useState("");
  const [code, setCode] = useState("");
  const [fixed, setFixed] = useState("");

  const copy = (value) => {
    navigator.clipboard?.writeText(value);
    onCopy?.(value);
  };

  return (
    <div>
      <div className="utility-header">
        <h3>{utilityKey === "magic-bytes" ? "File Signature Checker" : "Code Viewer / Diff"}</h3>
        {utilityKey === "diff-viewer" && (
          <button className="btn btn-outline" type="button" onClick={() => copy(fixed)}>
            Copy Fixed
          </button>
        )}
      </div>
      {utilityKey === "magic-bytes" ? (
        <>
          <input
            className="mono"
            value={magic}
            onChange={(e) => setMagic(e.target.value)}
            placeholder="e.g., 89 50 4E 47"
          />
          <p className="muted">
            Common headers: PNG 89 50 4E 47, JPG FF D8 FF, ZIP 50 4B 03 04, PDF 25 50 44 46.
          </p>
        </>
      ) : (
        <>
          <div className="utility-grid">
            <textarea
              className="utility-textarea"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Original snippet"
            />
            <textarea
              className="utility-textarea"
              value={fixed}
              onChange={(e) => setFixed(e.target.value)}
              placeholder="Edited snippet"
            />
          </div>
          <p className="muted">Paste two snippets to eyeball differences or copy the fixed version.</p>
        </>
      )}
    </div>
  );
}
