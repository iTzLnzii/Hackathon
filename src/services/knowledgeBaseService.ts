import { GoogleGenAI, Type } from "@google/genai";
import { KnowledgeBaseResult } from '../types.ts';
import { VisualRecognitionService, VisualAnalysisResult } from './visualRecognitionService.ts';

interface EntityInfo {
  name: string;
  type: 'person' | 'place' | 'organization' | 'event' | 'brand';
  aliases: string[];
  facts: Record<string, any>;
  wikidataId?: string;
}

export class KnowledgeBaseService {
  private static async generateContent(payload: any) {
    const response = await fetch('/api/generate-content', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Failed with status ${response.status}`);
    }
    return response.json();
  }

  // Wikidata Property IDs
  private static P_INSTANCE_OF = 'P31';
  private static P_DATE_OF_BIRTH = 'P569';
  private static P_OCCUPATION = 'P106';
  private static P_NATIONALITY = 'P27';
  private static P_EMPLOYER = 'P108';
  private static P_TEAM = 'P54';
  private static P_POSITION_HELD = 'P39';
  private static P_COUNTRY = 'P17';

  private static ENTITIES: EntityInfo[] = [
    {
      name: 'Donald Trump',
      type: 'person',
      aliases: ['trump', 'donald j. trump', 'dj trump'],
      facts: {
        office: 'President',
        jurisdiction: 'United States',
        role: 'Politician',
        age: 77,
        nationality: 'American'
      },
      wikidataId: 'Q22686'
    },
    {
      name: 'Joe Biden',
      type: 'person',
      aliases: ['biden', 'joseph biden'],
      facts: {
        office: 'President',
        jurisdiction: 'United States',
        role: 'Politician',
        age: 81,
        nationality: 'American'
      },
      wikidataId: 'Q6279'
    },
    {
      name: 'Emmanuel Macron',
      type: 'person',
      aliases: ['macron'],
      facts: {
        office: 'President',
        jurisdiction: 'France',
        role: 'Politician',
        age: 46,
        nationality: 'French'
      },
      wikidataId: 'Q3052772'
    },
    {
      name: 'Lewis Hamilton',
      type: 'person',
      aliases: ['hamilton', 'sir lewis hamilton', 'lh44'],
      facts: {
        role: 'Racing Driver',
        nationality: 'British',
        team: 'Mercedes'
      },
      wikidataId: 'Q19037'
    },
    {
      name: 'Max Verstappen',
      type: 'person',
      aliases: ['verstappen', 'mv33', 'mv1'],
      facts: {
        role: 'Racing Driver',
        nationality: 'Dutch',
        team: 'Red Bull Racing'
      },
      wikidataId: 'Q16032253'
    },
    {
      name: 'Charles Leclerc',
      type: 'person',
      aliases: ['leclerc', 'cl16'],
      facts: {
        role: 'Racing Driver',
        nationality: 'Monegasque',
        team: 'Ferrari'
      },
      wikidataId: 'Q19943602'
    },
    {
      name: 'Cristiano Ronaldo',
      type: 'person',
      aliases: ['cristiano', 'ronaldo', 'cr7'],
      facts: {
        team: 'Al-Nassr',
        nationality: 'Portuguese',
        role: 'Football Player',
        age: 39,
        birthplace: 'Funchal, Madeira'
      },
      wikidataId: 'Q11571'
    },
    {
      name: 'Lionel Messi',
      type: 'person',
      aliases: ['messi', 'leo messi'],
      facts: {
        team: 'Inter Miami',
        nationality: 'Argentine',
        role: 'Football Player',
        age: 36
      },
      wikidataId: 'Q615'
    },
    {
      name: 'Kylian Mbappé',
      type: 'person',
      aliases: ['mbappé', 'mbappe'],
      facts: {
        team: 'Real Madrid',
        nationality: 'French',
        role: 'Football Player',
        age: 27
      },
      wikidataId: 'Q19662422'
    },
    {
      name: 'Aston Martin',
      type: 'brand',
      aliases: ['aston martin lagonda'],
      facts: {
        industry: 'Automotive',
        type: 'Luxury Sports Cars',
        founder: 'Lionel Martin and Robert Bamford'
      },
      wikidataId: 'Q27074'
    },
    {
      name: 'Paris',
      type: 'place',
      aliases: ['paris city'],
      facts: {
        location: 'France',
        type: 'Capital City'
      },
      wikidataId: 'Q90'
    },
    {
      name: 'Tunisia',
      type: 'place',
      aliases: ['tunisian republic'],
      facts: {
        type: 'Country',
        president: 'Kais Saied'
      },
      wikidataId: 'Q948'
    }
  ];

  /**
   * Knowledge Cross-Check Engine.
   * Uses a smarter routing system to verify claims across multiple sources.
   */
  static async verifyClaim(text: string, image?: string): Promise<KnowledgeBaseResult> {
    console.log(`[KnowledgeBaseService] Verifying claim: "${text.substring(0, 50)}..."`);

    let processedText = text.trim();

    if (!processedText || processedText.length < 5) {
      return this.insufficientEvidence('Claim text is too short or empty for verification.');
    }

    // ── 1. Handle Link Attaching (URL extraction) ──
    const isUrl = /^https?:\/\//i.test(processedText);
    if (isUrl) {
      console.log(`[KnowledgeBaseService] Detected URL, fetching content from: ${processedText}`);
      try {
        const urlFetch = await fetch('/api/fetch-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: processedText })
        });
        if (urlFetch.ok) {
          const res = await urlFetch.json();
          if (res.text) {
            processedText = res.text;
            console.log(`[KnowledgeBaseService] Extracted text from URL: ${processedText.substring(0, 50)}...`);
          }
        }
      } catch (err) {
        console.error('[KnowledgeBaseService] URL fetch failed:', err);
      }
    }

    // ── 2. Multi-source Evidence Gathering + Visual Recognition (parallel) ──
    let visualAnalysis: VisualAnalysisResult | undefined;
    let externalEvidence: Array<{ source: string; url: string; content: string; type: string }> = [];

    const gatherTasks: Promise<any>[] = [];

    // 2a. Visual recognition (if image provided)
    if (image) {
      console.log(`[KnowledgeBaseService] Starting visual analysis...`);
      gatherTasks.push(
        VisualRecognitionService.analyzeImage(image)
          .then(r => { visualAnalysis = r; })
          .catch(() => {
            visualAnalysis = {
              visualDescription: "Basic visual analysis performed due to engine error.",
              detectedObjects: ["Unknown"],
              detectedEntities: [],
              sceneType: 'generic',
              visualConfidence: 20,
              recognitionStrength: 'weak'
            };
          })
      );
    }

    // 2b. Multi-source evidence gathering (always — for both text and caption checks)
    gatherTasks.push(
      fetch('/api/gather-evidence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: processedText.substring(0, 300) })
      })
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (d?.evidence?.length) {
            externalEvidence = d.evidence;
            console.log(`[KnowledgeBaseService] Gathered ${externalEvidence.length} external evidence snippets`);
          }
        })
        .catch(err => console.warn('[KnowledgeBaseService] Evidence gathering failed:', err))
    );

    await Promise.allSettled(gatherTasks);

    // ── 3. Claim Routing (Hybrid Search) ──
    try {
      if (!image) {
        console.log(`[KnowledgeBaseService] Optimized text-only search initiated...`);
        return await this.performAICrossCheck(processedText, null, undefined, undefined, externalEvidence);
      }

      // For media-based claims, extract claim components to help visual focus
      const claimAnalysis = await this.analyzeClaimWithAI(processedText);
      return await this.performAICrossCheck(processedText, claimAnalysis, image, visualAnalysis, externalEvidence);
    } catch (error) {
      console.error('Knowledge Cross-Check Error:', error);
      return this.verifyClaimLegacy(processedText);
    }
  }


  private static async analyzeClaimWithAI(text: string) {
    const payload = {
      model: "gemini-2.0-flash",
      contents: `Analyze the following factual claim and extract its components.
      Claim: "${text}"
      
      Return JSON with:
      - subject: The main entity or topic
      - relation: The action or property being claimed
      - object: The value or target of the claim
      - type: One of [biography, age, role/title, location, nationality, sports affiliation, company fact, historical fact, organization fact, date/time fact, current-event-like factual claim, general]
      `,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            subject: { type: Type.STRING },
            relation: { type: Type.STRING },
            object: { type: Type.STRING },
            type: { type: Type.STRING }
          },
          required: ["subject", "relation", "object", "type"]
        }
      }
    };

    const response = await this.generateContent(payload);
    return JSON.parse(response.text);
  }

  private static async performAICrossCheck(
    text: string,
    claimInfo: any,
    image?: string,
    visualAnalysis?: VisualAnalysisResult,
    externalEvidence: Array<{ source: string; url: string; content: string; type: string }> = []
  ): Promise<KnowledgeBaseResult> {
    const promptParts: any[] = [
      {
        text: `Perform a High-Fidelity Credibility Investigation and Context Test for this input: "${text}"
      
      ${claimInfo ? `TOPIC ANALYSIS:
      Subject: ${claimInfo.subject}
      Relation: ${claimInfo.relation}
      Object: ${claimInfo.object}` : "TOPIC ANALYSIS: Perform an autonomous extraction of core factual claims from the provided text."}
      
      ${visualAnalysis ? `VISUAL EVIDENCE DATA (for Context Test):
      Description: ${visualAnalysis.visualDescription}
      Entities: ${visualAnalysis.detectedEntities.join(', ')}
      Strength: ${visualAnalysis.recognitionStrength}` : "NO VISUAL EVIDENCE: This is a pure textual information validation."}

      ${externalEvidence.length > 0 ? `
      ════════════════════════════════════════════════════
      EXTERNAL EVIDENCE GATHERED FROM RELIABLE SOURCES
      (Wikipedia, DuckDuckGo, Academic Journals, Government Data)
      ════════════════════════════════════════════════════
      ${externalEvidence.map((e, i) =>
        `[${i + 1}] SOURCE: ${e.source} (${e.type}) — ${e.url}\n      CONTENT: ${e.content}`
      ).join('\n\n      ')}
      ════════════════════════════════════════════════════
      CRITICAL: Cross-reference the claim against the above evidence. 
      1. INFORMATION VALIDATION: Is the factual statement true according to these sources?
      2. CONTEXT TEST: If an image is involved, does the caption accurately represent the contents, or is it misleading/false context?` : 'NO PRE-FETCHED EVIDENCE: Rely on your own knowledge and the built-in search tool to validate this information.'}
      
      ${image ? `
      CONTEXT TEST (Visual Verification):
      An image is provided. You MUST evaluate the visual evidence in the image against the textual claim/caption.

      STEP 1 — IDENTIFY: Look at the image. Identify people, places, objects, logos, uniforms, and settings.
      STEP 2 — VALIDATE: Does the caption match what is actually shown? Is the context correct?

      Decision Rules:
      - Case A: Clear identification + Matches caption → status: 'supported' (85-95% confidence)
      - Case B: Partial match + Plausible → status: 'partially supported' (60-75% confidence)
      - Case C: Ambiguous/Unclear → status: 'not enough information' (40-55% confidence)
      - Case D: DIRECT CONTRADICTION / FALSE CONTEXT → status: 'contradicted' (80-100% confidence)` 
      
      : `
      INFORMATION VALIDATION:
      No image provided. Use the external evidence above and your knowledge to verify the claim.

      Decision Rules:
      - Case A: Strong factual agreement -> status: 'supported' (85-100% confidence)
      - Case B: Partial agreement or missing context -> status: 'partially supported' (50-70% confidence)
      - Case C: Factual contradiction or debunked claim -> status: 'contradicted' (85-100% confidence)
      - Case D: No credible data found -> status: 'not enough information' (30-50% confidence)`}
      
      Explanation Style:
      - Start with a clear TRUE / FALSE / UNCERTAIN verdict.
      - Specify which reliable sources (Wikipedia, DDG, etc.) were used.
      - For images, explicitly state if the "Context Test" passed or failed.
      
      Return a detailed JSON verification result.`
      }
    ];

    if (image) {
      // Image is already preprocessed to clean base64 by server.ts
      const base64Data = image.includes(',') ? image.split(',')[1] : image;
      promptParts.unshift({
        inlineData: {
          data: base64Data,
          mimeType: "image/jpeg"
        }
      });
    }
    const payload = {
      model: "gemini-2.0-flash",
      contents: [{ parts: promptParts }],
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            status: { type: Type.STRING, enum: ['supported', 'contradicted', 'partially supported', 'not enough information'] },
            matchedEntity: { type: Type.STRING },
            claimType: { type: Type.STRING },
            claimedValue: { type: Type.STRING },
            actualValue: { type: Type.STRING },
            source: { type: Type.STRING, enum: ['Wikipedia', 'Wikidata', 'Both', 'Google Search', 'Multiple', 'PubMed', 'CrossRef', 'REST Countries', 'DuckDuckGo', 'None'] },
            sources: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  url: { type: Type.STRING },
                  type: { type: Type.STRING },
                  confidence: { type: Type.NUMBER },
                  freshness: { type: Type.STRING }
                },
                required: ["name", "type", "confidence"]
              }
            },
            confidence: { type: Type.NUMBER },
            explanation: { type: Type.STRING },
            supportLevel: { type: Type.STRING, enum: ['Supported', 'Contradicted', 'Unresolved', 'Insufficient Evidence'] },
            freshness: { type: Type.STRING }
          },
          required: ["status", "matchedEntity", "claimType", "source", "confidence", "explanation", "supportLevel"]
        }
      }
    };
    const response = await this.generateContent(payload);

    const result = JSON.parse(response.text);
    
    // Ensure claimType matches the requested enum
    const validClaimTypes = [
      'biography', 'age', 'role/title', 'location', 'nationality',
      'sports affiliation', 'company fact', 'historical fact',
      'organization fact', 'date/time fact', 'current-event-like factual claim', 'general'
    ];
    if (!validClaimTypes.includes(result.claimType)) {
      result.claimType = claimInfo?.type ?? 'general';
    }

    // Normalise source field to valid enum values
    const validSources = ['Wikipedia', 'Wikidata', 'Both', 'Google Search', 'Multiple', 'PubMed', 'CrossRef', 'REST Countries', 'DuckDuckGo', 'None'];
    if (!validSources.includes(result.source)) {
      result.source = externalEvidence.length > 0 ? 'Multiple' : 'Google Search';
    }

    // Upgrade source label when we used multiple APIs
    if (externalEvidence.length > 0 && result.source === 'None') {
      result.source = 'Multiple';
    }

    // Final safety check for confidence alignment
    if (result.status === 'supported' && result.confidence < 40) {
      result.status = 'partially supported';
      result.supportLevel = 'Insufficient Evidence';
    }

    // Add visual analysis data to the result if available
    if (visualAnalysis) {
      result.visualDescription = visualAnalysis.visualDescription;
      result.detectedObjects = visualAnalysis.detectedObjects;
      result.detectedEntities = visualAnalysis.detectedEntities;
      result.sceneType = visualAnalysis.sceneType;
      result.visualConfidence = visualAnalysis.visualConfidence;
      result.recognitionStrength = visualAnalysis.recognitionStrength;
    }

    return result;
  }

  private static async verifyClaimLegacy(text: string): Promise<KnowledgeBaseResult> {
    const lowerText = text.toLowerCase();

    try {
      // 1. Stage 1 & 2: Entity Detection & Best-Entity Resolution
      let resolution = this.resolveEntity(lowerText);
      let entity: EntityInfo | null = resolution ? resolution.entity : null;
      let resConfidence = resolution ? resolution.confidence : 0;
      let debugInfo: any = null;

      // If not in our high-profile list, try real-time Wikidata search
      if (!entity) {
        const searchResult = await this.searchWikidata(text);
        if (searchResult) {
          entity = searchResult.entity;
          resConfidence = searchResult.confidence;
          debugInfo = searchResult.debug;
        }
      }

      // If no entity is found at all, we return insufficient evidence
      if (!entity) {
        return this.insufficientEvidence('No recognized entities found in the claim.');
      }

      // 3. Source Lookup (Real Data)
      if (entity.wikidataId) {
        const freshFacts = await this.fetchWikidataFacts(entity.wikidataId);
        if (freshFacts) {
          entity.facts = { ...entity.facts, ...freshFacts };
        }
      }

      // 4. Claim Extraction & Classification
      const claim = this.extractClaim(lowerText, entity);
      
      if (!claim) {
        let explanation = `Recognized entity "${entity.name}" (Confidence: ${resConfidence}%), but the specific factual claim is ambiguous or informal.`;
        if (debugInfo) {
          explanation += ` [Debug: Results=${debugInfo.resultsCount}, ID=${debugInfo.selectedId}, Conf=${debugInfo.selectionConfidence}%]`;
        }
        return {
          status: 'not enough information',
          matchedEntity: entity.name,
          claimType: 'general',
          source: entity.wikidataId ? 'Wikidata' : 'None',
          confidence: resConfidence,
          explanation,
          supportLevel: 'Insufficient Evidence'
        };
      }

      // 5. Entity-Type Compatibility Check
      const compatibilityIssue = this.checkCompatibility(entity, claim);
      if (compatibilityIssue) {
        return {
          status: 'contradicted',
          matchedEntity: entity.name,
          claimType: claim.type,
          claimedValue: claim.value,
          source: 'Wikidata',
          confidence: Math.round(95 * (resConfidence / 100)),
          explanation: `${compatibilityIssue}${resConfidence < 100 ? ` (Entity resolved as ${entity.name} with ${resConfidence}% confidence)` : ''}`,
          supportLevel: 'Contradicted'
        };
      }

      // 6. Factual Verification
      const result = this.verifyFactualClaim(entity, claim);
      
      // Adjust confidence based on resolution confidence
      let finalExplanation = resConfidence < 100 
          ? `${result.explanation} [Entity resolved as ${entity.name} with ${resConfidence}% confidence]`
          : result.explanation;

      if (debugInfo) {
        finalExplanation += ` [Debug: Results=${debugInfo.resultsCount}, ID=${debugInfo.selectedId}, Conf=${debugInfo.selectionConfidence}%]`;
      }

      const finalResult = {
        ...result,
        source: entity.wikidataId ? 'Wikidata' : 'None' as any,
        confidence: Math.round(result.confidence * (resConfidence / 100)),
        explanation: finalExplanation
      };

      if (entity.facts.wikipediaUrl) {
        finalResult.explanation += ` (Source: ${entity.facts.wikipediaUrl})`;
        finalResult.source = 'Both';
      }

      return finalResult;
    } catch (error) {
      console.error('KnowledgeBaseService Legacy Error:', error);
      return this.verifyClaimMock(text);
    }
  }

  private static normalize(text: string): string {
    return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  private static async searchWikidata(text: string): Promise<{ entity: EntityInfo, confidence: number, debug?: any } | null> {
    try {
      // Improved extraction: look for sequences of capitalized words
      const nameMatches = text.match(/(?:[A-Z][a-z]+|[A-Z]\.)(?:\s+(?:[A-Z][a-z]+|[A-Z]\.))*/g);
      if (!nameMatches) return null;

      const sortedMatches = nameMatches.sort((a, b) => b.length - a.length);
      const searchTerm = sortedMatches[0];
      
      const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(searchTerm)}&language=en&type=item&limit=10&format=json&origin=*`;
      
      const searchResponse = await fetch(searchUrl);
      const searchData = await searchResponse.json();

      let results = searchData.search || [];

      // Fallback: if no results, try normalizing or using last name
      if (results.length === 0 && searchTerm.includes(' ')) {
        const parts = searchTerm.split(' ');
        const fallbackTerm = parts[parts.length - 1];
        const fallbackUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(fallbackTerm)}&language=en&type=item&limit=10&format=json&origin=*`;
        const fallbackResponse = await fetch(fallbackUrl);
        const fallbackData = await fallbackResponse.json();
        results = fallbackData.search || [];
      }

      if (results.length > 0) {
        const normalizedSearch = this.normalize(searchTerm);
        
        // Fetch claims for top 5 to do better filtering
        const topIds = results.slice(0, 5).map((r: any) => r.id);
        const claimsUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${topIds.join('|')}&props=claims&format=json&origin=*`;
        const claimsResponse = await fetch(claimsUrl);
        const claimsData = await claimsResponse.json();

        let bestCandidate = null;
        let maxScore = -1;

        const keywords = ['formula one driver', 'racing driver', 'driver', 'athlete', 'human', 'politician', 'footballer', 'soccer player'];

        for (const res of results) {
          let score = 0;
          const normalizedLabel = this.normalize(res.label);
          const description = (res.description || '').toLowerCase();

          // 1. Label Similarity (Normalized)
          if (normalizedLabel === normalizedSearch) {
            score += 60;
          } else if (normalizedLabel.includes(normalizedSearch) || normalizedSearch.includes(normalizedLabel)) {
            score += 30;
          }

          // 2. Description Keywords
          for (const kw of keywords) {
            if (description.includes(kw)) {
              score += 10;
              if (kw.includes('driver')) score += 10; // Bonus for driver
            }
          }

          // 3. Type Filtering (via claims)
          const entityClaims = claimsData.entities?.[res.id]?.claims;
          if (entityClaims) {
            // Instance of Human (Q5)
            const instanceOf = entityClaims[this.P_INSTANCE_OF];
            if (instanceOf && instanceOf.some((c: any) => c.mainsnak.datavalue?.value?.id === 'Q5')) {
              score += 20;
            }

            // Occupation Racing Driver (Q10841764)
            const occupation = entityClaims[this.P_OCCUPATION];
            if (occupation && occupation.some((c: any) => c.mainsnak.datavalue?.value?.id === 'Q10841764')) {
              score += 40;
            }
          }

          if (score > maxScore) {
            maxScore = score;
            bestCandidate = res;
          }
        }

        if (bestCandidate) {
          // Confidence calculation: base 40 + score, max 98
          const confidence = Math.min(98, 40 + maxScore);
          
          return {
            entity: {
              name: bestCandidate.label,
              type: 'person',
              aliases: bestCandidate.aliases || [],
              facts: {},
              wikidataId: bestCandidate.id
            },
            confidence,
            debug: {
              resultsCount: results.length,
              selectedId: bestCandidate.id,
              selectionConfidence: confidence,
              searchTerm
            }
          };
        }
      }
    } catch (e) {
      console.warn('Wikidata search failed:', e);
    }
    return null;
  }

  private static async fetchWikidataFacts(id: string): Promise<Record<string, any> | null> {
    try {
      const url = `https://www.wikidata.org/wiki/Special:EntityData/${id}.json`;
      const response = await fetch(url);
      const data = await response.json();
      const entity = data.entities[id];

      const facts: Record<string, any> = {};

      const getClaimValue = (prop: string) => {
        const claims = entity.claims[prop];
        if (claims && claims.length > 0) {
          const mainsnak = claims[0].mainsnak;
          if (mainsnak.datavalue) {
            if (mainsnak.datavalue.type === 'time') {
              return mainsnak.datavalue.value.time;
            } else if (mainsnak.datavalue.type === 'wikibase-entityid') {
              return mainsnak.datavalue.value.id;
            } else if (mainsnak.datavalue.type === 'string') {
              return mainsnak.datavalue.value;
            }
          }
        }
        return null;
      };

      // Extract Age from Date of Birth
      const dob = getClaimValue(this.P_DATE_OF_BIRTH);
      if (dob) {
        const birthYear = parseInt(dob.substring(1, 5));
        const currentYear = new Date().getFullYear();
        facts.age = currentYear - birthYear;
        facts.dob = dob;
      }

      // Extract Nationality (P27)
      const nationalityId = getClaimValue(this.P_NATIONALITY);
      if (nationalityId) {
        facts.nationalityId = nationalityId;
        const commonNationalities: Record<string, string> = {
          'Q142': 'French', 'Q183': 'German', 'Q29': 'Spanish', 'Q30': 'American', 
          'Q21': 'British', 'Q155': 'Portuguese', 'Q414': 'Argentine', 'Q38': 'Italian',
          'Q55': 'Dutch', 'Q31': 'Belgian', 'Q39': 'Swiss', 'Q252': 'Indonesian',
          'Q298': 'Chilean', 'Q41': 'Greek', 'Q28': 'Hungarian', 'Q233': 'Monegasque'
        };
        facts.nationality = commonNationalities[nationalityId] || nationalityId;
      }

      // Extract Team/Employer (P54/P108)
      const teamId = getClaimValue(this.P_TEAM) || getClaimValue(this.P_EMPLOYER);
      if (teamId) {
        facts.teamId = teamId;
        const commonTeams: Record<string, string> = {
          'Q169898': 'Mercedes', 'Q171337': 'Red Bull Racing', 'Q169893': 'Ferrari',
          'Q172030': 'McLaren', 'Q171328': 'Aston Martin', 'Q171331': 'Alpine',
          'Q171334': 'Williams', 'Q171340': 'Haas', 'Q171343': 'AlphaTauri', 
          'Q171346': 'Alfa Romeo', 'Q169891': 'Red Bull'
        };
        facts.team = commonTeams[teamId] || teamId;
      }

      // Extract Office/Role (P39/P106)
      const officeId = getClaimValue(this.P_POSITION_HELD) || getClaimValue(this.P_OCCUPATION);
      if (officeId) {
        facts.officeId = officeId;
        const commonRoles: Record<string, string> = {
          'Q10841764': 'Racing Driver', 'Q931492': 'Footballer', 'Q82955': 'Politician',
          'Q33999': 'Actor', 'Q177220': 'Singer', 'Q483501': 'Artist'
        };
        facts.role = commonRoles[officeId] || officeId;
      }

      // Extract Country (P17)
      const countryId = getClaimValue(this.P_COUNTRY);
      if (countryId) {
        facts.jurisdictionId = countryId;
      }

      // Extract Wikipedia Link
      if (entity.sitelinks && entity.sitelinks.enwiki) {
        facts.wikipediaUrl = entity.sitelinks.enwiki.url;
      }

      return facts;
    } catch (e) {
      console.warn('Wikidata fetch failed:', e);
    }
    return null;
  }

  private static resolveEntity(text: string): { entity: EntityInfo, confidence: number } | null {
    const normalizedText = this.normalize(text);

    // 1. Exact Full Name Match (100% confidence)
    for (const entity of this.ENTITIES) {
      if (normalizedText.includes(this.normalize(entity.name))) {
        return { entity: { ...entity }, confidence: 100 };
      }
    }

    // 2. High-Profile Alias Match with Word Boundaries (95% confidence)
    for (const entity of this.ENTITIES) {
      for (const alias of entity.aliases) {
        const normalizedAlias = this.normalize(alias);
        const regex = new RegExp(`\\b${normalizedAlias}\\b`, 'i');
        if (regex.test(normalizedText)) {
          return { entity: { ...entity }, confidence: 95 };
        }
      }
    }

    // 3. Fallback: Fuzzy/Partial Match for high-profile names (80% confidence)
    for (const entity of this.ENTITIES) {
      const normalizedName = this.normalize(entity.name);
      if (normalizedName.length > 5 && normalizedText.includes(normalizedName.substring(0, 5))) {
        return { entity: { ...entity }, confidence: 80 };
      }
    }

    return null;
  }

  private static extractClaim(text: string, entity: EntityInfo): { type: any, value: string, jurisdiction?: string } | null {
    const patterns = [
      { type: 'age' as const, regex: /(?:is|age|aged)\s+(\d+)\s*(?:years old|years of age)?/ },
      { type: 'role/title' as const, regex: /(?:is the|prime minister of|president of|king of|ruler of|mayor of|leads)\s+([^.]+)/ },
      { type: 'sports affiliation' as const, regex: /(?:plays for|playing for|member of|joined|drives for|racing for|driver for|drives a|racing a)\s+([^.]+)/ },
      { type: 'role/title' as const, regex: /(?:is the|works as|role is|is a|is an)\s+([^.]+)/ },
      { type: 'company fact' as const, regex: /(?:works at|employed by|ceo of|founder of)\s+([^.]+)/ },
      { type: 'location' as const, regex: /(?:is in|located in|found in)\s+([^.]+)/ },
      { type: 'biography' as const, regex: /(?:born in|birthplace is)\s+([^.]+)/ },
      { type: 'nationality' as const, regex: /(?:is|nationality is)\s+(portuguese|argentine|french|american|british|german|spanish|italian|dutch|monegasque)/ }
    ];

    for (const p of patterns) {
      const match = text.match(p.regex);
      if (match) {
        const value = match[1].trim();
        
        if (p.type === 'role/title') {
          const jurisdictionMatch = value.match(/(?:of|in)\s+([^.]+)/);
          const jurisdiction = jurisdictionMatch ? jurisdictionMatch[1].trim() : value;
          return { type: p.type, value, jurisdiction };
        }

        if (value.toLowerCase() !== entity.name.toLowerCase()) {
          return { type: p.type, value };
        }
      }
    }

    return null;
  }

  private static checkCompatibility(entity: EntityInfo, claim: { type: string, value: string }): string | null {
    const value = claim.value.toLowerCase();

    if (entity.facts.role === 'Football Player' && claim.type === 'team') {
      const resolution = this.resolveEntity(value);
      if (resolution && resolution.entity.type === 'brand') {
        return `The claim links ${entity.name} to ${resolution.entity.name} as a playing affiliation, which is semantically incompatible (Athlete vs. Automotive Brand).`;
      }
    }

    return null;
  }

  private static verifyFactualClaim(entity: EntityInfo, claim: { type: any, value: string, jurisdiction?: string }): KnowledgeBaseResult {
    // Map legacy types to new enum
    let claimType: KnowledgeBaseResult['claimType'] = 'general';
    if (claim.type === 'age') claimType = 'age';
    else if (claim.type === 'role/title' || claim.type === 'role') claimType = 'role/title';
    else if (claim.type === 'sports affiliation' || claim.type === 'team') claimType = 'sports affiliation';
    else if (claim.type === 'company fact' || claim.type === 'employer') claimType = 'company fact';
    else if (claim.type === 'location') claimType = 'location';
    else if (claim.type === 'biography' || claim.type === 'birthplace') claimType = 'biography';
    else if (claim.type === 'nationality') claimType = 'nationality';

    const actualValue = entity.facts[claim.type] || entity.facts[claimType];
    
    // Special handling for political office (legacy)
    if (claim.type === 'office' || claim.type === 'role/title') {
      const claimedJurisdiction = claim.jurisdiction || claim.value;
      const actualJurisdiction = entity.facts.jurisdiction;
      const actualOffice = entity.facts.office || entity.facts.role;

      if (actualJurisdiction && actualOffice) {
        const isJurisdictionMatch = claimedJurisdiction.toLowerCase().includes(actualJurisdiction.toLowerCase()) || 
                                   actualJurisdiction.toLowerCase().includes(claimedJurisdiction.toLowerCase());
        const isOfficeMatch = claim.value.toLowerCase().includes(actualOffice.toLowerCase());

        if (!isJurisdictionMatch && claim.type === 'office') {
          return {
            status: 'contradicted',
            matchedEntity: entity.name,
            claimType: 'role/title',
            claimedValue: `${actualOffice} of ${claimedJurisdiction}`,
            actualValue: `${actualOffice} of ${actualJurisdiction}`,
            source: 'Both',
            confidence: 100,
            explanation: `The claim assigns ${entity.name} to the presidency of ${claimedJurisdiction}, which conflicts with public knowledge-base data about political office and jurisdiction. ${entity.name} is associated with ${actualJurisdiction}.`,
            supportLevel: 'Contradicted'
          };
        }

        if (isJurisdictionMatch && isOfficeMatch) {
          return {
            status: 'supported',
            matchedEntity: entity.name,
            claimType: 'role/title',
            claimedValue: claim.value,
            actualValue: `${actualOffice} of ${actualJurisdiction}`,
            source: 'Both',
            confidence: 100,
            explanation: `Verified: ${entity.name} is indeed the ${actualOffice} of ${actualJurisdiction}.`,
            supportLevel: 'Supported'
          };
        }
      }
    }

    if (!actualValue) {
      return this.insufficientEvidence(`Recognized entity "${entity.name}" and claim type "${claim.type}", but no verified data is available for comparison.`);
    }

    const claimedValue = claim.value.toLowerCase();
    const actualValueStr = String(actualValue).toLowerCase();

    if (claimType === 'age') {
      const claimedNum = parseInt(claimedValue);
      const isMatch = claimedNum === actualValue;
      return {
        status: isMatch ? 'supported' : 'contradicted',
        matchedEntity: entity.name,
        claimType: 'age',
        claimedValue: `${claimedNum}`,
        actualValue: `${actualValue}`,
        source: 'Both',
        confidence: 100,
        explanation: isMatch 
          ? `Verified: ${entity.name} is indeed ${actualValue} years old.`
          : `Contradicted: ${entity.name} is ${actualValue} years old, not ${claimedNum}.`,
        supportLevel: isMatch ? 'Supported' : 'Contradicted'
      };
    }

    const isMatch = claimedValue.includes(actualValueStr) || actualValueStr.includes(claimedValue);
    
    return {
      status: isMatch ? 'supported' : 'contradicted',
      matchedEntity: entity.name,
      claimType: claimType,
      claimedValue: claim.value,
      actualValue: String(actualValue),
      source: 'Both',
      confidence: 90,
      explanation: isMatch
        ? `Knowledge base supports the claim that ${entity.name} is associated with ${actualValue}.`
        : `Knowledge base contradicts the claim. ${entity.name} is associated with ${actualValue}, not ${claim.value}.`,
      supportLevel: isMatch ? 'Supported' : 'Contradicted'
    };
  }

  private static insufficientEvidence(explanation: string): KnowledgeBaseResult {
    return {
      status: 'not enough information',
      matchedEntity: 'None',
      claimType: 'general',
      source: 'None',
      confidence: 0,
      explanation,
      supportLevel: 'Insufficient Evidence'
    };
  }

  private static async verifyClaimMock(text: string): Promise<KnowledgeBaseResult> {
    // Original mock logic as fallback
    const lowerText = text.toLowerCase();
    const resolution = this.resolveEntity(lowerText);
    if (!resolution) return this.insufficientEvidence('No recognized entities found.');
    const { entity, confidence: resConfidence } = resolution;
    const claim = this.extractClaim(lowerText, entity);
    if (!claim) return this.insufficientEvidence('Claim ambiguous.');
    const result = this.verifyFactualClaim(entity, claim);
    return { ...result, confidence: Math.round(result.confidence * (resConfidence / 100)), source: 'None' as any };
  }
}
