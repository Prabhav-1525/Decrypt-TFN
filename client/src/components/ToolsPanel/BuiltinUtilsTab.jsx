import CipherDecoder from "../utils/CipherDecoder";
import BaseConverter from "../utils/BaseConverter";
import EncodingChain from "../utils/EncodingChain";
import FrequencyAnalyzer from "../utils/FrequencyAnalyzer";
import HashCalc from "../utils/HashCalc";
import ImageChannelView from "../utils/ImageChannelView";
import HexViewer from "../utils/HexViewer";
import SubnetCalc from "../utils/SubnetCalc";
import BitwiseSuite from "../utils/BitwiseSuite";
import AudioWorkbench from "../utils/AudioWorkbench";
import LogicHelpers from "../utils/LogicHelpers";
import OsintHelpers from "../utils/OsintHelpers";
import ForensicsHelpers from "../utils/ForensicsHelpers";
import ClassicalCiphers from "../utils/ClassicalCiphers";
import NotepadUtility from "../utils/NotepadUtility";
import PlaceholderUtility from "../utils/PlaceholderUtility";

const REGISTRY = {
  "cipher-decoder": CipherDecoder,
  "base-converter": BaseConverter,
  "encoding-chain": EncodingChain,
  "freq-analysis": FrequencyAnalyzer,
  "hash-calc": HashCalc,
  "image-channel-viewer": ImageChannelView,
  "hex-viewer": HexViewer,
  "subnet-calc": SubnetCalc,
  "ip-binary-converter": SubnetCalc,
  "bitwise-calc": BitwiseSuite,
  "binary-to-ascii": BitwiseSuite,
  "endianness-converter": BitwiseSuite,
  "audio-player": AudioWorkbench,
  "waveform-viewer": AudioWorkbench,
  "grid-renderer": LogicHelpers,
  "truth-table": LogicHelpers,
  notepad: NotepadUtility,
  "timestamped-notepad": NotepadUtility,
  "coord-mapper": OsintHelpers,
  "whois-widget": OsintHelpers,
  "magic-bytes": ForensicsHelpers,
  "port-reference": SubnetCalc,
  "prime-factor": BaseConverter,
  "mod-calc": BaseConverter,
  "code-viewer": ForensicsHelpers,
  "diff-viewer": ForensicsHelpers,
  "cipher-identifier": ClassicalCiphers,
  "playfair-decoder": ClassicalCiphers,
  "substitution-mapper": ClassicalCiphers,
  "encoding-utils": EncodingChain
};

export default function BuiltinUtilsTab({ utils, onCopy, puzzle, onPasteToField }) {
  return (
    <div className="utils-grid">
      {utils.map((key) => {
        const Component = REGISTRY[key] || PlaceholderUtility;
        return (
          <div key={key} className="utility-card">
            <Component onCopy={onCopy} puzzle={puzzle} onPasteToField={onPasteToField} utilityKey={key} />
          </div>
        );
      })}
    </div>
  );
}
