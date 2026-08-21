import { useState, useRef, ChangeEvent, DragEvent } from 'react';
import { Filter, Download, CheckCircle2, AlertTriangle, Upload, ArrowRight, Activity, Trash2, ChevronLeft, ChevronRight, Lock } from 'lucide-react';
import { AnalysisReport } from '../types';
import { downloadTextFile, reportsToCSV } from '../utils';

interface HistoryDashboardProps {
  reports: AnalysisReport[];
  onSelectReport: (id: string) => void;
  onDeleteReport: (id: string) => void;
  onAnalyzeFile: (file: File) => void;
  isLoading: boolean;
  isPro: boolean;
  onUpgrade: () => void;
}

export default function HistoryDashboard({ reports, onSelectReport, onDeleteReport, onAnalyzeFile, isLoading, isPro, onUpgrade }: HistoryDashboardProps) {
  const [activeTab, setActiveTab] = useState<'all' | 'media' | 'urls' | 'archived'>('all');
  const [filterQuery, setFilterQuery] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onAnalyzeFile(file);
    e.target.value = '';
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onAnalyzeFile(file);
  };

  const handleExportCSV = () => {
    if (reports.length === 0) return;
    const stamp = new Date().toISOString().slice(0, 10);
    downloadTextFile(`truthai-history-${stamp}.csv`, reportsToCSV(reports), 'text/csv');
  };

  // Slicing categories
  const filteredReports = reports.filter(report => {
    // text search
    const matchesSearch = report.title.toLowerCase().includes(filterQuery.toLowerCase()) || 
                          report.explanation.toLowerCase().includes(filterQuery.toLowerCase());
    
    if (!matchesSearch) return false;

    // tab filters
    if (activeTab === 'all') return true;
    if (activeTab === 'media') return report.type === 'photo' || report.type === 'video';
    if (activeTab === 'urls') return report.type === 'link';
    if (activeTab === 'archived') return report.truthScore > 90; // mock archived as authentic
    return true;
  });

  const getVerdictBadge = (status: string) => {
    switch (status) {
      case 'authentic':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Authentic</span>
          </span>
        );
      case 'ai-generated':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-100">
            <Activity className="w-3.5 h-3.5" />
            <span>AI Generated</span>
          </span>
        );
      case 'uncertain':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-100">
            <Activity className="w-3.5 h-3.5" />
            <span>Uncertain</span>
          </span>
        );
      case 'manipulated':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-100">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Manipulated</span>
          </span>
        );
    }
  };

  return (
    <div className="w-full max-w-container-max mx-auto space-y-10 py-6">
      
      {/* Table Header Controls */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-end gap-4">
        <div>
          <h2 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 leading-none">
            Analysis History
          </h2>
          <p className="text-sm font-medium text-slate-400 mt-2">
            Review and manage your high-fidelity truth detection intelligence reports.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Quick inline search inside headers */}
          <input
            type="text"
            placeholder="Type search keyword..."
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            className="flex-1 min-w-[140px] sm:flex-none px-3 py-1.5 border border-slate-200 rounded-xl bg-white text-xs outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button 
            onClick={() => alert("Current filters apply: All standard scans mapped.")}
            className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl flex items-center gap-1.5 outline-none transition-all"
          >
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span>Filters</span>
          </button>
          <button
            onClick={handleExportCSV}
            disabled={reports.length === 0}
            className="px-4 py-2 border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed text-slate-700 font-bold text-xs rounded-xl flex items-center gap-1.5 outline-none transition-all"
          >
            <Download className="w-3.5 h-3.5 text-slate-400" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Free-tier notice: history isn't persisted across sessions */}
      {!isPro && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-amber-50/70 border border-amber-100 rounded-2xl px-5 py-4">
          <div className="flex items-start gap-3 min-w-0">
            <Lock className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-800 leading-relaxed">
              <span className="font-bold">History saving is a Pro feature.</span> On the free plan your new scans aren't saved after you leave — upgrade to keep a permanent, searchable scan log.
            </p>
          </div>
          <button
            onClick={onUpgrade}
            className="shrink-0 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md shadow-blue-500/15 transition-colors"
          >
            Upgrade — $3/mo
          </button>
        </div>
      )}

      {/* Stats Bento Grid Header block */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        
        {/* Total stats */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 relative overflow-hidden flex flex-col justify-between h-36 shadow-sm">
          <div className="indicator-strip bg-blue-600" />
          <span className="text-xs font-semibold text-slate-400 pl-3">Total Analyzed</span>
          <span className="text-3xl font-display font-extrabold text-slate-900 pl-3 mt-1">1,284</span>
          <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1 pl-3 mt-auto">
            <span>&uarr; +12% this week</span>
          </span>
        </div>

        {/* AI generated list */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 relative overflow-hidden flex flex-col justify-between h-36 shadow-sm">
          <div className="indicator-strip bg-purple-600" />
          <span className="text-xs font-semibold text-slate-400 pl-3">AI Generated Detected</span>
          <span className="text-3xl font-display font-extrabold text-slate-900 pl-3 mt-1">412</span>
          <span className="text-[11px] font-semibold text-slate-400 pl-3 mt-auto">
            32.1% of total volume
          </span>
        </div>

        {/* Deepfakes Flagged */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 relative overflow-hidden flex flex-col justify-between h-36 shadow-sm">
          <div className="indicator-strip bg-rose-500" />
          <span className="text-xs font-semibold text-slate-400 pl-3">Deepfakes Flagged</span>
          <span className="text-3xl font-display font-extrabold text-slate-900 pl-3 mt-1">86</span>
          <span className="text-[11px] font-bold text-rose-600 flex items-center gap-1 pl-3 mt-auto">
            <span>Critical Action Required</span>
          </span>
        </div>

        {/* Avg Confidence */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 relative overflow-hidden flex flex-col justify-between h-36 shadow-sm">
          <div className="indicator-strip bg-emerald-500" />
          <span className="text-xs font-semibold text-slate-400 pl-3">Avg. Confidence</span>
          <span className="text-3xl font-display font-extrabold text-slate-900 pl-3 mt-1">98.4%</span>
          <div className="pl-3 mt-auto pr-2">
            <div className="h-1 bg-slate-100 rounded-full w-full overflow-hidden">
              <div className="bg-emerald-500 h-full rounded-full" style={{ width: '98%' }}></div>
            </div>
          </div>
        </div>

      </div>

      {/* Filter tabs inside table */}
      <div className="flex gap-4 border-b border-slate-100 pb-1.5 overflow-x-auto whitespace-nowrap">
        <button
          onClick={() => setActiveTab('all')}
          className={`px-4 py-2 font-sans text-xs font-bold border-b-2 transition-all cursor-pointer ${
            activeTab === 'all'
              ? 'text-blue-600 border-blue-600'
              : 'text-slate-500 hover:text-slate-800 border-transparent'
          }`}
        >
          All Content
        </button>
        <button
          onClick={() => setActiveTab('media')}
          className={`px-4 py-2 font-sans text-xs font-bold border-b-2 transition-all cursor-pointer ${
            activeTab === 'media'
              ? 'text-blue-600 border-blue-600'
              : 'text-slate-500 hover:text-slate-800 border-transparent'
          }`}
        >
          Media File Analysis
        </button>
        <button
          onClick={() => setActiveTab('urls')}
          className={`px-4 py-2 font-sans text-xs font-bold border-b-2 transition-all cursor-pointer ${
            activeTab === 'urls'
              ? 'text-blue-600 border-blue-600'
              : 'text-slate-500 hover:text-slate-800 border-transparent'
          }`}
        >
          Links/URLs
        </button>
        <button
          onClick={() => setActiveTab('archived')}
          className={`px-4 py-2 font-sans text-xs font-bold border-b-2 transition-all cursor-pointer ${
            activeTab === 'archived'
              ? 'text-blue-600 border-blue-600'
              : 'text-slate-500 hover:text-slate-800 border-transparent'
          }`}
        >
          Fully Authentic
        </button>
      </div>

      {/* Main Ledger Table Frame */}
      <div className="bg-white rounded-[24px] border border-slate-100 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50/50 border-b border-slate-100">
              <tr>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Source Content Context
                </th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Analyzed At
                </th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest col-span-1">
                  Scope
                </th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Verdict
                </th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">
                  Truth Confidence
                </th>
                <th className="px-6 py-4 w-16" />
              </tr>
            </thead>
            
            <tbody className="divide-y divide-slate-50 font-sans">
              {filteredReports.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-400 text-xs">
                    No forensic intelligence matches the search or filter query.
                  </td>
                </tr>
              ) : (
                filteredReports.map((report) => (
                  <tr 
                    key={report.id}
                    className="hover:bg-slate-50/40 transition-colors group cursor-pointer"
                  >
                    {/* Source context */}
                    <td 
                      onClick={() => onSelectReport(report.id)}
                      className="px-6 py-4.5"
                    >
                      <div className="flex items-center gap-3.5">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${
                          report.status === 'authentic' 
                            ? 'bg-emerald-50 text-emerald-600 border-emerald-100' 
                            : report.status === 'ai-generated' 
                            ? 'bg-purple-50 text-purple-600 border-purple-100' 
                            : 'bg-rose-50 text-rose-600 border-rose-100'
                        }`}>
                          <span className="text-xs uppercase font-extrabold">{report.type ? report.type[0] : 'S'}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-800 truncate max-w-xs">{report.title}</p>
                          <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mt-0.5">{report.type ?? 'text'} forensic</p>
                        </div>
                      </div>
                    </td>

                    {/* Timestamp */}
                    <td 
                      onClick={() => onSelectReport(report.id)}
                      className="px-6 py-4.5 text-xs text-slate-500 font-medium"
                    >
                      {report.timestamp}
                    </td>

                    {/* Word / size payload scope */}
                    <td 
                      onClick={() => onSelectReport(report.id)}
                      className="px-6 py-4.5 text-xs text-slate-500 font-medium"
                    >
                      {report.fileSize || 'N/A'}
                    </td>

                    {/* Verdict Soft badge */}
                    <td 
                      onClick={() => onSelectReport(report.id)}
                      className="px-6 py-4.5"
                    >
                      {getVerdictBadge(report.status)}
                    </td>

                    {/* Progress score */}
                    <td 
                      onClick={() => onSelectReport(report.id)}
                      className="px-6 py-4.5 text-right shrink-0"
                    >
                      <div className="inline-flex flex-col items-end gap-1">
                        <span className="text-xs font-bold text-slate-800">{report.truthScore}%</span>
                        <div className="h-1 w-20 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${
                            report.truthScore > 60 ? 'bg-emerald-500' : report.truthScore > 30 ? 'bg-amber-500' : 'bg-rose-500'
                          }`} style={{ width: `${report.truthScore}%` }}></div>
                        </div>
                      </div>
                    </td>

                    {/* Delete button */}
                    <td className="px-6 py-4.5 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteReport(report.id);
                        }}
                        className="p-1 px-2 text-slate-300 hover:text-red-600 rounded-md transition-all cursor-pointer"
                        title="Delete Trace"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Dynamic pagination layout matching Image */}
        <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50/30 flex justify-between items-center text-xs text-slate-500">
          <span>Showing 1-{filteredReports.length} of {filteredReports.length} analyses (Real-Time Grounding Enabled)</span>
          <div className="flex gap-1.5 font-bold">
            <button className="w-7 h-7 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg flex items-center justify-center transition-all disabled:opacity-50" disabled>
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button className="w-7 h-7 bg-blue-600 text-white rounded-lg flex items-center justify-center transition-all">
              1
            </button>
            <button className="w-7 h-7 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg flex items-center justify-center transition-all disabled:opacity-50" disabled>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Asymmetric professional layout footer */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Drag and Drop analysis card */}
        <div
          onClick={() => !isLoading && fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`lg:col-span-2 bg-white rounded-3xl p-6 border flex flex-col justify-center items-center text-center space-y-4 min-h-[300px] cursor-pointer transition-all ${
            isDragging ? 'border-blue-500 ring-4 ring-blue-500/10 shadow-md' : 'border-slate-100 hover:border-blue-400 hover:shadow-md'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.jpeg,.jpg,.png,.webp,video/*,.mp4,.pdf,.txt,.doc,.docx"
            className="hidden"
            onChange={handleFileChange}
          />
          <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center border border-blue-100/25">
            {isLoading ? (
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Upload className="w-6 h-6" />
            )}
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-slate-900">{isLoading ? 'Analyzing upload…' : 'Start a Deep Analysis'}</h3>
            <p className="max-w-xs mx-auto text-xs text-slate-400 leading-relaxed">
              Drag and drop any media file or click to browse and initiate a forensic TruthAI scan with up to 99.9% detection accuracy.
            </p>
          </div>
          <div className="w-full max-w-sm border-2 border-dashed border-slate-200 hover:border-blue-300 rounded-2xl p-6 flex flex-col items-center justify-center gap-1.5 transition-all text-xs">
            <span className="text-blue-600 font-bold">{isDragging ? 'Drop to analyze' : 'Click to upload files'}</span>
            <span className="text-slate-400">JPG, PNG, MP4, PDF, or text (max. 500MB)</span>
          </div>
        </div>

        {/* AI Training Pulse sidebar */}
        <div className="space-y-6 flex flex-col justify-between">
          <div className="bg-white p-5 rounded-3xl border border-slate-100 relative overflow-hidden flex-1 flex flex-col justify-between shadow-sm">
            <div className="indicator-strip bg-blue-600" />
            
            <div className="pl-3 space-y-2">
              <h4 className="font-display text-sm font-bold text-slate-800">AI Training Pulse</h4>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                TruthAI model checkpoints were last synchronized 2 hours ago with 14,000 new validated deepfake signatures.
              </p>
            </div>

            <div className="pl-3 space-y-3 pt-4">
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-[10px] font-bold text-slate-400">
                  <span>LLM Consistency</span>
                  <span className="text-blue-600">Active</span>
                </div>
                <div className="h-1 bg-slate-100 w-full rounded-full overflow-hidden">
                  <div className="bg-blue-600 h-full rounded-full" style={{ width: '80%' }}></div>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-[10px] font-bold text-slate-400">
                  <span>GAN Detection</span>
                  <span className="text-blue-600">Active</span>
                </div>
                <div className="h-1 bg-slate-100 w-full rounded-full overflow-hidden">
                  <div className="bg-blue-600 h-full rounded-full" style={{ width: '92%' }}></div>
                </div>
              </div>
            </div>

            <button 
              onClick={() => alert("Model changelog version list: Checked Stable-4.2 checkpoints.")}
              className="pl-3 text-[11px] text-blue-600 hover:underline font-bold flex items-center gap-1 mt-4 group cursor-pointer outline-none"
            >
              <span>View Changelog</span>
              <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>

          {/* Status bar */}
          <div className="bg-slate-900 border border-slate-800 text-slate-100 p-4 rounded-2xl flex items-center justify-between shadow-sm">
            <div className="text-left shrink-0">
              <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">TruthAI API Status</p>
              <p className="text-xs font-bold text-white mt-0.5">Integration Node Status</p>
            </div>
            <div className="flex items-center gap-1.5 font-bold text-emerald-400 text-xs shrink-0 pl-4 bg-emerald-500/10 py-1.5 px-3 rounded-full border border-emerald-500/15">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Healthy</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
