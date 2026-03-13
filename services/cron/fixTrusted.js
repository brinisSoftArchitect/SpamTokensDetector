require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const cron = require('node-cron');
const axios = require('axios');
const mongoService = require('../mongoService');

// const API_BASE_URL = 'https://antiscam.brimind.pro/api';
const API_BASE_URL = 'http://localhost:4001/api';

// Function to fetch all trusted tokens from categories API
async function getTrustedTokens() {
  try {
    const response = await axios.get(`${API_BASE_URL}/categories`);
    const data = response.data;
    
    if (data.lists && data.lists.trusted && Array.isArray(data.lists.trusted)) {
      console.log(`Found ${data.lists.trusted.length} trusted tokens to validate`);
      return data.lists.trusted;
    }
    
    console.log('No trusted tokens found in API response');
    return [];
  } catch (error) {
    console.error('Error fetching trusted tokens:', error.message);
    return [];
  }
}

// Function to fetch all undefined tokens from categories API
async function getUndefinedTokens() {
  try {
    const response = await axios.get(`${API_BASE_URL}/categories`);
    const data = response.data;
    
    if (data.lists && data.lists.undefined && Array.isArray(data.lists.undefined)) {
      console.log(`Found ${data.lists.undefined.length} undefined tokens to recheck`);
      return data.lists.undefined;
    }
    
    console.log('No undefined tokens found in API response');
    return [];
  } catch (error) {
    console.error('Error fetching undefined tokens:', error.message);
    return [];
  }
}

// Derive category from API response (mirrors mongoService.determineCategory)
function deriveCategory(data) {
  if (!data) return 'undefined';
  // Explicit status field (set by categories route)
  if (data.status === 'trusted') return 'trusted';
  if (data.status === 'scam')    return 'scam';

  // Fall back to risk logic
  const risk = data.gapHunterBotRisk?.riskPercentage ?? data.riskPercentage;
  if (risk === undefined || risk === null || isNaN(risk)) return 'undefined';
  if (data.shouldSkip || data.hardSkip || risk >= 38) return 'scam';
  return 'trusted';
}

// Function to validate a single token
// forceFresh=true bypasses the 14-day cache so we get a real re-analysis
async function validateToken(tokenSymbol, forceFresh = true) {
  try {
    const url = `${API_BASE_URL}/check-symbol/${encodeURIComponent(tokenSymbol)}${forceFresh ? '?forceFresh=true' : ''}`;
    console.log(`Validating token: ${tokenSymbol} via ${url}`);
    const response = await axios.get(url, { timeout: 90000 });
    const category = deriveCategory(response.data);
    console.log(`Response for ${tokenSymbol}: category=${category}`);
    return {
      symbol: tokenSymbol,
      category,
      isValid: category === 'trusted',
      response: response.data
    };
  } catch (error) {
    console.error(`Error validating token ${tokenSymbol}:`, error.message);
    return {
      symbol: tokenSymbol,
      category: 'error',
      isValid: false,
      error: error.message
    };
  }
}

// Load progress from MongoDB
async function loadProgress() {
  try {
    await mongoService.connect();
    const doc = await mongoService.db.collection('appProgress').findOne({ _id: 'fixTrustedProgress' });
    if (doc) {
      return {
        validatedTokens: doc.validatedTokens || [],
        validatedUndefined: doc.validatedUndefined || [],
        phase: doc.phase || 'trusted',
        lastUpdate: doc.lastUpdate || null
      };
    }
    return { validatedTokens: [], validatedUndefined: [], phase: 'trusted', lastUpdate: null };
  } catch (error) {
    console.error('Error loading progress from MongoDB:', error.message);
    return { validatedTokens: [], validatedUndefined: [], phase: 'trusted', lastUpdate: null };
  }
}

// Save progress to MongoDB
async function saveProgress(progress) {
  try {
    await mongoService.connect();
    await mongoService.db.collection('appProgress').updateOne(
      { _id: 'fixTrustedProgress' },
      { $set: {
        validatedTokens: progress.validatedTokens || [],
        validatedUndefined: progress.validatedUndefined || [],
        phase: progress.phase || 'trusted',
        lastUpdate: progress.lastUpdate || new Date().toISOString()
      }},
      { upsert: true }
    );
  } catch (error) {
    console.error('Error saving progress to MongoDB:', error.message);
  }
}

// Get remaining tokens to validate (trusted + undefined combined)
async function getRemainingTokens() {
  const [trustedTokens, undefinedTokens] = await Promise.all([
    getTrustedTokens(),
    getUndefinedTokens()
  ]);
  // Merge and deduplicate
  const allTokens = [...new Set([...trustedTokens, ...undefinedTokens])];
  const progress = await loadProgress();
  
  const remaining = allTokens.filter(token => !progress.validatedTokens.includes(token));
  
  console.log(`📋 Combined list: ${trustedTokens.length} trusted + ${undefinedTokens.length} undefined = ${allTokens.length} total`);
  return { remaining, total: allTokens.length, validated: progress.validatedTokens.length };
}

// Get remaining undefined tokens to recheck
async function getRemainingUndefined() {
  const allTokens = await getUndefinedTokens();
  const progress = await loadProgress();
  const done = progress.validatedUndefined || [];
  
  const remaining = allTokens.filter(token => !done.includes(token));
  
  return { remaining, total: allTokens.length, validated: done.length };
}

// Function to validate next token in the list
async function validateNextToken() {
  const progress = await loadProgress();
  const phase = progress.phase || 'trusted';

  // ── PHASE 1: trusted tokens ──────────────────────────────────────────────
  if (phase === 'trusted') {
    const { remaining, total, validated } = await getRemainingTokens();

    if (remaining.length === 0) {
      console.log('\n=== ✅ Full cycle complete (trusted + undefined)! Resetting for next cycle ===');
      await saveProgress({
        validatedTokens: [],
        validatedUndefined: [],
        phase: 'trusted',
        lastUpdate: new Date().toISOString()
      });
      return;
    }

    const tokenSymbol = remaining[0];
    console.log(`\n[TRUSTED ${validated + 1}/${total}] Validating: ${tokenSymbol}`);
    console.log(`Remaining: ${remaining.length} tokens`);
    console.log(`Time: ${new Date().toISOString()}`);

    const validation = await validateToken(tokenSymbol);

    if (validation.error) {
      console.log(`❌ ERROR: ${tokenSymbol} - ${validation.error}`);
    } else if (!validation.isValid) {
      console.log(`⚠️  RECATEGORIZED: ${tokenSymbol} → now: ${validation.category}`);
    } else {
      console.log(`✅ STILL TRUSTED: ${tokenSymbol}`);
    }

    progress.validatedTokens.push(tokenSymbol);
    progress.lastUpdate = new Date().toISOString();
    await saveProgress(progress);
    return;
  }

  // Phase 2 is now merged into phase 1 — this is a no-op safety fallback
  if (phase === 'undefined') {
    console.log('⚠️  Legacy undefined phase — resetting to merged trusted+undefined cycle');
    await saveProgress({
      validatedTokens: [],
      validatedUndefined: [],
      phase: 'trusted',
      lastUpdate: new Date().toISOString()
    });
    return validateNextToken();
  }
}

// Initial load function
async function initializeCron() {
  console.log('\n=== Initializing Trusted + Undefined Tokens Validation ===');
  const { remaining, total, validated } = await getRemainingTokens();
  console.log(`Total tokens (trusted+undefined): ${total}`);
  console.log(`Already validated: ${validated}`);
  console.log(`Remaining to validate: ${remaining.length}`);
  console.log('Will validate one token every 10 minutes\n');
}

// Schedule cron job to run every minute
const cronJob = cron.schedule('*/10 * * * *', async () => {
  await validateNextToken();
}, {
  scheduled: true,
  timezone: "Africa/Tunis"
});

// Start the cron job
console.log('🔄 Trusted Tokens Validation Cron Job Started');
console.log('📅 Schedule: One token per minute');
console.log('🌍 Timezone: Africa/Tunis');
console.log('⏰ Next validation:', new Date(Date.now() + 60000).toISOString());

// Initialize and run first validation
initializeCron().then(() => {
  validateNextToken();
});

module.exports = cronJob;