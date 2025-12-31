// services/spamDetector.js - Spam detection scoring service

class SpamDetector {
  calculateSpamScore(tokenData, ownershipAnalysis) {
    let score = 0;
    const reasons = [];

    // Ownership concentration check (0-40 points)
    if (ownershipAnalysis.topOwnerPercentage > 80) {
      score += 40;
      reasons.push('Extreme ownership concentration (>80%)');
    } else if (ownershipAnalysis.topOwnerPercentage > 60) {
      score += 30;
      reasons.push('High ownership concentration (>60%)');
    } else if (ownershipAnalysis.topOwnerPercentage > 40) {
      score += 20;
      reasons.push('Moderate ownership concentration (>40%)');
    } else if (ownershipAnalysis.topOwnerPercentage > 25) {
      score += 10;
      reasons.push('Notable ownership concentration (>25%)');
    }

    // Top 10 holders concentration (0-25 points) - INCREASED FROM 15
    if (ownershipAnalysis.top10Percentage > 95) {
      score += 25;
      reasons.push('Top 10 holders control >95% of supply');
    } else if (ownershipAnalysis.top10Percentage > 90) {
      score += 20;
      reasons.push('Top 10 holders control >90% of supply');
    } else if (ownershipAnalysis.top10Percentage > 80) {
      score += 15;
      reasons.push('Top 10 holders control >80% of supply');
    } else if (ownershipAnalysis.top10Percentage > 70) {
      score += 10;
      reasons.push('Top 10 holders control >70% of supply');
    } else if (ownershipAnalysis.top10Percentage > 60) {
      score += 5;
      reasons.push('Top 10 holders control >60% of supply');
    }

    // Exchange listings check (0-25 points)
    const exchangeCount = tokenData.exchanges?.length || 0;
    if (exchangeCount === 0) {
      score += 25;
      reasons.push('No exchange listings found');
    } else if (exchangeCount < 2) {
      score += 15;
      reasons.push('Listed on only one exchange');
    } else if (exchangeCount < 5) {
      score += 5;
      reasons.push('Limited exchange presence');
    }

    // Verification status (0-10 points)
    if (!tokenData.verified) {
      score += 10;
      reasons.push('Token not verified');
    }

    // Market cap check (0-15 points)
    if (!tokenData.marketCap || tokenData.marketCap < 10000) {
      score += 15;
      reasons.push('Very low or no market cap (<$10k)');
    } else if (tokenData.marketCap < 50000) {
      score += 12;
      reasons.push('Extremely low market cap (<$50k)');
    } else if (tokenData.marketCap < 100000) {
      score += 8;
      reasons.push('Very low market cap (<$100k)');
    } else if (tokenData.marketCap < 500000) {
      score += 5;
      reasons.push('Low market cap (<$500k)');
    }

    // Volume to Market Cap ratio check (0-15 points)
    if (tokenData.volumeToMarketCapRatio !== null) {
      if (tokenData.volumeToMarketCapRatio > 2) {
        score += 15;
        reasons.push('Abnormally high volume/mcap ratio (>200%) - potential manipulation');
      } else if (tokenData.volumeToMarketCapRatio < 0.001 && tokenData.marketCap > 10000) {
        score += 10;
        reasons.push('Extremely low trading volume - potential dead token');
      } else if (tokenData.volumeToMarketCapRatio < 0.01 && tokenData.marketCap > 50000) {
        score += 5;
        reasons.push('Very low trading volume');
      }
    }

    // Top owner is exchange (reduce score)
    if (ownershipAnalysis.isExchange) {
      if (ownershipAnalysis.topOwnerPercentage > 50) {
        score -= 15;
        reasons.push(`Top owner is exchange: ${ownershipAnalysis.topOwnerLabel || 'Unknown'} (reduces risk)`);
      } else if (ownershipAnalysis.topOwnerPercentage > 30) {
        score -= 20;
        reasons.push(`Top owner is exchange: ${ownershipAnalysis.topOwnerLabel || 'Unknown'} (reduces risk)`);
      } else {
        score -= 10;
        reasons.push(`Exchange detected: ${ownershipAnalysis.topOwnerLabel || 'Unknown'}`);
      }
    }

    // Ensure score is between 0 and 100
    score = Math.max(0, Math.min(100, score));

    return {
      score,
      reasons,
      risk: this.getRiskLevel(score)
    };
  }

  getRiskLevel(score) {
    if (score >= 80) return 'CRITICAL';
    if (score >= 60) return 'HIGH';
    if (score >= 40) return 'MEDIUM';
    if (score >= 20) return 'LOW';
    return 'MINIMAL';
  }

  isKnownScamPattern(tokenData, ownershipAnalysis) {
    // Honeypot pattern: high concentration + no liquidity
    if (ownershipAnalysis.topOwnerPercentage > 90 && !tokenData.liquidity) {
      return { pattern: 'honeypot', confidence: 'high' };
    }

    // Rug pull pattern: creator holds majority + unverified
    if (
      ownershipAnalysis.topOwnerPercentage > 70 &&
      !tokenData.verified &&
      tokenData.exchanges?.length === 0
    ) {
      return { pattern: 'rug_pull', confidence: 'high' };
    }

    // Pump and dump pattern: extreme concentration + low market cap
    if (
      ownershipAnalysis.concentrated &&
      tokenData.marketCap &&
      tokenData.marketCap < 50000
    ) {
      return { pattern: 'pump_dump', confidence: 'medium' };
    }

    return { pattern: 'none', confidence: 'low' };
  }
}

module.exports = new SpamDetector();