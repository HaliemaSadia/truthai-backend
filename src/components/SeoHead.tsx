import { useEffect } from 'react';
import { ContentType } from '../types';
import { LegalSlug } from '../content/legal';

interface SeoHeadProps {
  activeTab: ContentType;
  legalPage: LegalSlug | null;
  hasCurrentReport: boolean;
}

const SEO_METADATA: Record<string, { title: string; description: string; name: string }> = {
  photos: {
    title: 'TruthAI Detection System – AI Detector & Deepfake Detection',
    description: 'TruthAI Detection System is the official AI detector and deepfake photo scanner. Detect ChatGPT, Midjourney, DALL-E 3, and Stable Diffusion images with pixel-level forensic analysis at 99.4% accuracy.',
    name: 'AI Image Detector'
  },
  videos: {
    title: 'TruthAI Detection System – Deepfake Video Detector & Facial Forensics',
    description: 'TruthAI Detection System is the official deepfake video detector. Catch face swaps, lip-sync anomalies, and synthetic video clips in real-time with multi-frame temporal video forensics.',
    name: 'Deepfake Video Detector'
  },
  news: {
    title: 'TruthAI Detection System – AI Content Detector & ChatGPT Text Verifier',
    description: 'TruthAI Detection System is the official AI content detector. Check news articles, blog posts, and text for ChatGPT, GPT-4, and LLM synthetic signatures.',
    name: 'AI Content Detector'
  },
  academic: {
    title: 'TruthAI Detection System – AI Assignment Detector & ChatGPT Essay Scanner',
    description: 'TruthAI Detection System is the official academic AI detector. Scan student essays, assignments, and documents for AI generated text, ChatGPT usage, and synthetic handwriting artifacts.',
    name: 'AI Assignment Detector'
  },
  dashboard: {
    title: 'TruthAI Detection System – Scan History Dashboard',
    description: 'View your private isolated TruthAI Detection System history and forensic reports.',
    name: 'History Dashboard'
  },
  settings: {
    title: 'TruthAI Detection System – Account Settings',
    description: 'Manage your TruthAI Detection System profile and subscription settings.',
    name: 'Account Settings'
  }
};

const LEGAL_METADATA: Record<LegalSlug, { title: string; description: string; name: string }> = {
  privacy: {
    title: 'TruthAI Detector — Privacy Policy',
    description: 'Read the official TruthAI Privacy Policy regarding data protection, user scans, and security.',
    name: 'Privacy Policy'
  },
  terms: {
    title: 'TruthAI Detector — Terms of Service',
    description: 'TruthAI Detector Terms of Service and usage conditions.',
    name: 'Terms of Service'
  },
  cookies: {
    title: 'TruthAI Detector — Cookie Policy',
    description: 'TruthAI Cookie Policy and session management overview.',
    name: 'Cookie Policy'
  }
};

// FAQ Schema data tailored to active views
const VIEW_FAQS: Record<string, Array<{ question: string; answer: string }>> = {
  photos: [
    {
      question: "What is TruthAI and how does it detect AI generated images?",
      answer: "TruthAI is an AI detection platform that inspects microscopic noise maps, spatial frequency artifacts, and EXIF metadata to identify synthetic images created by Midjourney, DALL-E, and Stable Diffusion."
    },
    {
      question: "Is TruthAI's AI image detector free?",
      answer: "Yes, TruthAI provides daily free scans for all users. For unlimited scans and 4K image forensics, users can upgrade to TruthAI Pro."
    }
  ],
  videos: [
    {
      question: "How does the TruthAI Deepfake Video Detector work?",
      answer: "TruthAI extracts multi-frame temporal sequences from videos to analyze facial geometry, lip-sync alignment, and micro-expression shift artifacts."
    },
    {
      question: "Can TruthAI detect face swaps and AI deepfake clips?",
      answer: "Yes, TruthAI detects face swaps, AI face synthesis, and manipulated video streams across standard MP4, WebM, and MOV formats."
    }
  ],
  news: [
    {
      question: "How does TruthAI verify AI content and ChatGPT text?",
      answer: "TruthAI analyzes text perplexity, burstiness, and token probability distributions to detect ChatGPT, GPT-4, and Claude generated text."
    },
    {
      question: "Can TruthAI distinguish human writing from AI generated articles?",
      answer: "Yes, TruthAI measures sentence structural variability and linguistic markers to identify AI-assisted or fully synthetic writing."
    }
  ],
  academic: [
    {
      question: "Is TruthAI safe for checking student assignments?",
      answer: "Yes, TruthAI offers secure, privacy-isolated scanning for academic assignments, essays, and handwritten documents without storing or publishing student papers."
    }
  ]
};

export default function SeoHead({ activeTab, legalPage, hasCurrentReport }: SeoHeadProps) {
  useEffect(() => {
    const domain = 'https://halima-ai.supertechholding.com';
    let title = 'TruthAI Detector — Official AI Detector & Deepfake Media Forensics';
    let description = 'TruthAI is the official AI detector and deepfake media forensic scanner. Verify images, videos, ChatGPT text, and assignments with pixel-level precision.';
    let isPrivate = false;
    let canonical = `${domain}/`;
    let pageName = 'AI Detector';

    if (legalPage && LEGAL_METADATA[legalPage]) {
      title = LEGAL_METADATA[legalPage].title;
      description = LEGAL_METADATA[legalPage].description;
      pageName = LEGAL_METADATA[legalPage].name;
      canonical = `${domain}/#${legalPage}`;
    } else if (hasCurrentReport) {
      title = 'TruthAI Detector — Forensic Scan Report';
      description = 'Detailed TruthAI forensic scan report and probability analysis.';
      canonical = `${domain}/`;
      pageName = 'Scan Report';
    } else if (SEO_METADATA[activeTab]) {
      title = SEO_METADATA[activeTab].title;
      description = SEO_METADATA[activeTab].description;
      pageName = SEO_METADATA[activeTab].name;
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

    // Dynamic Breadcrumb JSON-LD
    const breadcrumbSchema = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        {
          "@type": "ListItem",
          "position": 1,
          "name": "TruthAI Home",
          "item": `${domain}/`
        },
        {
          "@type": "ListItem",
          "position": 2,
          "name": pageName,
          "item": canonical
        }
      ]
    };

    let breadcrumbScript = document.getElementById('seo-breadcrumb-jsonld');
    if (!breadcrumbScript) {
      breadcrumbScript = document.createElement('script');
      breadcrumbScript.id = 'seo-breadcrumb-jsonld';
      breadcrumbScript.setAttribute('type', 'application/ld+json');
      document.head.appendChild(breadcrumbScript);
    }
    breadcrumbScript.textContent = JSON.stringify(breadcrumbSchema);

    // Dynamic View FAQ JSON-LD
    const currentFaqs = VIEW_FAQS[activeTab] || VIEW_FAQS.photos;
    const faqSchema = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": currentFaqs.map((faq) => ({
        "@type": "Question",
        "name": faq.question,
        "acceptedAnswer": {
          "@type": "Answer",
          "text": faq.answer
        }
      }))
    };

    let faqScript = document.getElementById('seo-faq-jsonld');
    if (!faqScript) {
      faqScript = document.createElement('script');
      faqScript.id = 'seo-faq-jsonld';
      faqScript.setAttribute('type', 'application/ld+json');
      document.head.appendChild(faqScript);
    }
    faqScript.textContent = JSON.stringify(faqSchema);

  }, [activeTab, legalPage, hasCurrentReport]);

  return null;
}
