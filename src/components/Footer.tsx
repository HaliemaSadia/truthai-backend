import { legalHref } from '../content/legal';

interface FooterProps {
  onOpenLegal: (slug: 'privacy' | 'terms' | 'cookies') => void;
}

export default function Footer({ onOpenLegal }: FooterProps) {
  return (
    <footer className="border-t border-slate-100 bg-white/80 px-4 sm:px-6 lg:px-8 py-6 mt-auto">
      <div className="max-w-container-max mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-slate-400">
        <p>&copy; {new Date().getFullYear()} TruthAI Detection System by open origin technology. Forensic results are probabilistic, not legal proof.</p>
        <nav className="flex flex-wrap items-center justify-center gap-4 font-semibold">
          <a href="/#photos" className="hover:text-blue-600 transition-colors">AI Image Detector</a>
          <a href="/#videos" className="hover:text-blue-600 transition-colors">Deepfake Detector</a>
          <a href="/#news" className="hover:text-blue-600 transition-colors">ChatGPT Detector</a>
          <a href="/#academic" className="hover:text-blue-600 transition-colors">AI Assignment Detector</a>
          <span className="text-slate-200">|</span>
          <a
            href={legalHref('privacy')}
            onClick={(e) => { e.preventDefault(); onOpenLegal('privacy'); }}
            className="hover:text-blue-600 transition-colors"
          >
            Privacy
          </a>
          <a
            href={legalHref('terms')}
            onClick={(e) => { e.preventDefault(); onOpenLegal('terms'); }}
            className="hover:text-blue-600 transition-colors"
          >
            Terms
          </a>
          <a
            href={legalHref('cookies')}
            onClick={(e) => { e.preventDefault(); onOpenLegal('cookies'); }}
            className="hover:text-blue-600 transition-colors"
          >
            Cookies
          </a>
        </nav>
      </div>
    </footer>
  );
}
