//modules/ST/ST.js
const axios = require("axios");
const cron = require("node-cron");
const fs = require("fs");
const path = require("path");

const STORAGE_PATH = path.join(__dirname, "st-tokens.json");
// Official Gate.io REST API (v4) — the old apiw endpoint now returns 403
const API_URL = "https://api.gateio.ws/api/v4/spot/currency_pairs";

let currentSTTokens = [];
function isValidJSON(data) {
  try {
    JSON.stringify(data);
    return true;
  } catch (error) {
    console.error("JSON validation failed:", error.message);
    return false;
  }
}

function isValidSTTokensData(tokens) {
  if (!Array.isArray(tokens) || tokens.length === 0) {
    console.warn("ST tokens data is empty or not an array");
    return false;
  }

  const allValidStrings = tokens.every(
    (token) => typeof token === "string" && token.trim().length > 0
  );

  if (!allValidStrings) {
    console.warn("ST tokens contain invalid entries");
    return false;
  }

  return true;
}
async function updateSTTokens() {
  try {
    console.log("Fetching ST tokens from Gate.io API...");
    const response = await axios.get(API_URL);
    // console.log('Received response from Gate.io API respons=',response);
    if (!response.data || !Array.isArray(response.data)) {
      console.error("Invalid API response structure");
      return;
    }
    const pairs = response.data;
    // console.log('Pairs=',pairs);
    const stTokens = pairs
      .filter((pairData) => pairData.st_tag === true)
      .map((pairData) => pairData.id)
      .sort(); // Sort tokens alphabetically by name
    // Log pair data for a specific token if it exists
    // const clipsUsdtPair = pairs.find(pair => pair.id === 'LION_USDT');
    // if (clipsUsdtPair) {
    //   console.log('CLIPS_USDT pair data:', clipsUsdtPair);
    // }
    // Validate the processed data before saving
    if (!isValidSTTokensData(stTokens)) {
      console.error("Processed ST tokens data is invalid, skipping save");
      return;
    }

    if (!isValidJSON(stTokens)) {
      console.error(
        "ST tokens data cannot be serialized to JSON, skipping save"
      );
      return;
    }
    currentSTTokens = stTokens;
    try {
      fs.writeFileSync(STORAGE_PATH, JSON.stringify(stTokens, null, 2));
      console.log(
        `Updated ST tokens list (${stTokens.length} tokens detected)`
      );
    } catch (writeError) {
      console.error("Error writing to file:", writeError.message);
    }
  } catch (error) {
    console.error("Error updating ST tokens:", error.message);
  }
}

// Initial update — run immediately on startup, no delay, so ST list is populated right away
console.log("--- Running initial ST token update on startup ---");
updateSTTokens();

// Schedule every 30 min — but only fetch if file is older than 29 min
cron.schedule("*/30 * * * *", async () => {
  try {
    const stats = fs.statSync(STORAGE_PATH);
    const ageMinutes = (Date.now() - stats.mtimeMs) / 60000;
    if (ageMinutes < 29) {
      // another instance already updated recently — skip
      return;
    }
  } catch(_) {}
  console.log("\n--- Running scheduled ST token update ---");
  updateSTTokens();
});

module.exports = {
  getSTTokens: () => [...currentSTTokens],
  getSTTokensSync: () => {
    try {
      return JSON.parse(fs.readFileSync(STORAGE_PATH, "utf8"));
    } catch (error) {
      return [];
    }
  },
};