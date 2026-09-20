import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import * as p from "@clack/prompts";
import type { CliContext } from "../context.js";
import { validateSkillName } from "../policies/name-validation.js";
import { skillPath } from "../policies/skill-registry.js";
import { handleError, info, warn } from "../utils/output.js";

/**
 * Policy: Trích xuất và chạy bash script từ nội dung Markdown.
 *
 * ⚠️ BẢO MẬT: Lệnh này thực thi code tùy ý từ file Markdown.
 * Chỉ chạy các skill từ nguồn đáng tin cậy.
 * Trong tương lai nên sandbox bằng Docker hoặc deno.
 */
function extractBashHook(content: string): string | null {
  const regex = /```bash\s+(?:hook|pre-hook)[^\n]*\n([\s\S]*?)```/;
  const match = content.match(regex);
  return match?.[1]?.trim() ?? null;
}

export async function runRun(ctx: CliContext, rawName: string, options: { yes?: boolean } = {}): Promise<void> {
  try {
    const name = validateSkillName(rawName);

    // Tìm trong project-local trước, rồi mới tìm trong kho tổng
    let skillFilePath = path.join(process.cwd(), ".agents", "skills", name, "SKILL.md");
    if (!fs.existsSync(skillFilePath)) {
      skillFilePath = skillPath(ctx, name);
    }

    if (!fs.existsSync(skillFilePath)) {
      handleError(new Error(`Không tìm thấy kỹ năng "${name}".`));
    }

    const content = fs.readFileSync(skillFilePath, "utf8");
    let scriptContent = extractBashHook(content);

    if (!scriptContent) {
      info(`Kỹ năng "${name}" không chứa khối mã \`\`\`bash để thực thi.`);
      return;
    }

    // ⚠️ Cảnh báo bảo mật cho người dùng
    warn("Đang thực thi code từ file Markdown. Chỉ chạy các skill từ nguồn đáng tin cậy!");

    // Preview script trước khi chạy
    console.log(`\n🚀 Thực thi kỹ năng "${name}":\n`);
    for (const line of scriptContent.split("\n")) {
      if (line.trim()) console.log(`  │ ${line}`);
    }
    console.log();

    if (!options.yes) {
      const shouldRun = await p.confirm({
        message: "Bạn có chắc chắn muốn chạy đoạn mã này không?",
      });
      if (p.isCancel(shouldRun) || !shouldRun) {
        info("Đã hủy thực thi.");
        return;
      }
    }

    execSync(scriptContent, { stdio: "inherit" });
  } catch (err: any) {
    handleError(err);
  }
}
