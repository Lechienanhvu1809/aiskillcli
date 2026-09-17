import { describe, expect, it } from "vitest";
import { injectTags, parseFrontmatter } from "../../src/utils/frontmatter.js";

describe("frontmatter utils", () => {
  describe("parseFrontmatter", () => {
    it("should parse basic frontmatter", () => {
      const content = `---\nname: my-skill\ndescription: A test skill\n---\n# my-skill`;
      const result = parseFrontmatter(content);
      expect(result).toEqual({ name: "my-skill", description: "A test skill" });
    });

    it("should parse tags array format", () => {
      const content = `---\nname: skill\ntags: [tag1, tag2]\n---`;
      const result = parseFrontmatter(content);
      expect(result.tags).toEqual(["tag1", "tag2"]);
    });

    it("should parse tags comma separated string", () => {
      const content = `---\nname: skill\ntags: tag1, tag2\n---`;
      const result = parseFrontmatter(content);
      expect(result.tags).toEqual(["tag1", "tag2"]);
    });

    it("should return empty object if no frontmatter", () => {
      const content = `# Just markdown\nNo frontmatter`;
      expect(parseFrontmatter(content)).toEqual({});
    });
  });

  describe("injectTags", () => {
    it("should inject tags into existing frontmatter without tags", () => {
      const content = `---\nname: my-skill\ndescription: Test\n---\n# my-skill`;
      const result = injectTags(content, ["tag1", "tag2"]);
      expect(result).toContain(`tags: [tag1, tag2]`);
      expect(result).toContain(`name: my-skill`);
    });

    it("should replace existing tags", () => {
      const content = `---\nname: my-skill\ntags: [old]\n---\n# my-skill`;
      const result = injectTags(content, ["new1", "new2"]);
      expect(result).toContain(`tags: [new1, new2]`);
      expect(result).not.toContain(`old`);
    });

    it("should create frontmatter if none exists", () => {
      const content = `# my-skill\nContent`;
      const result = injectTags(content, ["tag1"]);
      expect(result).toMatch(/^---\ntags: \[tag1\]\n---\n\n# my-skill/);
    });

    it("should do nothing if tags array is empty", () => {
      const content = `---\nname: my-skill\n---\n# my-skill`;
      const result = injectTags(content, []);
      expect(result).toBe(content);
    });
  });
});
