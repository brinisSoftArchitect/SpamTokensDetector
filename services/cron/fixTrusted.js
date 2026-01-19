const cron = require('node-cron');
const axios = require('axios');

const API_BASE_URL = 'https://antiscam.brimind.pro/api';

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
    const response = await axios.get(`${API_BASE_URL}/check-symbol/${tokenSymbol}`);
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

// Main validation function
async function validateAllTrustedTokens() {
  console.log('\n=== Starting Trusted Tokens Validation ===');
  console.log(`Time: ${new Date().toISOString()}`);
  
  const trustedTokens = await getTrustedTokens();
  
  if (trustedTokens.length === 0) {
    console.log('No trusted tokens found to validate');
    return;
  }
  
  const results = {
    total: trustedTokens.length,
    validated: 0,
    invalid: 0,
    errors: 0,
    invalidTokens: []
  };
  
  // Validate each token with a small delay to avoid overwhelming the API
  for (const tokenSymbol of trustedTokens) {
    const validation = await validateToken(tokenSymbol);
    
    if (validation.error) {
      results.errors++;
      console.log(`❌ ERROR: ${tokenSymbol} - ${validation.error}`);
    } else if (!validation.isValid) {
      results.invalid++;
      results.invalidTokens.push({
        symbol: tokenSymbol,
        validationResponse: validation.response
      });
      console.log(`⚠️  INVALID: ${tokenSymbol} - Should not be trusted!`);
    } else {
      results.validated++;
      console.log(`✅ VALID: ${tokenSymbol}`);
    }
    
    // Small delay between requests (100ms)
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log('\n=== Validation Summary ===');
  console.log(`Total Tokens: ${results.total}`);
  console.log(`Valid: ${results.validated}`);
  console.log(`Invalid: ${results.invalid}`);
  console.log(`Errors: ${results.errors}`);
  
  if (results.invalidTokens.length > 0) {
    console.log('\n⚠️  ATTENTION: The following tokens are marked as trusted but failed validation:');
    results.invalidTokens.forEach(token => {
      console.log(`  - ${token.symbol}`);
    });
  }
  
  console.log('=== Validation Complete ===\n');
}

// Schedule cron job to run every minute
const cronJob = cron.schedule('* * * * *', async () => {
  await validateAllTrustedTokens();
}, {
  scheduled: true,
  timezone: "Africa/Tunis"
});

// Start the cron job
console.log('🔄 Trusted Tokens Validation Cron Job Started');
console.log('📅 Schedule: Every minute');
console.log('🌍 Timezone: Africa/Tunis');
console.log('⏰ Next run:', new Date(Date.now() + 60000).toISOString());

// Run immediately on start
validateAllTrustedTokens();

module.exports = cronJob;