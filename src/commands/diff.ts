import fs from "node:fs";
import path from "node:path";
import { SkillApplicationService } from "../application/SkillApplicationService.js";
import type { CliContext } from "../context.js";
import { FileSystemSkillRepository } from "../infrastructure/FileSystemSkillRepository.js";
import { DiffError, generateDiff } from "../policies/diff.js";
import { fatal, handleError } from "../utils/output.js";

export async function runDiff(ctx: CliContext, name: string, filePath: string): Promise<void> {
  try {
    const repo = new FileSystemSkillRepository(ctx.skillsDir);
    const service = new SkillApplicationService(repo);

    const skill = await service.getSkill(name);
    if (!skill) {
      fatal(`Không tìm thấy kỹ năng "${name}" trong kho lưu trữ.`);
      return;
    }

    const absolutePath = path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(absolutePath)) {
      fatal(`Không tìm thấy file "${filePath}" để so sánh.`);
      return;
    }

    // Lấy toàn bộ nội dung Markdown (bao gồm frontmatter) từ entity
    const currentContent = skill.content;
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
      return;
    }
    handleError(err);
  }
}
