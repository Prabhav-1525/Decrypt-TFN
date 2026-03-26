import { useMemo, useState } from "react";
import BuiltinUtilsTab from "./BuiltinUtilsTab";
import ExternalLinksTab from "./ExternalLinksTab";
import ClipboardTray from "./ClipboardTray";

export default function ToolsPanel({
  puzzle,
  onCopy,
  clipboardHistory,
  onPasteToField
}) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("builtin");

  const toolConfig = useMemo(() => {
    return puzzle?.toolConfig || { builtinUtils: [], externalLinks: [] };
  }, [puzzle]);

  const hasBuiltins = (toolConfig?.builtinUtils || []).length > 0;
  const hasLinks = (toolConfig?.externalLinks || []).length > 0 || toolConfig?.isInspectPuzzle;

  if (!hasBuiltins && !hasLinks) {
    return null;
  }

  return (
    <section className="card tools-panel">
      <div className="tools-panel__header">
        <div>
          <span className="eyebrow">Tools</span>
          <h2 style={{ marginBottom: 0 }}>Puzzle Utilities</h2>
        </div>
        <button className="btn btn-outline" type="button" onClick={() => setOpen((v) => !v)}>
          {open ? "Hide Tools" : "Show Tools"}
        </button>
      </div>

      {open && (
        <>
          <div className="tools-panel__tabs">
            {hasBuiltins && (
              <button
                type="button"
                className={activeTab === "builtin" ? "tab active" : "tab"}
                onClick={() => setActiveTab("builtin")}
              >
                Built-In Utils
              </button>
            )}
            {hasLinks && (
              <button
                type="button"
                className={activeTab === "external" ? "tab active" : "tab"}
                onClick={() => setActiveTab("external")}
              >
                External Tools
              </button>
            )}
          </div>

          {activeTab === "builtin" && hasBuiltins && (
            <BuiltinUtilsTab
              utils={toolConfig.builtinUtils}
              onCopy={onCopy}
              puzzle={puzzle}
              onPasteToField={onPasteToField}
            />
          )}
          {activeTab === "external" && hasLinks && <ExternalLinksTab toolConfig={toolConfig} />}
        </>
      )}

      <ClipboardTray history={clipboardHistory} onPaste={onPasteToField} />
    </section>
  );
}
