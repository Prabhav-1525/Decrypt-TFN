import { useState } from "react";

export default function OsintHelpers({ onCopy }) {
  const [coords, setCoords] = useState("37.7749,-122.4194");
  const [whoisDomain, setWhoisDomain] = useState("example.com");

  const mapLink = `https://maps.google.com/?q=${encodeURIComponent(coords)}`;
  const whoisLink = `https://whois.domaintools.com/${encodeURIComponent(whoisDomain)}`;

  const copy = (value) => {
    navigator.clipboard?.writeText(value);
    onCopy?.(value);
  };

  return (
    <div>
      <div className="utility-header">
        <h3>OSINT Helpers</h3>
      </div>
      <div className="utility-grid">
        <label>
          <span className="eyebrow">Coordinates</span>
          <input value={coords} onChange={(e) => setCoords(e.target.value)} className="mono" />
        </label>
        <a className="btn btn-outline" href={mapLink} target="_blank" rel="noopener noreferrer">
          Open Map
        </a>
      </div>
      <button className="btn btn-muted" type="button" onClick={() => copy(mapLink)}>
        Copy Map URL
      </button>

      <div className="subsection">
        <h4>WHOIS Lookup</h4>
        <div className="utility-grid">
          <input value={whoisDomain} onChange={(e) => setWhoisDomain(e.target.value)} className="mono" />
          <a className="btn btn-outline" href={whoisLink} target="_blank" rel="noopener noreferrer">
            Open WHOIS
          </a>
        </div>
      </div>
    </div>
  );
}
