import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CliContext } from "../../src/context.js";
import type { ProjectProfile } from "../../src/policies/project-analyzer.js";
import { recommendSkills } from "../../src/policies/recommender.js";
import type { SkillInfo } from "../../src/policies/skill-registry.js";

describe("recommender policy", () => {
  let tmpDir: string;
  let ctx: CliContext;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "recommender-test-"));
    ctx = { skillsDir: tmpDir, verbose: false, projectDir: process.cwd() };
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function createSkillFile(name: string, content: string): SkillInfo {
    const filePath = path.join(tmpDir, `${name}.md`);
    fs.writeFileSync(filePath, content, "utf8");
    return { name, path: filePath };
  }

  const baseProfile: ProjectProfile = {
    name: "test-project",
    language: "typescript",
    frameworks: ["react"],
    tools: ["vitest", "eslint"],
    hasTests: true,
    hasCi: true,
    hasDocker: false,
  };

  it("recommends skills matching frameworks", () => {
    const skills = [
      createSkillFile(
        "react-patterns",
        "---\nname: react-patterns\ndescription: React component patterns\n---\n# React Patterns\nBest practices for React development.",
      ),
      createSkillFile(
        "python-guide",
        "---\nname: python-guide\ndescription: Python coding guide\n---\n# Python\nPython development patterns.",
      ),
    ];

    const recs = recommendSkills(ctx, baseProfile, skills);
    expect(recs.length).toBeGreaterThan(0);
    expect(recs[0].skillName).toBe("react-patterns");
  });

  it("recommends skills matching tools", () => {
    const skills = [
      createSkillFile(
        "vitest-setup",
        "---\nname: vitest-setup\ndescription: Vitest configuration guide\n---\n# Vitest Setup\nHow to configure vitest for your project.",
      ),
    ];

    const recs = recommendSkills(ctx, baseProfile, skills);
    expect(recs.length).toBeGreaterThan(0);
    expect(recs[0].skillName).toBe("vitest-setup");
  });

  it("recommends skills matching language", () => {
    const skills = [
      createSkillFile(
        "ts-best-practices",
        "---\nname: ts-best-practices\ndescription: TypeScript best practices\n---\n# TypeScript\nStrict mode, type guards, generics.",
      ),
    ];

    const recs = recommendSkills(ctx, baseProfile, skills);
    expect(recs.length).toBeGreaterThan(0);
    expect(recs[0].reason).toContain("typescript");
  });

  it("returns empty array when no skills match", () => {
    const profile: ProjectProfile = {
      ...baseProfile,
      frameworks: [],
      tools: [],
      language: "unknown",
      hasTests: false,
      hasCi: false,
      hasDocker: false,
    };
    const skills = [
      createSkillFile(
        "random-skill",
        "---\nname: random-skill\ndescription: Something unrelated\n---\n# Random\nNothing to do with the project.",
      ),
    ];

    const recs = recommendSkills(ctx, profile, skills);
    expect(recs).toEqual([]);
  });

  it("returns empty array when no skills available", () => {
    const recs = recommendSkills(ctx, baseProfile, []);
    expect(recs).toEqual([]);
  });

  it("limits results to maxResults", () => {
    const skills = [];
    for (let i = 0; i < 10; i++) {
      skills.push(
        createSkillFile(
          `react-skill-${i}`,
          `---\nname: react-skill-${i}\ndescription: React related skill ${i}\n---\n# React Skill ${i}\nReact development pattern.`,
        ),
      );
    }

    const recs = recommendSkills(ctx, baseProfile, skills, 3);
    expect(recs.length).toBeLessThanOrEqual(3);
  });

  it("assigns correct confidence levels", () => {
    const skills = [
      createSkillFile(
        "react-typescript-testing",
        "---\nname: react-typescript-testing\ndescription: React TypeScript testing with Vitest\n---\n# React + TypeScript + Vitest\nFull stack testing for React apps with TypeScript and Vitest.",
      ),
      createSkillFile(
        "docker-intro",
        "---\nname: docker-intro\ndescription: Docker basics\n---\n# Docker\nBasic Docker containerization.",
      ),
    ];

    const recs = recommendSkills(ctx, baseProfile, skills);
    // The first one matches react + typescript + vitest → should be high confidence
    const topRec = recs.find((r) => r.skillName === "react-typescript-testing");
    expect(topRec).toBeDefined();
    expect(topRec?.confidence).toBe("high");
  });

  it("sorts results by score descending", () => {
    const skills = [
      createSkillFile(
        "generic-skill",
        "---\nname: generic-skill\ndescription: A generic coding skill\n---\n# Generic\nGeneral typescript tips.",
      ),
      createSkillFile(
        "react-advanced",
        "---\nname: react-advanced\ndescription: Advanced React patterns with TypeScript\n---\n# React Advanced\nAdvanced React component patterns, hooks, and TypeScript types for React apps.",
      ),
    ];

    const recs = recommendSkills(ctx, baseProfile, skills);
    if (recs.length >= 2) {
      expect(recs[0].score).toBeGreaterThanOrEqual(recs[1].score);
    }
  });

  it("gracefully skips unreadable skill files", () => {
    const skills: SkillInfo[] = [
      { name: "missing-file", path: path.join(tmpDir, "does-not-exist.md") },
      createSkillFile(
        "react-guide",
        "---\nname: react-guide\ndescription: React guide\n---\n# React Guide\nReact patterns.",
      ),
    ];

    // Should not throw, just skip the missing file
    const recs = recommendSkills(ctx, baseProfile, skills);
    expect(recs.some((r) => r.skillName === "react-guide")).toBe(true);
    expect(recs.some((r) => r.skillName === "missing-file")).toBe(false);
  });
});
