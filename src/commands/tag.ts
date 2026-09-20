import fs from "node:fs";
import type { CliContext } from "../context.js";
import { getSkill, listSkills, skillExists, skillPath } from "../policies/skill-registry.js";
import { getTags, injectTags, removeTag, renameTag } from "../utils/frontmatter.js";
import { c, fatal } from "../utils/output.js";

/**
 * Subcommand `tag` — quản lý tags của skills.
 * Dùng như: ai-skills tag <action> [args...]
 */

// ─── tag add ──────────────────────────────────────────────────────────────────

export function runTagAdd(ctx: CliContext, skillName: string, tags: string[]): void {
  if (tags.length === 0) {
    fatal("Cần ít nhất 1 tag. Ví dụ: ai-skills tag add my-skill frontend web");
    return;
  }
  if (!skillExists(ctx, skillName)) {
    fatal(`Không tìm thấy skill "${skillName}".`);
    return;
  }

  const p = skillPath(ctx, skillName);
  const content = fs.readFileSync(p, "utf8");
  const current = getTags(content);

  // Chỉ thêm tags chưa có (deduplicate)
  const lower = new Set(current.map((t) => t.toLowerCase()));
  const toAdd = tags.filter((t) => !lower.has(t.toLowerCase()));

  if (toAdd.length === 0) {
    console.log(
      `${c.warn("⚠")}  Tất cả tags đã tồn tại trong "${skillName}": ${current.map((t) => c.accent(t)).join(", ")}`,
    );
    return;
  }

  const next = [...current, ...toAdd];
  const updated = injectTags(content, next);
  fs.writeFileSync(p, updated, "utf8");

  console.log(`${c.ok("✓")}  Tags của "${skillName}":`);
  console.log(`   ${next.map((t) => c.accent(t)).join("  ")}`);
  if (toAdd.length < tags.length) {
    const skipped = tags.filter((t) => lower.has(t.toLowerCase()));
    console.log(`${c.dim(`   (bỏ qua đã có: ${skipped.join(", ")})`)}`);
  }
}

// ─── tag remove ───────────────────────────────────────────────────────────────

export function runTagRemove(ctx: CliContext, skillName: string, tag: string): void {
  if (!skillExists(ctx, skillName)) {
    fatal(`Không tìm thấy skill "${skillName}".`);
    return;
  }

  const p = skillPath(ctx, skillName);
  const content = fs.readFileSync(p, "utf8");
  const { content: updated, removed } = removeTag(content, tag);

  if (!removed) {
    console.log(`${c.warn("⚠")}  Tag "${tag}" không tồn tại trong skill "${skillName}".`);
    const current = getTags(content);
    if (current.length > 0) {
      console.log(`   Tags hiện tại: ${current.map((t) => c.accent(t)).join("  ")}`);
    }
    return;
  }

  fs.writeFileSync(p, updated, "utf8");
  const remaining = getTags(updated);
  console.log(`${c.ok("✓")}  Đã xóa tag "${tag}" khỏi "${skillName}".`);
  if (remaining.length > 0) {
    console.log(`   Tags còn lại: ${remaining.map((t) => c.accent(t)).join("  ")}`);
  } else {
    console.log(`   ${c.dim("(không còn tag nào)")}`);
  }
}

// ─── tag list ─────────────────────────────────────────────────────────────────

export function runTagList(ctx: CliContext): void {
  const skills = listSkills(ctx);
  if (skills.length === 0) {
    console.log(c.dim("Kho kỹ năng trống."));
    return;
  }

  // Build tag → skill[] map
  const tagMap = new Map<string, string[]>();
  let untaggedCount = 0;

  for (const skill of skills) {
    const content = getSkill(ctx, skill.name);
    const tags = getTags(content);
    if (tags.length === 0) {
      untaggedCount++;
      continue;
    }
    for (const tag of tags) {
      const existing = tagMap.get(tag) ?? [];
      existing.push(skill.name);
      tagMap.set(tag, existing);
    }
  }

  if (tagMap.size === 0 && untaggedCount === 0) {
    console.log(c.dim("Không có skill nào."));
    return;
  }

  console.log(`\n${c.bold("Tags trong kho kỹ năng:")}\n`);

  const sortedTags = [...tagMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [tag, names] of sortedTags) {
    const count = c.dim(`(${names.length} skill)`);
    console.log(`  ${c.accent(tag.padEnd(24))} ${count}`);
    for (const n of names.sort()) {
      console.log(`    ${c.dim("•")} ${n}`);
    }
  }

  if (untaggedCount > 0) {
    console.log(`\n  ${c.dim(`(untagged: ${untaggedCount} skills)`)}`);
  }
  console.log(`\n${c.dim(`Tổng: ${tagMap.size} tags, ${skills.length} skills`)}`);
}

// ─── tag rename ───────────────────────────────────────────────────────────────

export function runTagRename(ctx: CliContext, oldTag: string, newTag: string): void {
  if (!newTag || newTag.trim() === "") {
    fatal("Tên tag mới không được để trống.");
    return;
  }

  const skills = listSkills(ctx);
  let renamedCount = 0;

  for (const skill of skills) {
    const content = getSkill(ctx, skill.name);
    const { content: updated, renamed } = renameTag(content, oldTag, newTag);
    if (renamed) {
      fs.writeFileSync(skill.path, updated, "utf8");
      renamedCount++;
      console.log(`  ${c.ok("✓")}  ${skill.name}`);
    }
  }

  if (renamedCount === 0) {
    console.log(`${c.warn("⚠")}  Tag "${oldTag}" không tìm thấy trong bất kỳ skill nào.`);
    return;
  }

  console.log(`\n${c.ok("✓")} Đã đổi "${oldTag}" → "${newTag}" trong ${renamedCount} skill.`);
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

export function runTag(ctx: CliContext, action: string, args: string[]): void {
  switch (action) {
    case "add": {
      const [skill, ...tags] = args;
      if (!skill) {
        fatal("Usage: ai-skills tag add <skill> <tag1> [tag2...]");
        return;
      }
      runTagAdd(ctx, skill, tags);
      break;
    }
    case "remove":
    case "rm": {
      const [skill, tag] = args;
      if (!skill || !tag) {
        fatal("Usage: ai-skills tag remove <skill> <tag>");
        return;
      }
      runTagRemove(ctx, skill, tag);
      break;
    }
    case "list":
    case "ls": {
      runTagList(ctx);
      break;
    }
    case "rename":
    case "mv": {
      const [oldTag, newTag] = args;
      if (!oldTag || !newTag) {
        fatal("Usage: ai-skills tag rename <old-tag> <new-tag>");
        return;
      }
      runTagRename(ctx, oldTag, newTag);
      break;
    }
    default:
      fatal(`Action không hợp lệ: "${action}". Dùng: add | remove | list | rename`);
  }
}
