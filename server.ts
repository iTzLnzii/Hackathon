import { config } from 'dotenv';
config({ path: '.env.local' }); // Load GEMINI_API_KEY before anything else

import express from 'express';
import cors from 'cors';
import path from 'path';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import { ImageProcessor } from './src/services/imageProcessor.ts';
import { GoogleGenAI, Type } from '@google/genai';


// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// ── Gemini helper ────────────────────────────────────────────────────────────

function getAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
}

async function runGeminiAnalysis(base64: string): Promise<{
  verdict: string;
  trustScore: number;
  confidence: number;
  explanation: string;
  signals: string[];
  status: 'gemini';
} | null> {
  const ai = getAI();
  if (!ai) return null;

  try {
    const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{
        parts: [
          {
            inlineData: {
              data: base64Data,
              mimeType: 'image/jpeg'
            }
          },
          {
            text: `Perform a rigorous forensic analysis of this image to detect generative AI manipulation.

CRITICAL FIRST STEP - IMAGE CATEGORIZATION:
Determine what type of image this is before analyzing it.
- If the image is primarily TEXT (e.g., a simple text background, a screenshot of a tweet/post, a quote).
- If the image is a MEME, DIGITAL GRAPHIC, UI SCREENSHOT, or 2D ILLUSTRATION.
-> DO NOT penalize these for lacking "biological texture" or "camera grain". They are inherently synthetic but NOT generative AI fakes of reality. For these, return realismScore > 85, aiLikelihood < 15, and verdict "Verified" unless you see clear generative AI anomalies (like garbled text, impossible anatomy in the meme, etc.).

If the image is a PHOTOGRAPH or realistic rendering, evaluate these generative AI signals:
- Overly perfect facial symmetry
- Unrealistically smooth, plastic-like skin without pores
- Nonsensical background details, garbled text, or morphing objects
- Extra/missing fingers or structurally impossible anatomy
- Decorative elements merged seamlessly with skin/clothing
- Absence of natural camera grain or sensor noise

Scoring Rules:
- realismScore: 0-100 (100 = completely authentic real photo or authentic human-made digital graphic/text; 0 = fully AI generated)
- aiLikelihood: 0-100 (100 = definitely generative AI; 0 = completely human-made)
- verdict: must be exactly one of ["Verified", "Suspicious", "AI-generated", "Uncertain"]

Strict Rule for Portraits: If it IS a close-up photograph and has 4+ strong AI signals, realismScore CANNOT be above 35 and verdict MUST be "AI-generated" or "Suspicious".

Return a JSON object:
- realismScore: number
- aiLikelihood: number
- verdict: string
- confidence: number (0-100, how sure you are)
- explanation: one concise sentence explaining the verdict
- signals: array of short strings, each naming one detected anomaly (empty if verified)`
          }
        ]
      }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            realismScore:  { type: Type.NUMBER },
            aiLikelihood:  { type: Type.NUMBER },
            verdict:       { type: Type.STRING },
            confidence:    { type: Type.NUMBER },
            explanation:   { type: Type.STRING },
            signals:       { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ['realismScore', 'aiLikelihood', 'verdict', 'confidence', 'explanation', 'signals']
        }
      }
    });

    const result = JSON.parse(response.text ?? '{}');

    // Post-processing: enforce strict portrait rule
    if (Array.isArray(result.signals) && result.signals.length >= 4 && result.aiLikelihood < 70) {
      result.aiLikelihood = 70;
      result.realismScore = Math.min(result.realismScore, 30);
    }
    if (Array.isArray(result.signals) && result.signals.length >= 3 && result.verdict === 'Uncertain') {
      result.verdict = 'Suspicious';
    }

    // Normalise any Gemini-specific verdict labels to what the extension expects
    const verdictMap: Record<string, string> = {
      'Likely AI-generated': 'Suspicious',
      'Likely Real':         'Verified',
      'Analysis Failed':     'Uncertain',
    };
    result.verdict = verdictMap[result.verdict] ?? result.verdict;

    return {
      verdict:     result.verdict      ?? 'Uncertain',
      trustScore:  result.realismScore ?? 50,
      confidence:  result.confidence   ?? 50,
      explanation: result.explanation  ?? '',
      signals:     Array.isArray(result.signals) ? result.signals : [],
      status:      'gemini'
    };
  } catch (err) {
    console.error('[API] Gemini analysis failed:', err);
    return null;
  }
}

async function runGeminiAudioAnalysis(base64: string, mimeType: string) {
  if (!process.env.GEMINI_API_KEY) {
    console.warn('[API] Missing GEMINI_API_KEY in .env.local');
    return null;
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  console.log('[API] Running deep Gemini audio analysis...');

  try {
    let finalMimeType = mimeType || 'audio/mp3';
    let base64Data = base64;

    if (base64.includes(',')) {
      const parts = base64.split(',');
      const match = parts[0].match(/:(.*?);/);
      if (match) finalMimeType = match[1];
      base64Data = parts[1];
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{
        parts: [
          {
            inlineData: {
              data: base64Data,
              mimeType: finalMimeType
            }
          },
          {
            text: `Perform a rigorous forensic analysis of this audio clip to detect AI-generated voice cloning, deepfakes, or synthetic audio manipulation.

Identify any of these AI Audio Signals:
- Metallic, robotic, or "vocoder-like" artifacts in the voice
- Unnatural or mechanically perfect breathing patterns (or complete lack of breathing)
- Glitches, warbles, or sudden pitch shifts common in TTS models
- Monotone cadence that lacks natural human emotional fluctuation
- Unnatural separation between voice and background noise (or sudden background noise dropouts)

Scoring Rules:
- realismScore: 0-100 (100 = completely authentic real human voice; 0 = fully AI generated synthetic voice)
- aiLikelihood: 0-100 (100 = definitely generative AI; 0 = completely human-made)
- verdict: must be exactly one of ["Verified", "Suspicious", "AI-generated", "Uncertain"]

Return a JSON object:
- realismScore: number
- aiLikelihood: number
- verdict: string
- confidence: number (0-100, how sure you are)
- explanation: one concise sentence explaining the verdict
- signals: array of short strings, each naming one detected anomaly (empty if verified)`
          }
        ]
      }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            realismScore: { type: Type.INTEGER },
            aiLikelihood: { type: Type.INTEGER },
            verdict: { type: Type.STRING },
            confidence: { type: Type.INTEGER },
            explanation: { type: Type.STRING },
            signals: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["realismScore", "aiLikelihood", "verdict", "confidence", "explanation", "signals"]
        }
      }
    });

    const result = JSON.parse(response.text ?? '{}');
    
    // Normalise any Gemini-specific verdict labels
    const verdictMap: Record<string, string> = {
      'Likely AI-generated': 'Suspicious',
      'Likely Real':         'Verified',
      'Analysis Failed':     'Uncertain',
    };
    result.verdict = verdictMap[result.verdict] ?? result.verdict;

    return {
      verdict:     result.verdict      ?? 'Uncertain',
      trustScore:  result.realismScore ?? 50,
      confidence:  result.confidence   ?? 50,
      explanation: result.explanation  ?? '',
      signals:     Array.isArray(result.signals) ? result.signals : [],
      status:      'gemini'
    };
  } catch (err: any) {
    console.error('[API] Gemini audio analysis failed:', err);
    return { error: err.message || 'Gemini Audio API threw an unknown exception' };
  }
}

// ── Express app ──────────────────────────────────────────────────────────────

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));

  // ── /api/preprocess ──────────────────────────────────────────────────────
  app.post('/api/preprocess', upload.single('imageFile'), async (req: any, res) => {
    try {
      let imageInput = req.body.image;
      if (req.file) imageInput = req.file.buffer;

      if (!imageInput) return res.status(400).json({ error: 'No image data provided' });

      const preprocessed = await ImageProcessor.preprocess(imageInput);
      const buffer = Buffer.from(preprocessed.base64, 'base64');
      const heuristic = await ImageProcessor.performHeuristicAnalysis(buffer);

      res.json({ base64: preprocessed.base64, metadata: preprocessed.metadata, heuristic });
    } catch (error) {
      console.error('[API] Preprocessing failed:', error);
      res.status(500).json({ error: 'Image preprocessing failed' });
    }
  });

  // ── /api/analyze (deprecated) ────────────────────────────────────────────
  app.post('/api/analyze', (_req, res) => {
    res.status(400).json({ error: 'Please use /api/analyze-screenshot instead' });
  });

  // ── /api/analyze-screenshot (primary extension endpoint) ─────────────────
  app.post('/api/analyze-screenshot', upload.single('imageFile'), async (req: any, res) => {
    try {
      let imageInput = req.body.image;
      if (req.file) imageInput = req.file.buffer;

      if (!imageInput) return res.status(400).json({ error: 'No image data provided' });

      // 1. Preprocess (resize + normalise to JPEG)
      const preprocessed = await ImageProcessor.preprocess(imageInput);

      // 2. Gemini deep analysis (primary)
      const geminiResult = await runGeminiAnalysis(preprocessed.base64);
      if (geminiResult) {
        console.log(`[API] Gemini => verdict=${geminiResult.verdict} score=${geminiResult.trustScore} conf=${geminiResult.confidence}`);
        return res.json(geminiResult);
      }

      // 3. Heuristic fallback
      console.warn('[API] Gemini unavailable — falling back to heuristic analysis');
      const buffer = Buffer.from(preprocessed.base64, 'base64');
      const heuristic = await ImageProcessor.performHeuristicAnalysis(buffer);

      return res.json({
        verdict:     heuristic.realismScore > 70 ? 'Verified' : 'Suspicious',
        trustScore:  heuristic.realismScore,
        confidence:  40,
        explanation: heuristic.explanation,
        signals:     heuristic.anomalies,
        status:      'heuristic_only'
      });
    } catch (error) {
      console.error('[API] Screenshot analysis failed:', error);
      res.status(500).json({ error: 'Screenshot analysis failed' });
    }
  });

  // ── /api/analyze-audio (new audio endpoint) ──────────────────────────────
  app.post('/api/analyze-audio', async (req: any, res) => {
    try {
      const { audioData, mimeType } = req.body;
      if (!audioData) return res.status(400).json({ error: 'No audio data provided' });

      // Gemini deep analysis exclusively for audio
      const geminiResult = await runGeminiAudioAnalysis(audioData, mimeType || 'audio/mp3');
      if (geminiResult && Array.isArray(geminiResult.signals)) {
        console.log(`[API] Gemini Audio => verdict=${geminiResult.verdict} score=${geminiResult.trustScore} conf=${geminiResult.confidence}`);
        return res.json(geminiResult);
      }

      return res.status(500).json({ error: (geminiResult as any)?.error || 'Audio analysis failed on backend' });
    } catch (error) {
      console.error('[API] Audio analysis crash:', error);
      return res.status(500).json({ error: 'Audio analysis failed' });
    }
  });

  // ── /api/generate-content (Generic proxy for frontend services) ──────────
  app.post('/api/generate-content', async (req: any, res) => {
    try {
      if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: 'Missing API Key in server' });
      
      const { model, contents, config } = req.body;
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const response = await ai.models.generateContent({ model, contents, config });
      return res.json({ text: response.text });
    } catch (error: any) {
      console.error('[API] Proxy verification crash:', error);
      return res.status(500).json({ error: error.message || 'Verification proxy failed' });
    }
  });


  // ── /api/gather-evidence (Multi-source fact gathering) ─────────────────
  app.post('/api/gather-evidence', async (req: any, res) => {
    const { query, claimType } = req.body;
    if (!query) return res.status(400).json({ error: 'No query provided' });

    const UA = 'Mozilla/5.0 (compatible; DetectorBot/1.0)';
    const safe = (v: any, fallback: any = null) => { try { return v; } catch { return fallback; } };

    const results: Array<{ source: string; url: string; content: string; type: string }> = [];

    // ── 1. Wikipedia: search + first-hit summary ───────────────────────────
    const wikiSearch = (async () => {
      try {
        // First, try a direct search with the full query
        let response = await fetch(
          `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=3&format=json&origin=*`,
          { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(6000) }
        );
        if (!response.ok) return;
        let d = await response.json();
        let hits: any[] = safe(d.query?.search, []);

        // Fallback: If no hits, try extracting capitalized words (potential entities)
        if (!hits.length && query.length > 50) {
          const entities = query.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g) || [];
          if (entities.length) {
            const bestEntity = entities.sort((a, b) => b.length - a.length)[0];
            response = await fetch(
              `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(bestEntity)}&srlimit=3&format=json&origin=*`,
              { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(5000) }
            );
            if (response.ok) {
              d = await response.json();
              hits = safe(d.query?.search, []);
            }
          }
        }

        if (!hits.length) return;

        // Fetch summary for the top result
        const title = encodeURIComponent(hits[0].title.replace(/ /g, '_'));
        const sumR = await fetch(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${title}`,
          { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(6000) }
        );
        if (!sumR.ok) return;
        const sum = await sumR.json();
        if (sum.extract) {
          results.push({
            source: 'Wikipedia',
            url: sum.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${title}`,
            content: sum.extract.substring(0, 800),
            type: 'encyclopedia'
          });
        }
      } catch (err) {
        console.warn('[API] Wikipedia search failed:', err);
      }
    })();

    // ── 2. DuckDuckGo Instant Answer (no key) ─────────────────────────────
    const ddg = fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1&skip_disambig=1`,
      { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(6000) }
    ).then(async r => {
      if (!r.ok) return;
      const d = await r.json();
      const text = d.AbstractText || d.Answer || d.Definition || '';
      if (text.length > 20) {
        results.push({
          source: 'DuckDuckGo Instant Answer',
          url: d.AbstractURL || d.AnswerURL || 'https://duckduckgo.com',
          content: text.substring(0, 600),
          type: 'instant_answer'
        });
      }
      // Also collect related topics
      const topics: any[] = safe(d.RelatedTopics, []);
      topics.slice(0, 3).forEach((t: any) => {
        if (t.Text && t.Text.length > 20) {
          results.push({ source: 'DuckDuckGo Related', url: t.FirstURL || '', content: t.Text.substring(0, 400), type: 'related' });
        }
      });
    }).catch(() => {});

    // ── 4. REST Countries — for geographic/political claims ────────────────
    const isGeoQuery = /country|nation|capital|population|president|prime minister|government|gdp|currency/i.test(query);
    const countryQuery = isGeoQuery
      ? fetch(
          `https://restcountries.com/v3.1/name/${encodeURIComponent(query.match(/\b[A-Z][a-z]+\b/)?.[0] || query)}?fields=name,capital,population,region,subregion,currencies,languages,area,flag`,
          { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(5000) }
        ).then(async r => {
          if (!r.ok) return;
          const d = await r.json();
          const c = Array.isArray(d) ? d[0] : d;
          if (c?.name) {
            const info = [
              `Country: ${c.name?.common}`,
              c.capital?.[0] ? `Capital: ${c.capital[0]}` : '',
              c.population     ? `Population: ${c.population.toLocaleString()}` : '',
              c.region         ? `Region: ${c.region}` : '',
              c.subregion      ? `Sub-region: ${c.subregion}` : '',
              c.area           ? `Area: ${c.area.toLocaleString()} km²` : '',
              c.currencies     ? `Currency: ${Object.values(c.currencies as Record<string, any>).map((v: any) => v.name).join(', ')}` : '',
            ].filter(Boolean).join('. ');
            results.push({ source: 'REST Countries', url: `https://restcountries.com/v3.1/name/${c.name?.common}`, content: info, type: 'government_data' });
          }
        }).catch(() => {})
      : Promise.resolve();

    // ── 5. PubMed E-utilities — medical/science claims ────────────────────
    const isMedQuery = /vaccine|cancer|drug|disease|treatment|study|clinical|health|medicine|virus|bacteria|infection|covid|therapy|symptoms?|diagnosis/i.test(query);
    const pubmed = isMedQuery
      ? fetch(
          `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmode=json&retmax=3&tool=DetectorApp&email=detector@example.com`,
          { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) }
        ).then(async r => {
          if (!r.ok) return;
          const d = await r.json();
          const ids: string[] = safe(d.esearchresult?.idlist, []);
          if (!ids.length) return;

          // Fetch abstracts for the found IDs
          const sumR = await fetch(
            `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids.join(',')}&retmode=json&tool=DetectorApp&email=detector@example.com`,
            { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) }
          );
          if (!sumR.ok) return;
          const sd = await sumR.json();
          ids.forEach(id => {
            const entry = sd.result?.[id];
            if (entry?.title) {
              results.push({
                source: 'PubMed (NCBI)',
                url: `https://pubmed.ncbi.nlm.nih.gov/${id}`,
                content: `[Peer-reviewed] ${entry.title} — Authors: ${(entry.authors || []).slice(0, 3).map((a: any) => a.name).join(', ')} (${entry.pubdate})`,
                type: 'peer_reviewed'
              });
            }
          });
        }).catch(() => {})
      : Promise.resolve();

    // ── 6. CrossRef — academic paper DOI lookup ───────────────────────────
    const isAcademic = /research|study|journal|published|paper|findings|evidence|prove|scientist|professor|university/i.test(query);
    const crossRef = isAcademic
      ? fetch(
          `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=3&select=DOI,title,author,published-print,abstract,publisher`,
          { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) }
        ).then(async r => {
          if (!r.ok) return;
          const d = await r.json();
          const items: any[] = safe(d.message?.items, []);
          items.slice(0, 2).forEach((item: any) => {
            const title = Array.isArray(item.title) ? item.title[0] : item.title;
            const authors = (item.author || []).slice(0, 2).map((a: any) => `${a.given || ''} ${a.family || ''}`.trim()).join(', ');
            const year = item['published-print']?.['date-parts']?.[0]?.[0] || '';
            const pub = item.publisher || '';
            if (title) {
              results.push({
                source: `CrossRef / ${pub}`,
                url: item.DOI ? `https://doi.org/${item.DOI}` : 'https://crossref.org',
                content: `[Academic] "${title}" by ${authors} (${year}) — Publisher: ${pub}`,
                type: 'academic'
              });
            }
          });
        }).catch(() => {})
      : Promise.resolve();

    // ── Run all in parallel ───────────────────────────────────────────────
    await Promise.allSettled([wikiSearch, ddg, countryQuery, pubmed, crossRef]);

    console.log(`[API] gather-evidence: collected ${results.length} snippets for "${query.substring(0, 60)}"`);
    return res.json({ evidence: results, count: results.length });
  });

  // ── /api/fetch-url (CORS bypass for link attaching) ──────────────────────
  app.post('/api/fetch-url', async (req: any, res) => {
    try {
      const { url } = req.body;
      if (!url) return res.status(400).json({ error: 'No URL provided' });
      
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      });
      const html = await response.text();
      
      // Simple regex to extract <title> and first <p> to form a summary
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const pMatch = html.match(/<p[^>]*>([^<]+)<\/p>/i);
      
      let summary = "";
      if (titleMatch) summary += titleMatch[1].trim() + ". ";
      if (pMatch) summary += pMatch[1].replace(/<[^>]+>/g, '').trim();
      
      return res.json({ text: summary || "Could not extract text from this link." });
    } catch (error: any) {
      console.error('[API] Link fetch failed:', error);
      return res.status(500).json({ error: 'Failed to read link content' });
    }
  });


  // ── Vite dev middleware / static production serving ──────────────────────
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Detector Server running on http://localhost:${PORT}`);
    console.log(`[API] Gemini key present: ${!!process.env.GEMINI_API_KEY}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
});
