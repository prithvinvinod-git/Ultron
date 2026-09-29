// Probe which mstts:express-as styles Edge actually accepts per voice.
const { MsEdgeTTS, OUTPUT_FORMAT } = require("msedge-tts");

const VOICES = {
  "en-US-AriaNeural": ["chat", "friendly", "cheerful", "narration-professional", "newscast", "banana-bogus"],
  "en-US-JennyNeural": ["chat", "cheerful", "newscast", "narration-professional", "banana-bogus"],
  "en-US-GuyNeural": ["newscast", "cheerful", "banana-bogus"],
  "en-US-AndrewNeural": ["chat", "newscast", "banana-bogus"],
  "en-US-MichelleNeural": ["chat", "cheerful", "banana-bogus"],
  "en-US-AvaMultilingualNeural": ["chat", "friendly", "banana-bogus"],
  "en-GB-SoniaNeural": ["chat", "cheerful", "banana-bogus"],
  "en-GB-RyanNeural": ["newscast", "cheerful", "banana-bogus"],
};

function synth(text) {
  return new Promise((resolve) => {
    const tts = new MsEdgeTTS();
    let done = false;
    const finish = (res) => {
      if (done) return;
      done = true;
      try { tts.close(); } catch {}
      resolve(res);
    };
    (async () => {
      try {
        await tts.setMetadata(
          (global.__v = VOICES_ARG.voice),
          OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3,
        );
        const { audioStream } = tts.toStream(text, { rate: 1.0, pitch: "+0Hz" });
        let bytes = 0;
        audioStream.on("data", (d) => (bytes += d.length));
        audioStream.on("end", () => finish({ ok: true, bytes }));
        audioStream.on("close", () => finish({ ok: bytes > 0, bytes }));
        audioStream.on("error", (e) => finish({ ok: false, err: String(e.message || e).slice(0, 60) }));
        setTimeout(() => finish({ ok: false, err: "timeout" }), 20000);
      } catch (e) {
        finish({ ok: false, err: String(e.message || e).slice(0, 60) });
      }
    })();
  });
}

let VOICES_ARG = { voice: "en-US-AriaNeural" };

(async () => {
  for (const [voice, styles] of Object.entries(VOICES)) {
    for (const style of styles) {
      VOICES_ARG = { voice };
      const inner = `<mstts:express-as style="${style}">The answer is forty two, sir.</mstts:express-as>`;
      const r = await synth(inner);
      const tag = style.startsWith("banana") ? " [BOGUS]" : "";
      console.log(
        `${voice.padEnd(32)} ${style.padEnd(26)} ${r.ok ? "OK" : "FAIL"} ${String(r.bytes ?? r.err).slice(0, 40)}${tag}`,
      );
      await new Promise((r2) => setTimeout(r2, 350));
    }
  }
  process.exit(0);
})();
