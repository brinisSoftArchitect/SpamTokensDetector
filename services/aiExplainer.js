// services/aiExplainer.js - AI explanation service
const axios = require('axios');

class AIExplainer {
  async explainSpamReason(tokenData, ownershipAnalysis, spamScore) {
    try {
      const prompt = this.buildPrompt(tokenData, ownershipAnalysis, spamScore);
      const explanation = await this.getAIResponse(prompt);
      return explanation || this.getFallbackExplanation(tokenData, ownershipAnalysis, spamScore);
    } catch (error) {
      console.error('AI explainer error:', error.message);
      return this.getFallbackExplanation(tokenData, ownershipAnalysis, spamScore);
    }
  }

  buildPrompt(tokenData, ownershipAnalysis, spamScore) {
    return `Analyze this token and explain in ONE line why it might be spam:
    Token: ${tokenData.name} (${tokenData.symbol})
    Top owner holds: ${ownershipAnalysis.topOwnerPercentage}%
    Listed on: ${tokenData.exchanges?.length || 0} exchanges
    Verified: ${tokenData.verified}
    Spam Score: ${spamScore}/100
    Give a brief, clear explanation.`;
  }

  async getAIResponse(prompt) {
    try {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 100,
          temperature: 0.7
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );
      return response.data?.choices?.[0]?.message?.content?.trim();
    } catch (error) {
      if (error.response?.status === 401) {
        console.warn('OpenAI API key not configured or invalid');
      }
      return null;
    }
  }

  getFallbackExplanation(tokenData, ownershipAnalysis, spamScore) {
    if (ownershipAnalysis.topOwnerPercentage > 70) {
      return `High concentration risk: Top wallet holds ${ownershipAnalysis.topOwnerPercentage.toFixed(1)}% of supply, suggesting potential pump-and-dump scheme.`;
    }
    if (!tokenData.exchanges || tokenData.exchanges.length === 0) {
      return 'No major exchange listings detected, indicating limited liquidity and potential exit scam risk.';
    }
    if (!tokenData.verified) {
      return 'Unverified token with suspicious ownership distribution, commonly associated with rug pulls.';
    }
    if (spamScore >= 60) {
      return 'Multiple red flags detected including concentrated ownership and lack of legitimate exchange presence.';
    }
    return 'Token shows normal distribution patterns with reasonable exchange presence and verified status.';
  }
}

module.exports = new AIExplainer();