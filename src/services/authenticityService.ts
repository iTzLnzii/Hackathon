import { GoogleGenAI, Type } from "@google/genai";
import { HeuristicAnalysis } from "../types";

export interface AuthenticityAnalysisResult {
  realismScore: number; // 0-100
  aiLikelihood: number; // 0-100
  anomalies: string[];
  explanation: string;
  verdict: 'Likely Real' | 'Uncertain' | 'Suspicious' | 'Likely AI-generated' | 'Analysis Failed';
  confidence: number;
}

export class AuthenticityService {
  private static getAI() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;
    return new GoogleGenAI({ apiKey });
  }

  static async analyzeAuthenticity(imageBase64: string, heuristicFallback?: HeuristicAnalysis): Promise<AuthenticityAnalysisResult> {
    console.log(`[AuthenticityService] Starting image authenticity analysis (Frontend)...`);
    
    if (!imageBase64 || imageBase64.length < 10) {
      console.warn(`[AuthenticityService] No valid image data provided for deep analysis.`);
      return heuristicFallback ? this.fromHeuristic(heuristicFallback) : this.getFailedResult("No image data provided");
    }

    const ai = this.getAI();
    if (!ai) {
      console.warn(`[AuthenticityService] Gemini API key missing. Falling back to heuristic analysis.`);
      return heuristicFallback ? this.fromHeuristic(heuristicFallback) : this.getFailedResult("AI not available and no heuristic provided");
    }

    try {
      const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
      console.log(`[AuthenticityService] Calling Gemini for deep analysis. Image data length: ${base64Data.length} chars.`);
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{
          parts: [
            {
              inlineData: {
                data: base64Data,
                mimeType: "image/jpeg"
              }
            },
            {
              text: `Perform a rigorous forensic analysis of this image to detect AI-generation artifacts, specifically focusing on "too perfect" portrait patterns.
              
              1. Evaluate these Synthetic Portrait Signals:
              - Overly perfect facial symmetry (unnatural balance)
              - Unrealistically smooth skin or plastic-like texture (lack of pores/blemishes)
              - Overly glossy or "glassy" eyes with unrealistic catchlights
              - Unnaturally consistent or stylized lighting (studio-perfect blending with no falloff)
              - Excessive softness or lack of natural camera sensor noise/grain
              - Decorative elements (flowers, jewelry) blended too perfectly into skin/hair
              - Hair strands that look artificially rendered or "spaghetti-like"
              - Lack of realistic asymmetry, micro-imperfections, or natural skin variations
              
              2. Cumulative Suspicion Scoring:
              - Do not treat signals in isolation. If multiple signals (e.g., symmetry + smooth skin + perfect hair) cluster together, the AI-likelihood must increase SHARPLY.
              - Clustering of "unrealistic perfection" is a strong indicator of synthetic origin.
              
              3. Verdict & Confidence Rules:
              - If 3 or more strong synthetic signals are present: Do NOT return "Uncertain". Return "Likely AI-generated" or "AI-generated".
              - If 5 or more strong signals are present: Confidence MUST be high (75-95%).
              - Weak/Mixed signals: Confidence 35-55%.
              - Moderate synthetic evidence: Confidence 55-75%.
              - Strong synthetic evidence: Confidence 75-95%.
              
              4. Explanation Requirements:
              - Explicitly mention the strongest visual reasons for the verdict.
              - Example: "This portrait shows unusually perfect facial symmetry, extremely smooth skin, and stylized lighting patterns consistent with AI-generated imagery."
              
              5. Strict Portrait Rule:
              - If the image is a close-up human portrait and shows at least 4 strong synthetic realism anomalies, the result CANNOT remain "Uncertain" and AI-likelihood CANNOT be below 70.
              
              6. Safeguard:
              - Do not mark every attractive portrait as fake. Look for the *absence* of natural biological and optical imperfections.
              
              Return a JSON object with:
              - realismScore: (0-100) - Lower if synthetic
              - aiLikelihood: (0-100) - Higher if synthetic
              - anomalies: List of specific detected visual anomalies
              - explanation: Detailed forensic explanation
              - verdict: One of ['Likely Real', 'Uncertain', 'Suspicious', 'Likely AI-generated']
              - confidence: (0-100) based on the evidence strength rules above
              - isPortrait: boolean - true if the image is a close-up human portrait
              `
            }
          ]
        }],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              realismScore: { type: Type.NUMBER },
              aiLikelihood: { type: Type.NUMBER },
              anomalies: { type: Type.ARRAY, items: { type: Type.STRING } },
              explanation: { type: Type.STRING },
              verdict: { type: Type.STRING },
              confidence: { type: Type.NUMBER },
              isPortrait: { type: Type.BOOLEAN }
            },
            required: ["realismScore", "aiLikelihood", "anomalies", "explanation", "verdict", "confidence", "isPortrait"]
          }
        }
      });

      const result = JSON.parse(response.text);
      
      // Post-processing reinforcement for "Uncertain" results that should be stronger
      if (result.verdict === 'Uncertain' && result.aiLikelihood > 60) {
        result.verdict = 'Suspicious';
      }
      
      // Strict Portrait Rule Enforcement
      if (result.isPortrait && result.anomalies.length >= 4) {
        if (result.verdict === 'Uncertain') {
          result.verdict = 'Suspicious';
        }
        if (result.aiLikelihood < 70) {
          result.aiLikelihood = 70;
          result.realismScore = Math.min(result.realismScore, 30);
        }
      }

      if (result.verdict === 'Suspicious' && result.anomalies.length >= 3) {
        result.verdict = 'Likely AI-generated';
        result.confidence = Math.max(result.confidence, 65);
      }

      console.log(`[AuthenticityService] Deep analysis complete. Verdict: ${result.verdict}, Confidence: ${result.confidence}%`);
      return result;
    } catch (error) {
      console.error('[AuthenticityService] Deep analysis failed:', error);
      if (heuristicFallback) {
        console.warn(`[AuthenticityService] Falling back to heuristic analysis due to API error.`);
        return this.fromHeuristic(heuristicFallback);
      }
      return this.getFailedResult(error instanceof Error ? error.message : "Deep analysis failed");
    }
  }

  static async analyzeAudio(audioBase64: string): Promise<AuthenticityAnalysisResult> {
    console.log(`[AuthenticityService] Sending audio to backend for analysis...`);
    try {
      const response = await fetch('/api/analyze-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioData: audioBase64 })
      });
      let data;
      if (!response.ok) {
        try { data = await response.json(); } catch(e) {}
        throw new Error(data?.error || `Server threw error ${response.status}`);
      }
      data = await response.json();
      

      
      // Map backend extension response to internal Authenticity types
      return {
        realismScore: data.trustScore,
        aiLikelihood: 100 - data.trustScore,
        anomalies: data.signals || [],
        explanation: data.explanation,
        verdict: data.verdict === 'Suspicious' ? 'Suspicious' :
                 data.verdict === 'Verified' ? 'Likely Real' : 
                 data.verdict === 'Uncertain' ? 'Uncertain' : 'Likely AI-generated',
        confidence: data.confidence
      };
    } catch (e) {
      console.error(e);
      return this.getFailedResult(e instanceof Error ? e.message : 'Unknown error');
    }
  }

  private static getFailedResult(reason: string): AuthenticityAnalysisResult {
    return {
      realismScore: 0,
      aiLikelihood: 0,
      anomalies: ["Analysis failed"],
      explanation: `Analysis could not be completed: ${reason}`,
      verdict: 'Analysis Failed',
      confidence: 0
    };
  }

  private static fromHeuristic(heuristic: HeuristicAnalysis): AuthenticityAnalysisResult {
    let verdict: AuthenticityAnalysisResult['verdict'] = 'Uncertain';
    if (heuristic.realismScore < 40) verdict = 'Likely AI-generated';
    else if (heuristic.realismScore < 70) verdict = 'Suspicious';
    else if (heuristic.realismScore > 85) verdict = 'Likely Real';

    return {
      realismScore: heuristic.realismScore,
      aiLikelihood: 100 - heuristic.realismScore,
      anomalies: heuristic.anomalies,
      explanation: `Heuristic Analysis: ${heuristic.explanation}`,
      verdict,
      confidence: 40 // Lower confidence for heuristics
    };
  }
}
