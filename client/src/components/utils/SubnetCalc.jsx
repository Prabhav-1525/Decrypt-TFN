import { useMemo, useState } from "react";

function ipToBinary(ip) {
  const octets = ip.split(".").map((n) => Number(n));
  if (octets.length !== 4 || octets.some((o) => Number.isNaN(o) || o < 0 || o > 255)) {
    return null;
  }
  return octets.map((o) => o.toString(2).padStart(8, "0")).join(".");
}

function binaryToIp(bin) {
  const parts = bin.replace(/[^01]/g, " ").trim().split(/\s+|\./);
  if (parts.length !== 4 || parts.some((p) => p.length !== 8)) return null;
  const octets = parts.map((p) => parseInt(p, 2));
  if (octets.some((o) => Number.isNaN(o))) return null;
  return octets.join(".");
}

function calcSubnet(ip, cidr) {
  const octets = ip.split(".").map((n) => Number(n));
  if (octets.length !== 4 || octets.some((o) => Number.isNaN(o) || o < 0 || o > 255)) return null;
  const mask = cidr ? cidr : 24;
  const maskBits = (0xffffffff << (32 - mask)) >>> 0;
  const ipNum = octets.reduce((acc, o) => (acc << 8) + o, 0) >>> 0;
  const network = ipNum & maskBits;
  const broadcast = network + (0xffffffff >>> mask);
  return {
    network: [
      (network >>> 24) & 255,
      (network >>> 16) & 255,
      (network >>> 8) & 255,
      network & 255
    ].join("."),
    broadcast: [
      (broadcast >>> 24) & 255,
      (broadcast >>> 16) & 255,
      (broadcast >>> 8) & 255,
      broadcast & 255
    ].join(".")
  };
}

const PORTS = [
  { port: 21, name: "FTP" },
  { port: 22, name: "SSH" },
  { port: 23, name: "Telnet" },
  { port: 25, name: "SMTP" },
  { port: 53, name: "DNS" },
  { port: 80, name: "HTTP" },
  { port: 110, name: "POP3" },
  { port: 143, name: "IMAP" },
  { port: 443, name: "HTTPS" }
];

export default function SubnetCalc({ onCopy, utilityKey }) {
  const [ip, setIp] = useState("192.168.1.10");
  const [cidr, setCidr] = useState(24);
  const binary = useMemo(() => ipToBinary(ip), [ip]);
  const subnet = useMemo(() => calcSubnet(ip, Number(cidr)), [ip, cidr]);

  const onCopyValue = (value) => {
    navigator.clipboard?.writeText(value);
    onCopy?.(value);
  };

  const title =
    utilityKey === "port-reference"
      ? "Port Reference"
      : utilityKey === "ip-binary-converter"
      ? "IP ⇄ Binary"
      : "Subnet Calculator";

  return (
    <div>
      <div className="utility-header">
        <h3>{title}</h3>
      </div>
      {utilityKey !== "port-reference" && (
        <>
          <div className="utility-grid">
            <label>
              <span className="eyebrow">IP Address</span>
              <input value={ip} onChange={(e) => setIp(e.target.value)} className="mono" />
            </label>
            <label>
              <span className="eyebrow">CIDR</span>
              <input type="number" value={cidr} onChange={(e) => setCidr(e.target.value)} />
            </label>
          </div>
          <p className="muted mono">Binary: {binary || "Invalid IP"}</p>
          {subnet && (
            <div className="conversion-grid">
              <div className="conversion-row">
                <strong>Network</strong>
                <span className="mono">{subnet.network}</span>
                <button className="btn btn-muted" type="button" onClick={() => onCopyValue(subnet.network)}>
                  Copy
                </button>
              </div>
              <div className="conversion-row">
                <strong>Broadcast</strong>
                <span className="mono">{subnet.broadcast}</span>
                <button className="btn btn-muted" type="button" onClick={() => onCopyValue(subnet.broadcast)}>
                  Copy
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {utilityKey === "port-reference" && (
        <div className="port-table">
          {PORTS.map((p) => (
            <div key={p.port} className="port-row">
              <span className="mono">{p.port}</span>
              <span>{p.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
