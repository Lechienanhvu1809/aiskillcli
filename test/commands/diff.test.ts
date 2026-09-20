import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CliContext } from "../../src/context.js";
import { runDiff } from "../../src/commands/diff.js";
import * as diffPolicy from "../../src/policies/diff.js";

// Mock output.ts to suppress console output during tests
vi.mock("../../src/utils/output.js", () => ({
  c: {
    ok: (s: string) => s,
    warn: (s: string) => s,
    err: (s: string) => s,
    dim: (s: string) => s,
    bold: (s: string) => s,
    cmd: (s: string) => s,
    accent: (s: string) => s,
  },
  fatal: vi.fn().mockImplementation((msg) => { throw new Error(`FATAL: ${msg}`); }),
  handleError: vi.fn().mockImplementation((err) => { throw err; }),
}));

describe("runDiff", () => {
  let ctx: CliContext;
  let testDir: string;
  let incomingFile: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(process.cwd(), "test-diff-"));
    incomingFile = path.join(testDir, "incoming.md");
    ctx = {
      skillsDir: testDir,
      projectDir: testDir,
      verbose: false,
    };
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it("should fail if skill does not exist", async () => {
    const { fatal } = await import("../../src/utils/output.js");
    fs.writeFileSync(incomingFile, "incoming content");
    
    expect(() => runDiff(ctx, "nonexistent", incomingFile)).toThrowError(/FATAL:/);
    expect(fatal).toHaveBeenCalledWith(expect.stringContaining("Không tìm thấy kỹ năng"));
  });

  it("should fail if incoming file does not exist", async () => {
    const { fatal } = await import("../../src/utils/output.js");
    fs.writeFileSync(path.join(testDir, "s1.md"), "current content");
    
    expect(() => runDiff(ctx, "s1", "ghost.md")).toThrowError(/FATAL:/);
    expect(fatal).toHaveBeenCalledWith(expect.stringContaining("Không tìm thấy file"));
  });

  it("should output identical message when diff returns empty", () => {
    fs.writeFileSync(path.join(testDir, "s1.md"), "same");
    fs.writeFileSync(incomingFile, "same");
    
    // Mock generateDiff to return empty
    vi.spyOn(diffPolicy, "generateDiff").mockReturnValue("");

    runDiff(ctx, "s1", incomingFile);
    
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("không có thay đổi nào"));
  });

  it("should output diff output when diff returns a string", () => {
    fs.writeFileSync(path.join(testDir, "s1.md"), "old");
    fs.writeFileSync(incomingFile, "new");
    
    // Mock generateDiff to return fake diff
    vi.spyOn(diffPolicy, "generateDiff").mockReturnValue("diff string here");

    runDiff(ctx, "s1", incomingFile);
    
    expect(console.log).toHaveBeenCalledWith("diff string here");
  });
});
