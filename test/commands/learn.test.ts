import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runLearn } from "../../src/commands/learn.js";
import type { CliContext } from "../../src/context.js";
import * as gitSync from "../../src/policies/git-sync.js";
import * as registry from "../../src/policies/skill-registry.js";
import * as output from "../../src/utils/output.js";

vi.mock("node:fs", () => ({
  default: {
    writeFileSync: vi.fn(),
  },
}));

vi.mock("../../src/policies/skill-registry.js", () => ({
  ensureSkillsDir: vi.fn(),
  skillExists: vi.fn(),
  getSkill: vi.fn(),
  skillPath: vi.fn().mockReturnValue("/mock/skills/learned-test.md"),
}));

vi.mock("../../src/policies/git-sync.js", () => ({
  syncPush: vi.fn(),
}));

vi.mock("../../src/utils/output.js", () => ({
  handleError: vi.fn(),
  success: vi.fn(),
}));

describe("Command: learn", () => {
  let ctx: CliContext;
  
  beforeEach(() => {
    ctx = {
      skillsDir: "/mock/skills",
      projectDir: "/mock/project",
      verbose: false,
    };
    vi.clearAllMocks();
    
    // Fix timezone/date for consistent test
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-22T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("tạo file mới nếu skill chưa tồn tại", () => {
    vi.mocked(registry.skillExists).mockReturnValue(false);

    runLearn(ctx, "Test Topic!", "This is a new lesson.");

    expect(registry.ensureSkillsDir).toHaveBeenCalled();
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      "/mock/skills/learned-test.md",
      expect.stringContaining("name: learned-test-topic"),
      "utf8"
    );
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      "/mock/skills/learned-test.md",
      expect.stringContaining("- **[2026-09-22]**: This is a new lesson."),
      "utf8"
    );
    
    expect(gitSync.syncPush).toHaveBeenCalledWith(ctx, expect.stringContaining("auto-learned new lesson for test-topic"));
    expect(output.success).toHaveBeenCalled();
  });

  it("append vào file cũ nếu skill đã tồn tại", () => {
    vi.mocked(registry.skillExists).mockReturnValue(true);
    vi.mocked(registry.getSkill).mockReturnValue("existing content\n");

    runLearn(ctx, "test-topic", "Another lesson.");

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      "/mock/skills/learned-test.md",
      "existing content\n- **[2026-09-22]**: Another lesson.\n",
      "utf8"
    );
  });

  it("bỏ qua sync nếu có cờ noSync", () => {
    vi.mocked(registry.skillExists).mockReturnValue(false);

    runLearn(ctx, "test-topic", "lesson", { noSync: true });

    expect(gitSync.syncPush).not.toHaveBeenCalled();
  });

  it("xử lý lỗi thông qua handleError", () => {
    const error = new Error("Mock error");
    vi.mocked(registry.ensureSkillsDir).mockImplementation(() => {
      throw error;
    });

    runLearn(ctx, "topic", "lesson");

    expect(output.handleError).toHaveBeenCalledWith(error);
  });
});
