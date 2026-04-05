import { GoogleGenAI, Type } from "@google/genai";

export interface VisualAnalysisResult {
  visualDescription: string;
  detectedObjects: string[];
  detectedEntities: string[];
  sceneType: 'sports' | 'video game' | 'real-world' | 'news scene' | 'generic' | 'other';
  visualConfidence: number;
  recognitionStrength: 'strong' | 'medium' | 'weak';
  logoDetected?: string;
  extractedText?: string;
}

export class VisualRecognitionService {
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

  static async analyzeImage(image: string): Promise<VisualAnalysisResult> {
    console.log(`[VisualRecognitionService] Analyzing image. Data length: ${image.length} chars.`);
    if (!image || image.length === 0) {
      console.error(`[VisualRecognitionService] No image data provided.`);
      return this.getFallbackResult();
    }

    try {
      // Image is already preprocessed to clean base64 by server.ts
      const base64Data = image.includes(',') ? image.split(',')[1] : image;
      
      console.log(`[VisualRecognitionService] Sending image to Gemini for visual analysis. Data length: ${base64Data.length} chars.`);
      const payload = {
        model: "gemini-3-flash-preview",
        contents: [{
          parts: [
            {
              inlineData: {
                data: base64Data,
                mimeType: "image/jpeg"
              }
            },
            {
              text: `Analyze this image and provide a structured visual recognition report.
              Identify objects, entities, brands, and the general scene type.
              Evaluate how distinctive and recognizable the subjects are.
              
              Return JSON with:
              - visualDescription: A short summary of what is visible.
              - detectedObjects: List of main objects found.
              - detectedEntities: Specific famous people, places, or characters.
              - sceneType: One of [sports, video game, real-world, news scene, generic, other].
              - visualConfidence: Score from 0 to 100 on how certain you are of the identification.
              - recognitionStrength: 'strong' (clear subject/branding), 'medium' (partially clear), or 'weak' (generic/unclear).
              - logoDetected: Any visible brand logos.
              - extractedText: Any readable text in the image.
              `
            }
          ]
        }],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              visualDescription: { type: Type.STRING },
              detectedObjects: { type: Type.ARRAY, items: { type: Type.STRING } },
              detectedEntities: { type: Type.ARRAY, items: { type: Type.STRING } },
              sceneType: { type: Type.STRING },
              visualConfidence: { type: Type.NUMBER },
              recognitionStrength: { type: Type.STRING },
              logoDetected: { type: Type.STRING },
              extractedText: { type: Type.STRING }
            },
            required: ["visualDescription", "detectedObjects", "detectedEntities", "sceneType", "visualConfidence", "recognitionStrength"]
          }
        }
      };

      const response = await this.generateContent(payload);

      return JSON.parse(response.text);
    } catch (error) {
      console.error('Visual Recognition Error:', error);
      return this.getFallbackResult();
    }
  }

  private static getFallbackResult(): VisualAnalysisResult {
    return {
      visualDescription: "Visual analysis failed or image was not recognizable.",
      detectedObjects: [],
      detectedEntities: [],
      sceneType: 'generic',
      visualConfidence: 0,
      recognitionStrength: 'weak'
    };
  }
}
