import pc from "picocolors";
import { SkillApplicationService } from "../application/SkillApplicationService.js";
import type { CliContext } from "../context.js";
import { FileSystemSkillRepository } from "../infrastructure/FileSystemSkillRepository.js";
import { syncPush } from "../policies/git-sync.js";
import { validateSkillName } from "../policies/name-validation.js";
import { handleError, success } from "../utils/output.js";

export interface LearnOptions {
  noSync?: boolean;
}

export async function runLearn(
  ctx: CliContext,
  topic: string,
  lesson: string,
  options: LearnOptions = {},
): Promise<void> {
  try {
    const cleanTopic = validateSkillName(
      topic
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "-")
        .replace(/-+/g, "-") // collapse consecutive hyphens
        .replace(/^-+|-+$/g, ""), // trim leading/trailing hyphens
    );
    const skillName = `learned-${cleanTopic}`;

    const repo = new FileSystemSkillRepository(ctx.skillsDir);
    const service = new SkillApplicationService(repo);

    // Template cho skill mới (chỉ dùng khi skill chưa tồn tại)
    const dateStr = new Date().toISOString().split("T")[0];
    const newEntry = `- **[${dateStr}]**: ${lesson}`;
    const initialContent = `---
name: ${skillName}
description: Tự động ghi lại các bài học và kinh nghiệm rút ra liên quan đến chủ đề ${cleanTopic}.
tags: [learned, ${cleanTopic}]
---

# Sổ tay học tập: ${cleanTopic.toUpperCase()}

Kỹ năng này là một tập hợp các bài học, quy tắc và kinh nghiệm tự động được tích lũy bởi AI Agent sau các lần gỡ lỗi hoặc cấu hình thực tế. Hãy luôn đọc kỹ sổ tay này trước khi làm việc với ${cleanTopic} để tránh lặp lại sai lầm.

## Những bài học đã ghi nhận

${newEntry}
`;

    const { isNew } = await service.appendLesson(skillName, lesson, initialContent);

    if (isNew) {
      console.log(pc.blue(`ℹ Đang tạo sổ tay học tập mới "${skillName}"...`));
    } else {
      console.log(pc.blue(`ℹ Đang cập nhật bài học mới vào sổ tay "${skillName}"...`));
    }

    success(`Đã lưu bài học vào kỹ năng "${skillName}".`);

    if (!options.noSync) {
      console.log(pc.blue("ℹ Đang đồng bộ sổ tay lên kho lưu trữ đám mây..."));
      syncPush(ctx, `docs(learn): auto-learned new lesson for ${cleanTopic}`);
    }
  } catch (err) {
    handleError(err);
  }
}
