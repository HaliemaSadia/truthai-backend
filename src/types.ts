export type ContentType = 'photos' | 'videos' | 'news' | 'academic' | 'dashboard' | 'settings';

export interface ScanMetric {
  name: string;
  score: number; // 0 to 100
  label: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  description: string;
}

export interface AnalysisReport {
  id: string;
  title: string;
  type: 'photo' | 'video' | 'news' | 'assignment';
  timestamp: string;
  fileSize?: string;
  truthScore: number; // percentage (lower means more likely manipulated/synthetic)
  confidence?: number; // 0-100, how sure the model is given the evidence available
  status: 'authentic' | 'ai-generated' | 'manipulated' | 'uncertain' | 'processing';
  riskLevel: 'low' | 'moderate' | 'high';
  explanation: string;
  metrics: ScanMetric[];
  resolution?: string;
  colorSpace?: string;
  bitDepth?: string;
  method?: string;
  imageUrl?: string;
  targetDetails?: {
    x?: string; // CSS position
    y?: string;
    width?: string;
    height?: string;
    confidence?: number;
    label?: string;
  };
  chatHistory: { role: 'user' | 'assistant'; text: string }[];
}

export interface User {
  email: string;
  name: string;
  picture?: string;
  provider: 'google' | 'email';
}

/** Number of free scans allowed per calendar day. */
export const FREE_DAILY_SCANS = 5;
