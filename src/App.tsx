import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Navbar, Sidebar } from './components/Navigation';
import { AnimatedBackground } from './components/AnimatedBackground';
import { LandingPage } from './pages/LandingPage';
import { AnalyzerPage } from './pages/AnalyzerPage';
import { HistoryPage } from './pages/HistoryPage';
import { SettingsPage } from './pages/SettingsPage';

export default function App() {
  return (
    <Router>
      <div className="min-h-screen text-white selection:bg-indigo-500/30">
        <AnimatedBackground />
        <Navbar />
        <Sidebar />
        
        <main className="lg:pl-64 transition-all duration-300">
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/analyzer" element={<AnalyzerPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>

        {/* Extension Integration Architecture Note:
            The app uses a centralized routing and service structure.
            To support the extension, we can add a specific route like '/api/extension/analyze'
            or use window.postMessage listeners in main.tsx to communicate with the content script.
        */}
      </div>
    </Router>
  );
}
