import type { CliContext } from "../context.js";
import { auditSkills } from "../policies/analytics.js";
import { handleError } from "../utils/output.js";

export function runAudit(ctx: CliContext): void {
  try {
    auditSkills(ctx);
  } catch (err) {
    handleError(err);
  }
}
