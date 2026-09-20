import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DiffError, generateDiff } from "../../src/policies/diff.js";
import * as childProcess from "node:child_process";

// Mock child_process for executing git
vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

describe("generateDiff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return identical message if contents are identical", () => {
    const output = generateDiff("test-skill", "same content", "same content");
    expect(output).toBe('Kỹ năng "test-skill" không có thay đổi nào.');
    expect(childProcess.execSync).not.toHaveBeenCalled();
  });

  it("should return empty string if git diff returns 0 (identical)", () => {
    // Mock execSync to run successfully (exit 0)
    (childProcess.execSync as any).mockReturnValue("");

    const output = generateDiff("test-skill", "old", "new");
    expect(output).toBe("");
    expect(childProcess.execSync).toHaveBeenCalledWith(
      expect.stringContaining("git diff --no-index --color=always"),
      expect.any(Object)
    );
  });

  it("should format stdout and return diff string if git diff returns exit code 1", () => {
    const errorWithStatus1 = new Error("Command failed");
    (errorWithStatus1 as any).status = 1;
    (errorWithStatus1 as any).stdout = "--- a/test-skill_old_12345678.md\n+++ b/test-skill_new_12345678.md\n@@ -1 +1 @@\n-old\n+new";
    
    (childProcess.execSync as any).mockImplementation(() => {
      throw errorWithStatus1;
    });

    const output = generateDiff("test-skill", "old", "new");
    
    expect(output).toContain("--- a/test-skill.md (current)");
    expect(output).toContain("+++ b/test-skill.md (incoming)");
    expect(output).toContain("-old");
    expect(output).toContain("+new");
  });

  it("should throw DiffError if git is not installed or execution fails with non-1 status", () => {
    const errorWithoutStatus = new Error("git: command not found");
    
    (childProcess.execSync as any).mockImplementation(() => {
      throw errorWithoutStatus;
    });

    expect(() => generateDiff("test-skill", "old", "new")).toThrowError(DiffError);
    expect(() => generateDiff("test-skill", "old", "new")).toThrowError(/Không thể chạy lệnh git diff/);
  });
});
