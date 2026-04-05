import React from 'react';
import { motion } from 'motion/react';
import { User, Bell, Shield, Palette, Chrome, ExternalLink } from 'lucide-react';

export const SettingsPage = () => {
  const sections = [
    { icon: User, title: 'Profile', desc: 'Manage your account and preferences.' },
    { icon: Palette, title: 'Appearance', desc: 'Customize theme and accent colors.' },
    { icon: Bell, title: 'Notifications', desc: 'Configure alerts for analysis results.' },
    { icon: Shield, title: 'Privacy & Security', desc: 'Manage data retention and API keys.' },
    { icon: Chrome, title: 'Browser Extension', desc: 'Connect and configure the Detector extension.', active: true },
  ];

  return (
    <div className="pt-24 pb-20 px-6 min-h-screen">
      <div className="max-w-4xl mx-auto">
        <div className="mb-12">
          <h1 className="text-4xl font-black text-white tracking-tight mb-2">Settings</h1>
          <p className="text-gray-400">Configure your Detector experience and integrations.</p>
        </div>

        <div className="space-y-4">
          {sections.map((section, i) => (
            <motion.div
              key={section.title}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="group p-6 rounded-3xl bg-black/20 border border-white/5 hover:border-white/10 transition-all flex items-center justify-between cursor-pointer"
            >
              <div className="flex items-center gap-6">
                <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center group-hover:bg-indigo-600/10 transition-colors">
                  <section.icon className="w-6 h-6 text-gray-400 group-hover:text-indigo-400 transition-colors" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white mb-0.5">{section.title}</h3>
                  <p className="text-sm text-gray-500">{section.desc}</p>
                </div>
              </div>
              {section.active ? (
                <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 text-xs font-bold uppercase tracking-wider">
                  Configured
                  <ExternalLink className="w-3 h-3" />
                </div>
              ) : (
                <div className="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center text-gray-600 group-hover:text-white group-hover:border-white/30 transition-all">
                  <ExternalLink className="w-4 h-4" />
                </div>
              )}
            </motion.div>
          ))}
        </div>

        <div className="mt-12 p-8 rounded-[2.5rem] bg-gradient-to-br from-indigo-600/20 to-purple-600/20 border border-indigo-500/20">
          <div className="flex flex-col md:flex-row gap-8 items-center">
            <div className="flex-1 space-y-4">
              <h2 className="text-2xl font-bold text-white">Browser Extension</h2>
              <p className="text-gray-300 leading-relaxed">
                Analyze content directly from your browser. Capture screenshots of social media posts, news articles, or suspicious images and send them to Detector with one click.
              </p>
              <button className="px-8 py-3 bg-white text-black rounded-xl font-bold hover:bg-gray-200 transition-all flex items-center gap-2">
                Install Extension
                <Chrome className="w-5 h-5" />
              </button>
            </div>
            <div className="w-48 h-48 rounded-3xl bg-black/40 border border-white/10 flex items-center justify-center overflow-hidden">
               <div className="relative">
                  <div className="absolute inset-0 bg-indigo-500 blur-3xl opacity-20" />
                  <Chrome className="w-20 h-20 text-indigo-400 relative z-10" />
               </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
