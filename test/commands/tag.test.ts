import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runTagAdd, runTagList, runTagRemove, runTagRename } from "../../src/commands/tag.js";
import type { CliContext } from "../../src/context.js";
import { getTags } from "../../src/utils/frontmatter.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCtx(tmpDir: string): CliContext {
  return {
    skillsDir: tmpDir,
    gitRemote: null,
  } as unknown as CliContext;
}

function addTestSkill(ctx: CliContext, name: string, content: string): void {
  const p = path.join(ctx.skillsDir, `${name}.md`);
  fs.writeFileSync(p, content, "utf8");
}

function readSkillContent(ctx: CliContext, name: string): string {
  return fs.readFileSync(path.join(ctx.skillsDir, `${name}.md`), "utf8");
}

const SKILL_WITH_TAGS = `---
name: my-skill
description: Test skill
tags: [frontend, web]
---

# My Skill

Content here.
`;

const SKILL_NO_TAGS = `---
name: clean-skill
description: No tags
---

# Clean Skill

Content.
`;

const SKILL_NO_FRONTMATTER = `# Bare Skill

Just content, no frontmatter.
`;

// ─── Fixtures ─────────────────────────────────────────────────────────────────

let tmpDir: string;
let ctx: CliContext;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-skill-tag-test-"));
  ctx = makeCtx(tmpDir);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ─── tag add ──────────────────────────────────────────────────────────────────

describe("runTagAdd", () => {
  it("thêm tags mới vào skill đã có frontmatter", async () => {
    addTestSkill(ctx, "my-skill", SKILL_WITH_TAGS);
    await runTagAdd(ctx, "my-skill", ["typescript"]);
    const content = readSkillContent(ctx, "my-skill");
    const tags = getTags(content);
    expect(tags).toContain("typescript");
    expect(tags).toContain("frontend");
    expect(tags).toContain("web");
  });

  it("thêm tags vào skill không có tags", async () => {
    addTestSkill(ctx, "clean-skill", SKILL_NO_TAGS);
    await runTagAdd(ctx, "clean-skill", ["backend", "node"]);
    const content = readSkillContent(ctx, "clean-skill");
    const tags = getTags(content);
    expect(tags).toContain("backend");
    expect(tags).toContain("node");
  });

  it("thêm tags vào skill không có frontmatter", async () => {
    addTestSkill(ctx, "bare-skill", SKILL_NO_FRONTMATTER);
    await runTagAdd(ctx, "bare-skill", ["utils"]);
    const content = readSkillContent(ctx, "bare-skill");
    const tags = getTags(content);
    expect(tags).toContain("utils");
  });

  it("không duplicate tags đã tồn tại", async () => {
    addTestSkill(ctx, "my-skill", SKILL_WITH_TAGS);
    await runTagAdd(ctx, "my-skill", ["frontend", "css"]); // "frontend" đã có
    const content = readSkillContent(ctx, "my-skill");
    const tags = getTags(content);
    const frontendCount = tags.filter((t) => t === "frontend").length;
    expect(frontendCount).toBe(1);
    expect(tags).toContain("css");
  });

  it("case-insensitive deduplication", async () => {
    addTestSkill(ctx, "my-skill", SKILL_WITH_TAGS);
    await runTagAdd(ctx, "my-skill", ["FRONTEND"]); // "frontend" đã có dưới dạng lowercase
    const content = readSkillContent(ctx, "my-skill");
    const tags = getTags(content);
    const frontendVariants = tags.filter((t) => t.toLowerCase() === "frontend");
    expect(frontendVariants).toHaveLength(1);
  });

  it("không thay đổi file khi skill không tồn tại — gọi fatal", async () => {
    // Kiểm tra rằng skill không tồn tại thì sẽ throw hoặc không ghi file mới
    await expect(runTagAdd(ctx, "nonexistent", ["tag"])).rejects.toThrow();
  });
});

// ─── tag remove ───────────────────────────────────────────────────────────────

describe("runTagRemove", () => {
  it("xóa tag tồn tại", async () => {
    addTestSkill(ctx, "my-skill", SKILL_WITH_TAGS);
    await runTagRemove(ctx, "my-skill", "frontend");
    const content = readSkillContent(ctx, "my-skill");
    const tags = getTags(content);
    expect(tags).not.toContain("frontend");
    expect(tags).toContain("web"); // tag khác vẫn còn
  });

  it("case-insensitive: xóa tag với case khác", async () => {
    addTestSkill(ctx, "my-skill", SKILL_WITH_TAGS);
    await runTagRemove(ctx, "my-skill", "FRONTEND");
    const content = readSkillContent(ctx, "my-skill");
    const tags = getTags(content);
    expect(tags.map((t) => t.toLowerCase())).not.toContain("frontend");
  });

  it("không thay đổi file khi tag không tồn tại", async () => {
    addTestSkill(ctx, "my-skill", SKILL_WITH_TAGS);
    const before = readSkillContent(ctx, "my-skill");
    await runTagRemove(ctx, "my-skill", "nonexistent-tag");
    const after = readSkillContent(ctx, "my-skill");
    expect(getTags(after)).toEqual(getTags(before));
  });

  it("throw khi skill không tồn tại", async () => {
    await expect(runTagRemove(ctx, "ghost-skill", "tag")).rejects.toThrow();
  });
});

// ─── tag list ─────────────────────────────────────────────────────────────────

describe("runTagList", () => {
  it("không throw khi kho trống", async () => {
    await expect(runTagList(ctx)).resolves.not.toThrow();
  });

  it("không throw với nhiều skills có tags", async () => {
    addTestSkill(ctx, "skill-a", SKILL_WITH_TAGS); // frontend, web
    addTestSkill(ctx, "skill-b", SKILL_NO_TAGS); // không có tags
    await expect(runTagList(ctx)).resolves.not.toThrow();
  });

  it("không throw khi tất cả skills không có tags", async () => {
    addTestSkill(ctx, "bare", SKILL_NO_FRONTMATTER);
    await expect(runTagList(ctx)).resolves.not.toThrow();
  });
});

// ─── tag rename ───────────────────────────────────────────────────────────────

describe("runTagRename", () => {
  it("đổi tên tag trong tất cả skills có chứa tag đó", async () => {
    addTestSkill(ctx, "skill-a", SKILL_WITH_TAGS); // frontend, web
    addTestSkill(
      ctx,
      "skill-b",
      `---
name: skill-b
tags: [frontend, css]
---
# B
`,
    );
    await runTagRename(ctx, "frontend", "ui");

    const tagsA = getTags(readSkillContent(ctx, "skill-a"));
    const tagsB = getTags(readSkillContent(ctx, "skill-b"));

    expect(tagsA).toContain("ui");
    expect(tagsA).not.toContain("frontend");
    expect(tagsB).toContain("ui");
    expect(tagsB).not.toContain("frontend");
  });

  it("không thay đổi skills không chứa tag cũ", async () => {
    addTestSkill(ctx, "my-skill", SKILL_WITH_TAGS); // frontend, web
    addTestSkill(ctx, "other-skill", SKILL_NO_TAGS); // không có tag nào
    await runTagRename(ctx, "frontend", "ui");

    const otherContent = readSkillContent(ctx, "other-skill");
    const otherTags = getTags(otherContent);
    expect(otherTags).toHaveLength(0);
  });

  it("case-insensitive rename", async () => {
    addTestSkill(ctx, "my-skill", SKILL_WITH_TAGS); // frontend, web
    await runTagRename(ctx, "FRONTEND", "ui");
    const tags = getTags(readSkillContent(ctx, "my-skill"));
    expect(tags).toContain("ui");
    expect(tags.map((t) => t.toLowerCase())).not.toContain("frontend");
  });

  it("không throw khi tag cũ không tồn tại trong bất kỳ skill nào", async () => {
    addTestSkill(ctx, "my-skill", SKILL_WITH_TAGS);
    await expect(runTagRename(ctx, "nonexistent-tag", "new-tag")).resolves.not.toThrow();
  });
});
