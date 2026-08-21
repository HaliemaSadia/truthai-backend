// Batch-tests every image in test-images/ai and test-images/real against the
// local /api/analyze endpoint and prints a confusion summary.
// Usage: node test-detect.cjs   (server must be running on PORT, default 3000)
const fs = require('fs');
const path = require('path');
const http = require('http');

const PORT = process.env.PORT || 3000;
const IMG = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp']);

function post(body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({ host: 'localhost', port: PORT, path: '/api/analyze', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } },
      (res) => { let b = ''; res.on('data', (c) => b += c); res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } }); });
    req.on('error', reject); req.write(data); req.end();
  });
}

function mime(f) { const e = path.extname(f).toLowerCase(); return e === '.png' ? 'image/png' : e === '.webp' ? 'image/webp' : 'image/jpeg'; }

async function run(dir, expected) {
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => IMG.has(path.extname(f).toLowerCase())); } catch { return { total: 0, correct: 0, rows: [] }; }
  const rows = []; let correct = 0;
  for (const f of files) {
    const b64 = fs.readFileSync(path.join(dir, f)).toString('base64');
    let r; try { r = await post({ text: f, type: 'image', imageBase64: b64, mimeType: mime(f) }); } catch (e) { rows.push(`${f}: ERROR ${e.message}`); continue; }
    const status = r.status || '?';
    const hit = (expected === 'ai' && status === 'ai-generated') || (expected === 'real' && status === 'authentic');
    if (hit) correct++;
    rows.push(`  ${hit ? 'OK ' : 'XX '} ${f.padEnd(28)} → ${status.padEnd(13)} truth=${r.truthScore} conf=${r.confidence}`);
  }
  return { total: files.length, correct, rows };
}

(async () => {
  console.log(`\nTesting against http://localhost:${PORT}/api/analyze\n`);
  const ai = await run('test-images/ai', 'ai');
  const real = await run('test-images/real', 'real');
  console.log('AI images (want → ai-generated):');
  ai.rows.forEach((r) => console.log(r));
  console.log(`\nREAL images (want → authentic):`);
  real.rows.forEach((r) => console.log(r));
  console.log(`\n── SUMMARY ──`);
  console.log(`AI recall:      ${ai.correct}/${ai.total} flagged as AI`);
  console.log(`Real precision: ${real.correct}/${real.total} correctly kept authentic`);
  if (ai.total === 0 && real.total === 0) console.log('(no images found — add files to test-images/ai and test-images/real)');
})();
