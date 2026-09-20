import type { CliContext } from "../context.js";
import { syncPull } from "../policies/git-sync.js";
import {
  type SearchResult,
  searchSkills,
  searchSkillsSemantic,
} from "../policies/skill-registry.js";
import type { ScoredResult } from "../policies/text-search.js";
import { c } from "../utils/output.js";

export interface SearchOptions {
  semantic?: boolean;
  tag?: string;
}

/** Hiển thị kết quả TF-IDF/fuzzy search */
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

/** Hiển thị kết quả brute-force search */
function displayBruteForceResults(results: SearchResult[], keyword: string): void {
  console.log(`Kết quả tìm kiếm cho ${c.accent(`"${keyword}"`)}: \n`);
  if (results.length === 0) {
    console.log(c.dim("Không tìm thấy kỹ năng nào khớp với từ khóa."));
    return;
  }
  for (const r of results) {
    const tags: string[] = [];
    if (r.matchedInName) tags.push("tên");
    if (r.matchedInContent) tags.push("nội dung");
    console.log(`  ${c.ok("•")} ${r.name} ${c.dim(`(khớp trong: ${tags.join(", ")})`)}`);
  }
}

export function runSearch(ctx: CliContext, keyword: string, opts: SearchOptions = {}): void {
  syncPull(ctx);

  if (opts.semantic) {
    const results = searchSkillsSemantic(ctx, keyword, opts.tag);
    displaySemanticResults(results, keyword);
  } else {
    const results = searchSkills(ctx, keyword, opts.tag);
    displayBruteForceResults(results, keyword);
  }
}
