import { type CliContext } from "../context.js";
import { searchSkills } from "../policies/skill-registry.js";
import { syncPull } from "../policies/git-sync.js";
import { c } from "../utils/output.js";

export function runSearch(ctx: CliContext, keyword: string): void {
  syncPull(ctx);
  const results = searchSkills(ctx, keyword);
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
