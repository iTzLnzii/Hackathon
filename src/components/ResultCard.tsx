import React from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, AlertTriangle, XCircle, Info, ArrowRight, ShieldCheck, Fingerprint, Activity, FileSearch, HelpCircle, ListChecks, BookOpen } from 'lucide-react';
import { AnalysisResult, VerificationStatus } from '../types';
import { cn } from '../lib/utils';

interface ResultCardProps {
  result: AnalysisResult;
  onReset: () => void;
}

const statusConfig: Record<VerificationStatus, { icon: any, color: string, bg: string, border: string }> = {
  'Verified': { icon: ShieldCheck, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  'Likely': { icon: CheckCircle2, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
  'Suspicious': { icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
  'AI-generated': { icon: Fingerprint, color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20' },
  'False context': { icon: FileSearch, color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20' },
  'Contradicted': { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20' },
  'Uncertain': { icon: HelpCircle, color: 'text-gray-400', bg: 'bg-gray-500/10', border: 'border-gray-500/20' },
  'Unsupported': { icon: Info, color: 'text-slate-400', bg: 'bg-slate-500/10', border: 'border-slate-500/20' },
};

export const ResultCard = ({ result, onReset }: ResultCardProps) => {
  const config = statusConfig[result.status];
  const StatusIcon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-5xl mx-auto space-y-6"
    >
      <div className={cn("p-8 rounded-[2.5rem] border backdrop-blur-xl", config.bg, config.border)}>
        <div className="flex flex-col lg:flex-row gap-10 items-start">
          <div className="flex-1 space-y-8">
            <div className="flex items-center gap-4">
              <div className={cn("p-3 rounded-2xl", config.bg, config.border)}>
                <StatusIcon className={cn("w-8 h-8", config.color)} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-3xl font-black text-white tracking-tight">{result.status}</h2>
                  <span className={cn("px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border", config.border, config.color)}>
                    {result.riskLevel} Risk
                  </span>
                </div>
                <p className="text-sm text-gray-400 mt-1">Forensic Analysis ID: {result.id}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="p-6 rounded-3xl bg-white/5 border border-white/10">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <Activity className="w-3 h-3" />
                  {result.type === 'text' ? 'Credibility Assessment' : 'Executive Summary'}
                </h3>
                <p className="text-xl text-white leading-relaxed font-semibold">
                  {result.explanation}
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: result.type === 'text' ? 'Factual Accuracy' : 'Authenticity', score: result.scores.authenticity, icon: result.type === 'text' ? FileSearch : Fingerprint },
                  { label: result.type === 'text' ? 'Evidence Match' : 'Consistency', score: result.scores.consistency, icon: ListChecks },
                  { label: result.type === 'text' ? 'Source Credibility' : 'Credibility', score: result.scores.credibility, icon: ShieldCheck },
                  { label: result.type === 'text' ? 'Data Sufficiency' : 'Sufficiency', score: result.scores.sufficiency, icon: result.type === 'text' ? BookOpen : ListChecks },
                ].map((s) => (
                  <div key={s.label} className="p-4 rounded-2xl bg-black/20 border border-white/5 flex flex-col items-center gap-2">
                    <s.icon className="w-4 h-4 text-gray-500" />
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-tighter">{s.label}</span>
                    <div className="flex items-end gap-1">
                      <span className="text-lg font-black text-white">{s.score}</span>
                      <span className="text-[10px] text-gray-600 mb-1">/100</span>
                    </div>
                    <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${s.score}%` }}
                        className={cn(
                          "h-full rounded-full",
                          s.score > 80 ? "bg-emerald-500" : s.score > 50 ? "bg-amber-500" : "bg-red-500"
                        )}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-3">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                  {result.type === 'text' ? <BookOpen className="w-3 h-3" /> : <FileSearch className="w-3 h-3" />}
                  {result.type === 'text' ? 'Detailed Analytical Breakdown' : 'Detailed Forensic Reasoning'}
                </h3>
                <div className="p-6 rounded-3xl bg-black/20 border border-white/5 text-gray-300 text-sm leading-relaxed space-y-3">
                  {result.detailedReasoning.split('. ').map((step, i) => (
                    <p key={i} className="flex gap-3">
                      <span className="text-indigo-400 font-bold shrink-0">{i + 1}.</span>
                      {step}
                    </p>
                  ))}
                </div>
              </div>

              {result.uncertainties.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                    <HelpCircle className="w-3 h-3" />
                    Remaining Uncertainties
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {result.uncertainties.map((u, i) => (
                      <span key={i} className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/5 text-xs text-gray-400">
                        {u}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

          {result.type !== 'text' && (result.status === 'Contradicted' || result.status === 'AI-generated' || result.status === 'Suspicious') && (
            <div className="p-6 rounded-3xl bg-red-500/5 border border-red-500/10 space-y-3">
              <div className="flex items-center gap-2 text-red-400">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-wider">Suspicious Regions Detected</span>
              </div>
              <div className="relative aspect-video rounded-xl overflow-hidden bg-black/40 border border-white/5">
                <div className="absolute inset-0 flex items-center justify-center">
                  <p className="text-xs text-gray-500 italic">Heatmap overlay: High-frequency anomalies detected in central region</p>
                </div>
                <div className="absolute top-1/4 left-1/3 w-24 h-24 bg-red-500/20 blur-2xl rounded-full animate-pulse" />
                <div className="absolute top-1/2 left-1/2 w-16 h-16 bg-orange-500/20 blur-xl rounded-full animate-pulse delay-75" />
              </div>
            </div>
          )}
        </div>

          <div className="w-full lg:w-80 space-y-6">
            <div className="p-8 rounded-[2rem] bg-black/40 border border-white/5 flex flex-col items-center text-center">
              <div className="relative w-40 h-40 mb-6">
                <svg className="w-full h-full transform -rotate-90">
                  <circle
                    cx="80"
                    cy="80"
                    r="74"
                    fill="transparent"
                    stroke="currentColor"
                    strokeWidth="12"
                    className="text-white/5"
                  />
                  <motion.circle
                    cx="80"
                    cy="80"
                    r="74"
                    fill="transparent"
                    stroke="currentColor"
                    strokeWidth="12"
                    strokeDasharray={464.7}
                    initial={{ strokeDashoffset: 464.7 }}
                    animate={{ strokeDashoffset: 464.7 - (464.7 * result.confidence) / 100 }}
                    transition={{ duration: 1.5, ease: "easeOut" }}
                    className={config.color}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-4xl font-black text-white">{result.confidence}%</span>
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-tighter">Confidence</span>
                </div>
              </div>
              
              <div className="space-y-4 w-full">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center justify-center gap-2">
                  <ListChecks className="w-3 h-3" />
                  Detected Signals
                </h3>
                <div className="space-y-2">
                  {result.signals.map((signal) => (
                    <div key={signal.id} className="p-3 rounded-xl bg-white/5 border border-white/5 text-left">
                      <div className="flex items-center gap-2 mb-1">
                        <div className={cn(
                          "w-1.5 h-1.5 rounded-full",
                          signal.type === 'positive' ? 'bg-emerald-500' : signal.type === 'negative' ? 'bg-red-500' : 'bg-gray-500'
                        )} />
                        <span className="text-[10px] font-bold text-white uppercase">{signal.label}</span>
                      </div>
                      <p className="text-[10px] text-gray-500 leading-tight">{signal.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-6 rounded-3xl bg-indigo-600/10 border border-indigo-500/20">
              <h4 className="text-xs font-bold text-indigo-300 uppercase tracking-widest mb-2">Recommended Action</h4>
              <p className="text-sm text-gray-300 leading-relaxed font-medium">
                {result.recommendedAction}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center px-4">
        <button 
          onClick={onReset}
          className="text-sm font-bold text-gray-400 hover:text-white transition-colors flex items-center gap-2"
        >
          <Activity className="w-4 h-4" />
          Analyze another content
        </button>
        <div className="flex gap-3">
          <button className="px-6 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-bold text-white transition-all">
            Export PDF
          </button>
          <button className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-sm font-bold text-white transition-all flex items-center gap-2">
            Save to History
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
};
