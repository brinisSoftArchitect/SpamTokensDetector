// services/aiRiskAnalyzer.js - AI-powered comprehensive risk analysis

class AIRiskAnalyzer {
  analyzeToken(analysisData) {
    const tokenInfo = analysisData.token || {};
    const marketData = analysisData.marketData || {};
    const ownershipAnalysis = analysisData.ownershipAnalysis || {};
    const holderConcentration = analysisData.holderConcentration || {};
    const scamAssessment = analysisData.scamAssessment || {};
    const exchanges = analysisData.exchanges || [];
    const spamScore = analysisData.spamScore || 0;
    const riskLevel = analysisData.riskLevel || 'UNKNOWN';
    
    let aiScore = 0;
    const factors = [];
    const criticalIssues = [];
    const warnings = [];
    const positives = [];
    
    const top10 = holderConcentration.top10Percentage || ownershipAnalysis.top10Percentage || 0;
    const top1 = holderConcentration.top1Percentage || ownershipAnalysis.topOwnerPercentage || 0;
    const marketCap = marketData.marketCapRaw || 0;
    const volume = marketData.volume24hRaw || 0;
    const volumeRatio = marketData.volumeToMarketCapRatio || 0;
    const verified = tokenInfo.verified || false;
    const exchangeCount = exchanges.length;
    const isExchange = holderConcentration.top1IsExchange || ownershipAnalysis.isExchange || false;
    const volMcapPercent = volumeRatio * 100;
    
    console.log('\n=== AI Risk Analysis ===');
    console.log('Input data:', {
      top10, top1, marketCap, volume, verified, exchangeCount, isExchange
    });
    
    if (top10 >= 95) {
      aiScore += 40;
      criticalIssues.push('🚨 Extreme holder concentration: Top 10 holders control ' + top10.toFixed(2) + '%');
      factors.push({ factor: 'Extreme concentration (≥95%)', impact: 40, severity: 'CRITICAL', value: top10 });
    } else if (top10 >= 85) {
      aiScore += 30;
      criticalIssues.push('⚠️ Very high concentration: Top 10 holders control ' + top10.toFixed(2) + '%');
      factors.push({ factor: 'Very high concentration (≥85%)', impact: 30, severity: 'CRITICAL', value: top10 });
    } else if (top10 >= 70) {
      aiScore += 22;
      warnings.push('⚠️ High concentration: Top 10 holders control ' + top10.toFixed(2) + '%');
      factors.push({ factor: 'High concentration (≥70%)', impact: 22, severity: 'HIGH', value: top10 });
    } else if (top10 >= 50) {
      aiScore += 12;
      warnings.push('⚡ Moderate concentration: Top 10 holders control ' + top10.toFixed(2) + '%');
      factors.push({ factor: 'Moderate concentration (≥50%)', impact: 12, severity: 'MEDIUM', value: top10 });
    } else if (top10 < 30) {
      aiScore -= 10;
      positives.push('✅ Good distribution: Top 10 holders control only ' + top10.toFixed(2) + '%');
      factors.push({ factor: 'Good distribution (<30%)', impact: -10, severity: 'POSITIVE', value: top10 });
    }
    
    if (top1 >= 50 && !isExchange) {
      aiScore += 25;
      criticalIssues.push('🚨 Single wallet dominance: ' + top1.toFixed(2) + '% (Not an exchange)');
      factors.push({ factor: 'Single wallet >50% (non-exchange)', impact: 25, severity: 'CRITICAL', value: top1 });
    } else if (top1 >= 30 && !isExchange) {
      aiScore += 15;
      warnings.push('⚠️ Large single holder: ' + top1.toFixed(2) + '% (Not an exchange)');
      factors.push({ factor: 'Large single holder >30%', impact: 15, severity: 'HIGH', value: top1 });
    }
    
    if (!verified) {
      if (top10 >= 70) {
        aiScore += 28;
        criticalIssues.push('🚨 Unverified contract + high concentration = Extreme rug pull risk');
        factors.push({ factor: 'Unverified + high concentration', impact: 28, severity: 'CRITICAL' });
      } else if (top10 >= 50) {
        aiScore += 18;
        warnings.push('⚠️ Unverified contract with moderate concentration');
        factors.push({ factor: 'Unverified + moderate concentration', impact: 18, severity: 'HIGH' });
      } else {
        aiScore += 10;
        warnings.push('⚡ Contract not verified on explorer');
        factors.push({ factor: 'Contract not verified', impact: 10, severity: 'MEDIUM' });
      }
    } else {
      positives.push('✅ Contract verified on blockchain explorer');
      factors.push({ factor: 'Contract verified', impact: 0, severity: 'POSITIVE' });
    }
    
    if (marketCap < 5000) {
      aiScore += 35;
      criticalIssues.push('🚨 Extremely low market cap: $' + marketCap.toLocaleString() + ' - Easy to manipulate');
      factors.push({ factor: 'Extremely low mcap (<$5k)', impact: 35, severity: 'CRITICAL', value: marketCap });
    } else if (marketCap < 25000) {
      aiScore += 28;
      criticalIssues.push('🚨 Very low market cap: $' + marketCap.toLocaleString());
      factors.push({ factor: 'Very low mcap (<$25k)', impact: 28, severity: 'CRITICAL', value: marketCap });
    } else if (marketCap < 50000) {
      aiScore += 20;
      warnings.push('⚠️ Low market cap: $' + marketCap.toLocaleString());
      factors.push({ factor: 'Low mcap (<$50k)', impact: 20, severity: 'HIGH', value: marketCap });
    } else if (marketCap < 100000) {
      aiScore += 14;
      warnings.push('⚡ Small market cap: $' + marketCap.toLocaleString());
      factors.push({ factor: 'Small mcap (<$100k)', impact: 14, severity: 'MEDIUM', value: marketCap });
    } else if (marketCap < 500000) {
      aiScore += 8;
      factors.push({ factor: 'Microcap (<$500k)', impact: 8, severity: 'LOW', value: marketCap });
    } else if (marketCap > 10000000) {
      aiScore -= 12;
      positives.push('✅ Substantial market cap: $' + marketCap.toLocaleString());
      factors.push({ factor: 'Large mcap (>$10M)', impact: -12, severity: 'POSITIVE', value: marketCap });
    } else if (marketCap > 1000000) {
      aiScore -= 5;
      positives.push('✅ Decent market cap: $' + marketCap.toLocaleString());
      factors.push({ factor: 'Good mcap (>$1M)', impact: -5, severity: 'POSITIVE', value: marketCap });
    }
    
    if (volMcapPercent > 500) {
      aiScore += 25;
      criticalIssues.push('🚨 Suspicious volume: ' + volMcapPercent.toFixed(1) + '% of mcap - Possible wash trading');
      factors.push({ factor: 'Abnormal volume (>500%)', impact: 25, severity: 'CRITICAL', value: volMcapPercent });
    } else if (volMcapPercent > 200) {
      aiScore += 15;
      warnings.push('⚠️ Very high volume: ' + volMcapPercent.toFixed(1) + '% of mcap');
      factors.push({ factor: 'Very high volume (>200%)', impact: 15, severity: 'HIGH', value: volMcapPercent });
    } else if (volMcapPercent < 0.1 && marketCap > 50000) {
      aiScore += 18;
      warnings.push('⚠️ Extremely low volume: ' + volMcapPercent.toFixed(2) + '% - Dead token risk');
      factors.push({ factor: 'Extremely low volume (<0.1%)', impact: 18, severity: 'HIGH', value: volMcapPercent });
    } else if (volMcapPercent < 0.5 && marketCap > 100000) {
      aiScore += 12;
      warnings.push('⚡ Very low trading volume: ' + volMcapPercent.toFixed(2) + '%');
      factors.push({ factor: 'Very low volume (<0.5%)', impact: 12, severity: 'MEDIUM', value: volMcapPercent });
    } else if (volMcapPercent < 2 && marketCap > 500000) {
      aiScore += 6;
      factors.push({ factor: 'Low volume (<2%)', impact: 6, severity: 'LOW', value: volMcapPercent });
    } else if (volMcapPercent >= 10 && volMcapPercent <= 100) {
      aiScore -= 8;
      positives.push('✅ Healthy volume: ' + volMcapPercent.toFixed(1) + '% of market cap');
      factors.push({ factor: 'Healthy volume (10-100%)', impact: -8, severity: 'POSITIVE', value: volMcapPercent });
    } else if (volMcapPercent >= 5 && volMcapPercent < 10) {
      aiScore -= 5;
      positives.push('✅ Good volume: ' + volMcapPercent.toFixed(1) + '% of market cap');
      factors.push({ factor: 'Good volume (5-10%)', impact: -5, severity: 'POSITIVE', value: volMcapPercent });
    }
    
    if (exchangeCount === 0) {
      aiScore += 20;
      criticalIssues.push('🚨 No exchange listings found');
      factors.push({ factor: 'No exchange listings', impact: 20, severity: 'CRITICAL', value: 0 });
    } else if (exchangeCount === 1) {
      aiScore += 12;
      warnings.push('⚠️ Only listed on 1 exchange');
      factors.push({ factor: 'Single exchange listing', impact: 12, severity: 'HIGH', value: 1 });
    } else if (exchangeCount === 2) {
      aiScore += 6;
      factors.push({ factor: 'Limited listings (2)', impact: 6, severity: 'MEDIUM', value: 2 });
    } else if (exchangeCount >= 10) {
      aiScore -= 12;
      positives.push('✅ Listed on ' + exchangeCount + ' exchanges');
      factors.push({ factor: 'Many exchanges (≥10)', impact: -12, severity: 'POSITIVE', value: exchangeCount });
    } else if (exchangeCount >= 5) {
      aiScore -= 8;
      positives.push('✅ Listed on ' + exchangeCount + ' exchanges');
      factors.push({ factor: 'Good listings (≥5)', impact: -8, severity: 'POSITIVE', value: exchangeCount });
    }
    
    if (isExchange && top1 > 20) {
      aiScore -= 15;
      positives.push('✅ Top holder is a known exchange (' + top1.toFixed(2) + '%)');
      factors.push({ factor: 'Top holder is exchange', impact: -15, severity: 'POSITIVE' });
    }
    
    if (holderConcentration.rugPullRisk || (top10 >= 70 && !verified)) {
      aiScore += 15;
      criticalIssues.push('🚨 HIGH RUG PULL RISK detected');
      factors.push({ factor: 'Rug pull risk indicators', impact: 15, severity: 'CRITICAL' });
    }
    
    if (scamAssessment && scamAssessment.scamScore >= 70) {
      aiScore += 12;
      criticalIssues.push('🚨 High scam score: ' + scamAssessment.scamScore + '/100');
      factors.push({ factor: 'High scam assessment score', impact: 12, severity: 'CRITICAL', value: scamAssessment.scamScore });
    }
    
    aiScore = Math.max(0, Math.min(100, aiScore));
    
    let aiVerdict = '';
    let aiRecommendation = '';
    let tradingAdvice = '';
    
    if (aiScore >= 85) {
      aiVerdict = 'EXTREME_DANGER';
      aiRecommendation = '🚨 EXTREME DANGER - DO NOT TRADE UNDER ANY CIRCUMSTANCES';
      tradingAdvice = 'This token shows multiple critical red flags indicating an extremely high probability of being a scam or rug pull. Avoid completely.';
    } else if (aiScore >= 70) {
      aiVerdict = 'VERY_HIGH_RISK';
      aiRecommendation = '🛑 VERY HIGH RISK - Strongly NOT recommended';
      tradingAdvice = 'Multiple severe risk factors detected. This token is highly likely to result in loss of funds. Do not trade.';
    } else if (aiScore >= 55) {
      aiVerdict = 'HIGH_RISK';
      aiRecommendation = '⚠️ HIGH RISK - Not recommended for trading';
      tradingAdvice = 'Significant risk factors present. Only trade with money you can afford to lose completely. High chance of rug pull or abandonment.';
    } else if (aiScore >= 40) {
      aiVerdict = 'MODERATE_RISK';
      aiRecommendation = '⚡ MODERATE RISK - Proceed with extreme caution';
      tradingAdvice = 'Several concerning factors identified. If trading, use very small position sizes and set tight stop losses. Monitor closely.';
    } else if (aiScore >= 25) {
      aiVerdict = 'LOW_MODERATE_RISK';
      aiRecommendation = '⚠️ LOW-MODERATE RISK - Acceptable but monitor closely';
      tradingAdvice = 'Some minor concerns but overall acceptable risk profile. Use reasonable position sizing and proper risk management.';
    } else if (aiScore >= 15) {
      aiVerdict = 'LOW_RISK';
      aiRecommendation = '✓ LOW RISK - Generally safe for trading';
      tradingAdvice = 'Token shows mostly positive indicators with minimal red flags. Standard trading precautions apply.';
    } else {
      aiVerdict = 'MINIMAL_RISK';
      aiRecommendation = '✅ MINIMAL RISK - Good safety profile';
      tradingAdvice = 'Token demonstrates strong fundamentals and safety indicators. Suitable for normal trading with standard risk management.';
    }
    
    const confidence = factors.length >= 5 ? 'VERY_HIGH' : 
                       factors.length >= 4 ? 'HIGH' : 
                       factors.length >= 3 ? 'MEDIUM' : 'LOW';
    
    console.log('AI Analysis complete:', {
      score: aiScore,
      verdict: aiVerdict,
      criticalIssues: criticalIssues.length,
      warnings: warnings.length,
      positives: positives.length
    });
    
    return {
      score: parseFloat(aiScore.toFixed(2)),
      verdict: aiVerdict,
      recommendation: aiRecommendation,
      tradingAdvice: tradingAdvice,
      confidence: confidence,
      criticalIssues: criticalIssues,
      warnings: warnings,
      positiveFactors: positives,
      detailedFactors: factors,
      factorCount: factors.length,
      analysis: `AI analyzed ${factors.length} risk factors across holder concentration, market metrics, and exchange presence. ${aiVerdict.replace(/_/g, ' ')} detected with ${criticalIssues.length} critical issues, ${warnings.length} warnings, and ${positives.length} positive factors.`
    };
  }

  analyzeNativeToken(marketData, exchanges, symbol) {
    const factors = [];
    let aiScore = 0;
    const warnings = [];
    const positives = [];
    
    const marketCap = marketData.marketCapRaw || 0;
    const volume = marketData.volume24hRaw || 0;
    const volumeRatio = (marketCap > 0 && volume > 0) ? (volume / marketCap) : 0;
    const volMcapPercent = volumeRatio * 100;
    const exchangeCount = exchanges.length;
    
    const majorTokens = ['ETH', 'BTC', 'BNB', 'MATIC', 'AVAX', 'FTM', 'SOL', 'ADA', 'DOT', 'LINK'];
    const isMajorToken = majorTokens.includes(symbol.toUpperCase());
    
    if (isMajorToken) {
      return {
        score: 0,
        verdict: 'MINIMAL_RISK',
        recommendation: '✅ EXCELLENT - Major established cryptocurrency',
        tradingAdvice: 'This is a well-established, major cryptocurrency with excellent liquidity and minimal risk for trading.',
        confidence: 'ABSOLUTE',
        criticalIssues: [],
        warnings: [],
        positiveFactors: [
          '✅ Major established blockchain cryptocurrency',
          '✅ Proven track record and security',
          '✅ Maximum liquidity and market depth'
        ],
        detailedFactors: [{ factor: 'Major cryptocurrency', impact: 0, severity: 'EXCELLENT', value: symbol }],
        factorCount: 1,
        analysis: `${symbol} is a major, well-established blockchain cryptocurrency with minimal trading risk.`
      };
    }
    
    if (marketCap < 50000) {
      aiScore += 45;
      warnings.push('⚠️ Very low market cap: $' + marketCap.toLocaleString());
      factors.push({ factor: 'Very low mcap (<$50k)', impact: 45, severity: 'HIGH', value: marketCap });
    } else if (marketCap < 500000) {
      aiScore += 30;
      warnings.push('⚡ Low market cap: $' + marketCap.toLocaleString());
      factors.push({ factor: 'Low mcap (<$500k)', impact: 30, severity: 'MEDIUM', value: marketCap });
    } else if (marketCap < 5000000) {
      aiScore += 18;
      factors.push({ factor: 'Small mcap (<$5M)', impact: 18, severity: 'LOW', value: marketCap });
    } else if (marketCap > 100000000) {
      aiScore -= 15;
      positives.push('✅ Large market cap: $' + marketCap.toLocaleString());
      factors.push({ factor: 'Large mcap (>$100M)', impact: -15, severity: 'POSITIVE', value: marketCap });
    } else if (marketCap > 10000000) {
      aiScore -= 10;
      positives.push('✅ Decent market cap: $' + marketCap.toLocaleString());
      factors.push({ factor: 'Good mcap (>$10M)', impact: -10, severity: 'POSITIVE', value: marketCap });
    }
    
    if (volMcapPercent < 0.2) {
      aiScore += 35;
      warnings.push('⚠️ Extremely low volume: ' + volMcapPercent.toFixed(2) + '%');
      factors.push({ factor: 'Extremely low volume (<0.2%)', impact: 35, severity: 'HIGH', value: volMcapPercent });
    } else if (volMcapPercent < 1) {
      aiScore += 22;
      warnings.push('⚡ Very low volume: ' + volMcapPercent.toFixed(2) + '%');
      factors.push({ factor: 'Very low volume (<1%)', impact: 22, severity: 'MEDIUM', value: volMcapPercent });
    } else if (volMcapPercent < 3) {
      aiScore += 12;
      factors.push({ factor: 'Low volume (<3%)', impact: 12, severity: 'LOW', value: volMcapPercent });
    } else if (volMcapPercent >= 5 && volMcapPercent <= 100) {
      aiScore -= 12;
      positives.push('✅ Healthy volume: ' + volMcapPercent.toFixed(1) + '%');
      factors.push({ factor: 'Healthy volume (5-100%)', impact: -12, severity: 'POSITIVE', value: volMcapPercent });
    } else if (volMcapPercent > 150) {
      aiScore += 18;
      warnings.push('⚠️ Unusually high volume: ' + volMcapPercent.toFixed(1) + '%');
      factors.push({ factor: 'Very high volume (>150%)', impact: 18, severity: 'MEDIUM', value: volMcapPercent });
    }
    
    if (exchangeCount === 0) {
      aiScore += 40;
      warnings.push('⚠️ No exchange listings found');
      factors.push({ factor: 'No exchange listings', impact: 40, severity: 'CRITICAL', value: 0 });
    } else if (exchangeCount === 1) {
      aiScore += 25;
      warnings.push('⚠️ Only 1 exchange listing');
      factors.push({ factor: 'Single exchange', impact: 25, severity: 'HIGH', value: 1 });
    } else if (exchangeCount >= 15) {
      aiScore -= 15;
      positives.push('✅ Listed on ' + exchangeCount + ' exchanges');
      factors.push({ factor: 'Many exchanges (≥15)', impact: -15, severity: 'POSITIVE', value: exchangeCount });
    } else if (exchangeCount >= 8) {
      aiScore -= 10;
      positives.push('✅ Listed on ' + exchangeCount + ' exchanges');
      factors.push({ factor: 'Good listings (≥8)', impact: -10, severity: 'POSITIVE', value: exchangeCount });
    }
    
    aiScore = Math.max(0, Math.min(100, aiScore));
    
    let verdict, recommendation, tradingAdvice;
    
    if (aiScore >= 75) {
      verdict = 'VERY_HIGH_RISK';
      recommendation = '🛑 VERY HIGH RISK - Not recommended';
      tradingAdvice = 'This native token shows very poor liquidity and market indicators. High risk of failed trades and significant slippage.';
    } else if (aiScore >= 55) {
      verdict = 'HIGH_RISK';
      recommendation = '⚠️ HIGH RISK - Proceed with extreme caution';
      tradingAdvice = 'Low liquidity detected. Only trade with very small amounts and expect high slippage.';
    } else if (aiScore >= 35) {
      verdict = 'MODERATE_RISK';
      recommendation = '⚡ MODERATE RISK - Acceptable but risky';
      tradingAdvice = 'Moderate liquidity concerns. Use limit orders and monitor for sudden changes.';
    } else if (aiScore >= 20) {
      verdict = 'LOW_RISK';
      recommendation = '✓ LOW RISK - Decent for trading';
      tradingAdvice = 'Acceptable liquidity for trading. Standard precautions apply.';
    } else {
      verdict = 'MINIMAL_RISK';
      recommendation = '✅ MINIMAL RISK - Good liquidity';
      tradingAdvice = 'Good liquidity and market depth. Suitable for normal trading.';
    }
    
    return {
      score: parseFloat(aiScore.toFixed(2)),
      verdict: verdict,
      recommendation: recommendation,
      tradingAdvice: tradingAdvice,
      confidence: factors.length >= 3 ? 'HIGH' : 'MEDIUM',
      criticalIssues: [],
      warnings: warnings,
      positiveFactors: positives,
      detailedFactors: factors,
      factorCount: factors.length,
      analysis: `AI analyzed ${factors.length} liquidity and market factors for this native token. ${verdict.replace(/_/g, ' ')} detected.`
    };
  }
}

module.exports = new AIRiskAnalyzer();