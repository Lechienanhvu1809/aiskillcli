import { SkillApplicationService } from "../application/SkillApplicationService.js";
import type { CliContext } from "../context.js";
import { FileSystemSkillRepository } from "../infrastructure/FileSystemSkillRepository.js";
import { c, handleError, success } from "../utils/output.js";

export async function runStats(ctx: CliContext): Promise<void> {
  try {
    const repo = new FileSystemSkillRepository(ctx.skillsDir);
    const service = new SkillApplicationService(repo);

    const skills = await service.getAllSkills();
    if (skills.length === 0) {
      console.log(c.dim("Kho kỹ năng trống. Hãy dùng lệnh `create` hoặc `add` để thêm."));
      return;
    }

    const tagCounts = new Map<string, number>();

    for (const skill of skills) {
      const tags = skill.getTags().map((t) => t.value.toLowerCase());
      for (const tag of tags) {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      }
    }

    success("Thống kê kho kỹ năng:");
    console.log(`  ${c.ok("•")} Tổng số kỹ năng: ${c.bold(String(skills.length))}`);

    if (tagCounts.size > 0) {
      console.log(`  ${c.ok("•")} Phân bố tags:`);
      const sortedTags = Array.from(tagCounts.entries()).sort((a, b) => b[1] - a[1]);
      for (const [tag, count] of sortedTags) {
        console.log(`      - ${c.accent(tag)}: ${count}`);
      }
    } else {
      console.log(c.dim("  (Không có tags nào được sử dụng)"));
    }
  } catch (err) {
    handleError(err);
  }
}
