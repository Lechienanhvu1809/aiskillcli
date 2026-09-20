import fs from "node:fs";
import path from "node:path";
import type { CliContext } from "../context.js";
import { BundleError, exportBundle } from "../policies/bundle.js";
import { listSkills } from "../policies/skill-registry.js";
import { parseFrontmatter } from "../utils/frontmatter.js";
import { c, fatal, handleError, info, success, warn } from "../utils/output.js";

export interface ExportOptions {
  tag?: string;
  all?: boolean;
}

export function runExport(
  ctx: CliContext,
  outputFile: string,
  skills: string[],
  opts: ExportOptions,
): void {
  try {
    const allSkills = listSkills(ctx);
    let toExport: string[] = [];

    if (opts.all) {
      toExport = allSkills.map((s) => s.name);
    } else if (opts.tag) {
      const lowerTag = opts.tag.toLowerCase();
      for (const skill of allSkills) {
        const content = fs.readFileSync(skill.path, "utf8");
        const frontmatter = parseFrontmatter(content);
        const tags = (frontmatter.tags ?? []).map((t) => t.toLowerCase());
        if (tags.includes(lowerTag)) {
          toExport.push(skill.name);
        }
      }
    } else {
      toExport = skills;
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
    }
    handleError(err);
  }
}
