const cron = require('node-cron');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

const API_BASE_URL = 'https://antiscam.brimind.pro/api';
const PROGRESS_FILE = path.join(__dirname, '../../cache/validation-progress.json');

// Function to fetch all trusted tokens from categories API
async function getTrustedTokens() {
  try {
    const response = await axios.get(`${API_BASE_URL}/categories`);
    const data = response.data;
    
    // Extract trusted list from the response
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

// Function to validate a single token
async function validateToken(tokenSymbol) {
  try {
    const url = `${API_BASE_URL}/check-symbol/${tokenSymbol}`;
    console.log(`Validating token: ${tokenSymbol} via ${url}`);
    const response = await axios.get(url);
    console.log(`Response for ${tokenSymbol}:`, response.data);
    return {
      symbol: tokenSymbol,
      isValid: response.data.status === 'trusted',
      response: response.data
    };
  } catch (error) {
    console.error(`Error validating token ${tokenSymbol}:`, error.message);
    return {
      symbol: tokenSymbol,
      isValid: false,
      error: error.message
    };
  }
}

// Load progress from file
async function loadProgress() {
  try {
    const data = await fs.readFile(PROGRESS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return { validatedTokens: [], lastUpdate: null };
  }
}

// Save progress to file
async function saveProgress(progress) {
  try {
    await fs.writeFile(PROGRESS_FILE, JSON.stringify(progress, null, 2));
  } catch (error) {
    console.error('Error saving progress:', error.message);
  }
}

// Get remaining tokens to validate
async function getRemainingTokens() {
  const allTokens = await getTrustedTokens();
  const progress = await loadProgress();
  
  const remaining = allTokens.filter(token => !progress.validatedTokens.includes(token));
  
  return { remaining, total: allTokens.length, validated: progress.validatedTokens.length };
}

// Function to validate next token in the list
async function validateNextToken() {
  const { remaining, total, validated } = await getRemainingTokens();
  
  if (remaining.length === 0) {
    console.log('\n=== All tokens validated! Starting new cycle ===');
    await saveProgress({ validatedTokens: [], lastUpdate: new Date().toISOString() });
    const newCheck = await getRemainingTokens();
    if (newCheck.remaining.length === 0) {
      console.log('No trusted tokens found to validate');
      return;
    }
    return validateNextToken();
  }
  
  const tokenSymbol = remaining[0];
  console.log(`\n[${validated + 1}/${total}] Validating: ${tokenSymbol}`);
  console.log(`Remaining: ${remaining.length} tokens`);
  console.log(`Time: ${new Date().toISOString()}`);
  
  const validation = await validateToken(tokenSymbol);
  
  if (validation.error) {
    console.log(`❌ ERROR: ${tokenSymbol} - ${validation.error}`);
  } else if (!validation.isValid) {
    console.log(`⚠️  INVALID: ${tokenSymbol} - Should not be trusted!`);
    console.log(`   Status returned: ${validation.response.status}`);
  } else {
    console.log(`✅ VALID: ${tokenSymbol}`);
  }
  
  const progress = await loadProgress();
  progress.validatedTokens.push(tokenSymbol);
  progress.lastUpdate = new Date().toISOString();
  await saveProgress(progress);
}

// Initial load function
async function initializeCron() {
  console.log('\n=== Initializing Trusted Tokens Validation ===');
  const { remaining, total, validated } = await getRemainingTokens();
  console.log(`Total trusted tokens: ${total}`);
  console.log(`Already validated: ${validated}`);
  console.log(`Remaining to validate: ${remaining.length}`);
  console.log('Will validate one token per minute\n');
}

// Schedule cron job to run every minute
const cronJob = cron.schedule('* * * * *', async () => {
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