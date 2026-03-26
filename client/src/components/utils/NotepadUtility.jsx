import { useEffect, useRef, useState } from "react";
import api from "../../services/api";

const SAVE_DEBOUNCE = 500;

export default function NotepadUtility({ onCopy, utilityKey }) {
  const [value, setValue] = useState("");
  const [status, setStatus] = useState("idle");
  const timerRef = useRef(null);

  useEffect(() => {
    let active = true;
    api
      .get("/team/notepad")
      .then((response) => {
        if (active) {
          setValue(response.data?.content || "");
        }
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    setStatus("saving");
    timerRef.current = setTimeout(() => {
      api
        .put("/team/notepad", { content: value })
        .then(() => setStatus("saved"))
        .catch(() => setStatus("error"));
    }, SAVE_DEBOUNCE);
    return () => clearTimeout(timerRef.current);
  }, [value]);

  const handleCopy = () => {
    navigator.clipboard?.writeText(value);
    onCopy?.(value);
  };

  const insertTimestamp = () => {
    const stamp = `[${new Date().toLocaleString()}] `;
    setValue((prev) => `${prev}${prev.endsWith("\n") || prev.length === 0 ? "" : "\n"}${stamp}`);
  };

  const title = utilityKey === "timestamped-notepad" ? "Timestamped Notepad" : "Scratch Notepad";

  return (
    <div>
      <div className="utility-header">
        <h3>{title}</h3>
        <div className="utility-actions">
          {utilityKey === "timestamped-notepad" && (
            <button className="btn btn-muted" type="button" onClick={insertTimestamp}>
              Insert Timestamp
            </button>
          )}
          <button className="btn btn-outline" type="button" onClick={handleCopy}>
            Copy
          </button>
        </div>
      </div>
      <textarea
        className="utility-textarea"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Notes auto-save every 0.5s"
      />
      <p className="muted" style={{ marginTop: "6px" }}>
        {status === "saving" && "Saving..."}
        {status === "saved" && "Saved"}
        {status === "error" && "Unable to save"}
      </p>
    </div>
  );
}
