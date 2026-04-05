import sharp from 'sharp';

export interface ImageMetadata {
  width: number;
  height: number;
  format: string;
  size: number;
  hasAlpha: boolean;
}

export interface HeuristicAnalysis {
  realismScore: number;
  anomalies: string[];
  explanation: string;
}

export class ImageProcessor {
  /**
   * Preprocesses an image: validates, resizes if too large, and returns base64 and metadata.
   */
  static async preprocess(input: Buffer | string): Promise<{ base64: string; metadata: ImageMetadata }> {
    console.log(`[ImageProcessor] Preprocessing image...`);
    
    let buffer: Buffer;
    if (typeof input === 'string') {
      // Handle base64 string (with or without data URL prefix)
      const base64Data = input.includes(',') ? input.split(',')[1] : input;
      buffer = Buffer.from(base64Data, 'base64');
    } else {
      buffer = input;
    }

    if (!buffer || buffer.length === 0) {
      throw new Error('Empty image payload');
    }

    try {
      const image = sharp(buffer);
      const metadata = await image.metadata();

      if (!metadata.width || !metadata.height || !metadata.format) {
        throw new Error('Invalid image format or corrupted data');
      }

      // Resize if too large (Gemini has limits, and we want to save bandwidth)
      // Max dimension 2048px is usually safe and high quality enough
      let processedImage = image;
      if (metadata.width > 2048 || metadata.height > 2048) {
        processedImage = image.resize(2048, 2048, { fit: 'inside', withoutEnlargement: true });
      }

      // Convert to JPEG for consistency
      const outputBuffer = await processedImage.jpeg({ quality: 85 }).toBuffer();
      const outputMetadata = await sharp(outputBuffer).metadata();

      console.log(`[ImageProcessor] Preprocessing complete. Size: ${outputBuffer.length} bytes, Format: ${outputMetadata.format}`);

      return {
        base64: outputBuffer.toString('base64'),
        metadata: {
          width: outputMetadata.width || 0,
          height: outputMetadata.height || 0,
          format: outputMetadata.format || 'unknown',
          size: outputBuffer.length,
          hasAlpha: !!outputMetadata.hasAlpha
        }
      };
    } catch (error) {
      console.error(`[ImageProcessor] Preprocessing failed:`, error);
      throw new Error(`Image could not be processed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Performs basic heuristic analysis when AI is unavailable.
   */
  static async performHeuristicAnalysis(buffer: Buffer): Promise<HeuristicAnalysis> {
    console.log(`[ImageProcessor] Running basic heuristic analysis...`);
    
    try {
      const { data, info } = await sharp(buffer)
        .grayscale()
        .raw()
        .toBuffer({ resolveWithObject: true });

      // 1. Texture Smoothness (Variance)
      // AI images often have unnaturally smooth gradients in some areas
      let sum = 0;
      let sumSq = 0;
      for (let i = 0; i < data.length; i++) {
        sum += data[i];
        sumSq += data[i] * data[i];
      }
      const mean = sum / data.length;
      const variance = (sumSq / data.length) - (mean * mean);
      const stdDev = Math.sqrt(variance);

      // 2. Symmetry Detection (Basic)
      // AI faces are often too symmetrical. We'll check horizontal symmetry.
      const width = info.width;
      const height = info.height;
      let symmetryDiff = 0;
      let count = 0;
      
      // Sample some rows
      for (let y = Math.floor(height * 0.2); y < Math.floor(height * 0.8); y += 10) {
        for (let x = 0; x < Math.floor(width / 2); x += 5) {
          const leftIdx = y * width + x;
          const rightIdx = y * width + (width - 1 - x);
          symmetryDiff += Math.abs(data[leftIdx] - data[rightIdx]);
          count++;
        }
      }
      const avgSymmetryDiff = symmetryDiff / count;

      // 3. Noise Absence
      // Real photos have sensor noise. AI images are often "too clean".
      // We can estimate noise by looking at high-frequency components (Laplacian-like)
      let noiseEstimate = 0;
      for (let y = 1; y < height - 1; y += 5) {
        for (let x = 1; x < width - 1; x += 5) {
          const idx = y * width + x;
          const neighbors = [
            (y-1)*width + x, (y+1)*width + x,
            y*width + (x-1), y*width + (x+1)
          ];
          let localDiff = 0;
          for (const n of neighbors) localDiff += Math.abs(data[idx] - data[n]);
          noiseEstimate += localDiff / 4;
        }
      }
      const avgNoise = noiseEstimate / count;

      const anomalies: string[] = [];
      let realismScore = 85; // Start with high realism

      // Thresholds refined for portrait-style AI detection
      if (avgSymmetryDiff < 12) {
        anomalies.push("Excessive horizontal symmetry (unnatural balance)");
        realismScore -= 25;
      }
      if (avgNoise < 8) {
        anomalies.push("Absence of natural sensor noise (too clean)");
        realismScore -= 30;
      }
      if (stdDev < 35) {
        anomalies.push("Unrealistically smooth textures (plastic-like surfaces)");
        realismScore -= 20;
      }

      // Cumulative penalty: If multiple signals are present, drop score sharply
      if (anomalies.length >= 2) {
        realismScore -= 15;
      }
      if (anomalies.length >= 3) {
        realismScore -= 20;
      }

      const explanation = anomalies.length > 0 
        ? `Detected ${anomalies.length} synthetic markers: ${anomalies.join(', ')}.`
        : "No significant structural anomalies found in basic heuristic scan.";

      return {
        realismScore: Math.max(0, Math.min(100, realismScore)),
        anomalies,
        explanation
      };
    } catch (error) {
      console.error(`[ImageProcessor] Heuristic analysis failed:`, error);
      return {
        realismScore: 50,
        anomalies: ["Heuristic analysis failed"],
        explanation: "Basic visual analysis could not be completed."
      };
    }
  }
}
