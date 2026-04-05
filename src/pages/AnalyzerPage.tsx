import React, { useState } from 'react';
import { UploadZone } from '../components/UploadZone';
import { ResultCard } from '../components/ResultCard';
import { KnowledgeBaseCard } from '../components/KnowledgeBaseCard';
import { analyzeContent } from '../services/analysisService';
import { AnalysisResult } from '../types';
import { motion, AnimatePresence } from 'motion/react';

export const AnalyzerPage = () => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  const handleUpload = async (type: AnalysisResult['type'], data: any) => {
    setIsAnalyzing(true);
    setResult(null);
    try {
      const analysisResult = await analyzeContent(type, data);
      setResult(analysisResult);
    } catch (error) {
      console.error('Analysis failed:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="pt-24 pb-20 px-6 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <div className="mb-12 text-center">
          <h1 className="text-4xl font-black text-white tracking-tight mb-3">Content Analyzer</h1>
          <p className="text-gray-400">Verify authenticity and context using our advanced detection engine.</p>
        </div>

        <AnimatePresence mode="wait">
          {!result ? (
            <motion.div
              key="upload"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <UploadZone onUpload={handleUpload} isAnalyzing={isAnalyzing} />
            </motion.div>
          ) : (
            <motion.div
              key="result"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-8"
            >
              <ResultCard result={result} onReset={() => setResult(null)} />
              {result.knowledgeBase && (
                <KnowledgeBaseCard result={result.knowledgeBase} />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
