import fs from "node:fs";
import path from "node:path";
import { SkillApplicationService } from "../application/SkillApplicationService.js";
import type { CliContext } from "../context.js";
import { FileSystemSkillRepository } from "../infrastructure/FileSystemSkillRepository.js";
import { BundleError, exportBundle } from "../policies/bundle.js";
import { fatal, handleError, info, success, warn } from "../utils/output.js";

export interface ExportOptions {
  tag?: string;
  all?: boolean;
  withDeps?: boolean;
}

export async function runExport(
  ctx: CliContext,
  outputFile: string,
  skills: string[],
  opts: ExportOptions,
): Promise<void> {
  try {
    const repo = new FileSystemSkillRepository(ctx.skillsDir);
    const service = new SkillApplicationService(repo);
    const allSkills = await service.getAllSkills();

    let toExport: string[] = [];

    if (opts.all) {
      toExport = allSkills.map((s) => s.id);
    } else if (opts.tag) {
      const lowerTag = opts.tag.toLowerCase();
      // Lọc theo tag trực tiếp từ domain entity
      for (const skill of allSkills) {
        if (skill.getTags().some((t) => t.value === lowerTag)) {
          toExport.push(skill.id);
        }
      }
    } else {
      toExport = skills;
    }

    if (opts.withDeps) {
      const visited = new Set<string>();

      async function addDeps(name: string) {
        if (visited.has(name)) return;
        visited.add(name);
        const dep = await service.getSkill(name);
        if (dep) {
          for (const req of dep.getRequirements()) {
            await addDeps(req);
          }
        }
      }

      for (const s of toExport) {
        await addDeps(s);
      }
      toExport = Array.from(visited);
    }

    if (toExport.length === 0) {
      warn("Không có skill nào để export.");
      return;
    }

    info(`Đang đóng gói ${toExport.length} skills...`);
    const bundleStr = exportBundle(ctx, toExport);

    const outputPath = path.resolve(process.cwd(), outputFile);
    fs.writeFileSync(outputPath, bundleStr, "utf8");

    success(`Đã export ${toExport.length} skills ra file "${outputFile}".`);
  } catch (err) {
    if (err instanceof BundleError) {
      fatal(err.message);
      return;
    }
    handleError(err);
  }
}
