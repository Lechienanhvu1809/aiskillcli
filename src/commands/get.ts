import { SkillApplicationService } from "../application/SkillApplicationService.js";
import type { CliContext } from "../context.js";
import { FileSystemSkillRepository } from "../infrastructure/FileSystemSkillRepository.js";
import { trackUsage } from "../policies/analytics.js";
import { syncPull } from "../policies/git-sync.js";
import { validateSkillName } from "../policies/name-validation.js";
import { formatSkillAsMarkdown } from "../utils/frontmatter.js";
import { handleError } from "../utils/output.js";

export async function runGet(
  ctx: CliContext,
  rawName: string,
  options: { noSync?: boolean; recursive?: boolean } = {},
): Promise<void> {
  try {
    const name = validateSkillName(rawName);
    if (!options.noSync) {
      syncPull(ctx);
    }

    const repo = new FileSystemSkillRepository(ctx.skillsDir);
    const service = new SkillApplicationService(repo);

    if (!options.recursive) {
      const skill = await service.getSkill(name);
      if (!skill) throw new Error(`Không tìm thấy kỹ năng: ${name}`);
      const content = formatSkillAsMarkdown(skill);
      trackUsage(ctx, name);
      console.log(content);
      return;
    }

    // Đệ quy lấy nội dung skill và dependencies
    const visited = new Set<string>();
    const maxDepth = 2;
    const output: string[] = [];

    async function fetchRecursive(currentName: string, depth: number) {
      if (visited.has(currentName) || depth > maxDepth) return;
      visited.add(currentName);

      try {
        const validName = validateSkillName(currentName);
        const skill = await service.getSkill(validName);
        if (!skill) throw new Error("Not found");

        const content = formatSkillAsMarkdown(skill);
        trackUsage(ctx, validName);

        output.push(`\n<!-- ===== BẮT ĐẦU SKILL: ${validName} ===== -->\n`);
        output.push(content);
        output.push(`\n<!-- ===== KẾT THÚC SKILL: ${validName} ===== -->\n`);

        const reqs = skill.getRequirements();
        if (reqs && reqs.length > 0) {
          for (const req of reqs) {
            await fetchRecursive(req, depth + 1);
          }
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        output.push(`\n<!-- [LỖI] Không thể lấy phụ thuộc: ${currentName} (${msg}) -->\n`);
      }
    }

    await fetchRecursive(name, 0);
    console.log(output.join(""));
  } catch (err) {
    handleError(err);
  }
}
