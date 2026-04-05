import React from 'react';
import { motion } from 'motion/react';
import { BookOpen, CheckCircle2, XCircle, AlertCircle, HelpCircle, ExternalLink, Globe, Clock, ShieldCheck } from 'lucide-react';
import { KnowledgeBaseResult } from '../types';

interface KnowledgeBaseCardProps {
  result: KnowledgeBaseResult;
}

export const KnowledgeBaseCard: React.FC<KnowledgeBaseCardProps> = ({ result }) => {
  const getStatusColor = () => {
    switch (result.status) {
      case 'supported': return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
      case 'contradicted': return 'text-rose-400 bg-rose-400/10 border-rose-400/20';
      case 'partially supported': return 'text-amber-400 bg-amber-400/10 border-amber-400/20';
      default: return 'text-slate-400 bg-slate-400/10 border-slate-400/20';
    }
  };

  const getStatusIcon = () => {
    switch (result.status) {
      case 'supported': return <CheckCircle2 className="w-5 h-5" />;
      case 'contradicted': return <XCircle className="w-5 h-5" />;
      case 'partially supported': return <AlertCircle className="w-5 h-5" />;
      default: return <HelpCircle className="w-5 h-5" />;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 overflow-hidden relative group"
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <h3 className="text-lg font-bold text-white tracking-tight">Knowledge Cross-Check</h3>
        </div>
        <div className={`px-3 py-1 rounded-full border text-xs font-bold uppercase tracking-wider flex items-center gap-2 ${getStatusColor()}`}>
          {getStatusIcon()}
          {result.supportLevel}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-6">
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Subject</p>
              <p className="text-white font-medium text-sm">{result.matchedEntity}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Claim Type</p>
              <p className="text-indigo-400 font-medium text-sm capitalize">{result.claimType?.replace('/', ' / ')}</p>
            </div>
          </div>

          {result.visualDescription && (
            <div className="p-3 bg-slate-950/30 rounded-lg border border-slate-800/50 space-y-3">
              <div>
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Visual Evidence</p>
                <p className="text-slate-300 text-xs italic">"{result.visualDescription}"</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[8px] font-bold text-slate-600 uppercase tracking-widest mb-1">Detected Objects</p>
                  <div className="flex flex-wrap gap-1">
                    {result.detectedObjects?.map((obj, i) => (
                      <span key={i} className="px-1.5 py-0.5 bg-slate-800 rounded text-[9px] text-slate-400">{obj}</span>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[8px] font-bold text-slate-600 uppercase tracking-widest mb-1">Entities</p>
                  <div className="flex flex-wrap gap-1">
                    {result.detectedEntities?.map((ent, i) => (
                      <span key={i} className="px-1.5 py-0.5 bg-indigo-500/10 text-indigo-400 rounded text-[9px]">{ent}</span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-slate-800/50">
                <div className="flex items-center gap-2">
                  <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">Strength</span>
                  <span className={`text-[9px] font-bold uppercase ${
                    result.recognitionStrength === 'strong' ? 'text-emerald-400' :
                    result.recognitionStrength === 'medium' ? 'text-amber-400' : 'text-rose-400'
                  }`}>{result.recognitionStrength}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">Visual Conf.</span>
                  <span className="text-[9px] font-mono text-white">{result.visualConfidence}%</span>
                </div>
              </div>
            </div>
          )}

          {result.claimedValue && (
            <div className="grid grid-cols-2 gap-4 p-3 bg-slate-950/30 rounded-lg border border-slate-800/50">
              <div>
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Claimed Value</p>
                <p className="text-rose-400 font-mono text-xs truncate">{result.claimedValue}</p>
              </div>
              <div>
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Evidence Value</p>
                <p className="text-emerald-400 font-mono text-xs truncate">{result.actualValue || 'N/A'}</p>
              </div>
            </div>
          )}

          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
              <Globe className="w-3 h-3" />
              Sources Used
            </p>
            <div className="flex flex-wrap gap-2">
              {result.sources && result.sources.length > 0 ? (
                result.sources.map((s, i) => (
                  <a 
                    key={i}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-2 py-1 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 rounded text-[10px] text-slate-300 transition-colors"
                  >
                    {s.name}
                    <ExternalLink className="w-2.5 h-2.5 opacity-50" />
                  </a>
                ))
              ) : (
                <span className="text-slate-400 text-xs">{result.source}</span>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
              <ShieldCheck className="w-3 h-3 text-indigo-400" />
              Engine Confidence
            </p>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${result.confidence}%` }}
                  className={`h-full transition-all duration-1000 ${
                    result.confidence > 80 ? 'bg-emerald-500' : 
                    result.confidence > 50 ? 'bg-amber-500' : 'bg-rose-500'
                  }`}
                />
              </div>
              <span className="text-white font-mono text-xs">{result.confidence}%</span>
            </div>
          </div>

          {result.freshness && (
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1 flex items-center gap-2">
                <Clock className="w-3 h-3" />
                Evidence Freshness
              </p>
              <p className="text-slate-300 text-xs">{result.freshness}</p>
            </div>
          )}
        </div>
      </div>

      <div className="bg-slate-950/50 rounded-xl p-4 border border-slate-800/50 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500/30" />
        <p className="text-slate-300 text-sm leading-relaxed">
          {result.explanation}
        </p>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[9px] text-slate-600 uppercase font-bold tracking-tighter">
          <AlertCircle className="w-3 h-3" />
          <span>Multi-source cross-check engine • Real-time verification</span>
        </div>
        <div className="text-[9px] text-slate-500 font-mono">
          V2.0-CROSSCHECK
        </div>
      </div>
    </motion.div>
  );
};
