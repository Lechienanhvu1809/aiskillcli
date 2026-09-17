import { describe, expect, it } from "vitest";
import {
  DEFAULT_TEMPLATE_ID,
  getTemplate,
  listTemplates,
  TEMPLATES,
} from "../../src/policies/templates.js";

describe("templates policy", () => {
  it("has at least 4 built-in templates", () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(4);
  });

  it("each template has required fields", () => {
    for (const t of TEMPLATES) {
      expect(t.id).toBeTruthy();
      expect(t.label).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(typeof t.generate).toBe("function");
    }
  });

  it("template IDs are unique", () => {
    const ids = TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("getTemplate returns correct template by ID", () => {
    const t = getTemplate("coding-guide");
    expect(t).toBeDefined();
    expect(t?.id).toBe("coding-guide");
  });

  it("getTemplate returns undefined for unknown ID", () => {
    expect(getTemplate("nonexistent")).toBeUndefined();
  });

  it("listTemplates returns all templates", () => {
    const all = listTemplates();
    expect(all.length).toBe(TEMPLATES.length);
  });

  it("DEFAULT_TEMPLATE_ID exists in TEMPLATES", () => {
    expect(getTemplate(DEFAULT_TEMPLATE_ID)).toBeDefined();
  });

  describe("generated content", () => {
    it("coding-guide generates valid frontmatter", () => {
      const t = getTemplate("coding-guide")!;
      const content = t.generate("test-skill", "Test description");
      expect(content).toContain("---");
      expect(content).toContain("name: test-skill");
      expect(content).toContain("description: Test description");
      expect(content).toContain("# test-skill");
    });

    it("bash-automation includes bash hook block", () => {
      const t = getTemplate("bash-automation")!;
      const content = t.generate("auto-deploy", "Deploy automation");
      expect(content).toContain("```bash hook");
      expect(content).toContain("auto-deploy");
    });

    it("checklist includes checkbox items", () => {
      const t = getTemplate("checklist")!;
      const content = t.generate("review-list", "Code review checklist");
      expect(content).toContain("- [ ]");
      expect(content).toContain("review-list");
    });

    it("blank generates minimal content", () => {
      const t = getTemplate("blank")!;
      const content = t.generate("empty", "Empty skill");
      expect(content).toContain("name: empty");
      expect(content).toContain("# empty");
      // Should be shorter than other templates
      const codingContent = getTemplate("coding-guide")?.generate("x", "y");
      expect(content.length).toBeLessThan(codingContent.length);
    });

    it("all templates generate non-empty content with frontmatter", () => {
      for (const t of TEMPLATES) {
        const content = t.generate("my-skill", "My skill description");
        expect(content.length).toBeGreaterThan(0);
        expect(content).toMatch(/^---\n/);
        expect(content).toContain("name: my-skill");
        expect(content).toContain("description: My skill description");
      }
    });
  });
});
