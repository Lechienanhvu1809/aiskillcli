import fs from "node:fs";
import path from "node:path";
import type { CliContext } from "../context.js";
import { BundleError, importBundle, parseBundle } from "../policies/bundle.js";
import { generateDiff } from "../policies/diff.js";
import { syncPush } from "../policies/git-sync.js";
import { getSkill, skillExists } from "../policies/skill-registry.js";
import { c, fatal, handleError, success, warn } from "../utils/output.js";

export interface ImportOptions {
  force?: boolean;
  diff?: boolean;
}

export function runImport(ctx: CliContext, inputFile: string, opts: ImportOptions): void {
  try {
    const inputPath = path.resolve(process.cwd(), inputFile);
    if (!fs.existsSync(inputPath)) {
      fatal(`Không tìm thấy file "${inputFile}".`);
    }

    const content = fs.readFileSync(inputPath, "utf8");
    const bundle = parseBundle(content);

    console.log(`Đọc bundle thành công (chứa ${bundle.skills.length} skills).`);

    if (opts.diff) {
      let hasDiff = false;
      for (const skill of bundle.skills) {
        if (skillExists(ctx, skill.name)) {
          const currentContent = getSkill(ctx, skill.name);
          const diffOutput = generateDiff(skill.name, currentContent, skill.content);
          if (diffOutput) {
            hasDiff = true;
            console.log(`\n${c.bold(`Sự khác biệt cho kỹ năng "${skill.name}":`)}`);
            console.log(diffOutput);
          }
        } else {
          hasDiff = true;
          console.log(
            `\n${c.ok("+")} Kỹ năng "${skill.name}" là kỹ năng mới (chưa tồn tại cục bộ).`,
          );
        }
      }
      if (!hasDiff) {
        console.log(`\nKhông có sự thay đổi nào cho các kỹ năng trong bundle.`);
      }
      return;
    }

    const result = importBundle(ctx, bundle, { force: opts.force });

    if (result.imported.length > 0) {
      success(`Đã import thành công ${result.imported.length} skills:`);
      for (const name of result.imported) {
        console.log(`  ${c.ok("✓")} ${name}`);
      }
      syncPush(ctx, `Auto-sync: Import ${result.imported.length} skills`);
    }

    if (result.skipped.length > 0) {
      warn(
        `Đã bỏ qua ${result.skipped.length} skills (đã tồn tại, dùng --force để ghi đè hoặc --diff để xem thay đổi):`,
      );
      for (const name of result.skipped) {
        console.log(`  ${c.dim("○")} ${name}`);
      }
    }
  } catch (err) {
    if (err instanceof BundleError) {
      fatal(err.message);
    }
    handleError(err);
  }
}
