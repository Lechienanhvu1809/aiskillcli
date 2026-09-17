import fs from "node:fs";
import type { CliContext } from "../context.js";
import { syncPush } from "../policies/git-sync.js";
import { validateSkillName } from "../policies/name-validation.js";
import { ensureSkillsDir, skillExists, skillPath } from "../policies/skill-registry.js";
import { DEFAULT_TEMPLATE_ID, getTemplate, listTemplates } from "../policies/templates.js";
import { c, handleError, info, success, warn } from "../utils/output.js";

export interface CreateOptions {
  template?: string;
  description?: string;
  tags?: string[];
  force?: boolean;
  listTemplates?: boolean;
}

export function runCreate(ctx: CliContext, rawName: string | undefined, opts: CreateOptions): void {
  try {
    // --list-templates: chỉ liệt kê templates rồi thoát
    if (opts.listTemplates) {
      const templates = listTemplates();
      console.log(c.bold(`Templates có sẵn (${templates.length}):\n`));
      for (const t of templates) {
        const isDefault = t.id === DEFAULT_TEMPLATE_ID ? c.dim(" (mặc định)") : "";
        console.log(`  ${c.ok("•")} ${c.accent(t.id)}${isDefault}`);
        console.log(`    ${c.dim(t.description)}`);
      }
      return;
    }

    // Validate name
    if (!rawName) {
      handleError(new Error("Vui lòng cung cấp tên skill. Ví dụ: ai-skills create my-skill"));
    }
    const name = validateSkillName(rawName);

    // Kiểm tra đã tồn tại
    if (skillExists(ctx, name) && !opts.force) {
      warn(`Skill "${name}" đã tồn tại. Dùng --force để ghi đè.`);
      process.exit(1);
    }
    if (skillExists(ctx, name) && opts.force) {
      warn(`Đang ghi đè skill "${name}"...`);
    }

    // Lấy template
    const templateId = opts.template ?? DEFAULT_TEMPLATE_ID;
    const template = getTemplate(templateId);
    if (!template) {
      const available = listTemplates()
        .map((t) => t.id)
        .join(", ");
      handleError(
        new Error(`Template "${templateId}" không tồn tại. Các template có sẵn: ${available}`),
      );
    }

    // Generate content
    const description = opts.description ?? `Kỹ năng ${name}`;
    const content = template.generate(name, description, opts.tags);

    // Ghi file
    ensureSkillsDir(ctx);
    fs.writeFileSync(skillPath(ctx, name), content, "utf8");

    success(`Đã tạo kỹ năng "${name}" từ template "${template.id}"!`);
    info(`Đường dẫn: ${skillPath(ctx, name)}`);
    info(`Chỉnh sửa file và thêm nội dung phù hợp với dự án của bạn.`);

    syncPush(ctx, `Auto-sync: Create skill ${name}`);
  } catch (err) {
    handleError(err);
  }
}
