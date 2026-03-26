export default function PlaceholderUtility({ utilityKey }) {
  return (
    <div>
      <h3 style={{ marginBottom: "8px" }}>{utilityKey}</h3>
      <p className="muted">This utility is not available in this build. Use the External Tools tab if provided.</p>
    </div>
  );
}
