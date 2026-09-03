import { type CliContext } from "../context.js";
import { listSkills } from "../policies/skill-registry.js";
import { syncPull } from "../policies/git-sync.js";
import { c } from "../utils/output.js";

export function runList(ctx: CliContext): void {
  syncPull(ctx);
  const skills = listSkills(ctx);
  if (skills.length === 0) {
    console.log(
      c.dim('Kho kỹ năng đang trống. Thêm kỹ năng bằng: ai-skills add <tên> <đường_dẫn_file>'),
    );
    return;
  }
  console.log(c.bold(`Danh sách kỹ năng (${skills.length}):`));
  for (const skill of skills) {
    console.log(`  ${c.ok("•")} ${skill.name}`);
  }
}
