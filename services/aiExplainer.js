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
        'https://api.deepseek.com/v1/chat/completions',
        {
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 100,
          temperature: 0.7
        },
        {
          headers: {
            'Authorization': 'Bearer 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',
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );
      return response.data?.choices?.[0]?.message?.content?.trim();
    } catch (error) {
      console.log('Free AI service unavailable, using fallback');
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