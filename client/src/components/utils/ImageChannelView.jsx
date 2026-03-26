import { useEffect, useRef, useState } from "react";

export default function ImageChannelView({ onCopy }) {
  const [file, setFile] = useState(null);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [channels, setChannels] = useState({ r: true, g: true, b: true });
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!file || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    const img = new Image();
    img.onload = () => {
      canvasRef.current.width = img.width;
      canvasRef.current.height = img.height;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, img.width, img.height);
      const data = imageData.data;
      const bFactor = brightness / 100;
      const cFactor = contrast / 100;
      for (let i = 0; i < data.length; i += 4) {
        data[i] = channels.r ? data[i] * bFactor * cFactor : 0;
        data[i + 1] = channels.g ? data[i + 1] * bFactor * cFactor : 0;
        data[i + 2] = channels.b ? data[i + 2] * bFactor * cFactor : 0;
      }
      ctx.putImageData(imageData, 0, 0);
    };
    img.src = URL.createObjectURL(file);
  }, [file, brightness, contrast, channels]);

  const handleCopy = () => {
    const canvas = canvasRef.current;
    canvas?.toBlob((blob) => {
      if (blob) {
        navigator.clipboard?.write([new ClipboardItem({ [blob.type]: blob })]);
      }
    });
  };

  return (
    <div>
      <div className="utility-header">
        <h3>Image Channel Isolator</h3>
        <div className="utility-actions">
          <button className="btn btn-outline" type="button" onClick={handleCopy}>
            Copy Canvas
          </button>
        </div>
      </div>
      <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
      <div className="utility-grid" style={{ marginTop: "12px" }}>
        <label className="toggle-row">
          <input type="checkbox" checked={channels.r} onChange={(e) => setChannels((c) => ({ ...c, r: e.target.checked }))} />
          <span>Red</span>
        </label>
        <label className="toggle-row">
          <input type="checkbox" checked={channels.g} onChange={(e) => setChannels((c) => ({ ...c, g: e.target.checked }))} />
          <span>Green</span>
        </label>
        <label className="toggle-row">
          <input type="checkbox" checked={channels.b} onChange={(e) => setChannels((c) => ({ ...c, b: e.target.checked }))} />
          <span>Blue</span>
        </label>
      </div>
      <div className="utility-grid">
        <label>
          <span className="eyebrow">Brightness</span>
          <input
            type="range"
            min="0"
            max="200"
            value={brightness}
            onChange={(e) => setBrightness(Number(e.target.value))}
          />
        </label>
        <label>
          <span className="eyebrow">Contrast</span>
          <input
            type="range"
            min="0"
            max="200"
            value={contrast}
            onChange={(e) => setContrast(Number(e.target.value))}
          />
        </label>
      </div>
      <canvas ref={canvasRef} className="image-canvas" />
      <p className="muted" style={{ marginTop: "8px" }}>
        EXIF-like details are not extracted here; use the External Tools tab for deep metadata if needed.
      </p>
    </div>
  );
}
