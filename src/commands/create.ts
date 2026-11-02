import { SkillApplicationService } from "../application/SkillApplicationService.js";
import type { CliContext } from "../context.js";
import { FileSystemSkillRepository } from "../infrastructure/FileSystemSkillRepository.js";
import { syncPush } from "../policies/git-sync.js";
import { validateSkillName } from "../policies/name-validation.js";
import { DEFAULT_TEMPLATE_ID, getTemplate, listTemplates } from "../policies/templates.js";
import { c, handleError, info, success, warn } from "../utils/output.js";

export interface CreateOptions {
  template?: string;
  description?: string;
  tags?: string[];
  force?: boolean;
  listTemplates?: boolean;
}

export async function runCreate(
  ctx: CliContext,
  rawName: string | undefined,
  opts: CreateOptions,
): Promise<void> {
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
      return;
    }
    const name = validateSkillName(rawName);

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
      return;
    }

    const repo = new FileSystemSkillRepository(ctx.skillsDir);
    const service = new SkillApplicationService(repo);

    if ((await repo.exists(name)) && !opts.force) {
      warn(`Skill "${name}" đã tồn tại. Dùng --force để ghi đè.`);
      process.exit(1);
    }
    if ((await repo.exists(name)) && opts.force) {
      warn(`Đang ghi đè skill "${name}"...`);
    }

    // Generate content từ template
    const description = opts.description ?? `Kỹ năng ${name}`;
    const content = template.generate(name, description, opts.tags);

    await service.createSkillFromContent(name, content, opts.force);

    success(`Đã tạo kỹ năng "${name}" từ template "${template.id}"!`);
    info(`Chỉnh sửa file tại: ${ctx.skillsDir}/${name}.md`);
    info(`Thêm nội dung phù hợp với dự án của bạn.`);

    syncPush(ctx, `Auto-sync: Create skill ${name}`);
  } catch (err) {
    handleError(err);
  }
}
