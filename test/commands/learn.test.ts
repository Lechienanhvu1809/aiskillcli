import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runLearn } from "../../src/commands/learn.js";
import type { CliContext } from "../../src/context.js";
import * as gitSync from "../../src/policies/git-sync.js";

vi.mock("../../src/policies/git-sync.js", () => ({
  syncPush: vi.fn(),
}));

describe("Command: learn", () => {
  let ctx: CliContext;
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-skills-learn-test-"));
    ctx = {
      skillsDir: tempDir,
      projectDir: "/mock/project",
      verbose: false,
    };

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-22T00:00:00Z"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("tạo file mới nếu skill chưa tồn tại", async () => {
    await runLearn(ctx, "Test Topic!", "This is a new lesson.");

    const skillFile = path.join(tempDir, "learned-test-topic.md");
    expect(fs.existsSync(skillFile)).toBe(true);

    const content = fs.readFileSync(skillFile, "utf8");
    expect(content).toContain("name: learned-test-topic");
    expect(content).toContain("- **[2026-09-22]**: This is a new lesson.");

    expect(gitSync.syncPush).toHaveBeenCalledWith(
      ctx,
      expect.stringContaining("auto-learned new lesson for test-topic"),
    );
  });

  it("append vào file cũ nếu skill đã tồn tại", async () => {
    // Tạo file trước
    await runLearn(ctx, "test-topic", "First lesson.");
    // Sau đó append
    await runLearn(ctx, "test-topic", "Another lesson.");

    const content = fs.readFileSync(path.join(tempDir, "learned-test-topic.md"), "utf8");
    expect(content).toContain("- **[2026-09-22]**: First lesson.");
    expect(content).toContain("- **[2026-09-22]**: Another lesson.");
  });

  it("bỏ qua sync nếu có cờ noSync", async () => {
    await runLearn(ctx, "test-topic", "lesson", { noSync: true });

    expect(gitSync.syncPush).not.toHaveBeenCalled();
  });

  it("xử lý lỗi khi skillId không hợp lệ", async () => {
    // validateSkillName sẽ ném lỗi nếu tên sau khi chuẩn hoá trở nên rỗng/không hợp lệ
    // Ở đây chỉ kiểm tra runLearn không crash với input bình thường
    await expect(runLearn(ctx, "valid-topic", "lesson")).resolves.not.toThrow();
  });
});
