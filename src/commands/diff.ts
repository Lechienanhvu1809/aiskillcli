import fs from "node:fs";
import path from "node:path";
import type { CliContext } from "../context.js";
import { DiffError, generateDiff } from "../policies/diff.js";
import { getSkill, skillExists } from "../policies/skill-registry.js";
import { fatal, handleError } from "../utils/output.js";

export function runDiff(ctx: CliContext, name: string, filePath: string): void {
  try {
    if (!skillExists(ctx, name)) {
      fatal(`Không tìm thấy kỹ năng "${name}" trong kho lưu trữ.`);
    }

    const absolutePath = path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(absolutePath)) {
      fatal(`Không tìm thấy file "${filePath}" để so sánh.`);
    }

    const currentContent = getSkill(ctx, name);
    const incomingContent = fs.readFileSync(absolutePath, "utf8");

    const diffOutput = generateDiff(name, currentContent, incomingContent);

    if (diffOutput) {
      console.log(diffOutput);
    } else {
      console.log(`Kỹ năng "${name}" không có thay đổi nào so với file "${filePath}".`);
    }
  } catch (err) {
    if (err instanceof DiffError) {
      fatal(err.message);
    }
    handleError(err);
  }
}
