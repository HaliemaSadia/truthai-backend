import { ArrowLeft } from 'lucide-react';
import { LEGAL_DOCUMENTS, LegalSlug } from '../content/legal';

interface LegalPageProps {
  slug: LegalSlug;
  onClose: () => void;
}

export default function LegalPage({ slug, onClose }: LegalPageProps) {
  const doc = LEGAL_DOCUMENTS[slug];

  return (
    <div className="w-full max-w-3xl mx-auto py-6 space-y-8 font-sans">
      <button
        onClick={onClose}
        className="text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1 cursor-pointer outline-none"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to TruthAI
      </button>

      <header className="space-y-2 border-b border-slate-100 pb-6">
        <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-slate-900">{doc.title}</h1>
        <p className="text-xs text-slate-400">Last updated: {doc.updated}</p>
      </header>

      <article className="space-y-8">
        {doc.sections.map((section) => (
          <section key={section.heading} className="space-y-2">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">{section.heading}</h2>
            <p className="text-sm text-slate-600 leading-relaxed">{section.body}</p>
          </section>
        ))}
      </article>
    </div>
  );
}
