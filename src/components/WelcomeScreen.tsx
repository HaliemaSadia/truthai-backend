import { useState, useRef, ChangeEvent } from 'react';
import { Image, Link as LinkIcon, Send, AlertTriangle, Sparkles, Upload } from 'lucide-react';
import { ContentType } from '../types';

interface WelcomeScreenProps {
  activeTab: ContentType;
  onAnalyze: (text: string, type: string) => void;
  onAnalyzeFile: (file: File) => void;
  isLoading: boolean;
  onViewReport: (reportId: string) => void;
  onNavigateToTab: (tab: ContentType) => void;
  isPro: boolean;
  scansLeft: number;
  onUpgrade: () => void;
}

// Per-tab hero copy, default input mode, and upload affordances.
const TAB_CONFIG: Record<string, {
  title: string;
  subtitle: string;
  placeholder: string;
  defaultType: string;
  accept?: string;
  uploadLabel?: string;
}> = {
  photos: {
    title: 'Verify Every Image.',
    subtitle: 'Detect AI-generated and manipulated imagery with pixel-level forensic analysis at 99.4% accuracy.',
    placeholder: 'Upload an image, or paste an image URL / description to scan for deepfake & GAN artifacts...',
    defaultType: 'image',
    accept: 'image/*,.jpeg,.jpg,.png,.webp',
    uploadLabel: 'Upload image to scan'
  },
  videos: {
    title: 'Verify Every Frame.',
    subtitle: 'Catch deepfakes and synthetic video with temporal lip-sync and micro-expression forensics.',
    placeholder: 'Upload a video clip, or describe the footage / paste a stream URL to analyze...',
    defaultType: 'video',
    accept: 'video/*',
    uploadLabel: 'Upload video to scan'
  },
  links: {
    title: 'Verify Every Source.',
    subtitle: 'Ground any link against TruthAI intelligence to expose manipulated or synthetic web content.',
    placeholder: 'Paste a news, article, or media URL to ground and verify its authenticity...',
    defaultType: 'link'
  },
  news: {
    title: 'Verify Every Claim.',
    subtitle: 'Analyze articles and statements for LLM signatures, manipulation, and synthetic narratives.',
    placeholder: 'Paste news text, a quoted statement, or an essay sample to verify...',
    defaultType: 'news'
  },
  academic: {
    title: 'Verify Every Stroke.',
    subtitle: 'Forensic handwriting examination to detect AI-generated, font-rendered, or synthetically simulated assignments — neatness is not proof of authenticity.',
    placeholder: 'Upload a photo or scan of a handwritten assignment for forensic stroke, spacing, and glyph-variation analysis...',
    defaultType: 'assignment',
    accept: 'image/*,.pdf,.txt,.doc,.docx',
    uploadLabel: 'Upload handwritten assignment'
  }
};

export default function WelcomeScreen({ activeTab, onAnalyze, onAnalyzeFile, isLoading, onViewReport, onNavigateToTab, isPro, scansLeft, onUpgrade }: WelcomeScreenProps) {
  const config = TAB_CONFIG[activeTab] ?? TAB_CONFIG.photos;
  const [inputText, setInputText] = useState('');
  const [inputType, setInputType] = useState(config.defaultType);
  const [showToast, setShowToast] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleChipClick = (text: string, type: string) => {
    // Social-media / URL verification is a Pro feature.
    if (type === 'link' && !isPro) {
      onUpgrade();
      return;
    }
    setInputText(text);
    setInputType(type);
  };

  const handleVerify = () => {
    if (!inputText.trim()) return;
    onAnalyze(inputText, inputType);
  };

  const openFilePicker = (accept: string) => {
    if (fileInputRef.current) {
      fileInputRef.current.accept = accept;
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onAnalyzeFile(file);
    e.target.value = '';
  };

  return (
    <div className="w-full max-w-container-max mx-auto space-y-12 py-6">
      {/* Hidden file input shared by every upload affordance */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Hero Header Title */}
      <div className="max-w-3xl mx-auto text-center space-y-3">
        <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight gradient-text py-1">
          {config.title}
        </h2>
        <p className="font-sans text-sm sm:text-base text-slate-500 max-w-2xl mx-auto leading-relaxed px-2">
          {config.subtitle}
        </p>
      </div>

      {/* Central Search / Input Console Card */}
      <div className="max-w-2xl mx-auto">
        <div className="glass-effect rounded-2xl border border-slate-200 p-4 shadow-xl shadow-slate-200/40 hover:border-blue-300 focus-within:ring-4 focus-within:ring-blue-500/10 focus-within:border-blue-500 transition-all duration-300">
          <div className="flex items-start gap-3">
            <textarea
              id="verification-textarea"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={config.placeholder}
              className="w-full bg-transparent border-0 focus:ring-0 font-sans text-slate-800 placeholder:text-slate-400 resize-none h-32 text-sm leading-relaxed outline-none"
            />
          </div>

          {/* Action Row below input */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-100 mt-2">
            <div className="flex items-center gap-1">
              <button
                id="tool-btn-img"
                onClick={() => openFilePicker('image/*,.jpeg,.jpg,.png,.webp')}
                className="p-2 text-slate-400 hover:text-blue-600 hover:bg-slate-50 rounded-xl transition-all"
                title="Upload image to scan"
              >
                <Image className="w-4 h-4" />
              </button>
              <button
                id="tool-btn-link"
                onClick={() => handleChipClick('https://www.cnn-global-broadcast.news/politics/interview-manipulation-report-archive', 'link')}
                className="relative p-2 text-slate-400 hover:text-blue-600 hover:bg-slate-50 rounded-xl transition-all"
                title={isPro ? 'Ground with Link Verify' : 'Social link verification (Pro)'}
              >
                <LinkIcon className="w-4 h-4" />
                {!isPro && (
                  <span className="absolute -top-0.5 -right-0.5 text-[7px] font-black bg-indigo-600 text-white px-1 rounded-full">PRO</span>
                )}
              </button>

              {config.accept && (
                <button
                  id="tool-btn-upload"
                  onClick={() => openFilePicker(config.accept!)}
                  className="ml-1 flex items-center gap-1.5 px-3 py-2 text-blue-600 hover:bg-blue-50 rounded-xl transition-all text-xs font-bold"
                  title={config.uploadLabel}
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{config.uploadLabel}</span>
                </button>
              )}
            </div>

            <button
              id="execute-verify-btn"
              onClick={handleVerify}
              disabled={isLoading || !inputText.trim()}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:shadow-none text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-500/15 hover:shadow-blue-500/25 hover:translate-y-[-1px] active:translate-y-[1px] cursor-pointer transition-all flex items-center gap-2 outline-none"
            >
              {isLoading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Analyzing...</span>
                </>
              ) : (
                <>
                  <span>Verify Now</span>
                  <Send className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </div>

        {/* Free-tier scan meter */}
        {!isPro && (
          <div className="mt-3 flex items-center justify-center gap-2 text-[11px] font-medium">
            {scansLeft > 0 ? (
              <span className="text-slate-400">
                <span className="font-bold text-slate-600">{scansLeft}</span> free scan{scansLeft === 1 ? '' : 's'} left today ·{' '}
                <button onClick={onUpgrade} className="text-blue-600 font-bold hover:underline">Go unlimited for $3/mo</button>
              </span>
            ) : (
              <span className="text-rose-500">
                Daily free limit reached ·{' '}
                <button onClick={onUpgrade} className="text-blue-600 font-bold hover:underline">Upgrade to Pro</button>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Bento Grid layout - Asymmetric scan reports */}
      <div className="space-y-6 pt-6">
        <div className="flex justify-between items-end border-b border-slate-100 pb-4">
          <div>
            <h3 className="font-display text-xl font-bold text-slate-900">Recent Intelligence Scans</h3>
            <p className="text-xs text-slate-400 font-medium mt-1">Review live detections recently conducted inside TruthAI nodes</p>
          </div>
          <button
            id="all-scans-btn"
            onClick={() => onNavigateToTab('dashboard')}
            className="text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline transition-colors cursor-pointer"
          >
            View all history
          </button>
        </div>

        {/* 12-Column Grid */}
        <div className="grid grid-cols-12 gap-6">
          
          {/* Bento Card 1: CNN Deepfake Report */}
          <div
            onClick={() => onViewReport('demo-cnn-report')}
            className="col-span-12 bg-[#EDF3FF] rounded-3xl p-6 border border-blue-100/40 relative overflow-hidden group cursor-pointer hover:shadow-lg hover:shadow-blue-500/5 hover:-translate-y-0.5 transition-all duration-300"
          >
            <div className="relative z-10 flex flex-col h-full justify-between">
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <span className="px-2.5 py-1 bg-purple-600/10 text-purple-700 rounded-full text-[10px] font-bold">
                    High Accuracy
                  </span>
                  <span className="px-2.5 py-0.5 bg-orange-500/10 text-orange-700 rounded-full text-[10px] font-bold">
                    Verified Flag
                  </span>
                </div>
                <h4 className="font-display text-lg sm:text-xl font-bold text-slate-900 mb-2">
                  CNN News Deepfake Analysis
                </h4>
                <p className="font-sans text-xs sm:text-sm text-slate-600 max-w-lg leading-relaxed">
                  Real-time scan of the broadcast revealed 87% probability of frame manipulation in the lower quadrant. Discontinuities in micro-expression textures confirmed.
                </p>
              </div>

              {/* Progress and score details */}
              <div className="mt-6 flex flex-col sm:flex-row sm:items-center gap-6">
                <div className="shrink-0">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Truth Score</p>
                  <p className="text-3xl font-display font-black text-blue-600 mt-1">12%</p>
                </div>
                <div className="flex-1 max-w-xs">
                  <div className="h-2 w-full bg-slate-200/65 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-red-500 to-orange-500 w-[12%] rounded-full"></div>
                  </div>
                  <p className="mt-2 text-xs text-red-600 font-bold flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>Likely Manipulated Content</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Simulated overlay graphic representation */}
            <div className="absolute right-0 top-0 h-full w-1/3 bg-blue-500/5 mix-blend-overlay opacity-30 group-hover:opacity-60 transition-all duration-300 select-none pointer-events-none"></div>
          </div>

        </div>
      </div>

      {/* Floating Action Notification Banner Toast */}
      {showToast && (
        <div 
          id="scan-capability-toast"
          className="fixed bottom-4 sm:bottom-6 left-4 right-4 sm:left-auto sm:right-6 glass-effect border border-blue-100/60 p-4 rounded-2xl shadow-2xl flex items-center gap-4 animate-bounce-subtle z-50 sm:max-w-sm"
        >
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="font-sans text-xs font-bold text-blue-900 leading-tight">New Scan Capability</p>
            <p className="font-sans text-[11px] text-slate-500 mt-0.5 leading-snug">
              Analyze 4K video for micro-expression state shifts. Live now inside Pro investigator tier.
            </p>
          </div>
          <button 
            id="close-toast-btn"
            onClick={() => setShowToast(false)}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 shrink-0 self-start transition-colors"
          >
            &times;
          </button>
        </div>
      )}
    </div>
  );
}
