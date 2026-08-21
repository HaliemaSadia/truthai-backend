export type LegalSlug = 'privacy' | 'terms' | 'cookies';

export interface LegalDocument {
  slug: LegalSlug;
  title: string;
  updated: string;
  sections: { heading: string; body: string }[];
}

export const LEGAL_DOCUMENTS: Record<LegalSlug, LegalDocument> = {
  privacy: {
    slug: 'privacy',
    title: 'Privacy Policy',
    updated: 'July 28, 2026',
    sections: [
      {
        heading: 'Overview',
        body:
          'TruthAI Detector ("TruthAI", "we", "us") provides AI-assisted forensic analysis of images, video metadata, and text. This policy explains what we collect, how we use it, and the choices you have.',
      },
      {
        heading: 'Information we collect',
        body:
          'When you use TruthAI we may process: (1) content you upload or paste for analysis (images, text, URLs); (2) account details if you sign in (email, display name, profile photo from Google); (3) subscription status via Stripe when you upgrade to Pro; (4) basic technical logs (timestamps, errors) needed to operate the service.',
      },
      {
        heading: 'How we use information',
        body:
          'We use your data to run analyses, maintain your scan history (Pro), process payments, prevent abuse, and improve reliability. Uploaded content is sent to our analysis providers (e.g. OpenAI) only to perform the scan you requested.',
      },
      {
        heading: 'Local storage',
        body:
          'Free-tier scan counts and optional email sign-in credentials are stored in your browser (localStorage). Pro scan history may also be stored locally on your device. Clearing site data removes this information.',
      },
      {
        heading: 'Retention',
        body:
          'Analysis payloads are processed transiently on our servers and are not intended for long-term storage unless you save results locally. Server logs are retained only as long as needed for security and debugging.',
      },
      {
        heading: 'Your rights',
        body:
          'Depending on your location you may have rights to access, correct, or delete personal data. Contact us at privacy@truthai.app to make a request. You can also clear local data by signing out and removing site storage in your browser.',
      },
      {
        heading: 'Contact',
        body: 'Questions about this policy: privacy@truthai.app',
      },
    ],
  },
  terms: {
    slug: 'terms',
    title: 'Terms of Service',
    updated: 'July 28, 2026',
    sections: [
      {
        heading: 'Acceptance',
        body:
          'By using TruthAI Detector you agree to these Terms. If you do not agree, do not use the service.',
      },
      {
        heading: 'Service description',
        body:
          'TruthAI provides probabilistic forensic assessments of digital content. Results are informational only and must not be treated as legal proof, certification, or a guarantee of authenticity or manipulation.',
      },
      {
        heading: 'Acceptable use',
        body:
          'You may not use TruthAI to violate laws, infringe others\' rights, harass individuals, attempt unauthorized access, or submit malware. You are responsible for ensuring you have permission to analyze content you upload.',
      },
      {
        heading: 'Accounts & subscriptions',
        body:
          'Pro subscriptions are billed monthly via Stripe. You may cancel through Stripe\'s customer portal or by contacting support. Fees are non-refundable except where required by law.',
      },
      {
        heading: 'Disclaimer',
        body:
          'THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND. WE DISCLAIM LIABILITY FOR DECISIONS MADE BASED ON ANALYSIS OUTPUTS, INCLUDING FALSE POSITIVES OR FALSE NEGATIVES.',
      },
      {
        heading: 'Limitation of liability',
        body:
          'To the maximum extent permitted by law, TruthAI\'s total liability arising from your use of the service is limited to the amount you paid us in the twelve months before the claim.',
      },
      {
        heading: 'Contact',
        body: 'Legal inquiries: legal@truthai.app',
      },
    ],
  },
  cookies: {
    slug: 'cookies',
    title: 'Cookie Policy',
    updated: 'July 28, 2026',
    sections: [
      {
        heading: 'What we use',
        body:
          'TruthAI uses browser localStorage for session preferences, scan metering, and saved reports. We do not run third-party advertising cookies.',
      },
      {
        heading: 'Essential storage',
        body:
          'localStorage keys may include: truthai.user (signed-in profile), truthai.scans (daily free scan count), truthai.reports (Pro history), and truthai.accounts (local email credentials). These are required for core functionality.',
      },
      {
        heading: 'Third-party services',
        body:
          'If you sign in with Google, Google\'s scripts may set cookies subject to Google\'s policy. Stripe Checkout sets cookies when you subscribe. We do not control third-party cookie behavior.',
      },
      {
        heading: 'Managing cookies & storage',
        body:
          'You can clear localStorage and cookies in your browser settings. Doing so signs you out and resets free-tier scan counts.',
      },
      {
        heading: 'Contact',
        body: 'Cookie questions: privacy@truthai.app',
      },
    ],
  },
};

export function parseLegalHash(): LegalSlug | null {
  const hash = window.location.hash.replace(/^#\/?/, '').toLowerCase();
  if (hash === 'privacy' || hash === 'terms' || hash === 'cookies') return hash;
  return null;
}

export function legalHref(slug: LegalSlug): string {
  return `#${slug}`;
}
