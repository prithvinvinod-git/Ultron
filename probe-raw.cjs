const { MsEdgeTTS, OUTPUT_FORMAT } = require("msedge-tts");

const VOICE = "en-US-AriaNeural";

function raw(ssmlBody) {
  return new Promise((resolve) => {
    const tts = new MsEdgeTTS();
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
        const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="en-US"><voice name="${VOICE}">${ssmlBody}</voice></speak>`;
        const { audioStream } = tts.rawToStream(ssml);
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

const CASES = {
  "plain-prosody": `<prosody rate="1.0" pitch="+0Hz">The answer is forty two, sir.</prosody>`,
  "express-as-parent": `<mstts:express-as style="chat"><prosody rate="1.0" pitch="+0Hz">The answer is forty two, sir.</prosody></mstts:express-as>`,
  "express-as-bogus": `<mstts:express-as style="banana-bogus"><prosody rate="1.0" pitch="+0Hz">The answer is forty two, sir.</prosody></mstts:express-as>`,
  "breaks": `<prosody rate="1.0" pitch="+0Hz">The answer is <break time="300ms"/> forty two, sir.</prosody>`,
  "no-prosody": `The answer is forty two, sir.`,
};

(async () => {
  const which = process.argv[2];
  await raw(CASES[which]);
  setTimeout(() => process.exit(0), 300);
})();
