const { MsEdgeTTS } = require("msedge-tts");
(async () => {
  const tts = new MsEdgeTTS();
  const voices = await tts.getVoices();
  const en = voices.filter((v) => /^en-(US|GB|AU|IE|CA)-/.test(v.ShortName));
  console.log("total voices:", voices.length, "| en-*:", en.length);
  for (const v of en) {
    const hd = v.ShortName.includes("DragonHD") ? "DragonHD" : "";
    const ml = v.ShortName.includes("Multilingual") ? "Multilingual" : "";
    console.log(
      [v.ShortName.padEnd(38), (v.Gender || "").padEnd(7), (v.Locale || "").padEnd(7), (hd + (hd && ml ? "+" : "") + ml).padEnd(22)].join(""),
    );
  }
  tts.close();
  process.exit(0);
})();
