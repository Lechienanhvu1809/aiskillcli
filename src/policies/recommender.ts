import fs from "node:fs";
import type { ProjectProfile } from "./project-analyzer.js";
import type { SkillInfo } from "./skill-registry.js";

/**
 * Business Rule: Gợi ý skills phù hợp với dự án.
 * So sánh ProjectProfile với metadata (frontmatter + content) của mỗi skill.
 * Trả về danh sách recommendations sắp xếp theo confidence.
 */

export interface Recommendation {
  /** Tên skill */
  skillName: string;
  /** Lý do gợi ý */
  reason: string;
  /** Mức độ tự tin */
  confidence: "high" | "medium" | "low";
  /** Điểm nội bộ (dùng để sort) */
  score: number;
}

import { parseFrontmatter } from "../utils/frontmatter.js";

/** Kiểm tra keyword xuất hiện trong name, content, hoặc description */
function matchesAny(keyword: string, ...sources: string[]): boolean {
  return sources.some((s) => s.includes(keyword));
}

/** Tính điểm từ frameworks và tools */
function matchKeywords(
  profile: ProjectProfile,
  lowerName: string,
  lowerContent: string,
  description: string,
  tags: string[],
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  for (const fw of profile.frameworks) {
    if (matchesAny(fw, lowerContent, lowerName, description, ...tags)) {
      score += 3;
      reasons.push(`Phù hợp với framework "${fw}"`);
    }
  }

  for (const tool of profile.tools) {
    if (matchesAny(tool, lowerContent, lowerName, description, ...tags)) {
      score += 2;
      reasons.push(`Liên quan đến tool "${tool}"`);
    }
  }

  if (matchesAny(profile.language, lowerContent, lowerName, description, ...tags)) {
    score += 2;
    reasons.push(`Phù hợp với ngôn ngữ "${profile.language}"`);
  }

  return { score, reasons };
}

/** Tính điểm contextual (tests, CI, Docker) */
function matchContextual(
  profile: ProjectProfile,
  lowerName: string,
  lowerContent: string,
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  if (profile.hasTests && matchesAny("test", lowerContent, lowerName)) {
    score += 1;
    reasons.push("Dự án có tests — skill liên quan đến testing");
  }
  if (profile.hasCi && (lowerContent.includes("ci") || lowerContent.includes("deploy"))) {
    score += 1;
    reasons.push("Dự án có CI/CD — skill liên quan đến automation");
  }
  if (
    profile.hasDocker &&
    (lowerContent.includes("docker") || lowerContent.includes("container"))
  ) {
    score += 1;
    reasons.push("Dự án dùng Docker — skill liên quan đến containerization");
  }

  return { score, reasons };
}

/** Tính relevance score giữa skill content và project profile */
function computeRelevance(
  skillName: string,
  content: string,
  profile: ProjectProfile,
): { score: number; reasons: string[] } {
  const lowerContent = content.toLowerCase();
  const lowerName = skillName.toLowerCase();
  const frontmatter = parseFrontmatter(content);
  const description = frontmatter.description?.toLowerCase() ?? "";
  const tags = (frontmatter.tags ?? []).map((t) => t.toLowerCase());

  const keywords = matchKeywords(profile, lowerName, lowerContent, description, tags);
  const contextual = matchContextual(profile, lowerName, lowerContent);

  return {
    score: keywords.score + contextual.score,
    reasons: [...keywords.reasons, ...contextual.reasons],
  };
}

/** Chuyển score thành confidence level */
function scoreToConfidence(score: number): Recommendation["confidence"] {
  if (score >= 5) return "high";
  if (score >= 2) return "medium";
  return "low";
}

/**
 * Gợi ý skills phù hợp với project profile.
 * Đọc nội dung từng skill, so sánh với profile, trả về top matches.
 * @param maxResults Số kết quả tối đa trả về (mặc định 5)
 */
export function recommendSkills(
  profile: ProjectProfile,
  availableSkills: SkillInfo[],
  maxResults = 5,
): Recommendation[] {
  const recommendations: Recommendation[] = [];

  for (const skill of availableSkills) {
    let content: string;
    try {
      content = fs.readFileSync(skill.path, "utf8");
    } catch {
      continue; // Skip unreadable files
    }

    const { score, reasons } = computeRelevance(skill.name, content, profile);
    if (score <= 0 || reasons.length === 0) continue;

    recommendations.push({
      skillName: skill.name,
      reason: reasons.slice(0, 3).join("; "), // Top 3 reasons
      confidence: scoreToConfidence(score),
      score,
    });
  }

  // Sort giảm dần theo score
  recommendations.sort((a, b) => b.score - a.score);
  return recommendations.slice(0, maxResults);
}
