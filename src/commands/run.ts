import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as p from "@clack/prompts";
import type { CliContext } from "../context.js";
import { extractBashHook } from "../policies/bash-hook.js";
import { validateSkillName } from "../policies/name-validation.js";
import { skillPath } from "../policies/skill-registry.js";
import { handleError, info, warn } from "../utils/output.js";

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
    const scriptContent = extractBashHook(content);

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

    const execOptions: import("node:child_process").ExecSyncOptions = {
      stdio: "inherit",
      timeout: 300000, // 5 phút timeout mặc định
    };
    if (os.platform() === "win32") {
      execOptions.shell = "bash";
    }

    try {
      execSync(scriptContent, execOptions);
    } catch (e: any) {
      if (os.platform() === "win32" && e.message && e.message.includes("ENOENT")) {
        handleError(new Error("Không tìm thấy 'bash' trên Windows. Hãy chắc chắn bạn đã cài Git Bash hoặc WSL và đưa vào PATH."));
      } else {
        throw e;
      }
    }
  } catch (err: any) {
    handleError(err);
  }
}
