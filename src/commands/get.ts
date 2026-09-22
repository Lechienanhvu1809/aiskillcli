import type { CliContext } from "../context.js";
import { syncPull } from "../policies/git-sync.js";
import { validateSkillName } from "../policies/name-validation.js";
import { getSkill } from "../policies/skill-registry.js";
import { parseFrontmatter } from "../utils/frontmatter.js";
import { handleError } from "../utils/output.js";
import { trackUsage } from "../policies/analytics.js";

export function runGet(
  ctx: CliContext,
  rawName: string,
  options: { noSync?: boolean; recursive?: boolean } = {},
): void {
  try {
    const name = validateSkillName(rawName);
    if (!options.noSync) {
      syncPull(ctx);
    }

    if (!options.recursive) {
      const content = getSkill(ctx, name);
      trackUsage(ctx, name);
      console.log(content);
      return;
    }

    // Đệ quy lấy nội dung skill và dependencies
    const visited = new Set<string>();
    const maxDepth = 2;
    const output: string[] = [];

    function fetchRecursive(currentName: string, depth: number) {
      if (visited.has(currentName) || depth > maxDepth) return;
      visited.add(currentName);

      try {
        const validName = validateSkillName(currentName);
        const content = getSkill(ctx, validName);
        trackUsage(ctx, validName);

        output.push(`\n<!-- ===== BẮT ĐẦU SKILL: ${validName} ===== -->\n`);
        output.push(content);
        output.push(`\n<!-- ===== KẾT THÚC SKILL: ${validName} ===== -->\n`);

        const frontmatter = parseFrontmatter(content);
        if (frontmatter.requires && Array.isArray(frontmatter.requires)) {
          for (const req of frontmatter.requires) {
            fetchRecursive(req, depth + 1);
          }
        }
      } catch (e: any) {
        output.push(`\n<!-- [LỖI] Không thể lấy phụ thuộc: ${currentName} (${e.message}) -->\n`);
      }
    }

    fetchRecursive(name, 0);
    console.log(output.join(""));
  } catch (err) {
    handleError(err);
  }
}

