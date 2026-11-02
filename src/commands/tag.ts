import { SkillApplicationService } from "../application/SkillApplicationService.js";
import type { CliContext } from "../context.js";
import { FileSystemSkillRepository } from "../infrastructure/FileSystemSkillRepository.js";
import { c, fatal } from "../utils/output.js";

/**
 * Subcommand `tag` — quản lý tags của skills.
 * Dùng như: ai-skills tag <action> [args...]
 */

// ─── tag add ──────────────────────────────────────────────────────────────────

export async function runTagAdd(ctx: CliContext, skillName: string, tags: string[]): Promise<void> {
  if (tags.length === 0) {
    fatal("Cần ít nhất 1 tag. Ví dụ: ai-skills tag add my-skill frontend web");
    return;
  }

  const repo = new FileSystemSkillRepository(ctx.skillsDir);
  const service = new SkillApplicationService(repo);

  try {
    const skill = await service.addTagsToSkill(skillName, tags);
    console.log(`${c.ok("✓")}  Tags của "${skillName}":`);
    console.log(
      `   ${skill
        .getTags()
        .map((t) => c.accent(t.value))
        .join("  ")}`,
    );
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    if (errMsg.includes("not found")) {
      fatal(`Không tìm thấy skill "${skillName}".`);
    } else {
      fatal(errMsg);
    }
  }
}

// ─── tag remove ───────────────────────────────────────────────────────────────

export async function runTagRemove(ctx: CliContext, skillName: string, tag: string): Promise<void> {
  const repo = new FileSystemSkillRepository(ctx.skillsDir);
  const service = new SkillApplicationService(repo);

  try {
    const skill = await service.removeTagFromSkill(skillName, tag);
    console.log(`${c.ok("✓")}  Đã xóa tag "${tag}" khỏi "${skillName}".`);
    const remaining = skill.getTags();
    if (remaining.length > 0) {
      console.log(`   Tags còn lại: ${remaining.map((t) => c.accent(t.value)).join("  ")}`);
    } else {
      console.log(`   ${c.dim("(không còn tag nào)")}`);
    }
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    if (errMsg.includes("not found")) {
      fatal(`Không tìm thấy skill "${skillName}".`);
    } else {
      fatal(errMsg);
    }
  }
}

// ─── tag list ─────────────────────────────────────────────────────────────────

export async function runTagList(ctx: CliContext): Promise<void> {
  const repo = new FileSystemSkillRepository(ctx.skillsDir);
  const service = new SkillApplicationService(repo);

  const { tagMap, untagged } = await service.getTagsOverview();

  const _totalSkills = Array.from(tagMap.values()).flat().length + untagged.length;

  if (tagMap.size === 0 && untagged.length === 0) {
    console.log(c.dim("Không có skill nào."));
    return;
  }

  console.log(`\n${c.bold("Tags trong kho kỹ năng:")}\n`);

  const sortedTags = [...tagMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [tag, names] of sortedTags) {
    const uniqueNames = Array.from(new Set(names)).sort();
    const count = c.dim(`(${uniqueNames.length} skill)`);
    console.log(`  ${c.accent(tag.padEnd(24))} ${count}`);
    for (const n of uniqueNames) {
      console.log(`    ${c.dim("•")} ${n}`);
    }
  }

  if (untagged.length > 0) {
    console.log(`\n  ${c.dim(`(untagged: ${untagged.length} skills)`)}`);
  }
  console.log(`\n${c.dim(`Tổng: ${tagMap.size} tags`)}`);
}

// ─── tag rename ───────────────────────────────────────────────────────────────

export async function runTagRename(ctx: CliContext, oldTag: string, newTag: string): Promise<void> {
  if (!newTag || newTag.trim() === "") {
    fatal("Tên tag mới không được để trống.");
    return;
  }

  const repo = new FileSystemSkillRepository(ctx.skillsDir);
  const service = new SkillApplicationService(repo);

  const renamedCount = await service.renameTag(oldTag, newTag);

  if (renamedCount === 0) {
    console.log(`${c.warn("⚠")}  Tag "${oldTag}" không tìm thấy trong bất kỳ skill nào.`);
    return;
  }

  console.log(`\n${c.ok("✓")} Đã đổi "${oldTag}" → "${newTag}" trong ${renamedCount} skill.`);
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

export async function runTag(ctx: CliContext, action: string, args: string[]): Promise<void> {
  switch (action) {
    case "add": {
      const [skill, ...tags] = args;
      if (!skill) {
        fatal("Usage: ai-skills tag add <skill> <tag1> [tag2...]");
        return;
      }
      await runTagAdd(ctx, skill, tags);
      break;
    }
    case "remove":
    case "rm": {
      const [skill, tag] = args;
      if (!skill || !tag) {
        fatal("Usage: ai-skills tag remove <skill> <tag>");
        return;
      }
      await runTagRemove(ctx, skill, tag);
      break;
    }
    case "list":
    case "ls": {
      await runTagList(ctx);
      break;
    }
    case "rename":
    case "mv": {
      const [oldTag, newTag] = args;
      if (!oldTag || !newTag) {
        fatal("Usage: ai-skills tag rename <old-tag> <new-tag>");
        return;
      }
      await runTagRename(ctx, oldTag, newTag);
      break;
    }
    default:
      fatal(`Action không hợp lệ: "${action}". Dùng: add | remove | list | rename`);
  }
}
