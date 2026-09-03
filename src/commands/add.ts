import { type CliContext } from "../context.js";
import { addSkill, skillExists } from "../policies/skill-registry.js";
import { syncPush } from "../policies/git-sync.js";
import { validateSkillName } from "../policies/name-validation.js";
import { handleError, success, warn } from "../utils/output.js";

export function runAdd(
  ctx: CliContext,
  rawName: string,
  filePath: string,
  opts: { force?: boolean },
): void {
  try {
    const name = validateSkillName(rawName);

    // Policy: Cảnh báo nếu overwrite, không silent
    if (skillExists(ctx, name) && !opts.force) {
      warn(`Skill "${name}" đã tồn tại. Dùng --force để ghi đè.`);
      process.exit(1);
    }
    if (skillExists(ctx, name) && opts.force) {
      warn(`Đang ghi đè skill "${name}"...`);
    }

    addSkill(ctx, name, filePath, { overwrite: opts.force });
    success(`Đã thêm kỹ năng "${name}" vào kho lưu trữ!`);
    syncPush(ctx, `Auto-sync: Add skill ${name}`);
  } catch (err) {
    handleError(err);
  }
}
