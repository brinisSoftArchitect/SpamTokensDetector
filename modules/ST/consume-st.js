// consume-st.js
// Consumer script for modules/ST/ST.js
// Usage: node consume-st.js
// Place this file next to ST.js (or adjust the require path below)

const { getSTTokens, getSTTokensSync } = require("./ST");

function printTokens(label, tokens) {
  console.log(`\n--- ${label} (${tokens.length} tokens) ---`);
  if (tokens.length === 0) {
    console.log("⚠️  Empty list.");
    return;
  }
  console.log(tokens.slice(0, 20).join(", ") + (tokens.length > 20 ? ", ..." : ""));
}

function checkToken(tokens, symbol) {
  const found = tokens.includes(symbol);
  console.log(`Is "${symbol}" an ST token? →`, found ? "✅ YES" : "❌ NO");
}

// 1. getSTTokensSync() — reads directly from st-tokens.json on disk
const syncTokens = getSTTokensSync();
printTokens("getSTTokensSync()", syncTokens);

// 2. getSTTokens() — reads from in-memory cache (currentSTTokens)
// Note: right after requiring ST.js, the initial fetch runs async on startup,
// so in-memory data may still be empty for a second or two. We wait briefly
// to give the initial updateSTTokens() a chance to complete.
setTimeout(() => {
  const memTokens = getSTTokens();
  printTokens("getSTTokens() [in-memory]", memTokens);

  // Example lookups — adjust symbols as needed
  checkToken(memTokens, "LION_USDT");
  checkToken(memTokens, "BTC_USDT");

  console.log("\nDone.");
}, 5000); // 5s delay to let the initial API call in ST.js finish