import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CliContext } from "../../src/context.js";
import { runImport } from "../../src/commands/import.js";

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
  success: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  handleError: vi.fn().mockImplementation((err) => { throw err; }),
}));

// Mock syncPush to avoid git commands failing in test
vi.mock("../../src/policies/git-sync.js", () => ({
  syncPush: vi.fn(),
}));

describe("runImport", () => {
  let ctx: CliContext;
  let testDir: string;
  let bundleFile: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(process.cwd(), "test-import-"));
    bundleFile = path.join(testDir, "bundle.json");
    ctx = {
      skillsDir: testDir,
      projectDir: testDir,
      verbose: false,
    };
    // Mock console.log for clean test output
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it("should import skills from a valid bundle", () => {
    const bundle = {
      version: 1,
      type: "ai-skills-bundle",
      skills: [{ name: "s1", content: "c1" }]
    };
    fs.writeFileSync(bundleFile, JSON.stringify(bundle), "utf8");

    runImport(ctx, bundleFile, {});

    expect(fs.existsSync(path.join(testDir, "s1.md"))).toBe(true);
    expect(fs.readFileSync(path.join(testDir, "s1.md"), "utf8")).toBe("c1");
  });

  it("should skip existing skills without --force", async () => {
    const { warn } = await import("../../src/utils/output.js");
    fs.writeFileSync(path.join(testDir, "s1.md"), "old", "utf8");
    
    const bundle = {
      version: 1,
      type: "ai-skills-bundle",
      skills: [{ name: "s1", content: "new" }]
    };
    fs.writeFileSync(bundleFile, JSON.stringify(bundle), "utf8");

    runImport(ctx, bundleFile, {});

    expect(fs.readFileSync(path.join(testDir, "s1.md"), "utf8")).toBe("old");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Đã bỏ qua"));
  });

  it("should overwrite existing skills with --force", async () => {
    fs.writeFileSync(path.join(testDir, "s1.md"), "old", "utf8");
    
    const bundle = {
      version: 1,
      type: "ai-skills-bundle",
      skills: [{ name: "s1", content: "new" }]
    };
    fs.writeFileSync(bundleFile, JSON.stringify(bundle), "utf8");

    runImport(ctx, bundleFile, { force: true });

    expect(fs.readFileSync(path.join(testDir, "s1.md"), "utf8")).toBe("new");
  });

  it("should fail if file not found", async () => {
    const { fatal } = await import("../../src/utils/output.js");
    expect(() => runImport(ctx, "nonexistent.json", {})).toThrowError(/FATAL:/);
    expect(fatal).toHaveBeenCalledWith(expect.stringContaining("Không tìm thấy file"));
  });
});
