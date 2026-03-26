export default function ClipboardTray({ history, onPaste }) {
  if (!history?.length) {
    return null;
  }

  return (
    <div className="clipboard-tray">
      <span className="eyebrow">Clipboard History</span>
      <div className="clipboard-items">
        {history.slice(0, 5).map((item, index) => (
          <button
            key={`${item}-${index}`}
            type="button"
            className="clipboard-chip"
            onClick={() => onPaste?.(item)}
            title="Paste into active field"
          >
            {item.length > 30 ? `${item.slice(0, 30)}…` : item}
          </button>
        ))}
      </div>
    </div>
  );
}
