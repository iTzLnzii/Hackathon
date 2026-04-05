import React from 'react';
import { motion } from 'motion/react';
import { Shield, CheckCircle, Zap, Globe, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export const LandingPage = () => {
  return (
    <div className="pt-24 pb-20 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center space-y-8 mb-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 text-sm font-bold uppercase tracking-widest"
          >
            <Zap className="w-4 h-4" />
            Next-Gen Verification
          </motion.div>
          
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-6xl md:text-8xl font-black text-white tracking-tighter leading-[0.9]"
          >
            Fighting <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">Misinformation</span> with Precision.
          </motion.h1>
          
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed"
          >
            Detector uses advanced AI to verify content authenticity, contextual consistency, and source credibility in seconds.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex flex-wrap justify-center gap-4"
          >
            <Link to="/analyzer" className="px-10 py-5 bg-indigo-600 text-white rounded-[2rem] font-black text-xl hover:bg-indigo-500 transition-all shadow-2xl shadow-indigo-500/20 flex items-center gap-3 group">
              Start Analyzing
              <ArrowRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
            </Link>
            <button className="px-10 py-5 bg-white/5 text-white border border-white/10 rounded-[2rem] font-black text-xl hover:bg-white/10 transition-all">
              Learn More
            </button>
          </motion.div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            { icon: Shield, title: 'Authenticity', desc: 'Detect AI-generated images, deepfakes, and digital manipulations.' },
            { icon: Globe, title: 'Context Check', desc: 'Verify if captions and news claims match the visual evidence.' },
            { icon: CheckCircle, title: 'Source Trust', desc: 'Assess credibility using domain heuristics and writing style analysis.' },
          ].map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 + i * 0.1 }}
              className="p-8 rounded-[2.5rem] bg-black/20 border border-white/5 backdrop-blur-sm hover:border-indigo-500/30 transition-all group"
            >
              <div className="w-14 h-14 rounded-2xl bg-indigo-600/10 flex items-center justify-center border border-indigo-500/20 mb-6 group-hover:scale-110 transition-transform">
                <feature.icon className="w-7 h-7 text-indigo-400" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-3">{feature.title}</h3>
              <p className="text-gray-400 leading-relaxed">{feature.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
};
