import { useMemo, useState } from "react";

function caesarShift(text, shift) {
  const a = "a".charCodeAt(0);
  const A = "A".charCodeAt(0);
  return text
    .split("")
    .map((ch) => {
      if (/[a-z]/.test(ch)) {
        return String.fromCharCode(((ch.charCodeAt(0) - a + shift + 26) % 26) + a);
      }
      if (/[A-Z]/.test(ch)) {
        return String.fromCharCode(((ch.charCodeAt(0) - A + shift + 26) % 26) + A);
      }
      return ch;
    })
    .join("");
}

function vigenere(text, key) {
  if (!key) return text;
  const cleanKey = key.replace(/[^a-z]/gi, "").toLowerCase();
  let j = 0;
  return text
    .split("")
    .map((ch) => {
      if (!/[a-z]/i.test(ch)) return ch;
      const shift = cleanKey.charCodeAt(j % cleanKey.length) - 97;
      j += 1;
      return caesarShift(ch, shift);
    })
    .join("");
}

function rot13(text) {
  return caesarShift(text, 13);
}

function decodeBase64(text) {
  try {
    return atob(text);
  } catch {
    return "(invalid base64)";
  }
}

const MORSE_TABLE = {
  ".-": "A",
  "-...": "B",
  "-.-.": "C",
  "-..": "D",
  ".": "E",
  "..-.": "F",
  "--.": "G",
  "....": "H",
  "..": "I",
  ".---": "J",
  "-.-": "K",
  ".-..": "L",
  "--": "M",
  "-.": "N",
  "---": "O",
  ".--.": "P",
  "--.-": "Q",
  ".-.": "R",
  "...": "S",
  "-": "T",
  "..-": "U",
  "...-": "V",
  ".--": "W",
  "-..-": "X",
  "-.--": "Y",
  "--..": "Z",
  "-----": "0",
  ".----": "1",
  "..---": "2",
  "...--": "3",
  "....-": "4",
  ".....": "5",
  "-....": "6",
  "--...": "7",
  "---..": "8",
  "----.": "9"
};

function decodeMorse(input) {
  return input
    .trim()
    .split(" / ")
    .map((word) =>
      word
        .trim()
        .split(" ")
        .map((code) => MORSE_TABLE[code] || "?")
        .join("")
    )
    .join(" ");
}

export default function CipherDecoder({ onCopy }) {
  const [text, setText] = useState("");
  const [key, setKey] = useState("");
  const [shift, setShift] = useState(3);

  const bruteForce = useMemo(
    () =>
      Array.from({ length: 26 }, (_, i) => ({
        shift: i,
        output: caesarShift(text, i)
      })),
    [text]
  );

  const outputs = useMemo(
    () => ({
      caesar: caesarShift(text, Number(shift) || 0),
      vigenere: vigenere(text, key),
      rot13: rot13(text),
      base64: decodeBase64(text),
      morse: decodeMorse(text)
    }),
    [text, key, shift]
  );

  const handleCopy = (value) => {
    navigator.clipboard?.writeText(value);
    onCopy?.(value);
  };

  return (
    <div>
      <div className="utility-header">
        <h3>Multi-Cipher Decoder</h3>
        <div className="utility-actions">
          <button className="btn btn-outline" type="button" onClick={() => handleCopy(outputs.caesar)}>
            Copy Output
          </button>
        </div>
      </div>
      <textarea
        className="utility-textarea"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Enter ciphertext here..."
      />
      <div className="utility-grid">
        <label>
          <span className="eyebrow">Caesar Shift</span>
          <input type="number" value={shift} onChange={(e) => setShift(e.target.value)} />
        </label>
        <label>
          <span className="eyebrow">Vigenère Key</span>
          <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="keyword" />
        </label>
      </div>

      <div className="conversion-grid">
        <div className="conversion-row">
          <strong>Caesar</strong>
          <span className="mono">{outputs.caesar}</span>
        </div>
        <div className="conversion-row">
          <strong>Vigenère</strong>
          <span className="mono">{outputs.vigenere}</span>
        </div>
        <div className="conversion-row">
          <strong>ROT13</strong>
          <span className="mono">{outputs.rot13}</span>
        </div>
        <div className="conversion-row">
          <strong>Base64</strong>
          <span className="mono">{outputs.base64}</span>
        </div>
        <div className="conversion-row">
          <strong>Morse</strong>
          <span className="mono">{outputs.morse}</span>
        </div>
      </div>

      <div className="subsection">
        <h4>Brute-force Shifts</h4>
        <div className="brute-grid">
          {bruteForce.map((entry) => (
            <div key={entry.shift} className="brute-item">
              <span className="eyebrow">Shift {entry.shift}</span>
              <p className="mono">{entry.output}</p>
              <button className="btn btn-muted" type="button" onClick={() => handleCopy(entry.output)}>
                Copy
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
