import { SkillApplicationService } from "../application/SkillApplicationService.js";
import type { CliContext } from "../context.js";
import { FileSystemSkillRepository } from "../infrastructure/FileSystemSkillRepository.js";
import { syncPull } from "../policies/git-sync.js";
import { c } from "../utils/output.js";

export async function runList(ctx: CliContext): Promise<void> {
  syncPull(ctx);

  const repo = new FileSystemSkillRepository(ctx.skillsDir);
  const service = new SkillApplicationService(repo);
  const skills = await service.getAllSkills();

  if (skills.length === 0) {
    console.log(
      c.dim("Kho kỹ năng đang trống. Thêm kỹ năng bằng: ai-skills add <tên> <đường_dẫn_file>"),
    );
    return;
  }

  console.log(c.bold(`Danh sách kỹ năng (${skills.length}):`));
  // Sort alphabetically
  const sorted = skills.sort((a, b) => a.name.localeCompare(b.name));
  for (const skill of sorted) {
    console.log(`  ${c.ok("•")} ${skill.name}`);
  }
}
