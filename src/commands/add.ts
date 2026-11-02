import { SkillApplicationService } from "../application/SkillApplicationService.js";
import type { CliContext } from "../context.js";
import { FileSystemSkillRepository } from "../infrastructure/FileSystemSkillRepository.js";
import { syncPull, syncPush } from "../policies/git-sync.js";
import { validateSkillName } from "../policies/name-validation.js";
import { handleError, success, warn } from "../utils/output.js";

export async function runAdd(
  ctx: CliContext,
  rawName: string,
  filePath: string,
  opts: { force?: boolean; tags?: string[]; noSync?: boolean },
): Promise<void> {
  try {
    const name = validateSkillName(rawName);

    // Pull trước khi check exists và add
    if (!opts.noSync) {
      syncPull(ctx);
    }

    const repo = new FileSystemSkillRepository(ctx.skillsDir);
    const service = new SkillApplicationService(repo);

    if ((await repo.exists(name)) && !opts.force) {
      warn(`Skill "${name}" đã tồn tại. Dùng --force để ghi đè.`);
      process.exit(1);
    }
    if ((await repo.exists(name)) && opts.force) {
      warn(`Đang ghi đè skill "${name}"...`);
    }

    await service.createSkill(name, filePath, opts.tags || [], opts.force);

    success(`Đã thêm/cập nhật kỹ năng "${name}".`);

    if (!opts.noSync) {
      syncPush(ctx, `Auto-sync: Add/update skill ${name}`);
    }
  } catch (err) {
    handleError(err);
  }
}
