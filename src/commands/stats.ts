import type { CliContext } from "../context.js";
import { getSkill, listSkills } from "../policies/skill-registry.js";
import { parseFrontmatter } from "../utils/frontmatter.js";
import { c, handleError, success } from "../utils/output.js";

export function runStats(ctx: CliContext): void {
  try {
    const skills = listSkills(ctx);
    if (skills.length === 0) {
      console.log(c.dim("Kho kỹ năng trống. Hãy dùng lệnh `create` hoặc `add` để thêm."));
      return;
    }

    const tagCounts = new Map<string, number>();

    for (const skill of skills) {
      const content = getSkill(ctx, skill.name);
      const frontmatter = parseFrontmatter(content);
      const tags = (frontmatter.tags ?? []).map((t) => t.toLowerCase());

      for (const tag of tags) {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      }
    }

    success(`Thống kê kho kỹ năng:`);
    console.log(`  ${c.ok("•")} Tổng số kỹ năng: ${c.bold(skills.length)}`);

    if (tagCounts.size > 0) {
      console.log(`  ${c.ok("•")} Phân bố tags:`);
      // Sắp xếp tag theo số lượng giảm dần
      const sortedTags = Array.from(tagCounts.entries()).sort((a, b) => b[1] - a[1]);
      for (const [tag, count] of sortedTags) {
        console.log(`      - ${c.accent(tag)}: ${count}`);
      }
    } else {
      console.log(c.dim(`  (Không có tags nào được sử dụng)`));
    }
  } catch (err) {
    handleError(err);
  }
}
