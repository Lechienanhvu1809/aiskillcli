import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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

export function runRun(ctx: CliContext, rawName: string): void {
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

    // Windows: cmd.exe không hiểu '#' là comment — chỉ filter dòng thuần comment
    // (dòng mà ký tự không-whitespace đầu tiên là '#'), giữ nguyên '#' trong strings/arguments
    if (os.platform() === "win32") {
      scriptContent = scriptContent
        .split("\n")
        .filter((line) => !/^\s*#/.test(line))
        .join("\n");
    }

    // Preview script trước khi chạy
    console.log(`\n🚀 Thực thi kỹ năng "${name}":\n`);
    for (const line of scriptContent.split("\n")) {
      if (line.trim()) console.log(`  │ ${line}`);
    }
    console.log();

    const output = execSync(scriptContent, { encoding: "utf8", stdio: "pipe" });
    console.log(output);
  } catch (err) {
    if (err instanceof Error && "stdout" in err) {
      const execErr = err as Error & { stdout?: string; stderr?: string };
      if (execErr.stdout) console.log(execErr.stdout);
      if (execErr.stderr) console.error(execErr.stderr);
      handleError(new Error(`Lỗi khi thực thi: ${err.message}`));
    }
    handleError(err);
  }
}
