import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import WelcomeScreen from './components/WelcomeScreen';
import ResultsScreen from './components/ResultsScreen';
import HistoryDashboard from './components/HistoryDashboard';
import AuthScreen from './components/AuthScreen';
import LegalPage from './components/LegalPage';
import Footer from './components/Footer';
import SeoHead from './components/SeoHead';
import { ContentType, AnalysisReport, User, FREE_DAILY_SCANS } from './types';
import { formatBytes, readFileAsDataURL, resolveReportType } from './utils';
import { apiUrl } from './config';
import { postAnalyze, postJson, getJson, deleteJson, ApiError } from './api';
import { LegalSlug, parseLegalHash } from './content/legal';
import {
  getStoredUser, setStoredUser, clearStoredUser, setAccessToken,
  fetchProStatus, startCheckout,
  canScan, recordScan, scansRemaining,
  loadSavedReports, saveReports, clearSavedReports,
} from './auth';


// Baseline demo data matching all requirements
const INITIAL_REPORTS: AnalysisReport[] = [
  {
    id: 'demo-cnn-report',
    title: 'CNN News Deepfake Analysis',
    type: 'video',
    timestamp: 'Oct 24, 2023 • 16:22',
    fileSize: '42.1 MB',
    truthScore: 12,
    status: 'manipulated',
    riskLevel: 'high',
    explanation: 'Real-time scan of the broadcast revealed 87% probability of frame manipulation in the lower quadrant. Face swaps or neural expression overlays identified in secondary video streams.',
    resolution: '2048 x 1536',
    colorSpace: 'sRGB IEC61',
    bitDepth: '24-bit True',
    method: 'ConvNet Ensemble',
    imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAE0FL7rSIRxVOjrNIpqmlfccnePSU5suY3cgVF4dd8djO7alByoSPauAWdRLwHgcPIyPghgCtHXTY_2HQnLOYYzep5_doiA0t-cGHvHbFABGaS24T9ocYJToSTfGD1kJBHFgGK7H1TC-t45wMreL5O4gs9Nx2QywyD_HCBt3tvmZNVZU_s7Qipur07Kj4GaPl8TbYFbDN98XfW3DV74Dpdo7677sJroTd3uBy0YloRTasy0MTHIeE08ZjUw0xa8DO2r-jZ423jCVk',
    targetDetails: {
      x: '45%',
      y: '20%',
      width: '160px',
      height: '160px',
      label: 'Target Detected',
      confidence: 0.992
    },
    metrics: [
      {
        name: 'Frequency Discontinuity',
        score: 92,
        label: 'CRITICAL',
        description: 'High-frequency noise patterns do not align with natural lens sensor captures. Detected synthetic grain structure.'
      },
      {
        name: 'Edge Coherence',
        score: 78,
        label: 'HIGH',
        description: 'Micro-blurring and artifacting found on complex occlusion boundaries. Typical of latent space mapping errors.'
      },
      {
        name: 'Metadata Check',
        score: 45,
        label: 'MODERATE',
        description: 'Stripped EXIF data and suspicious quantization tables. Fingerprint suggests Adobe or Midjourney post-processing.'
      }
    ],
    chatHistory: [
      { role: 'assistant', text: 'TruthAI Forensic initialized. I have completed the spatial heatmap analysis for this CNN scan. Let me know if you would like me to dissect the specific frequency discontinuity scores or trace individual artifact coordinates.' }
    ]
  },
  {
    id: 'demo-academic-report',
    title: 'Academic Essay Integrity Assessment',
    type: 'assignment',
    timestamp: 'Oct 23, 2023 • 11:05',
    fileSize: '4.2 MB',
    truthScore: 91,
    status: 'authentic',
    riskLevel: 'low',
    explanation: 'Linguistic cadence shows highly robust lexical diversity and fully irregular structural distributions classic in authentic human writing. No automated templates flagged.',
    metrics: [
      {
        name: 'Linguistic Perplexity',
        score: 11,
        label: 'LOW',
        description: 'Strong organic semantic distribution representing high variability in word selection clusters.'
      },
      {
        name: 'Cadence Uniformity',
        score: 15,
        label: 'LOW',
        description: 'Highly natural sentence length variations and syntax formatting indicators.'
      },
      {
        name: 'Stylometry Fingertip',
        score: 8,
        label: 'LOW',
        description: 'Signature styles check out clean against standard language generator baselines.'
      }
    ],
    chatHistory: []
  },
  {
    id: 'shot_042_candid.png',
    title: 'shot_042_candid.jpg',
    type: 'photo',
    timestamp: 'Oct 24, 2023 • 14:22',
    fileSize: '4.2 MB',
    truthScore: 99,
    status: 'authentic',
    riskLevel: 'low',
    explanation: 'Image contains valid sensor noise configurations and consistent focal depth. No trace of digital forgery or neural generation models.',
    metrics: [
      { name: 'Frequency Discontinuity', score: 3, label: 'LOW', description: 'Zero grain disruption detected.' },
      { name: 'Edge Coherence', score: 5, label: 'LOW', description: 'Edges resolve at uniform focal properties.' },
      { name: 'Metadata Check', score: 2, label: 'LOW', description: 'Consistent EXIF signature matching camera configuration model.' }
    ],
    chatHistory: []
  },
  {
    id: 'interview_deepfake_test',
    title: 'interview_deepfake_test.mp4',
    type: 'video',
    timestamp: 'Oct 24, 2023 • 12:05',
    fileSize: '128.5 MB',
    truthScore: 5,
    status: 'ai-generated',
    riskLevel: 'high',
    explanation: 'Linguistic lip-sync vectors fail standard temporal micro-alignments. Secondary neural face-swap synthesis patterns identified inside high-frequency channels.',
    metrics: [
      { name: 'Frequency Discontinuity', score: 94, label: 'CRITICAL', description: 'Significant Fourier transform discrepancies detected in audio-visual patterns.' },
      { name: 'Edge Coherence', score: 87, label: 'HIGH', description: 'Unnatural facial edge artifacts at key light bounds.' },
      { name: 'Metadata Check', score: 91, label: 'CRITICAL', description: 'Anomalous structural wrappers aligned with synthetic outputs.' }
    ],
    chatHistory: []
  },
  {
    id: 'contract_v4_signed',
    title: 'contract_v4_signed.pdf',
    type: 'news',
    timestamp: 'Oct 23, 2023 • 16:45',
    fileSize: '1.2 MB',
    truthScore: 18,
    status: 'manipulated',
    riskLevel: 'high',
    explanation: 'Target PDF is edited with layered metadata revisions. Signature hashes represent cryptographic mismatched timestamps, signifying suspect manual forgery.',
    metrics: [
      { name: 'Frequency Discontinuity', score: 78, label: 'HIGH', description: 'Discontinuous document layer formatting structures.' },
      { name: 'Edge Coherence', score: 71, label: 'HIGH', description: 'Edge blur on original contract background pixels.' },
      { name: 'Metadata Check', score: 88, label: 'CRITICAL', description: 'EXIF indicates historical edit revisions bypassed.' }
    ],
    chatHistory: []
  }
];

export default function App() {
  // Guest by default — the app runs with no account logged in.
  const [user, setUser] = useState<User | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [pendingCheckout, setPendingCheckout] = useState(false);

  const [activeTab, setActiveTab] = useState<ContentType>('photos');
  const [reports, setReports] = useState<AnalysisReport[]>(INITIAL_REPORTS);
  const [currentReport, setCurrentReport] = useState<AnalysisReport | null>(null);
  const [searchHistoryQuery, setSearchHistoryQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isPro, setIsPro] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [legalPage, setLegalPage] = useState<LegalSlug | null>(null);
  // Bumps whenever a scan is consumed, so "scans remaining" re-renders.
  const [scanTick, setScanTick] = useState(0);

  // scanTick forces this to recompute after a scan is consumed.
  void scanTick;
  const scansLeft = scansRemaining(isPro);

  // Returns false (and surfaces an upgrade prompt) when a scan isn't allowed.
  const guardScan = (_text?: string): boolean => {
    if (!canScan(isPro)) {
      alert(`You've used all ${FREE_DAILY_SCANS} free scans for today. Upgrade to Pro for unlimited scans.`);
      handleUpgrade();
      return false;
    }
    return true;
  };

  const consumeScan = () => {
    recordScan(isPro);
    setScanTick((t) => t + 1);
  };

  // ── On load: restore session, verify Pro via Stripe, handle checkout return ─
  useEffect(() => {
    const stored = getStoredUser();
    if (stored) setUser(stored);

    const params = new URLSearchParams(window.location.search);
    const upgrade = params.get('upgrade');
    const authError = params.get('error');

    if (authError === 'google_not_configured') {
      window.history.replaceState({}, '', window.location.pathname);
      alert('Google Sign-In requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to be added to your Render Environment Variables. Please use Email Login or configure your Google API credentials in Render.');
    }

    // Handle Google OAuth callback token in URL hash / params
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#\/?/, '?'));
    const tokenFromHash = hashParams.get('access_token');
    if (tokenFromHash) {
      setAccessToken(tokenFromHash);
      window.history.replaceState(null, '', window.location.pathname);
      getJson<{ success: boolean; user: any }>(apiUrl('/auth/me'))
        .then((data) => {
          if (data?.user?.email) {
            const googleUser: User = {
              email: data.user.email,
              name: data.user.name || data.user.email.split('@')[0],
              picture: data.user.avatar_url,
              provider: 'google',
            };
            setStoredUser(googleUser);
            setUser(googleUser);
          }
        })
        .catch((e) => console.warn('Could not fetch user profile from OAuth callback token:', e));
    }

    const tracker = params.get('tracker') || params.get('beacon');
    const sig = params.get('sig') || params.get('signature');
    const orderId = params.get('order_id');

    if (tracker || upgrade === 'success') {
      postJson<{ success: boolean; isPro: boolean }>(apiUrl('/api/payments/safepay/verify'), {
        tracker,
        sig,
        order_id: orderId,
        email: stored?.email,
      })
        .then((res) => {
          if (res?.isPro || res?.success) {
            applyPro(true);
          }
        })
        .catch((e) => console.warn('[Safepay] Verification call warning:', e));
    }

    const init = async () => {
      const email = stored?.email;
      // After returning from Checkout, the subscription may take a moment
      // to register — poll a few times before giving up.
      const attempts = (upgrade === 'success' || tracker) ? 5 : 1;
      for (let i = 0; i < attempts; i++) {
        const pro = await fetchProStatus(email);
        if (pro) { applyPro(true); break; }
        if (i < attempts - 1) await new Promise((r) => setTimeout(r, 1500));
      }
      if (upgrade) {
        // Clean the query string so a refresh doesn't re-trigger.
        window.history.replaceState({}, '', window.location.pathname);
        if (upgrade === 'success') {
          alert('🎉 Welcome to TruthAI Pro! Unlimited scans and all Pro features are unlocked.');
        } else if (upgrade === 'cancelled') {
          alert('Payment was cancelled. You can upgrade to Pro anytime.');
        }
      }
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hash-based legal pages (#privacy, #terms, #cookies)
  useEffect(() => {
    const sync = () => setLegalPage(parseLegalHash());
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  const openLegal = (slug: LegalSlug) => {
    window.location.hash = slug;
    setLegalPage(slug);
  };

  const closeLegal = () => {
    history.replaceState(null, '', window.location.pathname + window.location.search);
    setLegalPage(null);
  };

  // Persist Pro users' generated reports so their history survives reloads.
  useEffect(() => {
    if (!isPro) return;
    saveReports(reports.filter((r) => r.id.startsWith('report-')));
  }, [reports, isPro]);

  const applyPro = (pro: boolean) => {
    setIsPro(pro);
    if (pro) {
      const saved = loadSavedReports();
      if (saved && saved.length) {
        setReports((prev) => {
          const ids = new Set(prev.map((r) => r.id));
          const restored = (saved as AnalysisReport[]).filter((r) => !ids.has(r.id));
          return [...restored, ...prev];
        });
      }
    }
  };

  // ── Fetch user-isolated history when user is logged in ────────────────────
  useEffect(() => {
    if (!user) return;
    const loadHistory = async () => {
      try {
        const res = await getJson<{ success: boolean; reports: AnalysisReport[] }>(apiUrl('/api/history'));
        if (res?.reports && Array.isArray(res.reports) && res.reports.length > 0) {
          setReports(res.reports);
        }
      } catch (e) {
        console.warn('Could not fetch user-isolated history from server:', e);
      }
    };
    loadHistory();
  }, [user]);

  // ── Authentication controllers ─────────────────────────────────────────────
  const handleLoginSuccess = async (loggedIn: User) => {
    setStoredUser(loggedIn);
    setUser(loggedIn);
    setShowAuth(false);
    const pro = await fetchProStatus(loggedIn.email);
    applyPro(pro);
    if (pendingCheckout) {
      setPendingCheckout(false);
      startCheckout(loggedIn.email).catch((e) => alert(e.message));
    }
  };

  const handleLogout = () => {
    clearStoredUser();
    clearSavedReports();
    setUser(null);
    setIsPro(false);
    setReports(INITIAL_REPORTS);
    setCurrentReport(null);
  };

  // Start the real Stripe Checkout flow (requires an account so the subscription
  // is tied to an email).
  const handleUpgrade = () => {
    if (isPro) return;
    if (!user) {
      setPendingCheckout(true);
      setShowAuth(true);
      return;
    }
    startCheckout(user.email).catch((e) => alert(e.message || 'Could not start checkout.'));
  };

  // Normalize a raw API response into a full AnalysisReport
  const buildReport = (
    reportData: any,
    opts: { type: string; title?: string; fileSize?: string; imageUrl?: string }
  ): AnalysisReport => {
    const title = opts.title || reportData.title || `Analyzed Traces: ${opts.type}`;
    return {
      id: `report-${Date.now()}`,
      title,
      type: resolveReportType(opts.type),
      timestamp: 'Just Now',
      fileSize: opts.fileSize || reportData.resolution || '1.1 MB',
      truthScore: reportData.truthScore ?? 50,
      confidence: reportData.confidence,
      status: reportData.status || 'manipulated',
      riskLevel: reportData.riskLevel || 'moderate',
      explanation: reportData.explanation || 'Detailed semantic evaluation traces synthetic indicators.',
      resolution: reportData.resolution,
      colorSpace: reportData.colorSpace,
      bitDepth: reportData.bitDepth,
      method: reportData.method,
      imageUrl: opts.imageUrl || reportData.imageUrl,
      metrics: reportData.metrics || [],
      chatHistory: [
        { role: 'assistant', text: `TruthAI Forensic initialized for: "${title}". Spatial checks complete. Ready for follow-up questions.` }
      ]
    };
  };

  // Run forensic verification (Live Server Endpoint or fallback)
  const handleAnalyzeContent = async (text: string, type: string) => {
    if (!guardScan(text)) return;
    setIsLoading(true);
    try {
      const reportData = await postAnalyze<any>(apiUrl('/api/analyze'), { text, type });
      const newReport = buildReport(reportData, { type });

      setReports(prev => [newReport, ...prev]);
      setCurrentReport(newReport);
      consumeScan();
    } catch (err: any) {
      console.error(err);
      const msg = err instanceof ApiError ? err.message : err.message || 'Unknown error';
      alert(`Analysis could not be completed: ${msg}`);
    } finally {
      setIsLoading(false);
    }
  };

/**
 * Extract representative frames from a video file using a hidden video element and canvas.
 */
async function extractVideoFrames(file: File, frameCount: number = 5): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.src = URL.createObjectURL(file);
    video.muted = true;
    video.playsInline = true;

    video.onloadedmetadata = () => {
      const duration = video.duration;
      if (!duration || isNaN(duration)) {
        URL.revokeObjectURL(video.src);
        return reject(new Error('Could not determine video duration.'));
      }

      const fractions = [0.05, 0.25, 0.50, 0.75, 0.95];
      const targetTimes = fractions.map(f => f * duration);
      const frames: string[] = [];
      let currentIndex = 0;

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      const captureFrame = () => {
        if (!ctx) {
          URL.revokeObjectURL(video.src);
          return reject(new Error('Canvas context not available.'));
        }
        
        const MAX_SIZE = 512;
        let w = video.videoWidth;
        let h = video.videoHeight;
        if (w > MAX_SIZE || h > MAX_SIZE) {
          if (w > h) {
            h = Math.round((h * MAX_SIZE) / w);
            w = MAX_SIZE;
          } else {
            w = Math.round((w * MAX_SIZE) / h);
            h = MAX_SIZE;
          }
        }
        
        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(video, 0, 0, w, h);
        
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        frames.push(dataUrl);

        currentIndex++;
        if (currentIndex < targetTimes.length) {
          video.currentTime = targetTimes[currentIndex];
        } else {
          URL.revokeObjectURL(video.src);
          resolve(frames);
        }
      };

      video.addEventListener('seeked', captureFrame);
      video.currentTime = targetTimes[0];
    };

    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      reject(new Error('Error loading video file for frame extraction.'));
    };
  });
}

  // Run forensic verification on an uploaded file (image/video/document)
  const handleAnalyzeFile = async (file: File) => {
    if (!guardScan()) return;
    setIsLoading(true);
    const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif)$/i.test(file.name);
    const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|avi|mov)$/i.test(file.name);
    const uploadType = activeTab === 'academic' ? 'assignment' : (isImage ? 'image' : isVideo ? 'video' : 'document');

    try {
      let imageBase64: string | undefined;
      let imageUrl: string | undefined;
      let videoFrames: string[] | undefined;
      
      if (isImage) {
        imageUrl = await readFileAsDataURL(file);
        imageBase64 = imageUrl.split(',')[1];
      } else if (isVideo) {
        try {
          const rawFrames = await extractVideoFrames(file, 5);
          videoFrames = rawFrames.map(f => f.split(',')[1]);
        } catch (e: any) {
          console.warn('Failed to extract video frames:', e);
          throw new Error('Could not extract frames from video. The format may be unsupported.');
        }
      }

      let textContent = `Forensic authenticity analysis of uploaded file "${file.name}" (${file.type || 'unknown type'}, ${formatBytes(file.size)}).`;
      const isText = file.type.startsWith('text/') || /\.(txt|md|csv|html|css|js|ts|tsx|json)$/i.test(file.name);
      if (!isImage && !isVideo && isText) {
        try {
          textContent = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(reader.error || new Error('Failed to read text file'));
            reader.readAsText(file);
          });
        } catch (e) {
          console.warn('Failed to read text file, using metadata fallback:', e);
        }
      }

      const reportData = await postAnalyze<any>(apiUrl('/api/analyze'), {
        text: textContent,
        type: uploadType,
        imageBase64,
        videoFrames,
        mimeType: file.type
      });
      const newReport = buildReport(reportData, {
        type: uploadType,
        title: file.name,
        fileSize: formatBytes(file.size),
        imageUrl
      });

      setReports(prev => [newReport, ...prev]);
      setCurrentReport(newReport);
      consumeScan();
    } catch (err: any) {
      console.error(err);
      const msg = err instanceof ApiError ? err.message : err.message || 'Upload failed';
      alert(`Upload analysis failed: ${msg}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Follow-up AI chats
  const handleSendChatMessage = async (message: string) => {
    if (!currentReport) return;
    
    // Optimistic UI update
    const userMessageObj = { role: 'user' as const, text: message };
    const updatedReport = {
      ...currentReport,
      chatHistory: [...currentReport.chatHistory, userMessageObj]
    };
    
    // update report inside reports lists
    setCurrentReport(updatedReport);
    setReports(prev => prev.map(r => r.id === currentReport.id ? updatedReport : r));
    
    setIsChatLoading(true);

    try {
      const chatData = await postJson<{ text: string }>(apiUrl('/api/chat'), {
        userMessage: message,
        chatHistory: currentReport.chatHistory,
        reportContext: {
          title: currentReport.title,
          status: currentReport.status,
          truthScore: currentReport.truthScore,
          riskLevel: currentReport.riskLevel,
          explanation: currentReport.explanation
        }
      });
      const assistantMessageObj = { role: 'assistant' as const, text: chatData.text };

      const fullyUpdatedReport = {
        ...updatedReport,
        chatHistory: [...updatedReport.chatHistory, assistantMessageObj]
      };

      setCurrentReport(fullyUpdatedReport);
      setReports(prev => prev.map(r => r.id === currentReport.id ? fullyUpdatedReport : r));
    } catch (err: any) {
      console.error(err);
      const msg = err instanceof ApiError ? err.message : 'Connection error';
      const errorMessageObj = { role: 'assistant' as const, text: `Could not reach the analysis assistant: ${msg}` };
      const failedUpdatedReport = {
        ...updatedReport,
        chatHistory: [...updatedReport.chatHistory, errorMessageObj]
      };
      setCurrentReport(failedUpdatedReport);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleSelectReport = (id: string) => {
    const report = reports.find(r => r.id === id);
    if (report) {
      setCurrentReport(report);
    }
  };

  const handleDeleteReport = (id: string) => {
    setReports(prev => prev.filter(r => r.id !== id));
    if (currentReport?.id === id) {
      setCurrentReport(null);
    }
  };

  // Render correct body elements inside layout wrapper
  const renderMainContent = () => {
    if (legalPage) {
      return <LegalPage slug={legalPage} onClose={closeLegal} />;
    }

    if (currentReport) {
      return (
        <ResultsScreen
          report={currentReport}
          onSendChatMessage={handleSendChatMessage}
          isChatLoading={isChatLoading}
          onNewAnalysis={() => setCurrentReport(null)}
          isPro={isPro}
          onUpgrade={handleUpgrade}
        />
      );
    }

    if (activeTab === 'dashboard') {
      // Filter out reports matching searched history query
      const filtered = reports.filter(r => 
        r.title.toLowerCase().includes(searchHistoryQuery.toLowerCase())
      );

      return (
        <HistoryDashboard
          reports={filtered}
          onSelectReport={handleSelectReport}
          onDeleteReport={handleDeleteReport}
          onAnalyzeFile={handleAnalyzeFile}
          isLoading={isLoading}
          isPro={isPro}
          onUpgrade={handleUpgrade}
        />
      );
    }

    if (activeTab === 'settings') {
      return (
        <div className="w-full max-w-2xl mx-auto py-10 space-y-8 font-sans">
          <div className="space-y-2">
            <h3 className="font-display text-xl font-bold text-slate-900">TruthAI Node Setup & Settings</h3>
            <p className="text-xs text-slate-400">Manage investigator credentials, API keys, and validation rules.</p>
          </div>

          <div className="bg-white border border-slate-100 rounded-3xl p-6 space-y-6">
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-widest text-blue-600">Account</h4>
              <div className="text-xs text-slate-500 space-y-1">
                {user ? (
                  <>
                    <p><strong>Signed in as:</strong> {user.name}</p>
                    <p><strong>Email:</strong> {user.email}</p>
                    <p><strong>Plan:</strong> {isPro ? 'TruthAI Pro' : 'Free'}</p>
                  </>
                ) : (
                  <div className="flex items-center justify-between bg-slate-50 p-4 border border-slate-100 rounded-2xl">
                    <span className="text-xs text-slate-600">You're browsing as a guest. Sign in to save history and upgrade.</span>
                    <button
                      onClick={() => setShowAuth(true)}
                      className="px-3.5 py-1.5 bg-blue-600 text-white rounded-lg text-[10px] font-bold shadow-md shadow-blue-500/10 cursor-pointer shrink-0 ml-3"
                    >
                      Sign In
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-widest text-blue-600">Subscription</h4>
              <div className="flex justify-between items-center bg-slate-50 p-4 border border-slate-100 rounded-2xl">
                <div className="text-xs">
                  <span className="font-bold text-slate-700">{isPro ? 'Pro — Unlimited scans' : 'Free — Basic tier'}</span>
                  {!isPro && (
                    <span className="block text-slate-400 mt-0.5">
                      {scansLeft} of {FREE_DAILY_SCANS} daily scans remaining
                    </span>
                  )}
                </div>
                {!isPro ? (
                  <button
                    onClick={handleUpgrade}
                    className="px-3.5 py-1.5 bg-blue-600 text-white rounded-lg text-[10px] font-bold shadow-md shadow-blue-500/10 cursor-pointer shrink-0 ml-3"
                  >
                    Upgrade — $3/mo
                  </button>
                ) : (
                  <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">Active</span>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Default: Welcome Screen (Photos, Videos, News, Academic tabs)
    return (
      <WelcomeScreen
        activeTab={activeTab}
        onAnalyze={handleAnalyzeContent}
        onAnalyzeFile={handleAnalyzeFile}
        isLoading={isLoading}
        onViewReport={handleSelectReport}
        onNavigateToTab={(tab) => setActiveTab(tab)}
        isPro={isPro}
        scansLeft={scansLeft}
        onUpgrade={handleUpgrade}
      />
    );
  };


  return (
    <div className="min-h-screen bg-[#f9f9ff] flex text-slate-800 selection:bg-blue-600/10">
      <SeoHead activeTab={activeTab} legalPage={legalPage} hasCurrentReport={!!currentReport} />

      {/* Mobile backdrop overlay (closes the drawer when tapped) */}
      {isSidebarOpen && (
        <div
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-30 lg:hidden"
          aria-hidden="true"
        />
      )}

      {/* Sidebar — fixed on desktop, off-canvas drawer on mobile */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={(tab) => {
          setCurrentReport(null);
          setActiveTab(tab);
          setIsSidebarOpen(false);
        }}
        user={user}
        onLogout={handleLogout}
        onOpenAuth={() => setShowAuth(true)}
        isPro={isPro}
        onUpgrade={handleUpgrade}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      {/* Main Container viewport */}
      <div className="flex-1 lg:ml-64 flex flex-col min-h-screen min-w-0">

        {/* Top Navbar Header */}
        <Header
          onNewAnalysis={() => {
            setCurrentReport(null);
            if (activeTab === 'dashboard' || activeTab === 'settings') {
              setActiveTab('photos');
            }
          }}
          activeTab={activeTab}
          setActiveTab={(tab) => {
            setCurrentReport(null);
            setActiveTab(tab);
          }}
          onSearchHistory={(query) => setSearchHistoryQuery(query)}
          user={user}
          isPro={isPro}
          onOpenAuth={() => setShowAuth(true)}
          onLogout={handleLogout}
          onToggleSidebar={() => setIsSidebarOpen((v) => !v)}
        />

        {/* Viewport content */}
        <main className="flex-1 mt-16 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          {renderMainContent()}
        </main>

        <Footer onOpenLegal={openLegal} />

      </div>

      {/* Login / sign-up overlay (opened from the profile icon or upgrade flow) */}
      {showAuth && (
        <AuthScreen
          onLoginSuccess={handleLoginSuccess}
          onClose={() => {
            setShowAuth(false);
            setPendingCheckout(false);
          }}
        />
      )}
    </div>
  );
}
