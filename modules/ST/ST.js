const axios = require("axios");
const cron = require("node-cron");
const fs = require("fs");
const path = require("path");

const STORAGE_PATH = path.join(__dirname, "st-tokens.json");
const API_URL = "https://www.gate.io/apiw/v2/market/spots?exchange_type=ALL";

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
    if (
      !response.data ||
      !response.data.data ||
      !Array.isArray(response.data.data)
    ) {
      console.error("Invalid API response structure");
      return;
    }
    const pairs = response.data.data;
    // console.log('Pairs=',pairs);
    const stTokens = pairs
      .filter((pairData) => pairData[pairData.length - 2] === "true")
      .map((pairData) => pairData[0])
      .sort(); // Sort tokens alphabetically by name
    // Log pairs data for CLIPS_USDT if it exists
    // const clipsUsdtPair = pairs.find(pair => pair[0] === 'LION_USDT');
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

// Initial update — stagger startup to avoid 15 accounts hitting simultaneously
const startupDelay = Math.floor(Math.random() * 5 * 60 * 1000); // 0-5min random
setTimeout(() => updateSTTokens(), startupDelay);

// Schedule every 15 min — but only fetch if file is older than 14 min
cron.schedule("*/15 * * * *", async () => {
  try {
    const stats = fs.statSync(STORAGE_PATH);
    const ageMinutes = (Date.now() - stats.mtimeMs) / 60000;
    if (ageMinutes < 14) {
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
