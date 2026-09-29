const { MsEdgeTTS, OUTPUT_FORMAT } = require("msedge-tts");

const VOICE = process.argv[2] || "en-US-AriaNeural";
const STYLE = process.argv[3] || null;

function run() {
  return new Promise((resolve) => {
    const tts = new MsEdgeTTS({ enableLogger: true });
    let bytes = 0;
    let finished = false;
    const finish = (r) => {
      if (finished) return;
      finished = true;
      try { tts.close(); } catch {}
      console.log("RESULT:", JSON.stringify(r));
      resolve(r);
    };
    (async () => {
      try {
        await tts.setMetadata(VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
        const inner = STYLE
          ? `<mstts:express-as style="${STYLE}">The answer is forty two, sir.</mstts:express-as>`
          : "The answer is forty two, sir.";
        const { audioStream } = tts.toStream(inner, { rate: 1.0, pitch: "+0Hz" });
        audioStream.on("data", (d) => { bytes += d.length; });
        audioStream.on("end", () => finish({ ok: true, bytes }));
        audioStream.on("error", (e) => finish({ ok: false, err: String(e.message || e) }));
        audioStream.on("close", () => finish({ ok: bytes > 0, bytes, note: "close" }));
        setTimeout(() => finish({ ok: false, err: "timeout" }), 25000);
      } catch (e) {
        finish({ ok: false, err: String(e.message || e) });
      }
    })();
  });
}

run().then(() => setTimeout(() => process.exit(0), 300));
