import { type CliContext } from "../context.js";
import { getSkill } from "../policies/skill-registry.js";
import { syncPull } from "../policies/git-sync.js";
import { validateSkillName } from "../policies/name-validation.js";
import { handleError } from "../utils/output.js";

export function runGet(ctx: CliContext, rawName: string): void {
  try {
    const name = validateSkillName(rawName);
    syncPull(ctx);
    const content = getSkill(ctx, name);
    console.log(content);
  } catch (err) {
    handleError(err);
  }
}
