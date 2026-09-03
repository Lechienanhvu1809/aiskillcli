import { type CliContext } from "../context.js";
import { removeSkill } from "../policies/skill-registry.js";
import { syncPush } from "../policies/git-sync.js";
import { validateSkillName } from "../policies/name-validation.js";
import { handleError, success } from "../utils/output.js";

export function runRemove(ctx: CliContext, rawName: string): void {
  try {
    const name = validateSkillName(rawName);
    removeSkill(ctx, name);
    success(`Đã xóa kỹ năng "${name}".`);
    syncPush(ctx, `Auto-sync: Remove skill ${name}`);
  } catch (err) {
    handleError(err);
  }
}
