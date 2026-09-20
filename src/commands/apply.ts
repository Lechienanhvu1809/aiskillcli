import fs from "node:fs";
import path from "node:path";
import type { CliContext } from "../context.js";
import { validateSkillName } from "../policies/name-validation.js";
import { skillPath } from "../policies/skill-registry.js";
import { handleError, info, success } from "../utils/output.js";

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

    // Xóa file cũ (force: true xóa được cả symlink treo)
    fs.rmSync(targetPath, { force: true });

    // Ưu tiên Symlink → Copy (Hardlink dễ gãy khi git pull thay inode)
    let method = "Copy";
    try {
      fs.symlinkSync(sourcePath, targetPath, "file");
      method = "Symlink";
    } catch {
      fs.copyFileSync(sourcePath, targetPath);
      method = "Copy";
    }

    success(`Đã apply kỹ năng "${name}" vào dự án! (phương thức: ${method})`);
    if (method === "Copy") {
      info("Lưu ý: Bạn đang dùng Copy, file này sẽ không tự cập nhật khi kho tổng thay đổi. Cần apply lại nếu muốn cập nhật.");
    }
    info(`Đường dẫn: .agents/skills/${name}/SKILL.md`);
  } catch (err) {
    handleError(err);
  }
}
