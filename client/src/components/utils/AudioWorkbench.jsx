import { useEffect, useRef, useState } from "react";

export default function AudioWorkbench() {
  const [fileUrl, setFileUrl] = useState(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const audioRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  const onFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setFileUrl(url);

    file.arrayBuffer().then((buf) => {
      if (!canvasRef.current) return;
      const audioCtx = new AudioContext();
      audioCtx.decodeAudioData(buf).then((audioBuffer) => {
        const channelData = audioBuffer.getChannelData(0).slice(0, 2048);
        const ctx = canvasRef.current.getContext("2d");
        canvasRef.current.width = 400;
        canvasRef.current.height = 120;
        ctx.clearRect(0, 0, 400, 120);
        ctx.strokeStyle = "#ffbc00";
        ctx.beginPath();
        channelData.forEach((val, idx) => {
          const x = (idx / channelData.length) * 400;
          const y = 60 + val * 50;
          idx === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.stroke();
      });
    });
  };

  const reverse = async () => {
    if (!fileUrl || !canvasRef.current) return;
    const response = await fetch(fileUrl);
    const buf = await response.arrayBuffer();
    const ctx = new AudioContext();
    const audioBuffer = await ctx.decodeAudioData(buf);
    for (let i = 0; i < audioBuffer.numberOfChannels; i += 1) {
      Array.prototype.reverse.call(audioBuffer.getChannelData(i));
    }
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    source.start();
  };

  return (
    <div>
      <div className="utility-header">
        <h3>Audio Player & Waveform</h3>
      </div>
      <input type="file" accept="audio/*" onChange={onFile} />
      {fileUrl && (
        <>
          <audio ref={audioRef} controls src={fileUrl} style={{ width: "100%", marginTop: "12px" }} />
          <div className="utility-grid">
            <label>
              <span className="eyebrow">Speed</span>
              <input
                type="range"
                min="0.5"
                max="2"
                step="0.05"
                value={playbackRate}
                onChange={(e) => setPlaybackRate(Number(e.target.value))}
              />
            </label>
            <button className="btn btn-outline" type="button" onClick={reverse}>
              Reverse Playback
            </button>
          </div>
          <canvas ref={canvasRef} className="waveform" />
        </>
      )}
    </div>
  );
}
