import { describe, expect, it } from "vitest";
import {
  extractSnippet,
  isFuzzyMatch,
  levenshtein,
  searchWithTfIdf,
  tokenize,
} from "../../src/policies/text-search.js";

describe("text-search policy", () => {
  describe("tokenize", () => {
    it("splits text into lowercase tokens", () => {
      const tokens = tokenize("Hello World TypeScript");
      expect(tokens).toContain("hello");
      expect(tokens).toContain("world");
      expect(tokens).toContain("typescript");
    });

    it("removes stopwords", () => {
      const tokens = tokenize("the quick brown fox is a very good animal");
      expect(tokens).not.toContain("the");
      expect(tokens).not.toContain("is");
      expect(tokens).not.toContain("a");
      expect(tokens).not.toContain("very");
      expect(tokens).toContain("quick");
      expect(tokens).toContain("brown");
      expect(tokens).toContain("fox");
    });

    it("removes single-character tokens", () => {
      const tokens = tokenize("a b c hello");
      expect(tokens).not.toContain("a");
      expect(tokens).not.toContain("b");
      expect(tokens).toContain("hello");
    });

    it("handles empty string", () => {
      expect(tokenize("")).toEqual([]);
    });

    it("handles special characters", () => {
      const tokens = tokenize("test-driven development (TDD)");
      expect(tokens).toContain("test-driven");
      expect(tokens).toContain("development");
      expect(tokens).toContain("tdd");
    });
  });

  describe("levenshtein", () => {
    it("returns 0 for identical strings", () => {
      expect(levenshtein("hello", "hello")).toBe(0);
    });

    it("returns correct distance for single edit", () => {
      expect(levenshtein("cat", "hat")).toBe(1);
      expect(levenshtein("cat", "cats")).toBe(1);
    });

    it("handles empty strings", () => {
      expect(levenshtein("", "hello")).toBe(5);
      expect(levenshtein("hello", "")).toBe(5);
      expect(levenshtein("", "")).toBe(0);
    });

    it("returns correct distance for multiple edits", () => {
      expect(levenshtein("kitten", "sitting")).toBe(3);
    });
  });

  describe("isFuzzyMatch", () => {
    it("matches exact strings", () => {
      expect(isFuzzyMatch("typescript", "typescript")).toBe(true);
    });

    it("matches with small typos", () => {
      expect(isFuzzyMatch("typescript", "tyepscript")).toBe(true);
      expect(isFuzzyMatch("testing", "testign")).toBe(true);
    });

    it("rejects distant strings", () => {
      expect(isFuzzyMatch("python", "typescript")).toBe(false);
    });
  });

  describe("extractSnippet", () => {
    it("returns line containing the query token", () => {
      const content = "First line\nThis has typescript info\nThird line";
      const snippet = extractSnippet(content, ["typescript"]);
      expect(snippet).toContain("typescript");
    });

    it("truncates long lines", () => {
      const longLine = `${"x".repeat(200)} typescript here`;
      const content = `${longLine}\nSecond line with typescript`;
      const snippet = extractSnippet(content, ["typescript"], 50);
      // Should get the second shorter line or truncate the first
      expect(snippet.length).toBeLessThanOrEqual(50);
    });

    it("falls back to first content line if no match", () => {
      const content = "---\nfrontmatter\n---\n# Title\nSome content here";
      const snippet = extractSnippet(content, ["nonexistent"]);
      expect(snippet).toBeTruthy();
    });
  });

  describe("searchWithTfIdf", () => {
    const docs = new Map([
      ["typescript-guide", "Guide for TypeScript development and testing best practices"],
      ["react-patterns", "React component patterns and hooks with TypeScript examples"],
      ["python-basics", "Introduction to Python programming and data science"],
      ["git-workflow", "Git branching strategies and commit message conventions"],
    ]);

    it("returns relevant results sorted by score", () => {
      const results = searchWithTfIdf(docs, "typescript");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toBe("typescript-guide");
    });

    it("ranks exact name matches higher", () => {
      const results = searchWithTfIdf(docs, "typescript");
      // typescript-guide should score higher due to name bonus
      const guideIdx = results.findIndex((r) => r.name === "typescript-guide");
      const reactIdx = results.findIndex((r) => r.name === "react-patterns");
      if (guideIdx !== -1 && reactIdx !== -1) {
        expect(guideIdx).toBeLessThan(reactIdx);
      }
    });

    it("returns empty array for no matches", () => {
      const results = searchWithTfIdf(docs, "kubernetes microservices");
      expect(results).toEqual([]);
    });

    it("handles empty query", () => {
      const results = searchWithTfIdf(docs, "");
      expect(results).toEqual([]);
    });

    it("handles empty docs", () => {
      const results = searchWithTfIdf(new Map(), "typescript");
      expect(results).toEqual([]);
    });

    it("includes snippets in results", () => {
      const results = searchWithTfIdf(docs, "typescript");
      for (const r of results) {
        expect(r.snippet).toBeTruthy();
      }
    });

    it("handles fuzzy typo matches", () => {
      const results = searchWithTfIdf(docs, "tyepscript");
      // Should find typescript-related docs via fuzzy matching
      expect(results.length).toBeGreaterThan(0);
    });

    it("scores are between 0 and 1", () => {
      const results = searchWithTfIdf(docs, "typescript development");
      for (const r of results) {
        expect(r.score).toBeGreaterThanOrEqual(0);
        expect(r.score).toBeLessThanOrEqual(1);
      }
    });
  });
});
