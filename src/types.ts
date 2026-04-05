export type VerificationStatus = 
  | 'Verified' 
  | 'Likely'
  | 'Suspicious' 
  | 'AI-generated' 
  | 'False context' 
  | 'Contradicted'
  | 'Uncertain'
  | 'Unsupported';

export type RiskLevel = 'Low' | 'Medium' | 'High' | 'Critical';

export interface AnalysisSignal {
  id: string;
  label: string;
  type: 'positive' | 'negative' | 'neutral';
  description: string;
}

export interface SignalCategories {
  authenticity: number; // 0-100 (100 = real, 0 = AI/Fake)
  visualStrength: number; // 0-100 (how identifiable/clear)
  consistency: number; // 0-100 (caption vs image match)
  knowledgeConsistency: number; // 0-100 (fact check)
  sufficiency: number; // 0-100 (enough evidence)
}

export interface KnowledgeBaseResult {
  status: 'supported' | 'contradicted' | 'partially supported' | 'not enough information';
  matchedEntity: string;
  claimType: 
    | 'biography' 
    | 'age' 
    | 'role/title' 
    | 'location' 
    | 'nationality' 
    | 'sports affiliation' 
    | 'company fact' 
    | 'historical fact' 
    | 'organization fact' 
    | 'date/time fact' 
    | 'current-event-like factual claim'
    | 'general';
  claimedValue?: string;
  actualValue?: string;
  source: 'Wikipedia' | 'Wikidata' | 'Both' | 'Google Search' | 'Multiple' | 'None';
  sources?: { name: string; url?: string; type: string; confidence: number; freshness?: string }[];
  confidence: number;
  explanation: string;
  supportLevel: 'Supported' | 'Contradicted' | 'Unresolved' | 'Insufficient Evidence';
  freshness?: string;
  visualDescription?: string;
  detectedObjects?: string[];
  detectedEntities?: string[];
  sceneType?: string;
  visualConfidence?: number;
  recognitionStrength?: 'strong' | 'medium' | 'weak';
}

export interface AnalysisResult {
  id: string;
  timestamp: number;
  type: 'image' | 'video' | 'audio' | 'text' | 'caption-check' | 'source';
  status: VerificationStatus;
  confidence: number; // Final Trustworthiness Score
  scores: {
    authenticity: number;
    consistency: number;
    credibility: number;
    sufficiency: number;
    knowledgeBase?: number;
    realism?: number;
    aiLikelihood?: number;
  };
  explanation: string; // Short summary
  detailedReasoning: string; // Forensic-style breakdown
  uncertainties: string[]; // What remains unverified
  signals: AnalysisSignal[];
  riskLevel: RiskLevel;
  recommendedAction: string;
  metadata: {
    fileName?: string;
    fileUrl?: string;
    text?: string;
    caption?: string;
    sourceUrl?: string;
  };
  knowledgeBase?: KnowledgeBaseResult;
}

export interface HeuristicAnalysis {
  realismScore: number;
  anomalies: string[];
  explanation: string;
}

export interface UserSettings {
  theme: 'light' | 'dark' | 'system';
  accentColor: string;
  notifications: boolean;
}
