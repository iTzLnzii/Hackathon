import { AnalysisResult, VerificationStatus, RiskLevel, HeuristicAnalysis, SignalCategories } from '../types';
import { KnowledgeBaseService } from './knowledgeBaseService';
import { AuthenticityService, AuthenticityAnalysisResult } from './authenticityService';

export const analyzeContent = async (
  type: AnalysisResult['type'],
  data: any
): Promise<AnalysisResult> => {
  try {
    console.log(`[AnalysisService] Starting rule-based reasoning analysis for type: ${type}`);

    // ── Strict type-based routing ──────────────────────────────────────────
    const isTextOnly        = type === 'text';
    const isCaptionCheck    = type === 'caption-check';
    const isVideo           = type === 'video';
    const isAudio           = type === 'audio';
    const isStandaloneMedia = type === 'image' || isVideo || isAudio;

    // ── Raw inputs ────────────────────────────────────────────────────────
    let imageInput = data.image || (!isTextOnly ? data.fileUrl || data.media : null) || null;

    // For text-only: combine the claim + optional context into the verification string
    let textForVerification = '';
    if (isTextOnly) {
      textForVerification = data.text || '';
    } else if (isCaptionCheck) {
      // Build a rich claim string from caption + optional media description
      const captionPart = data.caption ? `CAPTION: "${data.caption}"` : '';
      const mediaPart   = data.mediaDescription ? `\n\nMEDIA DESCRIPTION (what the image/media shows): "${data.mediaDescription}"` : '';
      textForVerification = captionPart + mediaPart;
      // If no real image, treat the media description as textual context only
      if (!imageInput && data.mediaDescription && !data.caption) {
        textForVerification = data.mediaDescription;
      }
    }

    // Legacy: isMediaWithCaption stays false for text-only to avoid cross-activation
    const isMediaWithCaption = isCaptionCheck && (imageInput || data.mediaDescription);

    let preprocessedBase64 = '';
    let heuristic: HeuristicAnalysis | undefined;

    // Preprocessing (Backend) - skip for audio
    if (imageInput && !isAudio) {
      console.log(`[AnalysisService] Preprocessing media...`);
      const preResponse = await fetch('/api/preprocess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageInput })
      });
      if (preResponse.ok) {
        const preData = await preResponse.json();
        preprocessedBase64 = preData.base64;
        heuristic = preData.heuristic;
      }
    }

    // 2. Module Activation & Signal Extraction
    let kbResult: any = null;
    let authResult: any = null;

    const tasks: Promise<any>[] = [];

    // ── Knowledge Base (fact-check) activation ───────────────────────────
    if (isTextOnly && textForVerification) {
      // Pure text fact-check — no image passed
      tasks.push(
        KnowledgeBaseService.verifyClaim(textForVerification, undefined)
          .then(res => { kbResult = res; })
      );
    } else if (isCaptionCheck && textForVerification) {
      // Caption check — pass image if available so KB can also check visual alignment
      tasks.push(
        KnowledgeBaseService.verifyClaim(textForVerification, preprocessedBase64 || undefined)
          .then(res => { kbResult = res; })
      );
    }

    // ── Authenticity (media forensics) activation ─────────────────────────
    if (isStandaloneMedia || (isCaptionCheck && imageInput)) {
      if (isAudio) {
        tasks.push(AuthenticityService.analyzeAudio(imageInput).then(res => { authResult = res; }));
      } else {
        tasks.push(AuthenticityService.analyzeAuthenticity(preprocessedBase64, heuristic).then(res => { authResult = res; }));
      }
    }

    await Promise.all(tasks);

    // Alias for downstream rules (keeps max compatiblity with existing logic)
    const caption = textForVerification;

    // 3. Signal Normalization (Reasoning Inputs)
    const signals: SignalCategories = {
      authenticity:         authResult ? authResult.realismScore                                                                 : (isTextOnly ? 100 : 100),
      visualStrength:       kbResult?.visualConfidence ?? (authResult ? 70 : (isTextOnly ? 100 : 0)),
      consistency:          kbResult ? (kbResult.status === 'supported' ? 100 : kbResult.status === 'partially supported' ? 60 : 0) : 100,
      knowledgeConsistency: kbResult ? kbResult.confidence                                                                       : 100,
      sufficiency:          (authResult && authResult.confidence > 25) || (kbResult && kbResult.confidence >= 30) ? 80 : 20
    };

    // 4. Rule-Based Decision Engine (Reasoning)
    let verdict: VerificationStatus = 'Uncertain';
    let confidence = 50;
    let reason = "Insufficient evidence to provide a definitive verdict.";
    let dominantSignal = "sufficiency";

    const claimSummary = caption ? `The input claims: "${caption.substring(0, 100)}${caption.length > 100 ? '...' : ''}"` : "The input is a standalone media file with no specific claim.";

    // RULE 1: Strong contradiction (visual or factual)
    if (kbResult?.status === 'contradicted') {
      verdict = 'Contradicted';
      confidence = Math.max(75, kbResult.confidence);
      reason = `A strong factual contradiction was detected. While the input claims one thing, verified knowledge sources confirm a different reality: ${kbResult.explanation}`;
      dominantSignal = "knowledgeConsistency";
    }
    // RULE 2: Strong AI-generation signals
    else if (authResult && (authResult.verdict === 'Likely AI-generated' || authResult.aiLikelihood > 75)) {
      verdict = 'AI-generated';
      confidence = Math.max(80, authResult.confidence);
      reason = `The system detected strong forensic evidence of AI generation. ${authResult.explanation}`;
      dominantSignal = "authenticity";
    }
    else if (authResult && authResult.verdict === 'Suspicious') {
      verdict = 'Suspicious';
      confidence = 65;
      reason = `The media contains suspicious patterns or anomalies that suggest manipulation or synthetic origin. ${authResult.explanation}`;
      dominantSignal = "authenticity";
    }
    // RULE 3: Caption/Image misinformation check
    else if (isCaptionCheck) {
      const hasImage = !!imageInput;
      // Use kbResult.status directly — do NOT rely on signals.consistency
      // which maps 'not enough information' -> 0 and blocks legitimate results
      const kbContradicts = kbResult?.status === 'contradicted';
      const kbSupports    = kbResult?.status === 'supported';
      const kbPartial     = kbResult?.status === 'partially supported';
      const kbNoInfo      = !kbResult || kbResult?.status === 'not enough information';
      const hasStrongVisual = kbResult?.recognitionStrength === 'strong' || (kbResult?.visualConfidence ?? 0) >= 80;
      const imageAuthentic  = signals.authenticity > 65;  // lower threshold — real photos rarely score < 65

      if (kbContradicts) {
        // KB found a clear contradiction → misleading caption
        verdict        = 'False context';
        confidence     = Math.max(75, kbResult.confidence);
        reason         = `The caption misrepresents what the image/media actually shows. ${kbResult.explanation}`;
        dominantSignal = 'knowledgeConsistency';
      } else if (hasImage && kbSupports && hasStrongVisual && imageAuthentic) {
        // Strong visual confirmation + KB agrees
        verdict        = 'Verified';
        confidence     = Math.min(95, Math.max(85, kbResult.confidence));
        reason         = `The caption accurately represents the image with strong visual confirmation. ${kbResult.explanation}`;
        dominantSignal = 'consistency';
      } else if (hasImage && (kbSupports || kbPartial) && imageAuthentic) {
        // KB confirmed or partially confirmed + image is authentic
        verdict        = 'Likely';
        confidence     = Math.max(60, kbResult?.confidence ?? 60);
        reason         = `The caption likely represents the image accurately. ${kbResult?.explanation ?? ''}`;
        dominantSignal = 'consistency';
      } else if (hasImage && kbNoInfo && imageAuthentic) {
        // Image is real and authentic, but KB could not independently confirm the identity/claim.
        // We MUST NOT approve this, because a fake caption might be applied to a real ambiguous image.
        verdict        = 'Uncertain';
        confidence     = 45;
        reason         = `The image appears to be authentic, but the specific identity or claim in the caption could not be independently verified. Try providing more context or a clearer image.`;
        dominantSignal = 'authenticity';
      } else if (!hasImage && kbResult) {
        // Text-only caption check (no image uploaded, only description)
        if (kbSupports) {
          verdict    = 'Likely';
          confidence = Math.max(60, kbResult.confidence);
          reason     = `Based on the provided description, the caption appears consistent. ${kbResult.explanation}`;
        } else if (kbPartial) {
          verdict    = 'Uncertain';
          confidence = 50;
          reason     = `The caption partially aligns with the described media but contains unverified elements. ${kbResult.explanation}`;
        } else {
          verdict    = 'Uncertain';
          confidence = 40;
          reason     = `Could not fully verify the relationship between the caption and the described media. ${kbResult?.explanation ?? ''}`;
        }
        dominantSignal = 'knowledgeConsistency';
      } else {
        verdict        = 'Uncertain';
        confidence     = 35;
        reason         = 'Caption alignment could not be verified. Try uploading a clearer image or providing a more specific caption.';
        dominantSignal = 'visualStrength';
      }
    }
    // RULE 4: Standalone media
    else if (isStandaloneMedia) {
      const hasStrongMedia = (kbResult?.recognitionStrength === 'strong' || signals.visualStrength > 80) || isAudio;
      const hasStrongMatch = (signals.consistency > 80 && signals.knowledgeConsistency > 80);
      const isAuthentic    = (signals.authenticity > 85);

      if (hasStrongMedia && hasStrongMatch && isAuthentic) {
        verdict       = 'Verified';
        confidence    = 90;
        reason        = 'The media appears authentic with no major anomalies detected.';
        dominantSignal = 'consistency';
      } else if (signals.authenticity > 70 && signals.consistency > 60) {
        verdict       = 'Likely';
        confidence    = authResult?.confidence ?? 0;
        reason        = 'The media appears authentic and generally aligns with known facts, though some minor details remain unconfirmed.';
        dominantSignal = 'consistency';
      }
    }
    // ── Rule: Text-Only Verification (Exclusive — no media) ──
    else if (isTextOnly) {
      const kbStatus = kbResult.status;
      if (kbStatus === 'supported' && kbResult.confidence > 85) {
        verdict = 'Verified';
        confidence = 95;
        reason = `The credibility assessment confirms this statement against high-authority sources. ${kbResult.explanation}`;
        dominantSignal = "knowledgeConsistency";
      } else if (kbStatus === 'supported') {
        verdict = 'Likely';
        confidence = Math.max(70, kbResult.confidence);
        reason = `Factual accuracy is high, though minor contextual nuances may require additional primary sources. ${kbResult.explanation}`;
        dominantSignal = "knowledgeConsistency";
      } else if (kbStatus === 'partially supported') {
        verdict = 'Uncertain';
        confidence = 55;
        reason = `The report indicates a mix of verifiable facts and unsubstantiated claims. ${kbResult.explanation}`;
        dominantSignal = "knowledgeConsistency";
      } else if (kbStatus === 'contradicted') {
        verdict = 'Contradicted';
        confidence = Math.max(85, kbResult.confidence);
        reason = `Credibility analysis has flagged this statement as factually incorrect or critically misleading. ${kbResult.explanation}`;
        dominantSignal = "knowledgeConsistency";
      } else {
        verdict = 'Unsupported';
        confidence = 30;
        reason = `No credible records could be found in scientific or official databases to verify this specific claim. ${kbResult.explanation}`;
        dominantSignal = "knowledgeConsistency";
      }
    }


    
    // ERROR BUBBLING: Show actual backend crashes in the UI instead of falling through to Rule 5
    if (authResult?.verdict === 'Analysis Failed') {
      verdict = 'Uncertain';
      confidence = 0;
      reason = `[System Error] ${authResult.explanation || 'Backend audio/image analysis module failed'}.`;
      dominantSignal = "authenticity";
    }
    // RULE 5: Final fallback for low-confidence results
    else if (signals.sufficiency < 35 && verdict !== 'Contradicted' && verdict !== 'AI-generated' && verdict !== 'Verified') {
      verdict = 'Uncertain';
      confidence = Math.max(confidence, 35);
      reason = kbResult?.explanation || "The evidence gathered is too limited to reach a definitive conclusion. The system could not find strong enough signals to support or contradict the claim with high confidence.";
      dominantSignal = "sufficiency";
    }

    // Video specific rule: If no media processed
    if (isVideo && !preprocessedBase64) {
      verdict = 'Uncertain';
      confidence = 30;
      reason = "No frames could be extracted from the video for analysis, making verification impossible.";
    }

    // 5. Final Result Construction
    const analysisSignals: any[] = [];
    if (authResult?.anomalies) {
      authResult.anomalies.forEach((a: string) => analysisSignals.push({
        id: Math.random().toString(36).substring(7),
        label: a,
        type: 'negative' as const,
        description: a
      }));
    }
    if (kbResult?.explanation) {
      analysisSignals.push({
        id: 'kb-signal',
        label: kbResult.status === 'supported' ? 'Factual Support' : 'Factual Check',
        type: kbResult.status === 'supported' ? 'positive' : kbResult.status === 'contradicted' ? 'negative' : 'neutral',
        description: kbResult.explanation
      });
    }

    const detailedReasoning = `
      ${claimSummary}
      
      CORE VALIDATION METRICS:
      - Reliability / Authenticity: ${isTextOnly ? confidence : signals.authenticity}%
      - Evidence Coverage: ${signals.sufficiency}%
      - Context Alignment: ${signals.consistency}%
      - Fact-Check Strength: ${signals.knowledgeConsistency}%
      
      VERIFICATION LOGIC:
      The verdict "${verdict}" was determined based on ${dominantSignal} analysis. 
      Result: ${reason}
    `.trim();

    return {
      id: Math.random().toString(36).substring(7),
      timestamp: Date.now(),
      type,
      status: verdict as VerificationStatus,
      confidence: confidence,
      scores: {
        authenticity: isTextOnly ? confidence : signals.authenticity,
        consistency: isTextOnly ? confidence : signals.consistency,
        credibility: signals.knowledgeConsistency,
        sufficiency: signals.sufficiency,
        knowledgeBase: signals.knowledgeConsistency,
        realism: authResult?.realismScore ?? 100,
        aiLikelihood: authResult?.aiLikelihood ?? 0
      },
      knowledgeBase: kbResult,
      explanation: reason,
      detailedReasoning: detailedReasoning,
      uncertainties: signals.sufficiency < 50 ? ["Low evidence volume", "Ambiguous visual markers"] : [],
      signals: analysisSignals,
      riskLevel: (verdict === 'Verified' || verdict === 'Likely') ? 'Low' : verdict === 'Uncertain' ? 'Medium' : 'High',
      recommendedAction: getRecommendation(verdict),
      metadata: data
    };
  } catch (error) {
    console.error('Analysis failed:', error);
    throw error;
  }
};

const getRecommendation = (status: VerificationStatus): string => {
  switch (status) {
    case 'Verified': return "Safe to use as a primary source.";
    case 'Likely': return "Generally reliable, but verify critical details.";
    case 'False context': return "Do not share. Media is real but context is misleading.";
    case 'Contradicted': return "Factual contradiction detected. Do not share.";
    case 'AI-generated': return "Synthetic media detected. Label as AI if used.";
    case 'Suspicious': return "Verify with independent sources.";
    case 'Uncertain': return "Insufficient evidence. Perform manual check.";
    default: return "Manual verification required.";
  }
};
