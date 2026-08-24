import { useEffect } from 'react';
import { ContentType } from '../types';
import { LegalSlug } from '../content/legal';

interface SeoHeadProps {
  activeTab: ContentType;
  legalPage: LegalSlug | null;
  hasCurrentReport: boolean;
}

const SEO_METADATA: Record<string, { title: string; description: string; keywords: string }> = {
  photos: {
    title: 'AI Image Detector & Deepfake Photo Forensics — TruthAI',
    description: 'Free AI image detector & deepfake photo scanner. Detect ChatGPT, Midjourney, DALL-E 3, and Stable Diffusion images with pixel-level forensic analysis at 99.4% accuracy.',
    keywords: 'AI image detector, deepfake photo detector, AI photo scanner, Midjourney detector, DALL-E image verification'
  },
  videos: {
    title: 'Deepfake Video Detector & AI Video Forensics — TruthAI',
    description: 'Detect deepfake videos, AI face swaps, lip-sync anomalies, and synthetic video clips in real-time with multi-frame temporal video forensics.',
    keywords: 'deepfake video detector, AI video detector, face swap detector, synthetic video analysis, deepfake scanner'
  },
  news: {
    title: 'AI Content Detector & ChatGPT Text Verifier — TruthAI',
    description: 'Verify news articles, blog posts, and text for ChatGPT, GPT-4, and LLM synthetic signatures. Accurately detect AI generated text and fake news.',
    keywords: 'AI content detector, ChatGPT detector, AI generated text detector, GPT-4 text verifier, AI news check'
  },
  academic: {
    title: 'AI Assignment Detector & ChatGPT Essay Scanner — TruthAI',
    description: 'Scan student essays, handwritten assignments, and academic papers for AI generated text, ChatGPT usage, and synthetic handwriting artifacts.',
    keywords: 'AI assignment detector, ChatGPT essay detector, academic integrity scanner, AI homework checker'
  },
  dashboard: {
    title: 'Scan History Dashboard — TruthAI',
    description: 'View your isolated AI detection history and forensic reports.',
    keywords: 'AI detector history'
  },
  settings: {
    title: 'Account Settings — TruthAI',
    description: 'Manage your TruthAI profile and subscription settings.',
    keywords: 'TruthAI account'
  }
};

const LEGAL_METADATA: Record<LegalSlug, { title: string; description: string }> = {
  privacy: {
    title: 'Privacy Policy — TruthAI Detector',
    description: 'Read the TruthAI Privacy Policy regarding data protection, user scans, and security.'
  },
  terms: {
    title: 'Terms of Service — TruthAI Detector',
    description: 'TruthAI Detector Terms of Service and usage conditions.'
  },
  cookies: {
    title: 'Cookie Policy — TruthAI Detector',
    description: 'TruthAI Cookie Policy and session management overview.'
  }
};

export default function SeoHead({ activeTab, legalPage, hasCurrentReport }: SeoHeadProps) {
  useEffect(() => {
    const domain = 'https://halima-ai.supertechholding.com';
    let title = 'TruthAI Detector — AI Deepfake & Synthetic Content Forensics';
    let description = 'Detect AI-generated images, deepfakes, manipulated video, and synthetic text with TruthAI forensic analysis.';
    let isPrivate = false;
    let canonical = `${domain}/`;

    if (legalPage && LEGAL_METADATA[legalPage]) {
      title = LEGAL_METADATA[legalPage].title;
      description = LEGAL_METADATA[legalPage].description;
      canonical = `${domain}/#${legalPage}`;
    } else if (hasCurrentReport) {
      title = 'Forensic Scan Report — TruthAI Detector';
      description = 'Detailed AI detection and forensic breakdown report.';
      canonical = `${domain}/`;
    } else if (SEO_METADATA[activeTab]) {
      title = SEO_METADATA[activeTab].title;
      description = SEO_METADATA[activeTab].description;
      if (activeTab === 'dashboard' || activeTab === 'settings') {
        isPrivate = true;
      }
      canonical = activeTab === 'photos' ? `${domain}/` : `${domain}/#${activeTab}`;
    }

    // Update document title
    document.title = title;

    // Helper to set meta tag content
    const setMeta = (nameAttr: string, attrValue: string, contentValue: string) => {
      let element = document.querySelector(`meta[${nameAttr}="${attrValue}"]`);
      if (!element) {
        element = document.createElement('meta');
        element.setAttribute(nameAttr, attrValue);
        document.head.appendChild(element);
      }
      element.setAttribute('content', contentValue);
    };

    // Update description, robots, canonical, Open Graph & Twitter tags
    setMeta('name', 'description', description);
    setMeta('name', 'robots', isPrivate ? 'noindex, nofollow' : 'index, follow');

    let linkCanonical = document.querySelector('link[rel="canonical"]');
    if (!linkCanonical) {
      linkCanonical = document.createElement('link');
      linkCanonical.setAttribute('rel', 'canonical');
      document.head.appendChild(linkCanonical);
    }
    linkCanonical.setAttribute('href', canonical);

    // Open Graph
    setMeta('property', 'og:title', title);
    setMeta('property', 'og:description', description);
    setMeta('property', 'og:url', canonical);

    // Twitter Card
    setMeta('name', 'twitter:title', title);
    setMeta('name', 'twitter:description', description);
  }, [activeTab, legalPage, hasCurrentReport]);

  return null;
}
