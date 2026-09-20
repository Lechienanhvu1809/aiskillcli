import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CliContext } from "../../src/context.js";
import { runExport } from "../../src/commands/export.js";
import { BundleError } from "../../src/policies/bundle.js";

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

describe("runExport", () => {
  let ctx: CliContext;
  let testDir: string;
  let outDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(process.cwd(), "test-export-"));
    outDir = fs.mkdtempSync(path.join(process.cwd(), "test-export-out-"));
    ctx = {
      skillsDir: testDir,
      projectDir: testDir,
      verbose: false,
    };
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
    fs.rmSync(outDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it("should export all skills when --all is used", () => {
    fs.writeFileSync(path.join(testDir, "s1.md"), "c1", "utf8");
    fs.writeFileSync(path.join(testDir, "s2.md"), "c2", "utf8");

    const outFile = path.join(outDir, "bundle.json");
    runExport(ctx, outFile, [], { all: true });

    expect(fs.existsSync(outFile)).toBe(true);
    const content = JSON.parse(fs.readFileSync(outFile, "utf8"));
    expect(content.skills).toHaveLength(2);
  });

  it("should export tagged skills when --tag is used", () => {
    fs.writeFileSync(path.join(testDir, "s1.md"), "---\ntags: [frontend]\n---\nc1", "utf8");
    fs.writeFileSync(path.join(testDir, "s2.md"), "---\ntags: [backend]\n---\nc2", "utf8");

    const outFile = path.join(outDir, "bundle.json");
    runExport(ctx, outFile, [], { tag: "frontend" });

    expect(fs.existsSync(outFile)).toBe(true);
    const content = JSON.parse(fs.readFileSync(outFile, "utf8"));
    expect(content.skills).toHaveLength(1);
    expect(content.skills[0].name).toBe("s1");
  });

  it("should export specified skills", () => {
    fs.writeFileSync(path.join(testDir, "s1.md"), "c1", "utf8");
    fs.writeFileSync(path.join(testDir, "s2.md"), "c2", "utf8");
    fs.writeFileSync(path.join(testDir, "s3.md"), "c3", "utf8");

    const outFile = path.join(outDir, "bundle.json");
    runExport(ctx, outFile, ["s1", "s3"], {});

    expect(fs.existsSync(outFile)).toBe(true);
    const content = JSON.parse(fs.readFileSync(outFile, "utf8"));
    expect(content.skills).toHaveLength(2);
    expect(content.skills[0].name).toBe("s1");
    expect(content.skills[1].name).toBe("s3");
  });

  it("should warn and do nothing if no skills to export", async () => {
    const { warn } = await import("../../src/utils/output.js");
    const outFile = path.join(outDir, "bundle.json");
    
    runExport(ctx, outFile, [], { all: true });
    
    expect(warn).toHaveBeenCalledWith("Không có skill nào để export.");
    expect(fs.existsSync(outFile)).toBe(false);
  });

  it("should throw fatal if a specified skill is not found", async () => {
    const { fatal } = await import("../../src/utils/output.js");
    fs.writeFileSync(path.join(testDir, "s1.md"), "c1", "utf8");

    const outFile = path.join(outDir, "bundle.json");
    
    expect(() => runExport(ctx, outFile, ["s1", "missing"], {})).toThrowError(/FATAL:/);
    expect(fatal).toHaveBeenCalled();
  });
});
