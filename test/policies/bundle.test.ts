import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CliContext } from "../../src/context.js";
import { BundleError, exportBundle, importBundle, parseBundle } from "../../src/policies/bundle.js";

describe("bundle policy", () => {
  let ctx: CliContext;
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(process.cwd(), "test-bundle-"));
    ctx = {
      skillsDir: testDir,
      projectDir: testDir,
      verbose: false,
    };
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe("exportBundle", () => {
    it("should export existing skills to a JSON string", () => {
      fs.writeFileSync(path.join(testDir, "skill1.md"), "content1", "utf8");
      fs.writeFileSync(path.join(testDir, "skill2.md"), "content2", "utf8");

      const bundleStr = exportBundle(ctx, ["skill1", "skill2"]);
      const parsed = JSON.parse(bundleStr);

      expect(parsed.version).toBe(1);
      expect(parsed.type).toBe("ai-skills-bundle");
      expect(parsed.skills).toHaveLength(2);
      expect(parsed.skills[0]).toEqual({ name: "skill1", content: "content1" });
      expect(parsed.skills[1]).toEqual({ name: "skill2", content: "content2" });
    });

    it("should throw BundleError if a skill is missing", () => {
      fs.writeFileSync(path.join(testDir, "skill1.md"), "content1", "utf8");

      expect(() => exportBundle(ctx, ["skill1", "missing-skill"])).toThrowError(BundleError);
      expect(() => exportBundle(ctx, ["skill1", "missing-skill"])).toThrowError(/Không tìm thấy skill/);
    });
  });

  describe("parseBundle", () => {
    it("should parse a valid bundle string", () => {
      const json = JSON.stringify({
        version: 1,
        type: "ai-skills-bundle",
        skills: [{ name: "s1", content: "c1" }]
      });
      const bundle = parseBundle(json);
      expect(bundle.skills).toHaveLength(1);
      expect(bundle.skills[0].name).toBe("s1");
    });

    it("should throw for invalid JSON", () => {
      expect(() => parseBundle("not json")).toThrowError(/lỗi cú pháp JSON/);
    });

    it("should throw for missing required fields", () => {
      expect(() => parseBundle('{}')).toThrowError(/thiếu các trường bắt buộc/);
      expect(() => parseBundle('{"type":"ai-skills-bundle"}')).toThrowError(/thiếu các trường bắt buộc/);
    });

    it("should throw for unsupported version", () => {
      const json = JSON.stringify({
        version: 2,
        type: "ai-skills-bundle",
        skills: []
      });
      expect(() => parseBundle(json)).toThrowError(/chưa được hỗ trợ/);
    });

    it("should throw for invalid skill format", () => {
      const json = JSON.stringify({
        version: 1,
        type: "ai-skills-bundle",
        skills: [{ name: "s1" }] // missing content
      });
      expect(() => parseBundle(json)).toThrowError(/Định dạng của một skill/);
    });
  });

  describe("importBundle", () => {
    it("should import skills that don't exist", () => {
      const bundle = {
        version: 1,
        type: "ai-skills-bundle" as const,
        skills: [
          { name: "skill1", content: "c1" },
          { name: "skill2", content: "c2" }
        ]
      };

      const result = importBundle(ctx, bundle);
      
      expect(result.imported).toEqual(["skill1", "skill2"]);
      expect(result.skipped).toEqual([]);
      
      expect(fs.readFileSync(path.join(testDir, "skill1.md"), "utf8")).toBe("c1");
      expect(fs.readFileSync(path.join(testDir, "skill2.md"), "utf8")).toBe("c2");
    });

    it("should skip existing skills if not forced", () => {
      fs.writeFileSync(path.join(testDir, "skill1.md"), "old", "utf8");

      const bundle = {
        version: 1,
        type: "ai-skills-bundle" as const,
        skills: [
          { name: "skill1", content: "new1" },
          { name: "skill2", content: "new2" }
        ]
      };

      const result = importBundle(ctx, bundle);
      
      expect(result.imported).toEqual(["skill2"]);
      expect(result.skipped).toEqual(["skill1"]);
      
      expect(fs.readFileSync(path.join(testDir, "skill1.md"), "utf8")).toBe("old");
      expect(fs.readFileSync(path.join(testDir, "skill2.md"), "utf8")).toBe("new2");
    });

    it("should overwrite existing skills if forced", () => {
      fs.writeFileSync(path.join(testDir, "skill1.md"), "old", "utf8");

      const bundle = {
        version: 1,
        type: "ai-skills-bundle" as const,
        skills: [
          { name: "skill1", content: "new1" }
        ]
      };

      const result = importBundle(ctx, bundle, { force: true });
      
      expect(result.imported).toEqual(["skill1"]);
      expect(result.skipped).toEqual([]);
      
      expect(fs.readFileSync(path.join(testDir, "skill1.md"), "utf8")).toBe("new1");
    });
  });
});
