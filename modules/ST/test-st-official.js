// test-st-official.js (UPDATED)
const axios = require("axios");

(async () => {
  try {
    console.log("Fetching official Gate.io spot markets...");
    const response = await axios.get("https://api.gateio.ws/api/v4/spot/currency_pairs", {
      timeout: 15000,
    });

    console.log("Status:", response.status);
    const pairs = response.data;
    
    if (!Array.isArray(pairs)) {
      console.error("❌ Pas un tableau !");
      return;
    }

    console.log(`Total pairs: ${pairs.length}`);
    
    // Filtrer sur st_tag === true
    const stTokens = pairs
      .filter(p => p.st_tag === true)
      .map(p => p.id)
      .sort();
    
    console.log(`\n✅ ST tokens found: ${stTokens.length}`);
    console.log("Premiers exemples:", stTokens.slice(0, 10));
    
  } catch (err) {
    console.error("❌ Erreur:", err.message);
  }
})();