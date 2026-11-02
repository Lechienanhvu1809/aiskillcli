import { SkillApplicationService } from "../application/SkillApplicationService.js";
import type { CliContext } from "../context.js";
import { FileSystemSkillRepository } from "../infrastructure/FileSystemSkillRepository.js";
import { syncPull } from "../policies/git-sync.js";
import { searchSkillsSemantic } from "../policies/skill-registry.js";
import type { ScoredResult } from "../policies/text-search.js";
import { c } from "../utils/output.js";

export interface SearchOptions {
  semantic?: boolean;
  tag?: string;
}

/** Hiển thị kết quả TF-IDF/fuzzy search (legacy policy path) */
function displaySemanticResults(results: ScoredResult[], keyword: string): void {
  console.log(`Kết quả tìm kiếm thông minh cho ${c.accent(`"${keyword}"`)}: \n`);
  if (results.length === 0) {
    console.log(c.dim("Không tìm thấy kỹ năng nào khớp với từ khóa."));
    return;
  }
  for (const r of results) {
    const scoreBar = "█".repeat(Math.round(r.score * 10)).padEnd(10, "░");
    const scoreLabel = c.dim(`[${scoreBar}] ${(r.score * 100).toFixed(0)}%`);
    const typeLabel =
      r.matchType === "exact"
        ? c.ok("exact")
        : r.matchType === "fuzzy"
          ? c.warn("fuzzy")
          : c.dim("tfidf");
    console.log(`  ${c.ok("•")} ${r.name}  ${scoreLabel}  ${typeLabel}`);
    if (r.snippet) {
      console.log(`    ${c.dim(r.snippet)}`);
    }
  }
}

/** Hiển thị kết quả brute-force search (từ Application Service) */
function displayBruteForceResults(
  results: Array<{ id: string; matchedInName: boolean; matchedInContent: boolean }>,
  keyword: string,
): void {
  console.log(`Kết quả tìm kiếm cho ${c.accent(`"${keyword}"`)}: \n`);
  if (results.length === 0) {
    console.log(c.dim("Không tìm thấy kỹ năng nào khớp với từ khóa."));
    return;
  }
  for (const r of results) {
    const tags: string[] = [];
    if (r.matchedInName) tags.push("tên");
    if (r.matchedInContent) tags.push("nội dung");
    console.log(`  ${c.ok("•")} ${r.id} ${c.dim(`(khớp trong: ${tags.join(", ")})`)}`);
  }
}

export async function runSearch(
  ctx: CliContext,
  keyword: string,
  opts: SearchOptions = {},
): Promise<void> {
  syncPull(ctx);

  if (opts.semantic) {
    // Semantic search vẫn dùng policy (TF-IDF logic phức tạp, giữ nguyên)
    const results = searchSkillsSemantic(ctx, keyword, opts.tag);
    displaySemanticResults(results, keyword);
  } else {
    // Brute-force search qua Application Service
    const repo = new FileSystemSkillRepository(ctx.skillsDir);
    const service = new SkillApplicationService(repo);
    const results = await service.searchSkills(keyword, opts.tag);
    displayBruteForceResults(results, keyword);
  }
}
