import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CliContext } from "../../src/context.js";
import {
  addSkill,
  getSkill,
  listSkills,
  SkillRegistryError,
  skillExists,
} from "../../src/policies/skill-registry.js";

// Dùng temp directory thật để test I/O thực sự
let tempDir: string;
let ctx: CliContext;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-skills-test-"));
  ctx = { skillsDir: tempDir, verbose: false, projectDir: tempDir };
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("listSkills", () => {
  it("trả về mảng rỗng khi không có skill", () => {
    expect(listSkills(ctx)).toEqual([]);
  });

  it("liệt kê đúng các skill files có trong thư mục", () => {
    fs.writeFileSync(path.join(tempDir, "skill-a.md"), "# A");
    fs.writeFileSync(path.join(tempDir, "skill-b.md"), "# B");
    const result = listSkills(ctx);
    expect(result).toHaveLength(2);
    expect(result.map((s) => s.name)).toContain("skill-a");
    expect(result.map((s) => s.name)).toContain("skill-b");
  });

  it("bỏ qua file không phải .md", () => {
    fs.writeFileSync(path.join(tempDir, "skill-a.md"), "# A");
    fs.writeFileSync(path.join(tempDir, "readme.txt"), "text");
    expect(listSkills(ctx)).toHaveLength(1);
  });
});

describe("addSkill", () => {
  let sourceFile: string;

  beforeEach(() => {
    sourceFile = path.join(tempDir, "_source.md");
    fs.writeFileSync(sourceFile, "# Test Skill Content");
  });

  it("thêm skill thành công từ file nguồn", () => {
    addSkill(ctx, "my-skill", sourceFile);
    expect(skillExists(ctx, "my-skill")).toBe(true);
  });

  it("throw SkillRegistryError nếu file nguồn không tồn tại", () => {
    expect(() => addSkill(ctx, "my-skill", "/nonexistent/path.md")).toThrow(SkillRegistryError);
    try {
      addSkill(ctx, "my-skill", "/nonexistent/path.md");
    } catch (err) {
      expect(err).toBeInstanceOf(SkillRegistryError);
      expect((err as SkillRegistryError).code).toBe("SOURCE_NOT_FOUND");
    }
  });

  it("throw SkillRegistryError nếu skill đã tồn tại và không có overwrite", () => {
    addSkill(ctx, "my-skill", sourceFile);
    expect(() => addSkill(ctx, "my-skill", sourceFile)).toThrow(SkillRegistryError);
  });

  it("ghi đè khi overwrite=true", () => {
    fs.writeFileSync(path.join(tempDir, "my-skill.md"), "old content");
    addSkill(ctx, "my-skill", sourceFile, { overwrite: true });
    const content = fs.readFileSync(path.join(tempDir, "my-skill.md"), "utf8");
    expect(content).toBe("# Test Skill Content");
  });
});

describe("getSkill", () => {
  it("đọc nội dung skill đúng", () => {
    fs.writeFileSync(path.join(tempDir, "my-skill.md"), "# Hello\nContent here");
    const content = getSkill(ctx, "my-skill");
    expect(content).toContain("# Hello");
    expect(content).toContain("Content here");
  });

  it("chuẩn hóa line endings về \\n", () => {
    fs.writeFileSync(path.join(tempDir, "my-skill.md"), "line1\r\nline2\r\nline3");
    const content = getSkill(ctx, "my-skill");
    expect(content).toBe("line1\nline2\nline3");
    expect(content).not.toContain("\r");
  });

  it("throw SkillRegistryError nếu không tìm thấy skill", () => {
    expect(() => getSkill(ctx, "nonexistent")).toThrow(SkillRegistryError);
  });
});
