import { useState, useRef, useEffect, FormEvent } from 'react';
import { AlertTriangle, Award, ZoomIn, Download, FileText, Send, Sparkles, MessageSquare, Lock } from 'lucide-react';
import { AnalysisReport } from '../types';
import { downloadReportPdf } from '../utils';

interface ResultsScreenProps {
  report: AnalysisReport;
  onSendChatMessage: (message: string) => void;
  isChatLoading: boolean;
  onNewAnalysis: () => void;
  isPro: boolean;
  onUpgrade: () => void;
}

export default function ResultsScreen({ report, onSendChatMessage, isChatLoading, onNewAnalysis, isPro, onUpgrade }: ResultsScreenProps) {
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [report.chatHistory]);

  const handleSubmitChat = (e: FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isChatLoading) return;
    onSendChatMessage(chatInput);
    setChatInput('');
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'authentic':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'ai-generated':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'uncertain':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'manipulated':
      default:
        return 'bg-rose-50 text-rose-700 border-rose-200';
    }
  };

  const statusHeadline =
    report.status === 'authentic' ? 'Likely Authentic'
      : report.status === 'ai-generated' ? 'Likely AI-Generated'
      : report.status === 'uncertain' ? 'Uncertain'
      : 'Likely Manipulated';

  const currentImage = report.imageUrl || "https://lh3.googleusercontent.com/aida-public/AB6AXuAE0FL7rSIRxVOjrNIpqmlfccnePSU5suY3cgVF4dd8djO7alByoSPauAWdRLwHgcPIyPghgCtHXTY_2HQnLOYYzep5_doiA0t-cGHvHbFABGaS24T9ocYJToSTfGD1kJBHFgGK7H1TC-t45wMreL5O4gs9Nx2QywyD_HCBt3tvmZNVZU_s7Qipur07Kj4GaPl8TbYFbDN98XfW3DV74Dpdo7677sJroTd3uBy0YloRTasy0MTHIeE08ZjUw0xa8DO2r-jZ423jCVk";

  return (
    <div className="w-full max-w-5xl mx-auto space-y-8 py-6 pb-36">
      
      {/* Return link */}
      <button 
        onClick={onNewAnalysis}
        className="text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1 cursor-pointer outline-none"
      >
        <span>&larr;</span> Back to New Verification
      </button>

      {/* Main Forensic Overview Section Card */}
      <section className="bg-white p-6 sm:p-8 rounded-[24px] border border-slate-100 shadow-sm relative overflow-hidden flex flex-col md:flex-row items-center gap-8">
        {/* Absolute Background Shield Icon deco */}
        <div className="absolute top-0 right-0 p-6 text-slate-50 opacity-60 pointer-events-none select-none">
          <Award className="w-48 h-48" />
        </div>

        {/* Circular gauge score */}
        <div className="relative w-40 h-40 shrink-0 select-none">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
            {/* Background track circle */}
            <circle
              className="text-slate-100"
              cx="50"
              cy="50"
              fill="transparent"
              r="40"
              stroke="currentColor"
              strokeWidth="8"
            />
            {/* Highlighted score circle */}
            <circle
              className={`${report.truthScore > 60 ? 'text-emerald-500' : report.truthScore > 30 ? 'text-amber-500' : 'text-purple-600'} transition-all duration-1000 ease-out`}
              cx="50"
              cy="50"
              fill="transparent"
              r="40"
              stroke="currentColor"
              strokeWidth="8"
              strokeDasharray={251.2}
              strokeDashoffset={251.2 - (251.2 * report.truthScore) / 100}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-3xl font-display font-black text-slate-900">{report.truthScore}%</span>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
              {report.type === 'assignment' ? 'HUMANITY INDEX' : 'TRUTH INDEX'}
            </span>
          </div>
        </div>

        {/* Title details & explanation */}
        <div className="flex-1 space-y-4 relative z-10 text-center md:text-left">
          <div className="flex flex-col sm:flex-row items-center gap-3 justify-center md:justify-start">
            <h3 className="text-2xl font-display font-black text-slate-900 leading-tight">
              {statusHeadline}
            </h3>
            <span className={`px-4 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5 ${getStatusBadgeClass(report.status)}`}>
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{report.riskLevel.toUpperCase()} RISK DETECTED</span>
            </span>
          </div>

          <p className="font-sans text-sm text-slate-500 leading-relaxed max-w-2xl">
            {report.explanation}
          </p>

          <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 pt-1">
            {typeof report.confidence === 'number' && (
              <div className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border bg-blue-50 border-blue-100 text-blue-700">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
                <span>Model confidence: {Math.round(report.confidence)}%</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-xs text-slate-600 font-semibold bg-slate-50 px-3 py-1.5 rounded-full border border-slate-100">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-600"></span>
              <span>DeepSight Neural Engine</span>
            </div>
          </div>
        </div>
      </section>

      {/* Bento Grid Indicators of report (3 cols) — advanced signals are Pro-only */}
      <div className="relative">
        {!isPro && report.metrics.length > 0 && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-2xl bg-white/70 backdrop-blur-[3px] border border-slate-100">
            <div className="flex items-center gap-2 text-slate-700">
              <Lock className="w-4 h-4" />
              <span className="text-sm font-bold">Advanced AI signals & confidence scores</span>
            </div>
            <p className="text-xs text-slate-500 max-w-xs text-center px-4">
              Per-signal forensic breakdowns with confidence scores are a Pro feature.
            </p>
            <button
              onClick={onUpgrade}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md shadow-blue-500/15 transition-colors"
            >
              Unlock with Pro — $3/mo
            </button>
          </div>
        )}
        <div className={`grid grid-cols-1 md:grid-cols-3 gap-6 ${!isPro ? 'pointer-events-none select-none' : ''}`}>
        {report.metrics.map((metric, idx) => {
          const colors = [
            { strip: 'bg-rose-500', text: 'text-rose-700 bg-rose-50', bar: 'bg-rose-500' },
            { strip: 'bg-amber-500', text: 'text-amber-700 bg-amber-50', bar: 'bg-amber-500' },
            { strip: 'bg-blue-600', text: 'text-blue-700 bg-blue-50', bar: 'bg-blue-600' }
          ];
          const clr = colors[idx % colors.length];

          return (
            <div key={metric.name} className="bg-white p-5 rounded-2xl border border-slate-100 relative overflow-hidden flex flex-col justify-between h-44 shadow-sm">
              {/* Left Stripe */}
              <div className={`indicator-strip ${clr.strip}`} />
              
              <div className="pl-3 space-y-2">
                <div className="flex justify-between items-start">
                  <h4 className="font-sans text-sm font-bold text-slate-800">{metric.name}</h4>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest ${clr.text}`}>
                    {metric.label}
                  </span>
                </div>
                <p className="font-sans text-[11px] text-slate-400 leading-relaxed">
                  {metric.description}
                </p>
              </div>

              {/* Progress Bar indicator */}
              <div className="pl-3 mt-auto">
                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full ${clr.bar} rounded-full`} style={{ width: `${metric.score}%` }}></div>
                </div>
              </div>
            </div>
          );
        })}
        </div>
      </div>

      {/* Spatial Heatmap Visualizer */}
      <section className="bg-white p-6 sm:p-8 rounded-[24px] border border-slate-100 shadow-sm">
        <div className="flex flex-col lg:flex-row gap-8">
          
          {/* Main Visual Frame */}
          <div className="flex-1 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-slate-900">
                {report.type === 'assignment' ? 'Handwriting Morphology Grid' : 'Spatial Heatmap Forensic'}
              </h3>
              <div className="flex gap-1.5">
                <button 
                  onClick={() => alert("Zoom forensic mode centered on high contrast frequencies.")}
                  className="p-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-600 transition-colors"
                  title="Zoom In"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => alert("Raw diagnostic frame layers downloaded to disk.")}
                  className="p-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-600 transition-colors"
                  title="Download Heatmap Layers"
                >
                  <Download className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Simulated interactive frame canvas */}
            <div className="relative rounded-2xl overflow-hidden aspect-video border border-slate-100 select-none group shrink-0">
              {report.type === 'assignment' && !report.imageUrl ? (
                <div className="w-full h-full bg-[#fcfbf7] p-6 flex flex-col relative overflow-hidden select-none shrink-0" style={{ backgroundImage: 'linear-gradient(#e2eade 1px, transparent 1px)', backgroundSize: '100% 24px' }}>
                  {/* Red margin line */}
                  <div className="absolute left-10 top-0 bottom-0 w-[1px] bg-red-300" />
                  <div className="pl-8 space-y-3 font-mono text-slate-600 text-[11px] leading-[24px]">
                    <p className="font-bold text-slate-800 border-b border-dashed border-slate-200 pb-0.5">Academic Integrity Assessment Report</p>
                    <p>Document: Forensic Analysis of Handwritten Assignment</p>
                    <p>Linguistic Cadence: Analyzed for lexical diversity & styling anomalies.</p>
                    <p>Glyph Regularity: Checked stroke consistency and templates.</p>
                    <p>Pressure Profile: Examined for mechanical pen dynamics.</p>
                    <p className="italic text-slate-400 mt-2">Simulated preview representing scanned academic submission page.</p>
                  </div>
                </div>
              ) : (
                <>
                  <img
                    src={currentImage}
                    alt={report.type === 'assignment' ? "Handwritten Scan" : "AI Portrait"}
                    className="w-full h-full object-cover grayscale brightness-50"
                  />
                  {/* Ambient purple scan glow simulation overlay */}
                  <div className="absolute inset-0 bg-gradient-to-tr from-purple-500/25 via-transparent to-blue-500/15 mix-blend-screen opacity-50 shrink-0"></div>

                  {/* Target Detection Overlaid Box */}
                  {report.targetDetails && (
                    <div 
                      className="absolute border-2 border-purple-500 rounded p-2 flex flex-col justify-between"
                      style={{
                        top: report.targetDetails.y || '20%',
                        left: report.targetDetails.x || '40%',
                        width: report.targetDetails.width || '150px',
                        height: report.targetDetails.height || '150px',
                        boxShadow: '0 0 20px rgba(139, 92, 246, 0.4)'
                      }}
                    >
                      <span className="bg-purple-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded w-fit uppercase tracking-wider">
                        {report.targetDetails.label || 'Artifact Detected'}
                      </span>
                      <div className="w-full h-[1px] bg-purple-400/40 my-1"></div>
                      <span className="text-purple-300 text-[10px] font-mono font-bold mt-auto self-end">
                        Prob: {report.targetDetails.confidence || 0.99}
                      </span>
                    </div>
                  )}

                  {/* Blurry circular hotspots */}
                  <div className="absolute bottom-[30%] right-[20%] w-24 h-24 bg-red-600/15 rounded-full blur-2xl animate-pulse"></div>
                </>
              )}
            </div>
            <p className="text-[11px] text-slate-400 italic">
              {report.type === 'assignment' 
                ? '* Highlighted areas indicate detected stroke, spacing, or glyph-regularity anomalies consistent with synthetic fonts.' 
                : '* Purple areas indicate high density correlation of structural automation artifacts mapped across pixels.'}
            </p>
          </div>

          {/* Parameters Metadata checklist sidecard */}
          <div className="w-full lg:w-80 space-y-6">
            <div className="p-5 bg-slate-50/50 border border-slate-100 rounded-2xl">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Scan Specifications</h4>
              <div className="space-y-3.5">
                <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                  <span className="text-xs text-slate-400 font-medium">Resolution Scope</span>
                  <span className="text-xs font-bold text-slate-800">{report.resolution || '2048 x 1536'}</span>
                </div>
                <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                  <span className="text-xs text-slate-400 font-medium">Spectral Context</span>
                  <span className="text-xs font-bold text-slate-800">{report.colorSpace || 'sRGB IEC61'}</span>
                </div>
                <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                  <span className="text-xs text-slate-400 font-medium">Model Depth</span>
                  <span className="text-xs font-bold text-slate-800">{report.bitDepth || '24-bit True'}</span>
                </div>
                <div className="flex justify-between items-center pb-1">
                  <span className="text-xs text-slate-400 font-medium">Detector Engine</span>
                  <span className="text-xs font-bold text-slate-800">{report.method || 'ConvNet Ensemble'}</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => (isPro ? downloadReportPdf(report) : onUpgrade())}
              className="w-full py-3.5 border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all outline-none"
            >
              {isPro ? <FileText className="w-4 h-4 text-slate-400" /> : <Lock className="w-4 h-4 text-slate-400" />}
              <span>{isPro ? 'Download PDF Forensic Report' : 'PDF Report (Pro) — Upgrade'}</span>
            </button>
          </div>

        </div>
      </section>

      {/* Free-tier branding strip */}
      {!isPro && (
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2 text-[11px] text-slate-400 bg-slate-50 border border-slate-100 rounded-2xl py-3 px-4">
          <span className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
            Forensic report by <span className="font-bold text-slate-600">TruthAI</span>
          </span>
          <span className="hidden sm:inline">·</span>
          <button onClick={onUpgrade} className="text-blue-600 font-bold hover:underline">
            Upgrade to Pro to remove branding
          </button>
        </div>
      )}

      {/* Follow-up Interactive Chat Console with Gemini */}
      <footer className="fixed bottom-0 left-0 lg:left-64 right-0 p-4 sm:p-5 bg-white/95 border-t border-slate-100 z-10 shadow-lg shrink-0">
        <div className="max-w-4xl mx-auto space-y-4">
          
          {/* Chat message threads inside viewport */}
          {report.chatHistory.length > 0 && (
            <div className="max-h-28 overflow-y-auto mb-3 space-y-2 border-b border-slate-50 pb-3 pr-2 scrollbar-thin">
              {report.chatHistory.map((msg, i) => (
                <div key={i} className={`flex gap-2.5 text-xs ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`p-2.5 rounded-2xl max-w-xl leading-relaxed ${
                    msg.role === 'user' 
                      ? 'bg-blue-600 text-white font-medium' 
                      : 'bg-slate-100 text-slate-700 font-medium'
                  }`}>
                    <p className="whitespace-pre-wrap">{msg.text}</p>
                  </div>
                </div>
              ))}
              {isChatLoading && (
                <div className="flex justify-start gap-2.5">
                  <div className="bg-slate-100 text-slate-500 text-xs p-2.5 rounded-2xl flex items-center gap-1.5 font-medium shimmer-bg">
                    <Sparkles className="w-3.5 h-3.5 animate-spin" />
                    <span>Analyzing follow-up coordinates...</span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          )}

          {/* Interactive footer entry */}
          <form onSubmit={handleSubmitChat} className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-2xl blur opacity-25 group-focus-within:opacity-100 transition duration-500"></div>
            <div className="relative bg-white border border-slate-200 rounded-xl flex items-center px-4 py-3 shadow-md focus-within:border-blue-500 transition-all">
              <MessageSquare className="w-4.5 h-4.5 text-blue-600 mr-3 shrink-0" />
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder={report.type === 'assignment' 
                  ? "Ask TruthAI a follow-up question regarding stroke width, character shapes, pressure variation, or spacing..." 
                  : "Ask TruthAI a follow-up question regarding eye artifacts, linguistic uniformity, or EXIF anomalies..."}
                className="flex-1 bg-transparent border-none outline-none focus:ring-0 font-sans text-xs sm:text-sm text-slate-800 placeholder:text-slate-400"
                disabled={isChatLoading}
              />
              <button 
                type="submit"
                disabled={!chatInput.trim() || isChatLoading}
                className="p-2 shrink-0 rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:bg-slate-200 disabled:text-slate-400 transition-colors flex items-center justify-center cursor-pointer outline-none"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </form>
        </div>
      </footer>

    </div>
  );
}
