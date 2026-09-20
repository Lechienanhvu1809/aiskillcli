import fs from "node:fs";
import path from "node:path";
import { pipeline } from "@xenova/transformers";
import type { CliContext } from "../context.js";
import { ensureSkillsDir } from "./skill-registry.js";

const MODEL_ID = "Xenova/all-MiniLM-L6-v2";

export interface SemanticResult {
  name: string;
  score: number;
}

class VectorDatabase {
  static pipelineInstance: any = null;

  static async getPipeline() {
    if (!this.pipelineInstance) {
      // Create feature extraction pipeline
      // This will download the model to cache on first run (around ~22MB)
      this.pipelineInstance = await pipeline("feature-extraction", MODEL_ID, {
        quantized: true,
      });
    }
    return this.pipelineInstance;
  }
}

/**
 * Tạo vector 384 chiều từ văn bản
 */
export async function embedText(text: string): Promise<number[]> {
  const extractor = await VectorDatabase.getPipeline();
  // Generate embeddings, applying mean pooling and normalization
  const output = await extractor(text, { pooling: "mean", normalize: true });
  return Array.from(output.data);
}

/**
 * Tính cosine similarity giữa 2 vector đã normalize
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

function getVectorDbPath(ctx: CliContext): string {
  ensureSkillsDir(ctx);
  return path.join(ctx.skillsDir, "vectors.json");
}

/**
 * Đọc tất cả vector từ đĩa
 */
export function loadVectors(ctx: CliContext): Record<string, number[]> {
  const dbPath = getVectorDbPath(ctx);
  if (!fs.existsSync(dbPath)) {
    return {};
  }
  try {
    const content = fs.readFileSync(dbPath, "utf8");
    return JSON.parse(content);
  } catch {
    return {};
  }
}

/**
 * Lưu 1 vector của skill vào đĩa
 */
export function saveVector(ctx: CliContext, skillName: string, vector: number[]): void {
  const vectors = loadVectors(ctx);
  vectors[skillName] = vector;
  const dbPath = getVectorDbPath(ctx);
  fs.writeFileSync(dbPath, JSON.stringify(vectors, null, 2), "utf8");
}

/**
 * Xóa 1 vector khỏi đĩa
 */
export function removeVector(ctx: CliContext, skillName: string): void {
  const vectors = loadVectors(ctx);
  if (vectors[skillName]) {
    delete vectors[skillName];
    const dbPath = getVectorDbPath(ctx);
    fs.writeFileSync(dbPath, JSON.stringify(vectors, null, 2), "utf8");
  }
}

/**
 * Tìm kiếm theo ngữ nghĩa
 */
export async function searchSemantic(
  ctx: CliContext,
  query: string,
  threshold = 0.5,
): Promise<SemanticResult[]> {
  const queryVector = await embedText(query);
  const vectors = loadVectors(ctx);
  
  const results: SemanticResult[] = [];
  
  for (const [name, vector] of Object.entries(vectors)) {
    const score = cosineSimilarity(queryVector, vector);
    if (score >= threshold) {
      results.push({ name, score });
    }
  }
  
  // Sort descending by score
  return results.sort((a, b) => b.score - a.score);
}
