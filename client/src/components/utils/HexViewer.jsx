import { useState } from "react";

function bufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ");
}

export default function HexViewer({ onCopy }) {
  const [preview, setPreview] = useState("");

  const onFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    const hex = bufferToHex(buf).slice(0, 4096);
    setPreview(hex);
  };

  const copy = () => {
    navigator.clipboard?.writeText(preview);
    onCopy?.(preview);
  };

  return (
    <div>
      <div className="utility-header">
        <h3>Hex Viewer</h3>
        <div className="utility-actions">
          <button className="btn btn-outline" type="button" onClick={copy} disabled={!preview}>
            Copy
          </button>
        </div>
      </div>
      <input type="file" onChange={onFile} />
      <pre className="asset-preview" style={{ minHeight: "120px" }}>
        {preview || "Load a file to view hex bytes."}
      </pre>
    </div>
  );
}
