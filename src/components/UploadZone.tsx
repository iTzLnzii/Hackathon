import React, { useState, useCallback } from 'react';
import { Upload, FileText, Image as ImageIcon, Video, Link as LinkIcon, X, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface UploadZoneProps {
  onUpload: (type: 'image' | 'video' | 'audio' | 'text' | 'caption-check', data: any) => void;
  isAnalyzing: boolean;
}

export const UploadZone = ({ onUpload, isAnalyzing }: UploadZoneProps) => {
  const [dragActive, setDragActive] = useState(false);
  const [activeTab, setActiveTab] = useState<'media' | 'text' | 'caption'>('media');

  // Text tab state
  const [claimInput, setClaimInput] = useState('');
  const [contextInput, setContextInput] = useState('');

  // Caption tab state
  const [captionInput, setCaptionInput] = useState('');
  const [mediaTextInput, setMediaTextInput] = useState('');

  // Media state (shared between media tab and caption tab image)
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleFile = (file: File) => {
    if (
      !file.type.startsWith('image/') &&
      !file.type.startsWith('video/') &&
      !file.type.startsWith('audio/')
    )
      return;
    setSelectedFile(file);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
  };

  // Global paste listener for images
  React.useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      // Only intercept paste if not focused on a textarea
      if (document.activeElement?.tagName === 'TEXTAREA') return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          if (blob) handleFile(blob);
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  const handleSubmit = async () => {
    if (activeTab === 'media' && selectedFile) {
      const type = selectedFile.type.startsWith('video')
        ? 'video'
        : selectedFile.type.startsWith('audio')
        ? 'audio'
        : 'image';
      const base64 =
        type === 'video'
          ? await extractFrameFromVideo(selectedFile)
          : await fileToBase64(selectedFile);
      onUpload(type, { fileName: selectedFile.name, fileUrl: previewUrl, image: base64 });
    } else if (activeTab === 'text' && claimInput.trim()) {
      // Pass both the claim and optional context to the service
      const combinedText = contextInput.trim()
        ? `CLAIM: ${claimInput.trim()}\n\nCONTEXT / ADDITIONAL INFORMATION: ${contextInput.trim()}`
        : claimInput.trim();
      onUpload('text', { text: combinedText, claim: claimInput.trim(), context: contextInput.trim() });
    } else if (activeTab === 'caption') {
      // Caption check requires the caption (text) and the media image description; image is optional but strongly encouraged
      const hasCaption = captionInput.trim().length > 0;
      const hasMediaText = mediaTextInput.trim().length > 0;
      if (!hasCaption && !hasMediaText) return;

      if (selectedFile) {
        const isVideo = selectedFile.type.startsWith('video');
        const base64 = isVideo
          ? await extractFrameFromVideo(selectedFile)
          : await fileToBase64(selectedFile);
        onUpload('caption-check', {
          fileUrl: previewUrl,
          caption: captionInput.trim(),
          mediaDescription: mediaTextInput.trim(),
          image: base64,
        });
      } else {
        // No image — still run a text-based misinformation check between caption and media description
        onUpload('caption-check', {
          caption: captionInput.trim(),
          mediaDescription: mediaTextInput.trim(),
        });
      }
    }
  };

  const extractFrameFromVideo = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.autoplay = false;
      video.muted = true;
      video.src = URL.createObjectURL(file);
      video.onloadedmetadata = () => {
        video.currentTime = Math.min(1, video.duration / 2);
      };
      video.onseeked = () => {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.9));
        } else {
          reject(new Error('Canvas context not available'));
        }
        URL.revokeObjectURL(video.src);
      };
      video.onerror = (e) => reject(e);
    });
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  const clearMedia = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
  };

  const clearAll = () => {
    clearMedia();
    setClaimInput('');
    setContextInput('');
    setCaptionInput('');
    setMediaTextInput('');
  };

  // Determine if submit is enabled
  const canSubmit = (() => {
    if (isAnalyzing) return false;
    if (activeTab === 'media') return !!selectedFile;
    if (activeTab === 'text') return claimInput.trim().length > 0;
    if (activeTab === 'caption') return captionInput.trim().length > 0 || mediaTextInput.trim().length > 0;
    return false;
  })();

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Tab selector */}
      <div className="flex gap-2 mb-6 p-1 bg-white/5 rounded-2xl border border-white/10">
        {(['media', 'text', 'caption'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); clearAll(); }}
            className={cn(
              'flex-1 py-2.5 rounded-xl text-sm font-medium transition-all capitalize',
              activeTab === tab
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            )}
          >
            {tab === 'caption' ? 'Caption Check' : tab}
          </button>
        ))}
      </div>

      {/* ── MEDIA TAB ─────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {activeTab === 'media' && (
          <motion.div
            key="media-tab"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <div
              className={cn(
                'relative min-h-[320px] rounded-3xl border-2 border-dashed transition-all duration-300 flex flex-col items-center justify-center p-8 bg-black/20 backdrop-blur-md overflow-hidden',
                dragActive ? 'border-indigo-500 bg-indigo-500/5 scale-[1.01]' : 'border-white/10 hover:border-white/20',
                isAnalyzing && 'pointer-events-none opacity-50'
              )}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <AnimatePresence mode="wait">
                {isAnalyzing ? (
                  <AnalyzingSpinner key="spin" />
                ) : previewUrl ? (
                  <motion.div
                    key="preview"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="relative w-full h-full flex flex-col items-center gap-4"
                  >
                    <div className="relative group/preview">
                      {selectedFile?.type.startsWith('video') ? (
                        <video src={previewUrl} className="max-h-48 rounded-xl shadow-2xl" controls />
                      ) : selectedFile?.type.startsWith('audio') ? (
                        <audio src={previewUrl} className="w-full max-w-xs mt-4" controls />
                      ) : (
                        <img src={previewUrl} className="max-h-48 rounded-xl shadow-2xl object-cover" alt="Preview" />
                      )}
                      <button
                        onClick={clearMedia}
                        className="absolute -top-2 -right-2 p-1.5 bg-red-500 text-white rounded-full shadow-lg opacity-0 group-hover/preview:opacity-100 transition-opacity"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="text-sm text-gray-400 font-medium">{selectedFile?.name}</p>
                  </motion.div>
                ) : (
                  <motion.div
                    key="drop-zone"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex flex-col items-center gap-6 group"
                  >
                    <div className="w-20 h-20 rounded-3xl bg-indigo-600/10 flex items-center justify-center border border-indigo-500/20 group-hover:scale-110 transition-transform duration-500">
                      <Upload className="w-10 h-10 text-indigo-400" />
                    </div>
                    <div className="text-center">
                      <h3 className="text-xl font-bold text-white mb-2">Drop your media here</h3>
                      <p className="text-gray-400 max-w-xs">
                        Drag and drop images, videos, screenshots, or audio clips to start authenticity check.
                      </p>
                    </div>
                    <label className="px-6 py-3 bg-white text-black rounded-xl font-bold text-sm cursor-pointer hover:bg-gray-200 transition-colors shadow-xl">
                      Browse Files
                      <input type="file" className="hidden" onChange={(e) => e.target.files && handleFile(e.target.files[0])} />
                    </label>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}

        {/* ── TEXT TAB ─────────────────────────────────────────── */}
        {activeTab === 'text' && (
          <motion.div
            key="text-tab"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-4"
          >
            <div
              className={cn(
                'rounded-3xl border border-white/10 bg-black/20 backdrop-blur-md p-6 space-y-5',
                isAnalyzing && 'pointer-events-none opacity-50'
              )}
            >
              {/* Claim input */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-indigo-400" />
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Claim / Statement to Verify
                  </label>
                  <span className="ml-auto text-xs text-red-400 font-medium">Required</span>
                </div>
                <textarea
                  value={claimInput}
                  onChange={(e) => setClaimInput(e.target.value)}
                  placeholder="Enter the claim, news headline, or statement you want to verify as true or false…"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-indigo-500/50 transition-colors resize-none h-32"
                />
              </div>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-white/10" />
                <span className="text-xs text-gray-600 font-medium">+ Supporting Info (Optional)</span>
                <div className="flex-1 h-px bg-white/10" />
              </div>

              {/* Context input */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-400" />
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Additional Context / Background Information
                  </label>
                  <span className="ml-auto text-xs text-gray-500 font-medium">Optional</span>
                </div>
                <textarea
                  value={contextInput}
                  onChange={(e) => setContextInput(e.target.value)}
                  placeholder="Provide any extra context, source information, related facts, or background knowledge that can help verify the claim above…"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-amber-500/30 transition-colors resize-none h-24"
                />
                <p className="text-xs text-gray-600">
                  The AI will use this context alongside its own knowledge base to determine if the claim is true or false.
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── CAPTION CHECK TAB ────────────────────────────────── */}
        {activeTab === 'caption' && (
          <motion.div
            key="caption-tab"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-4"
          >
            <div
              className={cn(
                'rounded-3xl border border-white/10 bg-black/20 backdrop-blur-md overflow-hidden',
                isAnalyzing && 'pointer-events-none opacity-50'
              )}
            >
              {/* Top description */}
              <div className="px-6 pt-5 pb-3">
                <h3 className="text-sm font-semibold text-white mb-1">Misinformation Caption Detector</h3>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Detects whether a caption or claim misrepresents or misleads when combined with the associated image or media description. Upload the image and enter both inputs below.
                </p>
              </div>

              <div className="border-t border-white/5" />

              {/* Two-column inputs */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x divide-white/5">

                {/* LEFT — Caption text input */}
                <div className="p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-violet-400" />
                    <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                      Caption / Claim Text
                    </label>
                    <span className="ml-auto text-xs text-gray-500">Text</span>
                  </div>
                  <textarea
                    value={captionInput}
                    onChange={(e) => setCaptionInput(e.target.value)}
                    placeholder="Paste the news headline, social media caption, or claim that appears alongside the image…"
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-violet-500/40 transition-colors resize-none h-36"
                  />
                  <p className="text-xs text-gray-600">
                    What text or caption is being shown alongside the media?
                  </p>
                </div>

                {/* RIGHT — Media image description + optional upload */}
                <div className="p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-cyan-400" />
                    <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                      Media / Image
                    </label>
                    <span className="ml-auto text-xs text-gray-500">Upload or describe</span>
                  </div>

                  {/* Image upload zone (compact) */}
                  <div
                    className={cn(
                      'rounded-xl border-2 border-dashed transition-all duration-200 flex flex-col items-center justify-center p-4 min-h-[80px] cursor-pointer relative',
                      dragActive ? 'border-cyan-500 bg-cyan-500/5' : 'border-white/10 hover:border-white/20',
                      previewUrl ? 'bg-black/20' : 'bg-white/3'
                    )}
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                  >
                    {previewUrl ? (
                      <div className="relative group/preview w-full flex flex-col items-center gap-2">
                        {selectedFile?.type.startsWith('video') ? (
                          <video src={previewUrl} className="max-h-24 rounded-lg shadow-xl" controls />
                        ) : (
                          <img src={previewUrl} className="max-h-24 rounded-lg shadow-xl object-cover" alt="Preview" />
                        )}
                        <p className="text-xs text-gray-500 truncate max-w-full">{selectedFile?.name}</p>
                        <button
                          onClick={clearMedia}
                          className="absolute -top-1 -right-1 p-1 bg-red-500 text-white rounded-full text-xs shadow-lg opacity-0 group-hover/preview:opacity-100 transition-opacity"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center gap-2 cursor-pointer w-full">
                        <Upload className="w-5 h-5 text-gray-500" />
                        <span className="text-xs text-gray-500 text-center">
                          Drop or <span className="text-cyan-400 underline">browse</span> image/video
                        </span>
                        <input
                          type="file"
                          className="hidden"
                          accept="image/*,video/*"
                          onChange={(e) => e.target.files && handleFile(e.target.files[0])}
                        />
                      </label>
                    )}
                  </div>

                  {/* Media description text */}
                  <div className="space-y-1">
                    <label className="text-xs text-gray-500 block">
                      Or describe what the image/media shows:
                    </label>
                    <textarea
                      value={mediaTextInput}
                      onChange={(e) => setMediaTextInput(e.target.value)}
                      placeholder="e.g. 'A photo showing thousands of people at a rally in Washington D.C.'"
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-cyan-500/30 transition-colors resize-none h-20"
                    />
                  </div>
                </div>
              </div>

              {/* Hint strip */}
              <div className="px-6 py-3 bg-white/3 border-t border-white/5">
                <p className="text-xs text-gray-600 flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500/70 flex-shrink-0" />
                  For best results, provide both the caption text and an uploaded image. The AI will detect if the caption misleads or misrepresents what the image actually shows.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Submit button */}
      <div className="mt-8 flex justify-center">
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={cn(
            'px-12 py-4 rounded-2xl font-bold text-lg transition-all shadow-2xl flex items-center gap-3',
            canSubmit
              ? 'bg-indigo-600 text-white hover:bg-indigo-500 hover:-translate-y-1 shadow-indigo-500/20 cursor-pointer'
              : 'bg-white/5 text-gray-500 cursor-not-allowed'
          )}
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Processing...
            </>
          ) : (
            'Run Analysis'
          )}
        </button>
      </div>
    </div>
  );
};

const AnalyzingSpinner = () => (
  <motion.div
    initial={{ opacity: 0, scale: 0.9 }}
    animate={{ opacity: 1, scale: 1 }}
    exit={{ opacity: 0, scale: 0.9 }}
    className="flex flex-col items-center gap-4"
  >
    <div className="relative">
      <div className="absolute inset-0 bg-indigo-500 blur-2xl opacity-20 animate-pulse" />
      <Loader2 className="w-12 h-12 text-indigo-500 animate-spin" />
    </div>
    <div className="text-center">
      <h3 className="text-lg font-semibold text-white mb-1">Analyzing Content</h3>
      <p className="text-sm text-gray-400">Scanning for digital signatures and anomalies...</p>
    </div>
  </motion.div>
);
