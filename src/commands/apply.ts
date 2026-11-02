import fs from "node:fs";
import path from "node:path";
import { SkillApplicationService } from "../application/SkillApplicationService.js";
import type { CliContext } from "../context.js";
import { FileSystemSkillRepository } from "../infrastructure/FileSystemSkillRepository.js";
import { trackUsage } from "../policies/analytics.js";
import { validateSkillName } from "../policies/name-validation.js";
import { handleError, info, success } from "../utils/output.js";

export async function runApply(ctx: CliContext, rawName: string): Promise<void> {
  try {
    const name = validateSkillName(rawName);

    const repo = new FileSystemSkillRepository(ctx.skillsDir);
    const service = new SkillApplicationService(repo);

    const skill = await service.getSkill(name);
    if (!skill) {
      handleError(new Error(`Không tìm thấy kỹ năng "${name}" trong kho tổng.`));
      return;
    }

    // Nguồn file vẫn cần đường dẫn thực để tạo symlink
    const sourcePath = path.join(ctx.skillsDir, `${name}.md`);
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

    trackUsage(ctx, name);

    success(`Đã apply kỹ năng "${name}" vào dự án! (phương thức: ${method})`);
    if (method === "Copy") {
      info(
        "Lưu ý: Bạn đang dùng Copy, file này sẽ không tự cập nhật khi kho tổng thay đổi. Cần apply lại nếu muốn cập nhật.",
      );
    }
    info(`Đường dẫn: .agents/skills/${name}/SKILL.md`);
  } catch (err) {
    handleError(err);
  }
}
