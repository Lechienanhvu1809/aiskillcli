import fs from "node:fs";
import path from "node:path";
import { type CliContext } from "../context.js";
import { skillPath } from "../policies/skill-registry.js";
import { validateSkillName } from "../policies/name-validation.js";
import { handleError, success, info } from "../utils/output.js";

export function runApply(ctx: CliContext, rawName: string): void {
  try {
    const name = validateSkillName(rawName);
    const sourcePath = skillPath(ctx, name);

    if (!fs.existsSync(sourcePath)) {
      handleError(new Error(`Không tìm thấy kỹ năng "${name}" trong kho tổng.`));
    }

    const targetDir = path.join(process.cwd(), ".agents", "skills", name);
    const targetPath = path.join(targetDir, "SKILL.md");

    fs.mkdirSync(targetDir, { recursive: true });

    // Xóa file cũ để tránh conflict
    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
    }

    // Ưu tiên Symlink → Hardlink → Copy (theo thứ tự ưu tiên)
    let method = "Copy";
    try {
      fs.symlinkSync(sourcePath, targetPath, "file");
      method = "Symlink";
    } catch {
      try {
        fs.linkSync(sourcePath, targetPath);
        method = "Hardlink";
      } catch {
        fs.copyFileSync(sourcePath, targetPath);
        method = "Copy";
      }
    }

    success(`Đã apply kỹ năng "${name}" vào dự án! (phương thức: ${method})`);
    info(`Đường dẫn: ${targetPath}`);
  } catch (err) {
    handleError(err);
  }
}
