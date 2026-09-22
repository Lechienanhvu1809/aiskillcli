import fs from "node:fs";
import path from "node:path";
import type { CliContext } from "../context.js";
import { syncPush } from "../policies/git-sync.js";
import { validateSkillName } from "../policies/name-validation.js";
import { ensureSkillsDir, getSkill, skillExists, skillPath } from "../policies/skill-registry.js";
import { handleError, success } from "../utils/output.js";
import pc from "picocolors";

export interface LearnOptions {
  noSync?: boolean;
}

export function runLearn(
  ctx: CliContext,
  topic: string,
  lesson: string,
  options: LearnOptions = {}
): void {
  try {
    ensureSkillsDir(ctx);
    
    // Đảm bảo tên topic an toàn
    const cleanTopic = validateSkillName(topic.toLowerCase().replace(/[^a-z0-9_-]/g, "-"));
    const skillName = `learned-${cleanTopic}`;
    const filePath = skillPath(ctx, skillName);
    
    const dateStr = new Date().toISOString().split("T")[0];
    const newEntry = `- **[${dateStr}]**: ${lesson}\n`;
    
    let content = "";
    
    if (skillExists(ctx, skillName)) {
      content = getSkill(ctx, skillName);
      // Append vào cuối file
      if (!content.endsWith("\n")) {
        content += "\n";
      }
      content += newEntry;
      console.log(pc.blue(`ℹ Đang cập nhật bài học mới vào sổ tay "${skillName}"...`));
    } else {
      console.log(pc.blue(`ℹ Đang tạo sổ tay học tập mới "${skillName}"...`));
      content = `---
name: ${skillName}
description: Tự động ghi lại các bài học và kinh nghiệm rút ra liên quan đến chủ đề ${cleanTopic}.
tags: [learned, ${cleanTopic}]
---

# Sổ tay học tập: ${cleanTopic.toUpperCase()}

Kỹ năng này là một tập hợp các bài học, quy tắc và kinh nghiệm tự động được tích lũy bởi AI Agent sau các lần gỡ lỗi hoặc cấu hình thực tế. Hãy luôn đọc kỹ sổ tay này trước khi làm việc với ${cleanTopic} để tránh lặp lại sai lầm.

## Những bài học đã ghi nhận

${newEntry}`;
    }
    
    fs.writeFileSync(filePath, content, "utf8");
    success(`Đã lưu bài học vào kỹ năng "${skillName}".`);
    
    if (!options.noSync) {
      console.log(pc.blue("ℹ Đang đồng bộ sổ tay lên kho lưu trữ đám mây..."));
      syncPush(ctx, `docs(learn): auto-learned new lesson for ${cleanTopic}`);
    }
  } catch (err) {
    handleError(err);
  }
}
