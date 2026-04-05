import React from 'react';
import { NavLink } from 'react-router-dom';
import { Shield, Search, History, Settings, LayoutDashboard } from 'lucide-react';
import { cn } from '../lib/utils';

export const Navbar = () => {
  return (
    <nav className="fixed top-0 left-0 right-0 h-16 border-b border-white/10 bg-black/50 backdrop-blur-xl z-50 flex items-center justify-between px-6">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
          <Shield className="w-5 h-5 text-white" />
        </div>
        <span className="text-xl font-bold tracking-tight text-white">Detector</span>
      </div>
      
      <div className="hidden md:flex items-center gap-1">
        <NavLink to="/" className={({ isActive }) => cn(
          "px-4 py-2 rounded-full text-sm font-medium transition-all",
          isActive ? "bg-white/10 text-white" : "text-gray-400 hover:text-white hover:bg-white/5"
        )}>
          Home
        </NavLink>
        <NavLink to="/analyzer" className={({ isActive }) => cn(
          "px-4 py-2 rounded-full text-sm font-medium transition-all",
          isActive ? "bg-white/10 text-white" : "text-gray-400 hover:text-white hover:bg-white/5"
        )}>
          Analyzer
        </NavLink>
        <NavLink to="/history" className={({ isActive }) => cn(
          "px-4 py-2 rounded-full text-sm font-medium transition-all",
          isActive ? "bg-white/10 text-white" : "text-gray-400 hover:text-white hover:bg-white/5"
        )}>
          History
        </NavLink>
      </div>

      <div className="flex items-center gap-4">
        <button className="p-2 text-gray-400 hover:text-white transition-colors">
          <Settings className="w-5 h-5" />
        </button>
        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 border border-white/20" />
      </div>
    </nav>
  );
};

export const Sidebar = () => {
  const links = [
    { icon: LayoutDashboard, label: 'Dashboard', to: '/' },
    { icon: Search, label: 'New Analysis', to: '/analyzer' },
    { icon: History, label: 'History', to: '/history' },
    { icon: Settings, label: 'Settings', to: '/settings' },
  ];

  return (
    <div className="fixed left-0 top-16 bottom-0 w-64 border-r border-white/10 bg-black/20 backdrop-blur-sm hidden lg:flex flex-col p-4 gap-2">
      {links.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          className={({ isActive }) => cn(
            "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all",
            isActive 
              ? "bg-indigo-600/10 text-indigo-400 border border-indigo-500/20" 
              : "text-gray-400 hover:text-white hover:bg-white/5"
          )}
        >
          <link.icon className="w-5 h-5" />
          {link.label}
        </NavLink>
      ))}
      
      <div className="mt-auto p-4 rounded-2xl bg-gradient-to-b from-indigo-600/20 to-transparent border border-indigo-500/20">
        <p className="text-xs font-semibold text-indigo-300 uppercase tracking-wider mb-2">Extension Ready</p>
        <p className="text-xs text-gray-400 leading-relaxed">
          The architecture is prepared for browser extension integration.
        </p>
      </div>
    </div>
  );
};
