import React from 'react';
import { motion } from 'motion/react';
import { History as HistoryIcon, Search, Filter, Trash2 } from 'lucide-react';

export const HistoryPage = () => {
  return (
    <div className="pt-24 pb-20 px-6 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
          <div>
            <h1 className="text-4xl font-black text-white tracking-tight mb-2">Analysis History</h1>
            <p className="text-gray-400">Review your past verifications and findings.</p>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input 
                type="text" 
                placeholder="Search history..." 
                className="pl-11 pr-6 py-3 bg-white/5 border border-white/10 rounded-2xl text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-all w-64"
              />
            </div>
            <button className="p-3 bg-white/5 border border-white/10 rounded-2xl text-gray-400 hover:text-white transition-all">
              <Filter className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {/* Empty State Placeholder */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="py-32 flex flex-col items-center justify-center text-center p-8 rounded-[3rem] border border-white/5 bg-black/20 backdrop-blur-sm"
          >
            <div className="w-20 h-20 rounded-3xl bg-white/5 flex items-center justify-center mb-6">
              <HistoryIcon className="w-10 h-10 text-gray-600" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">No history found</h3>
            <p className="text-gray-400 max-w-xs mb-8">
              Your verified content will appear here once you start using the analyzer.
            </p>
            <button className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-500 transition-all">
              Start First Analysis
            </button>
          </motion.div>
        </div>
      </div>
    </div>
  );
};
