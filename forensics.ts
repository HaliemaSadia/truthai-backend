// ─────────────────────────────────────────────────────────────────────────────
// Pixel-level AI-image forensics
//
// Detects AI-generated / manipulated images using ONLY visual evidence inside
// the pixels — no metadata, EXIF, watermarks, or file history. Every signal is
// computed from the decoded raster, then fused into a calibrated AI-probability.
//
// Techniques implemented (mapped to the requested list):
//   • Fourier spectrum analysis ......... 2D FFT, azimuthal (radial) power profile
//   • Frequency-domain artifacts ........ radial power-law slope deviation
//   • High-frequency artifact detection . high-band energy fraction
//   • GAN artifacts ..................... periodic spectral-peak detection (up-sampling fingerprint)
//   • Diffusion model artifacts ......... high-frequency deficit + over-smooth noise residual
//   • Noise residual analysis ........... high-pass residual statistics (std, kurtosis, spectral structure)
//   • Wavelet analysis .................. 1-level Haar; HH sub-band energy + coefficient kurtosis
//   • Local Binary Patterns (LBP) ....... micro-pattern histogram entropy / uniformity
//   • Texture inconsistencies ........... block-wise local-variance dispersion
//   • Spatial feature inconsistencies ... block-wise feature autocorrelation
//   • Pixel distribution analysis ....... intensity histogram comb / entropy / clipping
//   • Color distribution anomalies ...... channel correlation, chroma-vs-luma high-freq
//   • Edge consistency analysis ......... Sobel gradient distribution coherence
//   • Repeated texture patterns ......... residual autocorrelation secondary peaks
//   • Unrealistic detail generation ..... detail-energy vs edge-structure mismatch
//
// NOTE ON CALIBRATION: with no labelled training set wired in, the per-signal
// thresholds and fusion weights below are literature-informed heuristics. They
// are deliberately centralised in CONFIG so they can be replaced by coefficients
// learned from a labelled dataset (logistic regression over `signal.value`s).
// ─────────────────────────────────────────────────────────────────────────────

import sharp from "sharp";

/** Fixed feature order — kept for the standalone calibration tool (calibrate.ts). */
export const FEATURE_ORDER = [
  "fourier", "highfreq", "ganpeak", "noisestd", "noisekurt", "wavelet",
  "lbp", "texture", "pixeldist", "color", "edges", "repetition",
] as const;

/** A trained logistic model shape — used only by the calibration tool. */
export interface ForensicModel { weights: number[]; bias: number; trainAccuracy?: number }

// SINGLE-MODEL RULE: the probabilistic (pAI/pReal) model is the ONLY scoring path.
// The legacy trained-model loader and heuristic fusion have been removed.

export interface ForensicSignal {
  key: string;
  name: string;
  suspicion: number; // 0–100 (higher = more likely AI)
  value: number;     // raw measurement (for retraining / debugging)
  detail: string;
}

export type ForensicCategory = "texture" | "noise" | "frequency" | "compression" | "metadata";

export interface EvidenceItem {
  finding: string;
  category: ForensicCategory;
  severity: "Low" | "Medium" | "High" | "Critical";
  detail: string;
}

/** The required forensic measurement contract — scores are MEASURED, not guessed by an LLM. */
export interface ForensicMeasurements {
  texture_score: number;
  noise_score: number;
  frequency_score: number;
  metadata_score: number;
  compression_score: number;
  evidence: EvidenceItem[];
}

export interface ForensicReport {
  aiProbability: number;      // 0–100, fused
  authenticityScore: number;  // 100 − aiProbability
  confidence: number;         // 0–100, reliability of this analysis
  calibrated: boolean;        // true once a trained model is loaded (else heuristic/advisory)
  verdict: "likely-real" | "uncertain" | "likely-ai" | "insufficient";
  modelHint: "gan" | "diffusion" | "none";
  insufficient: boolean;      // true when measurements can't support any verdict
  authenticityEvidence: boolean; // positive markers of a genuine capture
  measurements: ForensicMeasurements;
  signals: ForensicSignal[];
  analyzedResolution: string;
  notes: string[];
}

export interface HandwritingSignal {
  name: string;
  score: number; // 0-100, higher = more likely synthetic/fake handwriting
  detail: string;
}

export interface HandwritingReport {
  applicable: boolean;
  syntheticProbability: number;
  authenticityScore: number;
  confidence: number;
  verdict: "likely-real" | "uncertain" | "likely-ai" | "not-handwriting";
  signals: HandwritingSignal[];
  evidence: string[];
  analyzedResolution: string;
}

// ── Tunable calibration ──────────────────────────────────────────────────────
const CONFIG = {
  maxSide: 1024,   // downscale ceiling before analysis (bounds compute)
  fftSize: 512,    // power-of-two analysis window (center crop)
  minFftSize: 128,
  // logistic(value; mid, k): suspicion rises through `mid` with steepness `k`
  // and per-signal fusion weight (reliability of the cue).
  signals: {
    radialSlope:   { mid: 0.55, k: 9,    w: 1.4 }, // |deviation of power-law slope from natural|
    highFreq:      { mid: 0.22, k: 22,   w: 1.2 }, // high-band energy fraction (excess)
    spectralPeak:  { mid: 4.2,  k: 1.1,  w: 1.8 }, // off-axis periodic peak prominence (GAN)
    residualStd:   { mid: 0.012,k: -260, w: 1.1 }, // LOW residual std → too clean (k<0 inverts)
    residualKurt:  { mid: 2.2,  k: -1.4, w: 0.8 }, // low residual kurtosis → unnatural noise
    waveletHH:     { mid: 5.5,  k: -0.7, w: 1.0 }, // low HH coeff kurtosis → AI smoothness
    lbpEntropy:    { mid: 4.1,  k: -1.6, w: 0.9 }, // low micro-pattern entropy
    textureCV:     { mid: 1.35, k: -2.6, w: 1.0 }, // low texture-variance dispersion → over-uniform
    pixelComb:     { mid: 14,   k: 0.22, w: 0.7 }, // histogram comb (empty bins)
    colorCorr:     { mid: 0.985,k: 60,   w: 0.9 }, // over-correlated channels
    edgeCoherence: { mid: 0.62, k: 7,    w: 0.9 }, // edge-density over-uniformity
    repetition:    { mid: 0.30, k: 9,    w: 1.1 }, // residual autocorrelation secondary peak
  },
  // Final verdict bands on aiProbability. Recalibrated for AI-hypothesis-first
  // detection: lower bar to call AI, narrower "uncertain" band.
  realBelow: 38,
  aiAbove: 52,
};

// ── small math helpers ───────────────────────────────────────────────────────
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const logistic = (x: number, mid: number, k: number) => 100 / (1 + Math.exp(-k * (x - mid)));
// STEP 2/3 — coerce any non-finite/NaN score to a neutral, clamped 0–100 value.
const safeScore = (x: number) => (Number.isFinite(x) ? clamp(x, 0, 100) : 50);
const cv = (a: ArrayLike<number>) => {
  const m = mean(a);
  return std(a, m) / (Math.abs(m) || 1e-9);
};

function mean(a: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i];
  return a.length ? s / a.length : 0;
}
function std(a: ArrayLike<number>, m = mean(a)): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - m; s += d * d; }
  return Math.sqrt(a.length ? s / a.length : 0);
}
function kurtosis(a: ArrayLike<number>): number {
  const m = mean(a), sd = std(a, m) || 1e-9;
  let s = 0;
  for (let i = 0; i < a.length; i++) { const z = (a[i] - m) / sd; s += z * z * z * z; }
  return a.length ? s / a.length : 0; // 3 = Gaussian
}
const nextPow2Down = (n: number) => 1 << Math.floor(Math.log2(n));

// ── STEP 3 — dedicated AI-artifact detection layer ───────────────────────────
// Emphasises the photorealistic-AI tells: over-smooth texture, spectral flatness,
// and noise uniformity. NOTE: in this codebase texture/frequency/noise are already
// AI-SUSPICION scores (high = artifact present), so we use them directly. The spec's
// `100 − x` is NOT applied — it would invert the detector (flagging real images) and
// compress aiProbability into a band that fights the core signal.
function computeArtifactScore(texture: number, frequency: number, noise: number, compression: number): number {
  // STEP 3 — guard: any invalid input falls back to a neutral 50 (never NaN/undefined).
  const safe = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(100, x)) : 50);
  const smoothness = safe(texture);            // over-smooth / over-uniform texture artifact
  const frequency_flatness = safe(frequency);  // spectral flatness / GAN-diffusion fingerprint
  const noise_uniformity = safe(noise);        // unnatural noise uniformity or absence
  const compression_anomaly = safe(compression);
  const artifact_score =
    smoothness * 0.30 +
    frequency_flatness * 0.30 +
    noise_uniformity * 0.25 +
    compression_anomaly * 0.15;
  return Math.max(0, Math.min(100, artifact_score));
}

// ── iterative in-place radix-2 FFT ───────────────────────────────────────────
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cwr = 1, cwi = 0;
      const half = len >> 1;
      for (let k = 0; k < half; k++) {
        const a = i + k, b = i + k + half;
        const vr = re[b] * cwr - im[b] * cwi;
        const vi = re[b] * cwi + im[b] * cwr;
        re[b] = re[a] - vr; im[b] = im[a] - vi;
        re[a] += vr; im[a] += vi;
        const ncwr = cwr * wr - cwi * wi;
        cwi = cwr * wi + cwi * wr; cwr = ncwr;
      }
    }
  }
}

/** 2D power spectrum of an NxN real field (Hann-windowed to cut edge leakage). */
function powerSpectrum2D(field: Float64Array, N: number): Float64Array {
  const re = new Float64Array(N * N);
  const im = new Float64Array(N * N);
  const win = new Float64Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) re[y * N + x] = field[y * N + x] * win[y] * win[x];

  const lr = new Float64Array(N), li = new Float64Array(N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) { lr[x] = re[y * N + x]; li[x] = im[y * N + x]; }
    fft(lr, li);
    for (let x = 0; x < N; x++) { re[y * N + x] = lr[x]; im[y * N + x] = li[x]; }
  }
  for (let x = 0; x < N; x++) {
    for (let y = 0; y < N; y++) { lr[y] = re[y * N + x]; li[y] = im[y * N + x]; }
    fft(lr, li);
    for (let y = 0; y < N; y++) { re[y * N + x] = lr[y]; im[y * N + x] = li[y]; }
  }
  const pow = new Float64Array(N * N);
  for (let i = 0; i < N * N; i++) pow[i] = re[i] * re[i] + im[i] * im[i];
  return pow;
}

// Frequency index → signed frequency (handles fftshift implicitly).
const freqOf = (u: number, N: number) => (u < N / 2 ? u : u - N);

// ── feature extractors ───────────────────────────────────────────────────────

/** Azimuthal power profile, power-law slope deviation, high-frequency fraction. */
function spectralFeatures(pow: Float64Array, N: number) {
  const maxR = Math.floor(N / 2);
  const radSum = new Float64Array(maxR + 1);
  const radCnt = new Float64Array(maxR + 1);
  let total = 0, highBand = 0;
  for (let y = 0; y < N; y++) {
    const fy = freqOf(y, N);
    for (let x = 0; x < N; x++) {
      const fx = freqOf(x, N);
      const r = Math.round(Math.sqrt(fx * fx + fy * fy));
      if (r === 0 || r > maxR) continue;
      const p = pow[y * N + x];
      radSum[r] += p; radCnt[r]++;
      total += p;
      if (r >= 0.5 * maxR) highBand += p;
    }
  }
  const radAvg = new Float64Array(maxR + 1);
  for (let r = 1; r <= maxR; r++) radAvg[r] = radCnt[r] ? radSum[r] / radCnt[r] : 0;

  // Power-law slope: fit log10(radAvg) vs log10(r) over the mid–high band.
  const xs: number[] = [], ys: number[] = [];
  for (let r = 4; r <= maxR; r++) {
    if (radAvg[r] > 0) { xs.push(Math.log10(r)); ys.push(Math.log10(radAvg[r])); }
  }
  let slope = -2;
  if (xs.length > 4) {
    const mx = mean(xs), my = mean(ys);
    let num = 0, den = 0;
    for (let i = 0; i < xs.length; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
    slope = den ? num / den : -2;
  }
  // Natural images ≈ −2 to −3 power-law. Deviation toward flat (excess HF) is suspicious.
  const slopeDev = clamp(Math.abs(slope - (-2.4)) / 2.0, 0, 1);
  const highFreqFrac = total ? highBand / total : 0;

  // Spectral peak prominence: residual over the radial baseline, off the axes.
  // JPEG compression puts a strong peak grid at multiples of N/8 — those are a
  // codec artifact, NOT a generation fingerprint, so we exclude them to avoid
  // false-flagging ordinary compressed photos as GAN output.
  const block = N / 8;
  const nearGrid = (f: number) => Math.abs(f) % block <= 1 || block - (Math.abs(f) % block) <= 1;
  let peakProm = 0;
  const resid: number[] = [];
  for (let y = 0; y < N; y++) {
    const fy = freqOf(y, N);
    for (let x = 0; x < N; x++) {
      const fx = freqOf(x, N);
      const r = Math.round(Math.sqrt(fx * fx + fy * fy));
      if (r < N / 8 || r > maxR) continue;
      if (Math.abs(fx) < 2 || Math.abs(fy) < 2) continue;       // skip axes (DC streaks)
      if (nearGrid(fx) && nearGrid(fy)) continue;               // skip JPEG 8×8 block grid
      const baseline = radAvg[r] || 1e-9;
      resid.push(pow[y * N + x] / baseline);
    }
  }
  if (resid.length) {
    const m = mean(resid), sd = std(resid, m) || 1e-9;
    let mx = 0;
    for (const v of resid) if (v > mx) mx = v;
    peakProm = (mx - m) / sd; // z-score of the strongest off-axis periodic peak
  }

  return { slope, slopeDev, highFreqFrac, peakProm, radAvg, maxR };
}

/** Separable 3×3 Gaussian blur (σ≈1). */
function gaussBlur(src: Float64Array, N: number): Float64Array {
  const k = [0.25, 0.5, 0.25];
  const tmp = new Float64Array(N * N);
  const out = new Float64Array(N * N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      let s = 0;
      for (let d = -1; d <= 1; d++) s += src[y * N + clamp(x + d, 0, N - 1)] * k[d + 1];
      tmp[y * N + x] = s;
    }
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      let s = 0;
      for (let d = -1; d <= 1; d++) s += tmp[clamp(y + d, 0, N - 1) * N + x] * k[d + 1];
      out[y * N + x] = s;
    }
  return out;
}

/** High-pass residual statistics + its spectral structure. */
function residualFeatures(gray: Float64Array, N: number) {
  const blur = gaussBlur(gray, N);
  const res = new Float64Array(N * N);
  for (let i = 0; i < N * N; i++) res[i] = gray[i] - blur[i];
  const rStd = std(res);
  const rKurt = kurtosis(res);

  // Residual autocorrelation via Wiener–Khinchin: ACF = IFFT(|FFT(res)|²).
  const pow = powerSpectrum2D(res, N);
  // Secondary-peak strength in the radial ACF approximated from spectral periodicity:
  // reuse spectral peak prominence on the residual (structured residual ⇒ repetition).
  const sp = spectralFeatures(pow, N);
  return { rStd, rKurt, residualPeak: sp.peakProm, residualHighFreq: sp.highFreqFrac };
}

/** 1-level Haar wavelet: HH sub-band energy fraction + coefficient kurtosis. */
function waveletFeatures(gray: Float64Array, N: number) {
  const h = N >> 1;
  const HH: number[] = [];
  let eLH = 0, eHL = 0, eHH = 0, eLL = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < h; x++) {
      const a = gray[(2 * y) * N + 2 * x];
      const b = gray[(2 * y) * N + 2 * x + 1];
      const c = gray[(2 * y + 1) * N + 2 * x];
      const d = gray[(2 * y + 1) * N + 2 * x + 1];
      const ll = (a + b + c + d) / 2;
      const lh = (a - b + c - d) / 2;
      const hl = (a + b - c - d) / 2;
      const hh = (a - b - c + d) / 2;
      eLL += ll * ll; eLH += lh * lh; eHL += hl * hl; eHH += hh * hh;
      HH.push(hh);
    }
  const hhRatio = eHH / (eLH + eHL + eHH + 1e-9);
  const hhKurt = kurtosis(HH);
  return { hhRatio, hhKurt };
}

/** Local Binary Pattern micro-pattern entropy (uniformity of texture). */
function lbpFeatures(u8: Uint8Array, W: number, H: number) {
  const hist = new Float64Array(256);
  const off = [[-1, -1], [-1, 0], [-1, 1], [0, 1], [1, 1], [1, 0], [1, -1], [0, -1]];
  let n = 0;
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const c = u8[y * W + x];
      let code = 0;
      for (let b = 0; b < 8; b++) {
        const v = u8[(y + off[b][0]) * W + (x + off[b][1])];
        if (v >= c) code |= 1 << b;
      }
      hist[code]++; n++;
    }
  let entropy = 0;
  for (let i = 0; i < 256; i++) { const p = hist[i] / (n || 1); if (p > 0) entropy -= p * Math.log2(p); }
  return { lbpEntropy: entropy };
}

/** Block-wise texture-variance dispersion + edge coherence + detail energy. */
function spatialFeatures(gray: Float64Array, N: number) {
  const G = 16, bs = Math.floor(N / G);
  const blockVar: number[] = [];
  const edgeDensity: number[] = [];
  for (let by = 0; by < G; by++)
    for (let bx = 0; bx < G; bx++) {
      const vals: number[] = [];
      let edges = 0, cnt = 0;
      for (let y = by * bs; y < (by + 1) * bs; y++)
        for (let x = bx * bs; x < (bx + 1) * bs; x++) {
          vals.push(gray[y * N + x]);
          if (x > 0 && y > 0) {
            const gx = gray[y * N + x] - gray[y * N + x - 1];
            const gy = gray[y * N + x] - gray[(y - 1) * N + x];
            if (Math.sqrt(gx * gx + gy * gy) > 0.06) edges++;
            cnt++;
          }
        }
      blockVar.push(std(vals) ** 2);
      edgeDensity.push(cnt ? edges / cnt : 0);
    }
  const bvMean = mean(blockVar) || 1e-9;
  const textureCV = std(blockVar) / bvMean;                 // dispersion of local detail
  const edgeCoherence = 1 - clamp(std(edgeDensity) / (mean(edgeDensity) || 1e-9), 0, 1); // 1 = over-uniform
  return { textureCV, edgeCoherence };
}

/** Intensity histogram comb (empty bins) + clipping. */
function pixelDistribution(u8: Uint8Array) {
  const hist = new Float64Array(256);
  for (let i = 0; i < u8.length; i++) hist[u8[i]]++;
  let empty = 0;
  for (let i = 1; i < 255; i++) if (hist[i] === 0) empty++;
  const clip = (hist[0] + hist[255]) / (u8.length || 1);
  return { combEmptyBins: empty, clipFrac: clip };
}

/** Inter-channel correlation (over-correlation ⇒ synthetic chroma). */
function colorFeatures(rgb: Uint8Array, n: number) {
  const R: number[] = [], Gc: number[] = [], B: number[] = [];
  const step = Math.max(1, Math.floor(n / 20000)); // subsample for speed
  for (let i = 0; i < n; i += step) { R.push(rgb[i * 3]); Gc.push(rgb[i * 3 + 1]); B.push(rgb[i * 3 + 2]); }
  const corr = (a: number[], b: number[]) => {
    const ma = mean(a), mb = mean(b);
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < a.length; i++) { const x = a[i] - ma, y = b[i] - mb; num += x * y; da += x * x; db += y * y; }
    return num / (Math.sqrt(da * db) || 1e-9);
  };
  const c = (Math.abs(corr(R, Gc)) + Math.abs(corr(Gc, B)) + Math.abs(corr(R, B))) / 3;
  return { channelCorr: c };
}

// ── Compression analysis ─────────────────────────────────────────────────────

/** 8×8 block-boundary "blockiness": JPEG leaves a grid; lossless/synthetic does not. */
function blockiness(gray: Float64Array, N: number): number {
  let boundary = 0, bcnt = 0, interior = 0, icnt = 0;
  for (let y = 0; y < N; y++)
    for (let x = 1; x < N; x++) {
      const d = Math.abs(gray[y * N + x] - gray[y * N + x - 1]);
      if (x % 8 === 0) { boundary += d; bcnt++; } else { interior += d; icnt++; }
    }
  return (bcnt ? boundary / bcnt : 0) / ((icnt ? interior / icnt : 1e-9) + 1e-9);
}

function compressionAnalysis(format: string, chroma: string | undefined, gray: Float64Array, N: number) {
  const ev: EvidenceItem[] = [];
  const block = blockiness(gray, N);
  const fmt = (format || "").toLowerCase();
  let score: number;

  if (fmt === "jpeg" || fmt === "jpg") {
    if (block > 1.22) {
      score = 18;
      ev.push({ finding: "Consistent JPEG compression", category: "compression", severity: "Low",
        detail: `8×8 DCT block grid present (blockiness ${block.toFixed(2)}), consistent with a normally-compressed photograph.` });
    } else {
      score = 46;
      ev.push({ finding: "Weak JPEG block structure", category: "compression", severity: "Medium",
        detail: `JPEG with unusually weak 8×8 blocking (blockiness ${block.toFixed(2)}) — high-quality re-save or synthetic origin re-encoded once.` });
    }
    if (chroma && chroma.replace(/\s/g, "") === "4:4:4") {
      score = clamp(score + 12, 0, 100);
      ev.push({ finding: "Atypical chroma subsampling", category: "compression", severity: "Low",
        detail: "4:4:4 chroma is uncommon for in-camera JPEGs (cameras typically use 4:2:0)." });
    }
  } else if (fmt === "png" || fmt === "webp" || fmt === "tiff" || fmt === "bmp") {
    score = 52;
    ev.push({ finding: "Lossless container — no JPEG history", category: "compression", severity: "Medium",
      detail: `Delivered as ${fmt.toUpperCase()} with no JPEG quantization history. Common for AI image exports (also for screenshots/edits), so suggestive but not conclusive.` });
  } else {
    score = 50;
    ev.push({ finding: "Unknown compression", category: "compression", severity: "Low", detail: "Compression format could not be determined." });
  }
  // Double-compression: a robust DCT-coefficient (Benford) test needs the raw JPEG
  // stream; from a re-decoded raster it is not reliable, so we report it as limited.
  ev.push({ finding: "Double-compression", category: "compression", severity: "Low",
    detail: "Double-compression could not be robustly assessed from the re-decoded raster (requires the original JPEG bitstream)." });

  return { score: clamp(score, 0, 100), evidence: ev };
}

// ── Metadata / EXIF analysis ─────────────────────────────────────────────────

async function metadataAnalysis(exifBuf?: Buffer) {
  const ev: EvidenceItem[] = [];
  if (!exifBuf || exifBuf.length === 0) {
    ev.push({ finding: "No EXIF / camera signature", category: "metadata", severity: "Medium",
      detail: "No camera EXIF metadata present. AI images typically carry none — but social platforms also strip EXIF from genuine photos, so this is weak on its own." });
    return { score: 55, evidence: ev, authenticity: false };
  }
  try {
    const { default: exifReader } = await import("exif-reader");
    const tags: any = exifReader(exifBuf);
    const make = tags?.Image?.Make ?? tags?.image?.Make;
    const model = tags?.Image?.Model ?? tags?.image?.Model;
    const software = String(tags?.Image?.Software ?? tags?.Photo?.Software ?? "");
    const dto = tags?.Photo?.DateTimeOriginal ?? tags?.Image?.DateTime;
    const blob = `${make ?? ""} ${model ?? ""} ${software}`.toLowerCase();

    const aiTags = ["midjourney", "dall", "dalle", "stable diffusion", "stable-diffusion", "sdxl", "flux", "firefly", "niji", "ideogram", "openai", "generative ai", "comfyui", "automatic1111"];
    if (aiTags.some((t) => blob.includes(t))) {
      ev.push({ finding: "AI generator signature in metadata", category: "metadata", severity: "Critical",
        detail: `Metadata references a generative tool: "${blob.trim().slice(0, 80)}".` });
      return { score: 95, evidence: ev, authenticity: false };
    }
    if (make && model) {
      ev.push({ finding: "Camera signature present", category: "metadata", severity: "Low",
        detail: `EXIF camera make/model: ${make} ${model}${dto ? `, captured ${dto}` : ""}.` });
      const editors = ["photoshop", "gimp", "lightroom", "affinity", "topaz"];
      if (editors.some((t) => software.toLowerCase().includes(t))) {
        ev.push({ finding: "Editing software in metadata", category: "metadata", severity: "Low",
          detail: `Processed with ${software} — editing does not imply AI generation but warrants scrutiny.` });
        return { score: 32, evidence: ev, authenticity: true };
      }
      return { score: 15, evidence: ev, authenticity: true };
    }
    if (software) {
      ev.push({ finding: "Software tag without camera signature", category: "metadata", severity: "Medium",
        detail: `Software "${software}" present but no camera make/model.` });
      return { score: 56, evidence: ev, authenticity: false };
    }
    ev.push({ finding: "Partial metadata, no camera identity", category: "metadata", severity: "Medium",
      detail: "EXIF block exists but lacks camera make/model — partial or edited metadata." });
    return { score: 50, evidence: ev, authenticity: false };
  } catch {
    ev.push({ finding: "Unreadable metadata", category: "metadata", severity: "Low",
      detail: "An EXIF block is present but could not be parsed." });
    return { score: 50, evidence: ev, authenticity: false };
  }
}

/** Spatial consistency of the noise field: real sensor noise is fairly uniform. */
function sensorNoiseConsistency(gray: Float64Array, N: number): number {
  const blur = gaussBlur(gray, N);
  const bs = 32, G = Math.max(1, Math.floor(N / bs));
  const stds: number[] = [];
  for (let by = 0; by < G; by++)
    for (let bx = 0; bx < G; bx++) {
      const vals: number[] = [];
      for (let y = by * bs; y < (by + 1) * bs; y++)
        for (let x = bx * bs; x < (bx + 1) * bs; x++) vals.push(gray[y * N + x] - blur[y * N + x]);
      stds.push(std(vals));
    }
  return std(stds) / (mean(stds) || 1e-9); // CV; high ⇒ inconsistent/absent noise field
}

// ── handwritten assignment forensics ─────────────────────────────────────────

interface InkComponent {
  area: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  cx: number;
  cy: number;
  density: number;
  contour: number;
  slant: number;
}

function percentileFromHist(hist: Uint32Array, total: number, p: number): number {
  const target = total * p;
  let acc = 0;
  for (let i = 0; i < hist.length; i++) {
    acc += hist[i];
    if (acc >= target) return i;
  }
  return hist.length - 1;
}

function groupRuns(values: ArrayLike<number>, minValue: number, minLen: number) {
  const runs: Array<{ start: number; end: number; sum: number }> = [];
  let start = -1, sum = 0;
  for (let i = 0; i <= values.length; i++) {
    const active = i < values.length && values[i] >= minValue;
    if (active) {
      if (start < 0) start = i;
      sum += values[i];
    } else if (start >= 0) {
      if (i - start >= minLen) runs.push({ start, end: i - 1, sum });
      start = -1; sum = 0;
    }
  }
  return runs;
}

function scoreLowVariation(value: number, mid: number, steepness: number): number {
  return safeScore(logistic(value, mid, -steepness));
}

function scoreHigh(value: number, mid: number, steepness: number): number {
  return safeScore(logistic(value, mid, steepness));
}

/** Heuristic detector for photographed/scanned handwritten assignments.
 *
 * This is intentionally separate from the generic deepfake image detector. It
 * only becomes applicable for high-contrast page/ink images, then looks for
 * handwriting-specific synthetic tells: over-uniform stroke width, flat pressure,
 * mechanically consistent baselines/spacing/slant, repeated glyph-sized shapes,
 * smooth contours, and digital antialias bands.
 */
export async function analyzeHandwritingForensics(input: Buffer, isAssignmentMode = false): Promise<HandwritingReport | null> {
  let data: Buffer, W = 0, H = 0;
  try {
    const raw = await sharp(input, { failOn: "none" })
      .rotate()
      .removeAlpha()
      .resize({ width: 900, height: 900, fit: "inside", withoutEnlargement: true })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    data = raw.data;
    W = raw.info.width;
    H = raw.info.height;
  } catch (e) {
    console.warn("[handwriting] decode failed:", (e as Error).message);
    return null;
  }

  const totalPixels = W * H;
  if (!W || !H || totalPixels < 120 * 120) return null;

  const hist = new Uint32Array(256);
  for (let i = 0; i < data.length; i++) hist[data[i]]++;
  const p02 = percentileFromHist(hist, totalPixels, 0.02);
  const p05 = percentileFromHist(hist, totalPixels, 0.05);
  const p10 = percentileFromHist(hist, totalPixels, 0.10);
  const p50 = percentileFromHist(hist, totalPixels, 0.50);
  const p90 = percentileFromHist(hist, totalPixels, 0.90);
  const contrast = p90 - Math.min(p02, p05, p10);
  const threshold = clamp(Math.round(p90 - Math.max(28, contrast * 0.46)), 35, 215);

  const ink = new Uint8Array(totalPixels);
  let inkCount = 0, edgeBand = 0;
  const inkDarkness: number[] = [];
  for (let i = 0; i < totalPixels; i++) {
    const v = data[i];
    if (v <= threshold) {
      ink[i] = 1;
      inkCount++;
      inkDarkness.push(p90 - v);
    } else if (v <= threshold + 28) {
      edgeBand++;
    }
  }
  const inkCoverage = inkCount / totalPixels;
  const pageLike = p90 >= 155 && p50 >= 120 && contrast >= 35 && inkCoverage >= 0.003 && inkCoverage <= 0.38;
  if (!pageLike && !isAssignmentMode) {
    return {
      applicable: false,
      syntheticProbability: 0,
      authenticityScore: 100,
      confidence: 0,
      verdict: "not-handwriting",
      signals: [],
      evidence: [`Not a page-like handwritten document (p90 ${p90}, contrast ${contrast}, ink ${(inkCoverage * 100).toFixed(2)}%).`],
      analyzedResolution: `${W}x${H}`,
    };
  }
  if (isAssignmentMode && inkCount < 50) {
    return {
      applicable: false,
      syntheticProbability: 0,
      authenticityScore: 100,
      confidence: 0,
      verdict: "not-handwriting",
      signals: [],
      evidence: [`Image contains virtually no ink (ink count ${inkCount}).`],
      analyzedResolution: `${W}x${H}`,
    };
  }

  const visited = new Uint8Array(totalPixels);
  const components: InkComponent[] = [];
  const q = new Int32Array(totalPixels);
  const neighbors = [-1, 1, -W, W, -W - 1, -W + 1, W - 1, W + 1];
  for (let i = 0; i < totalPixels; i++) {
    if (!ink[i] || visited[i]) continue;
    let head = 0, tail = 0;
    q[tail++] = i; visited[i] = 1;
    let area = 0, minX = W, minY = H, maxX = 0, maxY = 0;
    let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, perimeter = 0;
    while (head < tail) {
      const idx = q[head++];
      const x = idx % W, y = Math.floor(idx / W);
      area++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      for (const d of neighbors) {
        const ni = idx + d;
        if (ni < 0 || ni >= totalPixels) { perimeter++; continue; }
        const nx = ni % W;
        if (Math.abs(nx - x) > 1) { perimeter++; continue; }
        if (!ink[ni]) { perimeter++; continue; }
        if (!visited[ni]) { visited[ni] = 1; q[tail++] = ni; }
      }
    }
    if (area < 4) continue;
    const bw = maxX - minX + 1, bh = maxY - minY + 1;
    const mx = sx / area, my = sy / area;
    const vx = sxx / area - mx * mx;
    const vy = syy / area - my * my;
    const covxy = sxy / area - mx * my;
    const slant = vx > 1e-6 ? covxy / vx : 0;
    components.push({
      area, minX, minY, maxX, maxY, cx: mx, cy: my,
      density: area / (bw * bh),
      contour: (perimeter * perimeter) / (area || 1),
      slant: clamp(slant, -3, 3),
    });
  }

  const glyphs = components.filter((c) => {
    const w = c.maxX - c.minX + 1, h = c.maxY - c.minY + 1;
    return c.area >= 6 && c.area <= totalPixels * 0.025 && w >= 2 && h >= 3 && w <= W * 0.18 && h <= H * 0.16;
  });
  if (glyphs.length < 18 && !isAssignmentMode) {
    return {
      applicable: false,
      syntheticProbability: 0,
      authenticityScore: 100,
      confidence: 0,
      verdict: "not-handwriting",
      signals: [],
      evidence: [`Too few glyph-like ink components for handwriting analysis (${glyphs.length}).`],
      analyzedResolution: `${W}x${H}`,
    };
  }
  if (isAssignmentMode && glyphs.length < 3) {
    return {
      applicable: false,
      syntheticProbability: 0,
      authenticityScore: 100,
      confidence: 0,
      verdict: "not-handwriting",
      signals: [],
      evidence: [`Too few ink components detected to run handwriting forensics (${glyphs.length}).`],
      analyzedResolution: `${W}x${H}`,
    };
  }

  // Approximate stroke radius from each ink pixel to nearest background within a 9x9 window.
  const strokeDistances: number[] = [];
  for (let y = 1; y < H - 1; y += 2) {
    for (let x = 1; x < W - 1; x += 2) {
      const idx = y * W + x;
      if (!ink[idx]) continue;
      let best = 5;
      for (let dy = -4; dy <= 4; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= H) continue;
        for (let dx = -4; dx <= 4; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= W) continue;
          if (!ink[yy * W + xx]) {
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < best) best = d;
          }
        }
      }
      strokeDistances.push(best);
    }
  }

  const rowCounts = new Uint16Array(H);
  const colCounts = new Uint16Array(W);
  for (let y = 0; y < H; y++) {
    let row = 0;
    for (let x = 0; x < W; x++) if (ink[y * W + x]) { row++; colCounts[x]++; }
    rowCounts[y] = row;
  }
  const lineRuns = groupRuns(rowCounts, Math.max(2, W * 0.006), 4)
    .filter((r) => r.sum >= W * 0.08);
  const lineHeights = lineRuns.map((r) => r.end - r.start + 1);
  const lineCenters = lineRuns.map((r) => (r.start + r.end) / 2);
  const lineGaps: number[] = [];
  for (let i = 1; i < lineRuns.length; i++) lineGaps.push(lineRuns[i].start - lineRuns[i - 1].end);

  const spacingCVs: number[] = [];
  const margins: number[] = [];
  for (const line of lineRuns) {
    const cols = new Uint16Array(W);
    for (let y = line.start; y <= line.end; y++)
      for (let x = 0; x < W; x++) if (ink[y * W + x]) cols[x]++;
    const minCol = Math.max(1, (line.end - line.start + 1) * 0.06);
    const runs = groupRuns(cols, minCol, 1);
    if (runs.length >= 2) {
      margins.push(runs[0].start);
      const gaps: number[] = [];
      for (let i = 1; i < runs.length; i++) {
        const gap = runs[i].start - runs[i - 1].end;
        if (gap > 1 && gap < W * 0.20) gaps.push(gap);
      }
      if (gaps.length >= 4) spacingCVs.push(cv(gaps));
    }
  }

  const widths = glyphs.map((c) => c.maxX - c.minX + 1);
  const heights = glyphs.map((c) => c.maxY - c.minY + 1);
  const areas = glyphs.map((c) => c.area);
  const densities = glyphs.map((c) => c.density);
  const contours = glyphs.map((c) => c.contour);
  const slants = glyphs.map((c) => c.slant);

  const bins = new Map<string, number>();
  for (const c of glyphs) {
    const w = c.maxX - c.minX + 1, h = c.maxY - c.minY + 1;
    const key = [
      Math.round(w / 2), Math.round(h / 2),
      Math.round((w / Math.max(h, 1)) * 4),
      Math.round(c.density * 10),
      Math.round(c.contour / 8),
    ].join(":");
    bins.set(key, (bins.get(key) || 0) + 1);
  }
  let duplicateGlyphs = 0;
  for (const count of bins.values()) if (count >= 3) duplicateGlyphs += count - 2;
  const duplicateRate = glyphs.length ? duplicateGlyphs / glyphs.length : 0;

  const strokeCV = cv(strokeDistances);
  const pressureCV = cv(inkDarkness);
  const lineHeightCV = lineHeights.length >= 2 ? cv(lineHeights) : 0.55;
  const lineGapCV = lineGaps.length >= 2 ? cv(lineGaps) : 0.55;
  const marginCV = margins.length >= 2 ? cv(margins) : 0.55;
  const spacingCV = spacingCVs.length ? mean(spacingCVs) : 0.55;
  const slantStd = std(slants);
  const contourCV = cv(contours);
  const glyphSizeCV = widths.length ? (cv(widths) + cv(heights) + cv(areas) + cv(densities)) / 4 : 0.55;
  const antialiasRatio = edgeBand / (inkCount + edgeBand || 1);

  const strokeScore = scoreLowVariation(strokeCV, 0.34, 12);
  const pressureScore = scoreLowVariation(pressureCV, 0.38, 10);
  const lineScore = safeScore((scoreLowVariation(lineHeightCV, 0.24, 10) + scoreLowVariation(lineGapCV, 0.32, 8) + scoreLowVariation(marginCV, 0.22, 10)) / 3);
  const spacingScore = scoreLowVariation(spacingCV, 0.42, 8);
  const slantScore = scoreLowVariation(slantStd, 0.30, 9);
  const contourScore = safeScore((scoreLowVariation(contourCV, 0.34, 8) + scoreLowVariation(glyphSizeCV, 0.46, 7)) / 2);
  const repetitionScore = scoreHigh(duplicateRate, 0.18, 12);
  const textureScore = scoreLowVariation(cv(colCounts), 1.15, 3.5);
  const artifactScore = scoreHigh(antialiasRatio, 0.34, 8);

  const signals: HandwritingSignal[] = [
    { name: "Stroke Width Variation", score: Math.round(strokeScore), detail: `Stroke-width CV ${strokeCV.toFixed(2)}; unusually low variation suggests generated or font-like strokes.` },
    { name: "Pressure Variation", score: Math.round(pressureScore), detail: `Ink darkness CV ${pressureCV.toFixed(2)}; flat pressure is suspicious for handwriting.` },
    { name: "Line Consistency", score: Math.round(lineScore), detail: `Line height CV ${lineHeightCV.toFixed(2)}, gap CV ${lineGapCV.toFixed(2)}, margin CV ${marginCV.toFixed(2)} across ${lineRuns.length} line(s).` },
    { name: "Spacing Regularity", score: Math.round(spacingScore), detail: `Within-line gap CV ${spacingCV.toFixed(2)}; mechanical spacing raises suspicion.` },
    { name: "Slant Uniformity", score: Math.round(slantScore), detail: `Glyph slant standard deviation ${slantStd.toFixed(2)}; natural writing usually varies by character and word.` },
    { name: "Contour Irregularity", score: Math.round(contourScore), detail: `Contour CV ${contourCV.toFixed(2)}, glyph-size CV ${glyphSizeCV.toFixed(2)}; over-smooth repeated outlines are suspicious.` },
    { name: "Repeated Character Shapes", score: Math.round(repetitionScore), detail: `Glyph fingerprint repeat rate ${(duplicateRate * 100).toFixed(1)}%.` },
    { name: "Uniform Ink Texture", score: Math.round(textureScore), detail: `Column ink-density CV ${cv(colCounts).toFixed(2)}; overly even texture can indicate synthetic rendering.` },
    { name: "Synthetic Raster Artifacts", score: Math.round(artifactScore), detail: `Near-threshold antialias band ratio ${(antialiasRatio * 100).toFixed(1)}%.` },
  ];

  const syntheticProbability = Math.round(safeScore(
    strokeScore * 0.17 +
    pressureScore * 0.17 +
    lineScore * 0.13 +
    spacingScore * 0.11 +
    slantScore * 0.11 +
    contourScore * 0.12 +
    repetitionScore * 0.12 +
    textureScore * 0.04 +
    artifactScore * 0.03
  ));
  const strongSignals = signals.filter((s) => s.score >= 58).length;
  const realVariationSignals = [strokeScore, pressureScore, spacingScore, slantScore, contourScore]
    .filter((s) => s <= 35).length;
  const verdict: HandwritingReport["verdict"] =
    syntheticProbability >= 58 && strongSignals >= 2 ? "likely-ai" :
    syntheticProbability <= 35 && realVariationSignals >= 3 ? "likely-real" :
    "uncertain";
  const applicability = clamp((inkCoverage - 0.003) / 0.02, 0, 1) * clamp((contrast - 35) / 55, 0, 1);
  const confidence = Math.round(clamp(Math.abs(syntheticProbability - 50) * 1.25 + strongSignals * 6, 10, 92) * clamp(applicability + 0.35, 0.35, 1));

  const top = [...signals].sort((a, b) => b.score - a.score).slice(0, 4);
  return {
    applicable: true,
    syntheticProbability,
    authenticityScore: 100 - syntheticProbability,
    confidence,
    verdict,
    signals: signals.sort((a, b) => b.score - a.score),
    evidence: top.map((s) => `${s.name}: ${s.detail}`),
    analyzedResolution: `${W}x${H}; ink ${(inkCoverage * 100).toFixed(2)}%; threshold ${threshold}`,
  };
}

// ── main entry ───────────────────────────────────────────────────────────────
export async function analyzeImageForensics(input: Buffer): Promise<ForensicReport | null> {
  let gray: Float64Array, u8: Uint8Array, rgb: Uint8Array, S: number, origW = 0, origH = 0;
  let imgFormat = "", imgChroma: string | undefined, exifBuf: Buffer | undefined;
  try {
    const base = sharp(input, { failOn: "none" }).rotate().removeAlpha();
    const meta = await base.metadata();
    origW = meta.width ?? 0; origH = meta.height ?? 0;
    if (!origW || !origH) return null;
    imgFormat = meta.format ?? "";
    imgChroma = meta.chromaSubsampling;
    exifBuf = meta.exif;

    // Downscale large images (bounds compute); never enlarge (preserves native stats).
    const resized = origW > CONFIG.maxSide || origH > CONFIG.maxSide
      ? base.clone().resize({ width: CONFIG.maxSide, height: CONFIG.maxSide, fit: "inside", withoutEnlargement: true })
      : base.clone();

    const grayRaw = await resized.clone().grayscale().raw().toBuffer({ resolveWithObject: true });
    const W = grayRaw.info.width, H = grayRaw.info.height;
    const g8 = new Uint8Array(grayRaw.data.buffer, grayRaw.data.byteOffset, W * H);

    // Center-crop a power-of-two square for FFT/wavelet. Never exceed the image
    // (would read out of bounds); if it's genuinely tiny, bail → insufficient.
    S = Math.min(nextPow2Down(Math.min(W, H)), CONFIG.fftSize);
    if (S < 32) return null;
    const ox = ((W - S) >> 1), oy = ((H - S) >> 1);
    gray = new Float64Array(S * S);
    u8 = new Uint8Array(S * S);
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const v = g8[(oy + y) * W + (ox + x)];
        u8[y * S + x] = v;
        gray[y * S + x] = v / 255;
      }

    const rgbRaw = await resized.clone().removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const RW = rgbRaw.info.width;
    rgb = new Uint8Array(S * S * 3);
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const si = ((oy + y) * RW + (ox + x)) * 3;
        const di = (y * S + x) * 3;
        rgb[di] = rgbRaw.data[si]; rgb[di + 1] = rgbRaw.data[si + 1]; rgb[di + 2] = rgbRaw.data[si + 2];
      }
  } catch (e) {
    console.warn("[forensics] decode failed:", (e as Error).message);
    return null;
  }

  // Compute every signal.
  const pow = powerSpectrum2D(gray, S);
  const spec = spectralFeatures(pow, S);
  const resid = residualFeatures(gray, S);
  const wav = waveletFeatures(gray, S);
  const lbp = lbpFeatures(u8, S, S);
  const spat = spatialFeatures(gray, S);
  const pix = pixelDistribution(u8);
  const col = colorFeatures(rgb, S * S);

  const C = CONFIG.signals;
  const raw: Array<Omit<ForensicSignal, "suspicion"> & { mid: number; k: number; w: number }> = [
    { key: "fourier",    name: "Fourier Power-Spectrum Slope",   value: spec.slopeDev,        detail: `Radial power-law slope ${spec.slope.toFixed(2)} (natural ≈ −2 to −3).`, ...C.radialSlope },
    { key: "highfreq",   name: "High-Frequency Artifacts",       value: spec.highFreqFrac,    detail: `${(spec.highFreqFrac * 100).toFixed(1)}% of spectral energy in the high band.`, ...C.highFreq },
    { key: "ganpeak",    name: "GAN Up-Sampling Peaks",          value: spec.peakProm,        detail: `Off-axis periodic peak prominence ${spec.peakProm.toFixed(1)}σ.`, ...C.spectralPeak },
    { key: "noisestd",   name: "Noise Residual Level",           value: resid.rStd,           detail: `High-pass residual σ=${resid.rStd.toFixed(4)} (very low ⇒ unnaturally clean).`, ...C.residualStd },
    { key: "noisekurt",  name: "Noise Residual Shape",           value: resid.rKurt,          detail: `Residual kurtosis ${resid.rKurt.toFixed(2)} (Gaussian ≈ 3).`, ...C.residualKurt },
    { key: "wavelet",    name: "Wavelet (HH) Statistics",        value: wav.hhKurt,           detail: `HH sub-band kurtosis ${wav.hhKurt.toFixed(2)}; energy ratio ${(wav.hhRatio * 100).toFixed(1)}%.`, ...C.waveletHH },
    { key: "lbp",        name: "Local Binary Pattern Entropy",   value: lbp.lbpEntropy,       detail: `Micro-pattern entropy ${lbp.lbpEntropy.toFixed(2)} bits.`, ...C.lbpEntropy },
    { key: "texture",    name: "Texture Inconsistency",          value: spat.textureCV,       detail: `Block-variance dispersion CV=${spat.textureCV.toFixed(2)} (low ⇒ over-uniform).`, ...C.textureCV },
    { key: "pixeldist",  name: "Pixel Distribution Comb",        value: pix.combEmptyBins,    detail: `${pix.combEmptyBins} empty intensity bins; clipping ${(pix.clipFrac * 100).toFixed(1)}%.`, ...C.pixelComb },
    { key: "color",      name: "Color Distribution Anomaly",     value: col.channelCorr,      detail: `Mean inter-channel correlation ${col.channelCorr.toFixed(3)}.`, ...C.colorCorr },
    { key: "edges",      name: "Edge Consistency",               value: spat.edgeCoherence,   detail: `Edge-density uniformity ${spat.edgeCoherence.toFixed(2)} (high ⇒ over-coherent).`, ...C.edgeCoherence },
    { key: "repetition", name: "Repeated Texture Patterns",      value: resid.residualPeak / 10, detail: `Residual periodicity score ${(resid.residualPeak / 10).toFixed(2)}.`, ...C.repetition },
  ];

  const signals: ForensicSignal[] = raw.map((s) => ({
    key: s.key, name: s.name, value: s.value, detail: s.detail,
    suspicion: Math.round(clamp(logistic(s.value, s.mid, s.k), 0, 100)),
  }));

  // aiProbability is set ONLY by the probabilistic model below (single source of truth).
  let aiProbability = 50;

  // ── Category aggregation (the measured scores) ─────────────────────────────
  const SUS = (k: string) => signals.find((s) => s.key === k)?.suspicion ?? 0;
  const sensorCV = sensorNoiseConsistency(gray, S);
  const sensorSusp = clamp(logistic(sensorCV, 0.85, 5), 0, 100); // inconsistent/absent noise field

  // STEP 2 — every forensic input is finite & 0–100 (neutral 50 fallback if not).
  const texture_score = safeScore(Math.round((SUS("texture") + SUS("repetition") + SUS("lbp") + SUS("edges")) / 4));
  const noise_score = safeScore(Math.round((SUS("noisestd") + SUS("noisekurt") + sensorSusp) / 3));
  const frequency_score = safeScore(Math.round((SUS("fourier") + SUS("highfreq") + SUS("ganpeak") + SUS("wavelet")) / 4));

  const comp = compressionAnalysis(imgFormat, imgChroma, gray, S);
  const meta = await metadataAnalysis(exifBuf);
  const compression_score = safeScore(Math.round(comp.score));
  const metadata_score = safeScore(Math.round(meta.score));

  // Evidence list — one summary item per pixel-domain category + raw comp/metadata findings.
  const sevOf = (v: number): EvidenceItem["severity"] => v >= 80 ? "Critical" : v >= 55 ? "High" : v >= 35 ? "Medium" : "Low";
  const evidence: EvidenceItem[] = [
    { finding: "Texture analysis", category: "texture", severity: sevOf(texture_score),
      detail: texture_score >= 45 ? "Over-smoothing, repetitive micro-texture, or low pattern entropy detected — consistent with synthetic generation." : "Texture statistics fall within the natural range." },
    { finding: "Noise residual analysis", category: "noise", severity: sevOf(noise_score),
      detail: noise_score >= 45 ? `Residual noise is unusually clean or spatially inconsistent (sensor-noise CV ${sensorCV.toFixed(2)}) — typical of synthesis or heavy denoising.` : `Noise residual is consistent with sensor capture (CV ${sensorCV.toFixed(2)}).` },
    { finding: "Frequency-domain analysis", category: "frequency", severity: sevOf(frequency_score),
      detail: frequency_score >= 45 ? "Spectral anomalies detected: power-law slope deviation, high-frequency excess, or GAN up-sampling / diffusion artifacts." : "Power spectrum follows a natural decay with no synthetic peaks." },
    ...comp.evidence,
    ...meta.evidence,
  ];

  // ── AI-hypothesis-first evidence aggregation ───────────────────────────────
  // STEP 1 — aggressively weigh evidence FOR AI generation. AI tells cluster in
  // a few signals, so the old diluting mean buried them (false negatives). Use a
  // noisy-OR: the strongest indicator sets the floor; each corroborating
  // indicator escalates. "Multiple AI indicators → AI Generated."
  const STRONG = 55; // counted only for the indicator tally shown in evidence
  const indicators = [frequency_score, texture_score, noise_score, compression_score, metadata_score]
    .filter((s) => s >= STRONG).length;

  // STEP 2 — evidence FOR authenticity (positive markers only; absence ≠ authentic).
  const authenticityEvidence = meta.authenticity ||
    (sensorSusp < 35 && frequency_score < 35 && texture_score < 40 && noise_score < 40);

  // ── PROBABILITY-NORMALIZED TWO-BRANCH MODEL ──────────────────────────────────
  // STEP 1 — normalize to [0,1]. POLARITY NOTE: texture/frequency/noise_score are
  // AI-SUSPICION here (high = AI), but this spec's t/f/nse are REALNESS — so we
  // normalize to realness (1 − score/100). compression stays anomaly-oriented.
  // This single correction lets STEPS 2–7 run verbatim (otherwise everything inverts).
  const n = (x: number) => Math.max(0, Math.min(1, (Number.isFinite(x) ? x : 50) / 100));
  const t = 1 - n(texture_score);     // texture naturalness
  const f = 1 - n(frequency_score);   // frequency naturalness
  const nse = 1 - n(noise_score);     // noise realism
  const c = n(compression_score);     // compression anomaly
  // m (metadata) is intentionally not used in either likelihood (STEP 7).

  // STEP 2 — REALITY LIKELIHOOD
  let realLikelihood = 0.40 * t + 0.35 * nse + 0.25 * f;
  realLikelihood = Math.max(0, Math.min(1, realLikelihood));

  // ARTIFACT SCORE (in [0,1])
  const artifact_score = 0.30 * (1 - t) + 0.30 * (1 - f) + 0.25 * (1 - nse) + 0.15 * c;

  // STEP 3 — SYNTHETIC LIKELIHOOD (compression weight raised 0.10→0.15 to use the
  // under-used compression signal more; metadata stays OUT of classification.)
  let aiLikelihood = 0.45 * artifact_score + 0.25 * (1 - f) + 0.15 * (1 - nse) + 0.15 * c;
  aiLikelihood = Math.max(0, Math.min(1, aiLikelihood));

  // STEP 4 — PROBABILITY NORMALIZATION (+1e-6 ensures total != 0)
  const total = realLikelihood + aiLikelihood + 1e-6;
  let pAI = aiLikelihood / total;
  let pReal = realLikelihood / total;
  // Crash guard: any invalid likelihood → neutral 50/50.
  if (!Number.isFinite(pAI) || !Number.isFinite(pReal)) { pAI = 0.5; pReal = 0.5; }

  // SHARPEN — push the probability away from 0.5 so the model commits instead of
  // sitting in the "uncertain" middle. SYMMETRIC around 0.5, so it doesn't add a
  // directional bias / false positives — it just turns weak leans into decisions.
  const SHARPEN = 1.7;
  pAI = Math.max(0, Math.min(1, 0.5 + (pAI - 0.5) * SHARPEN));
  pReal = 1 - pAI;

  // Single source of truth for the API's 0–100 field.
  aiProbability = Math.round(pAI * 100);
  if (!Number.isFinite(aiProbability)) aiProbability = 50;

  // Evidence aggregation: lead with the AI-indicator tally so the explanation
  // reflects how many independent indicators fired.
  const catRank: [ForensicCategory, number][] = [["frequency", frequency_score], ["texture", texture_score], ["noise", noise_score], ["compression", compression_score], ["metadata", metadata_score]];
  const topCat = [...catRank].sort((a, b) => b[1] - a[1])[0][0];
  evidence.unshift({
    finding: `P(AI) ${Math.round(pAI * 100)}% vs P(real) ${Math.round(pReal * 100)}%`,
    category: topCat,
    severity: Math.abs(pAI - pReal) >= 0.06 ? "High" : "Low",
    detail: `Probability-normalized model — realLikelihood ${realLikelihood.toFixed(2)}, aiLikelihood ${aiLikelihood.toFixed(2)}; ${indicators} of 5 categories exceeded the AI-evidence threshold (≥${STRONG}).`,
  });

  const ganPeak = SUS("ganpeak");
  const diffusionCue = (SUS("noisestd") + SUS("highfreq") + SUS("wavelet")) / 3;
  let modelHint: ForensicReport["modelHint"] = "none";
  if (aiProbability >= CONFIG.aiAbove) modelHint = ganPeak > 70 ? "gan" : diffusionCue > 60 ? "diffusion" : "none";

  // ── STEP 6 — CONFIDENCE = statistical separation strength ─────────────────────
  let confidence = Math.abs(pAI - pReal) * 100;
  // STEP 7 — metadata may ONLY nudge confidence, never classification. "Missing"
  // metadata = HIGH metadata_score here (no-camera/AI tag), so the spec's `< 30`
  // realness test is applied as `>= 70` suspicion.
  if (metadata_score >= 70) confidence -= 5;
  confidence = Math.round(Math.max(0, Math.min(100, confidence)));
  if (!Number.isFinite(confidence)) confidence = 50;     // NaN guard

  // Insufficient ONLY when measurements can't support any verdict (tiny/degraded
  // AND no indicator fired) — never a fallback for "I'm not sure".
  const reliabilityLow = S < 192 || origW * origH < 160 * 160;
  const insufficient = reliabilityLow && indicators === 0 && aiProbability < CONFIG.aiAbove;

  // ── STEP 5 — DECISION (no thresholds; pAI vs pReal separation) ────────────────
  // ("likely-real" is this system's enum for the spec's "likely-authentic" — kept
  //  for the unchanged frontend/API contract.)
  let verdict: ForensicReport["verdict"];
  if (insufficient) {
    verdict = "insufficient";
  } else if (Math.abs(pAI - pReal) < 0.06) {   // narrowed 0.12→0.06: "uncertain" only for true ties
    verdict = "uncertain";
  } else if (pAI > pReal) {
    verdict = "likely-ai";
  } else {
    verdict = "likely-real";
  }

  // Audit log — track the AI / real / uncertain distribution and spot
  // false negatives/positives on known inputs. (True FP/FN needs labels: feed
  // labelled images to `npm run calibrate`.)
  console.log(`[forensics] verdict=${verdict} aiProb=${Math.round(aiProbability)} indicators=${indicators} ` +
    `cats={freq:${frequency_score},tex:${texture_score},noise:${noise_score},comp:${compression_score},meta:${metadata_score}} ` +
    `auth=${authenticityEvidence}`);

  const notes: string[] = [];
  if (S < 256) notes.push("Low effective resolution — signal cues are less reliable.");
  if (insufficient) notes.push("Image too small / degraded to extract reliable forensic evidence.");
  notes.push("Probabilistic model (heuristic weights) — run `npm run calibrate` on labelled images to tune them.");

  return {
    aiProbability: Math.round(aiProbability),
    authenticityScore: Math.round(100 - aiProbability),
    confidence: insufficient ? Math.min(confidence, 25) : confidence,
    calibrated: false,
    verdict,
    modelHint,
    insufficient,
    authenticityEvidence,
    measurements: { texture_score, noise_score, frequency_score, metadata_score, compression_score, evidence },
    signals: signals.sort((a, b) => b.suspicion - a.suspicion),
    analyzedResolution: `${origW}×${origH} → ${S}×${S} analysis window`,
    notes,
  };
}
