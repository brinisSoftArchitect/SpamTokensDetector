// services/tokenAnalyzer.js - Main token analysis service
const cmcService = require('./cmcService');
const coingeckoService = require('./coingeckoService');
const blockchainService = require('./blockchainService');
const aiExplainer = require('./aiExplainer');
const spamDetector = require('./spamDetector');
const aiRiskAnalyzer = require('./aiRiskAnalyzer');

class TokenAnalyzer {
  async analyzeToken(contractAddress, network) {
    try {
      const [cmcData, coingeckoData, blockchainData] = await Promise.allSettled([
        cmcService.getTokenInfo(contractAddress, network),
        coingeckoService.getTokenInfo(contractAddress, network),
        blockchainService.getTokenDetails(contractAddress, network)
      ]);

      const tokenData = this.mergeTokenData(
        cmcData.status === 'fulfilled' ? cmcData.value : null,
        coingeckoData.status === 'fulfilled' ? coingeckoData.value : null,
        blockchainData.status === 'fulfilled' ? blockchainData.value : null
      );

      const ownershipAnalysis = this.analyzeOwnership(tokenData);
      const spamAnalysis = spamDetector.calculateSpamScore(tokenData, ownershipAnalysis);
      const spamScore = spamAnalysis.score;
      const aiExplanation = await aiExplainer.explainSpamReason(tokenData, ownershipAnalysis, spamScore);

      const scamAssessment = this.assessScamProbability(tokenData, ownershipAnalysis, spamScore, spamAnalysis);
      const gapHunterRisk = this.calculateGapHunterRisk(tokenData, ownershipAnalysis, spamScore, spamAnalysis.risk);
      
      const completeAnalysis = {
        token: {
          name: tokenData.name,
          symbol: tokenData.symbol,
          contractAddress,
          network,
          verified: tokenData.verified
        },
        holderConcentration: {
          top1Percentage: ownershipAnalysis.topOwnerPercentage,
          top1Address: ownershipAnalysis.topOwnerAddress,
          top1Label: ownershipAnalysis.topOwnerLabel,
          top1IsExchange: ownershipAnalysis.isExchange,
          top10Percentage: ownershipAnalysis.top10Percentage,
          rugPullRisk: ownershipAnalysis.top10Percentage > 70
        },
        marketData: {
          marketCapRaw: tokenData.marketCap,
          volume24hRaw: tokenData.volume24h,
          volumeToMarketCapRatio: tokenData.volumeToMarketCapRatio
        },
        ownershipAnalysis,
        scamAssessment,
        exchanges: tokenData.exchanges || [],
        spamScore,
        riskLevel: spamAnalysis.risk
      };
      
      console.log('\n=== Calling AI Risk Analyzer ===');
      const aiRiskScore = aiRiskAnalyzer.analyzeToken(completeAnalysis);
      console.log('AI Risk Score returned:', JSON.stringify(aiRiskScore, null, 2));
      
      console.log('\n=== Building Response with AI Risk Score ===');
      console.log('AI Score Object:', aiRiskScore);
      console.log('AI Score Value:', aiRiskScore?.score);

      const gapHunterBotRiskResponse = {
        riskPercentage: gapHunterRisk.riskPercentage,
        shouldSkip: gapHunterRisk.shouldSkip,
        hardSkip: gapHunterRisk.hardSkip,
        hardSkipReasons: gapHunterRisk.hardSkipReasons,
        components: gapHunterRisk.components,
        recommendation: gapHunterRisk.recommendation,
        AIriskScore: aiRiskScore
      };

      console.log('Final gapHunterBotRisk:', JSON.stringify(gapHunterBotRiskResponse, null, 2));

      return {
        gapHunterBotRisk: gapHunterBotRiskResponse,
        isSpam: spamScore >= 60,
        spamScore,
        riskLevel: spamAnalysis.risk,
        reasons: spamAnalysis.reasons,
        scamAssessment: scamAssessment,
        token: {
          name: tokenData.name,
          symbol: tokenData.symbol,
          contractAddress,
          network,
          verified: tokenData.verified
        },
        holderConcentration: {
          top1Percentage: ownershipAnalysis.topOwnerPercentage,
          top1Address: ownershipAnalysis.topOwnerAddress,
          top1Label: ownershipAnalysis.topOwnerLabel,
          top1IsExchange: ownershipAnalysis.isExchange,
          top10Percentage: ownershipAnalysis.top10Percentage,
          rugPullRisk: ownershipAnalysis.top10Percentage > 70,
          concentrationLevel: this.getConcentrationLevel(ownershipAnalysis)
        },
        marketData: {
          marketCap: tokenData.marketCap ? `${tokenData.marketCap.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : null,
          marketCapRaw: tokenData.marketCap,
          volume24h: tokenData.volume24h ? `${tokenData.volume24h.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : null,
          volume24hRaw: tokenData.volume24h,
          volumeToMarketCapRatio: tokenData.volumeToMarketCapRatio,
          volumeToMarketCapPercentage: tokenData.volumeToMarketCapRatio ? `${(tokenData.volumeToMarketCapRatio * 100).toFixed(2)}%` : null,
          priceChange24h: tokenData.priceChange24h ? `${tokenData.priceChange24h.toFixed(2)}%` : null,
          currentPrice: tokenData.currentPrice ? `${tokenData.currentPrice}` : null,
          liquidityRisk: this.assessLiquidityRisk(tokenData),
          volumeAnomalyDetected: this.detectVolumeAnomaly(tokenData)
        },
        exchanges: tokenData.exchanges || [],
        ownershipAnalysis,
        holdersSourceUrl: blockchainData.status === 'fulfilled' ? blockchainData.value?.holdersSourceUrl : null,
        aiExplanation,
        dataSources: {
          coinMarketCap: cmcData.status === 'fulfilled',
          coinGecko: coingeckoData.status === 'fulfilled',
          blockchain: blockchainData.status === 'fulfilled'
        }
      };
    } catch (error) {
      throw new Error(`Token analysis failed: ${error.message}`);
    }
  }

  mergeTokenData(cmcData, coingeckoData, blockchainData) {
    const marketCap = cmcData?.marketCap || coingeckoData?.marketCap;
    const volume24h = cmcData?.volume24h || coingeckoData?.volume24h;
    const volumeToMarketCapRatio = (marketCap && volume24h) ? (volume24h / marketCap) : null;
    
    return {
      name: cmcData?.name || coingeckoData?.name || blockchainData?.name || 'Unknown',
      symbol: cmcData?.symbol || coingeckoData?.symbol || blockchainData?.symbol || 'UNKNOWN',
      exchanges: this.mergeExchanges(cmcData, coingeckoData),
      holders: blockchainData?.holders || [],
      totalSupply: blockchainData?.totalSupply || cmcData?.totalSupply || coingeckoData?.totalSupply,
      marketCap: marketCap,
      volume24h: volume24h,
      volumeToMarketCapRatio: volumeToMarketCapRatio,
      priceChange24h: cmcData?.priceChange24h || coingeckoData?.priceChange24h,
      currentPrice: cmcData?.currentPrice || coingeckoData?.currentPrice,
      liquidity: blockchainData?.liquidity,
      creatorAddress: blockchainData?.creatorAddress,
      verified: cmcData?.verified || coingeckoData?.verified || false
    };
  }

  mergeExchanges(cmcData, coingeckoData) {
    const exchanges = new Set();
    if (cmcData?.exchanges) cmcData.exchanges.forEach(ex => exchanges.add(ex));
    if (coingeckoData?.exchanges) coingeckoData.exchanges.forEach(ex => exchanges.add(ex));
    return Array.from(exchanges);
  }

  analyzeOwnership(tokenData) {
    if (!tokenData.holders || tokenData.holders.length === 0) {
      return {
        topOwnerPercentage: 0,
        topOwnerAddress: null,
        topOwnerLabel: null,
        isExchange: false,
        concentrated: false,
        top10Percentage: 0
      };
    }

    const topHolder = tokenData.holders[0];

    return {
      topOwnerPercentage: topHolder.percentage || 0,
      topOwnerAddress: topHolder.address,
      topOwnerLabel: topHolder.label || null,
      isExchange: topHolder.isExchange || false,
      concentrated: topHolder.percentage > 50,
      top10Percentage: tokenData.holders.slice(0, 10).reduce((sum, h) => sum + (h.percentage || 0), 0)
    };
  }

  getConcentrationLevel(ownershipAnalysis) {
    const top10 = ownershipAnalysis.top10Percentage;
    if (top10 > 95) return 'EXTREME';
    if (top10 > 85) return 'VERY_HIGH';
    if (top10 > 70) return 'HIGH';
    if (top10 > 50) return 'MODERATE';
    return 'NORMAL';
  }

  assessLiquidityRisk(tokenData) {
    if (!tokenData.marketCap) return 'UNKNOWN';
    if (tokenData.marketCap < 10000) return 'CRITICAL';
    if (tokenData.marketCap < 50000) return 'VERY_HIGH';
    if (tokenData.marketCap < 100000) return 'HIGH';
    if (tokenData.marketCap < 500000) return 'MODERATE';
    if (tokenData.marketCap < 1000000) return 'LOW';
    return 'MINIMAL';
  }

  detectVolumeAnomaly(tokenData) {
    if (!tokenData.volumeToMarketCapRatio) return false;
    if (tokenData.volumeToMarketCapRatio > 2) return true;
    if (tokenData.volumeToMarketCapRatio < 0.001 && tokenData.marketCap > 10000) return true;
    return false;
  }

  assessVolumeLiquidity(volumeToMarketCapRatio) {
    if (!volumeToMarketCapRatio) return { status: 'UNKNOWN', emoji: '❓', description: 'No volume data available' };
    
    const percentageRaw = volumeToMarketCapRatio * 100;
    
    if (percentageRaw > 500) {
      return { 
        status: 'SUSPICIOUS', 
        emoji: '🚨', 
        description: 'Possible wash trading - abnormally high volume',
        percentage: percentageRaw.toFixed(2)
      };
    } else if (percentageRaw >= 50 && percentageRaw <= 300) {
      return { 
        status: 'GOOD', 
        emoji: '✅', 
        description: 'Good tradable liquidity',
        percentage: percentageRaw.toFixed(2)
      };
    } else if (percentageRaw >= 20 && percentageRaw < 50) {
      return { 
        status: 'CAUTION', 
        emoji: '⚠️', 
        description: 'Ok but exercise caution',
        percentage: percentageRaw.toFixed(2)
      };
    } else if (percentageRaw >= 15 && percentageRaw < 20) {
      return { 
        status: 'LOW_LIQUIDITY', 
        emoji: '💤', 
        description: 'Low liquidity',
        percentage: percentageRaw.toFixed(2)
      };
    } else if (percentageRaw >= 10 && percentageRaw < 15) {
      return { 
        status: 'TOO_DEAD', 
        emoji: '💤', 
        description: 'Too dead/illiquid',
        percentage: percentageRaw.toFixed(2)
      };
    } else {
      return { 
        status: 'AUTO_SKIP', 
        emoji: '🛑', 
        description: 'Auto-skip - extremely illiquid',
        percentage: percentageRaw.toFixed(2)
      };
    }
  }

  clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  calculateGapHunterRisk(tokenData, ownershipAnalysis, globalSpamScore, riskLevel) {
    const top10Percentage = ownershipAnalysis.top10Percentage || 0;
    const marketCap = tokenData.marketCap || 0;
    const volumeToMarketCapRatio = tokenData.volumeToMarketCapRatio || 0;
    const verified = tokenData.verified || false;
    const volMcapPercentage = volumeToMarketCapRatio * 100;

    let H = 0;
    if (top10Percentage >= 90) {
      H = 100;
    } else if (top10Percentage >= 70) {
      H = 80;
    } else if (top10Percentage >= 50) {
      H = 50;
    } else if (top10Percentage >= 40) {
      H = 30;
    } else {
      H = 0;
    }

    const U = verified ? 0 : 100;

    let M = 0;
    if (marketCap < 50000) {
      M = 100;
    } else if (marketCap < 100000) {
      M = 80;
    } else if (marketCap < 500000) {
      M = 60;
    } else if (marketCap < 1000000) {
      M = 40;
    } else if (marketCap < 10000000) {
      M = 20;
    } else {
      M = 0;
    }

    let V = 0;
    if (volMcapPercentage >= 50 && volMcapPercentage <= 300) {
      V = 0;
    } else {
      V = this.clamp(Math.abs(volMcapPercentage - 175) / 175 * 100, 0, 100);
    }

    let P = 0;
    if (riskLevel === 'MINIMAL') P = 0;
    else if (riskLevel === 'LOW') P = 25;
    else if (riskLevel === 'MEDIUM') P = 50;
    else if (riskLevel === 'HIGH') P = 75;
    else if (riskLevel === 'CRITICAL') P = 100;
    else P = this.clamp(globalSpamScore, 0, 100);

    const riskPercentage = (
      0.35 * H +
      0.20 * U +
      0.20 * M +
      0.15 * V +
      0.10 * P
    );

    const shouldSkip = riskPercentage >= 60;

    const hardSkipReasons = [];
    let hardSkip = false;

    if (top10Percentage >= 70) {
      hardSkip = true;
      hardSkipReasons.push('Top 10 holders ≥70%');
    }

    if (['HIGH', 'CRITICAL'].includes(riskLevel)) {
      hardSkip = true;
      hardSkipReasons.push(`Risk level is ${riskLevel}`);
    }

    if (!verified && top10Percentage >= 55) {
      hardSkip = true;
      hardSkipReasons.push('Unverified contract AND Top 10 ≥55%');
    }

    return {
      riskPercentage: parseFloat(riskPercentage.toFixed(2)),
      shouldSkip: shouldSkip,
      hardSkip: hardSkip,
      hardSkipReasons: hardSkipReasons,
      components: {
        H: { value: parseFloat(H.toFixed(2)), weight: '35%', description: 'Holder concentration' },
        U: { value: parseFloat(U.toFixed(2)), weight: '20%', description: 'Unverified contract' },
        M: { value: parseFloat(M.toFixed(2)), weight: '20%', description: 'Microcap risk' },
        V: { value: parseFloat(V.toFixed(2)), weight: '15%', description: 'Volume/MarketCap anomaly' },
        P: { value: parseFloat(P.toFixed(2)), weight: '10%', description: 'Platform spam flags' }
      },
      recommendation: hardSkip ? '🛑 HARD SKIP - Do not trade' : 
                       shouldSkip ? '🚫 SKIP - High risk for gap bot' : 
                       riskPercentage >= 40 ? '⚠️ CAUTION - Risky trade' : 
                       '✅ ACCEPTABLE for gap bot'
    };
  }

  assessScamProbability(tokenData, ownershipAnalysis, spamScore, spamAnalysis) {
    const redFlags = [];
    const greenFlags = [];
    let scamScore = 0;

    if (ownershipAnalysis.top10Percentage > 70) {
      scamScore += 25;
      redFlags.push(`🐳 Top 10 holders control ${ownershipAnalysis.top10Percentage.toFixed(2)}% (Rug-pull risk)`);
    }

    if (ownershipAnalysis.topOwnerPercentage > 50 && !ownershipAnalysis.isExchange) {
      scamScore += 20;
      redFlags.push(`🚨 Single wallet holds ${ownershipAnalysis.topOwnerPercentage.toFixed(2)}% (Not an exchange)`);
    }

    if (!tokenData.verified) {
      scamScore += 15;
      redFlags.push('❌ Contract not verified (Harder to audit)');
    } else {
      greenFlags.push('✅ Contract verified on explorer');
    }

    if (!tokenData.marketCap || tokenData.marketCap < 50000) {
      scamScore += 15;
      redFlags.push(`💧 Very low market cap (${tokenData.marketCap ? tokenData.marketCap.toLocaleString() : '0'}) - Easy to manipulate`);
    } else if (tokenData.marketCap > 1000000) {
      greenFlags.push(`💰 Decent market cap (${tokenData.marketCap.toLocaleString()})`);
    }

    if (tokenData.volumeToMarketCapRatio !== null) {
      if (tokenData.volumeToMarketCapRatio > 2) {
        scamScore += 20;
        redFlags.push(`📊 Abnormal volume/mcap ratio (${(tokenData.volumeToMarketCapRatio * 100).toFixed(1)}%) - Potential wash trading`);
      } else if (tokenData.volumeToMarketCapRatio < 0.001 && tokenData.marketCap > 10000) {
        scamScore += 10;
        redFlags.push('📉 Extremely low trading volume - Potential dead token');
      } else if (tokenData.volumeToMarketCapRatio >= 0.01 && tokenData.volumeToMarketCapRatio <= 0.5) {
        greenFlags.push(`📊 Healthy volume/mcap ratio (${(tokenData.volumeToMarketCapRatio * 100).toFixed(1)}%)`);
      }
    }

    if (tokenData.exchanges && tokenData.exchanges.length === 0) {
      scamScore += 15;
      redFlags.push('🚫 No exchange listings found');
    } else if (tokenData.exchanges && tokenData.exchanges.length >= 3) {
      greenFlags.push(`✅ Listed on ${tokenData.exchanges.length} exchanges`);
    }

    if (ownershipAnalysis.isExchange) {
      scamScore -= 15;
      greenFlags.push(`🏦 Top holder is exchange: ${ownershipAnalysis.topOwnerLabel || 'Confirmed'}`);
    }

    scamScore = Math.max(0, Math.min(100, scamScore));

    let verdict = 'LIKELY_SAFE';
    let confidence = 'MEDIUM';

    if (scamScore >= 80) {
      verdict = 'LIKELY_SCAM';
      confidence = 'VERY_HIGH';
    } else if (scamScore >= 65) {
      verdict = 'LIKELY_SCAM';
      confidence = 'HIGH';
    } else if (scamScore >= 50) {
      verdict = 'HIGH_RISK';
      confidence = 'HIGH';
    } else if (scamScore >= 35) {
      verdict = 'MODERATE_RISK';
      confidence = 'HIGH';
    } else if (scamScore >= 20) {
      verdict = 'LOW_RISK';
      confidence = 'MEDIUM';
    } else {
      verdict = 'LIKELY_SAFE';
      confidence = greenFlags.length >= 3 ? 'HIGH' : 'MEDIUM';
    }

    return {
      scamScore: scamScore,
      verdict: verdict,
      confidence: confidence,
      redFlags: redFlags,
      greenFlags: greenFlags,
      summary: this.generateScamSummary(verdict, scamScore, redFlags.length, greenFlags.length)
    };
  }

  generateScamSummary(verdict, score, redFlagCount, greenFlagCount) {
    if (verdict === 'LIKELY_SCAM') {
      return `🚨 LIKELY SCAM - Scam Score: ${score}/100. ${redFlagCount} critical red flags detected. DO NOT INVEST - Exercise extreme caution.`;
    } else if (verdict === 'HIGH_RISK') {
      return `⚠️ HIGH RISK - Scam Score: ${score}/100. ${redFlagCount} major concerns identified. NOT RECOMMENDED for investment.`;
    } else if (verdict === 'MODERATE_RISK') {
      return `⚡ MODERATE RISK - Scam Score: ${score}/100. ${redFlagCount} concerns present. Proceed with extreme caution and DYOR.`;
    } else if (verdict === 'LOW_RISK') {
      return `✓ LOW RISK - Scam Score: ${score}/100. Token shows acceptable indicators but still do your research.`;
    } else {
      return `✅ LIKELY SAFE - Scam Score: ${score}/100. ${greenFlagCount} positive indicators found. Appears legitimate.`;
    }
  }

  calculateAIRiskScoreOld(tokenData, ownershipAnalysis, spamScore, spamAnalysis, scamAssessment) {
    let aiScore = 0;
    const factors = [];
    
    const top10 = ownershipAnalysis.top10Percentage || 0;
    const top1 = ownershipAnalysis.topOwnerPercentage || 0;
    const marketCap = tokenData.marketCap || 0;
    const volume = tokenData.volume24h || 0;
    const volumeRatio = tokenData.volumeToMarketCapRatio || 0;
    const verified = tokenData.verified || false;
    const exchanges = tokenData.exchanges?.length || 0;
    
    if (top10 >= 95) {
      aiScore += 35;
      factors.push({ factor: 'Extreme holder concentration (≥95%)', impact: 35, severity: 'CRITICAL' });
    } else if (top10 >= 80) {
      aiScore += 25;
      factors.push({ factor: 'Very high holder concentration (≥80%)', impact: 25, severity: 'HIGH' });
    } else if (top10 >= 70) {
      aiScore += 18;
      factors.push({ factor: 'High holder concentration (≥70%)', impact: 18, severity: 'MEDIUM' });
    } else if (top10 >= 50) {
      aiScore += 10;
      factors.push({ factor: 'Moderate holder concentration (≥50%)', impact: 10, severity: 'LOW' });
    }
    
    if (!verified) {
      if (top10 >= 60) {
        aiScore += 25;
        factors.push({ factor: 'Unverified + high concentration', impact: 25, severity: 'CRITICAL' });
      } else {
        aiScore += 12;
        factors.push({ factor: 'Contract not verified', impact: 12, severity: 'MEDIUM' });
      }
    }
    
    if (marketCap < 10000) {
      aiScore += 30;
      factors.push({ factor: 'Extremely low market cap (<$10k)', impact: 30, severity: 'CRITICAL' });
    } else if (marketCap < 50000) {
      aiScore += 20;
      factors.push({ factor: 'Very low market cap (<$50k)', impact: 20, severity: 'HIGH' });
    } else if (marketCap < 100000) {
      aiScore += 12;
      factors.push({ factor: 'Low market cap (<$100k)', impact: 12, severity: 'MEDIUM' });
    } else if (marketCap < 500000) {
      aiScore += 6;
      factors.push({ factor: 'Small market cap (<$500k)', impact: 6, severity: 'LOW' });
    }
    
    const volMcapPercent = volumeRatio * 100;
    if (volMcapPercent > 500) {
      aiScore += 20;
      factors.push({ factor: 'Suspicious volume/mcap ratio (>500%)', impact: 20, severity: 'CRITICAL' });
    } else if (volMcapPercent < 0.1 && marketCap > 50000) {
      aiScore += 15;
      factors.push({ factor: 'Extremely low volume (<0.1%)', impact: 15, severity: 'HIGH' });
    } else if (volMcapPercent < 1 && marketCap > 100000) {
      aiScore += 8;
      factors.push({ factor: 'Low trading volume (<1%)', impact: 8, severity: 'MEDIUM' });
    }
    
    if (exchanges === 0) {
      aiScore += 15;
      factors.push({ factor: 'No exchange listings found', impact: 15, severity: 'HIGH' });
    } else if (exchanges === 1) {
      aiScore += 8;
      factors.push({ factor: 'Only 1 exchange listing', impact: 8, severity: 'MEDIUM' });
    } else if (exchanges >= 10) {
      aiScore -= 10;
      factors.push({ factor: `Listed on ${exchanges} exchanges`, impact: -10, severity: 'POSITIVE' });
    }
    
    if (ownershipAnalysis.isExchange && top1 > 30) {
      aiScore -= 15;
      factors.push({ factor: 'Top holder is exchange', impact: -15, severity: 'POSITIVE' });
    }
    
    if (marketCap > 10000000 && verified && exchanges >= 5) {
      aiScore -= 15;
      factors.push({ factor: 'Established token (>$10M, verified, 5+ exchanges)', impact: -15, severity: 'POSITIVE' });
    }
    
    aiScore = Math.max(0, Math.min(100, aiScore));
    
    let aiVerdict = '';
    let aiRecommendation = '';
    
    if (aiScore >= 80) {
      aiVerdict = 'EXTREME_RISK';
      aiRecommendation = '🚨 AVOID - AI detects extreme risk signals';
    } else if (aiScore >= 65) {
      aiVerdict = 'VERY_HIGH_RISK';
      aiRecommendation = '🛑 DO NOT TRADE - Very high risk detected';
    } else if (aiScore >= 50) {
      aiVerdict = 'HIGH_RISK';
      aiRecommendation = '⚠️ HIGH RISK - Not recommended for trading';
    } else if (aiScore >= 35) {
      aiVerdict = 'MODERATE_RISK';
      aiRecommendation = '⚡ MODERATE RISK - Trade with extreme caution';
    } else if (aiScore >= 20) {
      aiVerdict = 'LOW_RISK';
      aiRecommendation = '✓ LOW RISK - Acceptable but monitor closely';
    } else {
      aiVerdict = 'MINIMAL_RISK';
      aiRecommendation = '✅ MINIMAL RISK - Good indicators present';
    }
    
    return {
      score: parseFloat(aiScore.toFixed(2)),
      verdict: aiVerdict,
      recommendation: aiRecommendation,
      confidence: factors.length >= 3 ? 'HIGH' : factors.length >= 2 ? 'MEDIUM' : 'LOW',
      riskFactors: factors,
      analysis: `AI analyzed ${factors.length} risk factors. ${aiVerdict.replace('_', ' ')} detected with ${factors.filter(f => f.severity === 'CRITICAL' || f.severity === 'HIGH').length} major concerns.`
    };
  }
}

module.exports = new TokenAnalyzer();