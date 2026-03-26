export const PUZZLE_TOOL_CONFIG = {
  cryptography: {
    builtinUtils: ["cipher-decoder", "base-converter", "freq-analysis"],
    externalLinks: [
      { name: "CyberChef", url: "https://gchq.github.io/CyberChef", desc: "Multi-step encoder/decoder" }
    ]
  },
  steganography: {
    builtinUtils: ["image-channel-viewer", "exif-viewer", "hash-calc"],
    externalLinks: [
      { name: "Aperi'Solve", url: "https://www.aperisolve.com", desc: "Automated steg analyzer" },
      { name: "StegOnline", url: "https://stegonline.georgeom.net", desc: "Image bit-plane explorer" }
    ]
  },
  "code-debugging": {
    builtinUtils: ["code-viewer", "diff-viewer"],
    externalLinks: [
      { name: "JDoodle", url: "https://www.jdoodle.com", desc: "Online compiler & runner" },
      { name: "Programiz", url: "https://www.programiz.com/online-compiler", desc: "Language playground" }
    ]
  },
  "number-theory": {
    builtinUtils: ["mod-calc", "prime-factor", "base-converter"],
    externalLinks: [
      { name: "WolframAlpha", url: "https://www.wolframalpha.com", desc: "Symbolic & numeric solver" }
    ]
  },
  networking: {
    builtinUtils: ["ip-binary-converter", "subnet-calc", "port-reference"],
    externalLinks: [
      { name: "CyberChef", url: "https://gchq.github.io/CyberChef", desc: "Hex & packet helpers" }
    ]
  },
  logic: {
    builtinUtils: ["grid-renderer", "notepad", "truth-table"],
    externalLinks: []
  },
  encoding: {
    builtinUtils: ["encoding-chain", "base-converter", "cipher-decoder"],
    externalLinks: [
      { name: "CyberChef", url: "https://gchq.github.io/CyberChef", desc: "Encoding swiss-army knife" }
    ]
  },
  osint: {
    builtinUtils: ["timestamped-notepad", "coord-mapper", "whois-widget"],
    externalLinks: [
      { name: "Google Maps", url: "https://maps.google.com", desc: "Map search" },
      { name: "Reverse Image Search", url: "https://images.google.com", desc: "Find similar images" },
      { name: "WHOIS", url: "https://whois.domaintools.com", desc: "Domain lookup" }
    ]
  },
  forensics: {
    builtinUtils: ["hex-viewer", "magic-bytes", "hash-calc"],
    externalLinks: [
      { name: "CyberChef", url: "https://gchq.github.io/CyberChef", desc: "File inspection" },
      { name: "hexed.it", url: "https://hexed.it", desc: "Browser hex editor" }
    ]
  },
  audio: {
    builtinUtils: ["audio-player", "waveform-viewer"],
    externalLinks: [
      { name: "Academo Spectrum Analyzer", url: "https://academo.org/demos/spectrum-analyzer", desc: "Real-time FFT" }
    ]
  },
  binary: {
    builtinUtils: ["bitwise-calc", "endianness-converter", "binary-to-ascii"],
    externalLinks: [
      { name: "CyberChef", url: "https://gchq.github.io/CyberChef", desc: "Binary transforms" }
    ]
  },
  classical: {
    builtinUtils: ["cipher-identifier", "playfair-decoder", "substitution-mapper"],
    externalLinks: [
      { name: "dcode.fr", url: "https://www.dcode.fr/en", desc: "Classical cipher tools" }
    ]
  },
  "html-inspect": {
    builtinUtils: ["notepad"],
    externalLinks: []
  },
  mixed: {
    builtinUtils: [
      "cipher-decoder",
      "encoding-chain",
      "base-converter",
      "freq-analysis",
      "hash-calc",
      "hex-viewer"
    ],
    externalLinks: [
      { name: "CyberChef", url: "https://gchq.github.io/CyberChef", desc: "Multi-step encoder/decoder" }
    ]
  }
};

export const DEFAULT_HINT_PENALTIES = [0, 60, 90];

export function getToolConfigForPuzzle(puzzle = {}) {
  const type = puzzle.puzzle_type || "mixed";
  const base = puzzle.toolConfig || PUZZLE_TOOL_CONFIG[type] || PUZZLE_TOOL_CONFIG.mixed;
  return {
    builtinUtils: base?.builtinUtils || [],
    externalLinks: base?.externalLinks || [],
    isInspectPuzzle: Boolean(puzzle.isInspectPuzzle || (type === "html-inspect")),
    isolatedUrl: puzzle.isolatedUrl || null
  };
}

export function getPuzzleHints(puzzle = {}) {
  if (Array.isArray(puzzle.hints)) {
    return puzzle.hints;
  }
  return [];
}
