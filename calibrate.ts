// ─────────────────────────────────────────────────────────────────────────────
// Forensic model calibration
//
// Learns the OPTIMAL combination of the pixel-level signals from labelled images,
// instead of hand-guessing thresholds. This is what turns the pipeline from
// "plausible" into "accurate".
//
// Usage:
//   1. Collect images into two folders (more = better; aim for 200+ each):
//        calibration/real/   ← genuine camera photos
//        calibration/ai/     ← AI-generated (Midjourney, SD, DALL·E, GANs, …)
//   2. npm run calibrate            (or: npx tsx calibrate.ts <realDir> <aiDir>)
//   3. It writes forensics-model.json, which the server auto-loads on next start.
//
// It trains a logistic regression over the 12 per-signal suspicions and reports
// held-out accuracy so you know the real number — not a hand-waved one.
// ─────────────────────────────────────────────────────────────────────────────

import { readdirSync, readFileSync, writeFileSync, statSync } from "fs";
import { join, extname } from "path";
import { analyzeImageForensics, FEATURE_ORDER } from "./forensics";

const IMG = new Set([".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif", ".tiff"]);
const realDir = process.argv[2] || "calibration/real";
const aiDir = process.argv[3] || "calibration/ai";

function listImages(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((f) => IMG.has(extname(f).toLowerCase()))
      .map((f) => join(dir, f))
      .filter((p) => statSync(p).isFile());
  } catch {
    return [];
  }
}

/** Image → feature vector (suspicions in [0,1], ordered by FEATURE_ORDER). */
async function featurize(path: string): Promise<number[] | null> {
  const r = await analyzeImageForensics(readFileSync(path)).catch(() => null);
  if (!r) return null;
  const byKey = new Map<string, number>(r.signals.map((s) => [s.key, s.suspicion / 100]));
  return FEATURE_ORDER.map((k) => byKey.get(k) ?? 0);
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

function trainLogistic(X: number[][], y: number[], epochs = 4000, lr = 0.2, l2 = 1e-3) {
  const n = X[0].length;
  const w: number[] = new Array(n).fill(0);
  let b = 0;
  for (let e = 0; e < epochs; e++) {
    const gw: number[] = new Array(n).fill(0);
    let gb = 0;
    for (let i = 0; i < X.length; i++) {
      let z = b;
      for (let j = 0; j < n; j++) z += w[j] * X[i][j];
      const err = sigmoid(z) - y[i];
      for (let j = 0; j < n; j++) gw[j] += err * X[i][j];
      gb += err;
    }
    for (let j = 0; j < n; j++) w[j] -= lr * (gw[j] / X.length + l2 * w[j]);
    b -= lr * (gb / X.length);
  }
  return { weights: w, bias: b };
}

function accuracy(model: { weights: number[]; bias: number }, X: number[][], y: number[]) {
  let ok = 0;
  for (let i = 0; i < X.length; i++) {
    let z = model.bias;
    for (let j = 0; j < model.weights.length; j++) z += model.weights[j] * X[i][j];
    if ((sigmoid(z) >= 0.5 ? 1 : 0) === y[i]) ok++;
  }
  return X.length ? ok / X.length : 0;
}

(async () => {
  const realPaths = listImages(realDir);
  const aiPaths = listImages(aiDir);
  console.log(`Real images: ${realPaths.length} (${realDir})`);
  console.log(`AI images:   ${aiPaths.length} (${aiDir})`);
  if (realPaths.length < 10 || aiPaths.length < 10) {
    console.error("\nNeed at least ~10 images per class (200+ recommended). Add images and re-run.");
    process.exit(1);
  }

  console.log("\nExtracting forensic features…");
  const X: number[][] = [], y: number[] = [];
  for (const p of realPaths) { const f = await featurize(p); if (f) { X.push(f); y.push(0); } }
  for (const p of aiPaths) { const f = await featurize(p); if (f) { X.push(f); y.push(1); } }

  // Deterministic shuffle + 80/20 split for an honest held-out number.
  const idx = X.map((_, i) => i).sort((a, b) => ((a * 2654435761) % 1000) - ((b * 2654435761) % 1000));
  const cut = Math.floor(idx.length * 0.8);
  const trIdx = idx.slice(0, cut), teIdx = idx.slice(cut);
  const Xtr = trIdx.map((i) => X[i]), ytr = trIdx.map((i) => y[i]);
  const Xte = teIdx.map((i) => X[i]), yte = teIdx.map((i) => y[i]);

  console.log(`Training logistic regression on ${Xtr.length} samples…`);
  const model = trainLogistic(Xtr, ytr);
  const trainAcc = accuracy(model, Xtr, ytr);
  const testAcc = accuracy(model, Xte, yte);

  const out = { weights: model.weights, bias: model.bias, trainAccuracy: +trainAcc.toFixed(3), testAccuracy: +testAcc.toFixed(3) };
  writeFileSync("forensics-model.json", JSON.stringify(out, null, 2));

  console.log("\n── Learned signal weights ──");
  FEATURE_ORDER.forEach((k, i) => console.log(`  ${k.padEnd(11)} ${model.weights[i] >= 0 ? " " : ""}${model.weights[i].toFixed(3)}`));
  console.log(`  bias        ${model.bias.toFixed(3)}`);
  console.log(`\nTrain accuracy: ${(trainAcc * 100).toFixed(1)}%`);
  console.log(`Held-out accuracy: ${(testAcc * 100).toFixed(1)}%   ← the honest number`);
  console.log("\nWrote forensics-model.json — restart the server to use it.");
})();
