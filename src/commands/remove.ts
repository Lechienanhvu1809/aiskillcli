import { SkillApplicationService } from "../application/SkillApplicationService.js";
import type { CliContext } from "../context.js";
import { FileSystemSkillRepository } from "../infrastructure/FileSystemSkillRepository.js";
import { syncPull, syncPush } from "../policies/git-sync.js";
import { validateSkillName } from "../policies/name-validation.js";
import { handleError, success } from "../utils/output.js";

export async function runRemove(ctx: CliContext, rawName: string): Promise<void> {
  try {
    const name = validateSkillName(rawName);

    // Pull trước khi remove
    syncPull(ctx);

    const repo = new FileSystemSkillRepository(ctx.skillsDir);
    const service = new SkillApplicationService(repo);

    await service.deleteSkill(name);

    success(`Đã xóa kỹ năng "${name}".`);
    syncPush(ctx, `Auto-sync: Remove skill ${name}`);
  } catch (err) {
    handleError(err);
  }
}
