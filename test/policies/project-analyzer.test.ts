import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { analyzeProject } from "../../src/policies/project-analyzer.js";

describe("project-analyzer policy", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "analyzer-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("detects TypeScript project", () => {
    fs.writeFileSync(
      path.join(tmpDir, "package.json"),
      JSON.stringify({
        name: "my-ts-app",
        devDependencies: { typescript: "^5.0.0" },
      }),
    );
    fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), "{}");

    const profile = analyzeProject(tmpDir);
    expect(profile.language).toBe("typescript");
    expect(profile.name).toBe("my-ts-app");
  });

  it("detects JavaScript project", () => {
    fs.writeFileSync(path.join(tmpDir, "package.json"), JSON.stringify({ name: "my-js-app" }));

    const profile = analyzeProject(tmpDir);
    expect(profile.language).toBe("javascript");
  });

  it("detects Python project", () => {
    fs.writeFileSync(path.join(tmpDir, "requirements.txt"), "flask\ndjango\n");

    const profile = analyzeProject(tmpDir);
    expect(profile.language).toBe("python");
  });

  it("returns unknown for unrecognized project", () => {
    const profile = analyzeProject(tmpDir);
    expect(profile.language).toBe("unknown");
  });

  it("detects frameworks from dependencies", () => {
    fs.writeFileSync(
      path.join(tmpDir, "package.json"),
      JSON.stringify({
        name: "react-app",
        dependencies: {
          react: "^18.0.0",
          "react-dom": "^18.0.0",
          next: "^14.0.0",
        },
      }),
    );

    const profile = analyzeProject(tmpDir);
    expect(profile.frameworks).toContain("react");
    expect(profile.frameworks).toContain("nextjs");
  });

  it("detects tools from devDependencies", () => {
    fs.writeFileSync(
      path.join(tmpDir, "package.json"),
      JSON.stringify({
        name: "test-app",
        devDependencies: {
          vitest: "^3.0.0",
          eslint: "^9.0.0",
          typescript: "^5.0.0",
        },
      }),
    );

    const profile = analyzeProject(tmpDir);
    expect(profile.tools).toContain("vitest");
    expect(profile.tools).toContain("eslint");
    expect(profile.tools).toContain("typescript");
  });

  it("detects test directory", () => {
    fs.mkdirSync(path.join(tmpDir, "test"));
    const profile = analyzeProject(tmpDir);
    expect(profile.hasTests).toBe(true);
  });

  it("detects CI/CD from .github/workflows", () => {
    fs.mkdirSync(path.join(tmpDir, ".github", "workflows"), { recursive: true });
    const profile = analyzeProject(tmpDir);
    expect(profile.hasCi).toBe(true);
  });

  it("detects Docker from Dockerfile", () => {
    fs.writeFileSync(path.join(tmpDir, "Dockerfile"), "FROM node:20");
    const profile = analyzeProject(tmpDir);
    expect(profile.hasDocker).toBe(true);
  });

  it("uses directory name when package.json has no name", () => {
    const profile = analyzeProject(tmpDir);
    expect(profile.name).toBe(path.basename(tmpDir));
  });

  it("handles malformed package.json gracefully", () => {
    fs.writeFileSync(path.join(tmpDir, "package.json"), "not valid json");
    const profile = analyzeProject(tmpDir);
    // Malformed JSON → readPackageJson returns null → but file exists → detected as JS
    expect(profile.language).toBe("javascript");
    expect(profile.frameworks).toEqual([]);
    expect(profile.tools).toEqual([]);
  });

  it("detects multiple frameworks and tools together", () => {
    fs.writeFileSync(
      path.join(tmpDir, "package.json"),
      JSON.stringify({
        name: "fullstack-app",
        dependencies: {
          react: "^18.0.0",
          express: "^4.0.0",
          prisma: "^5.0.0",
        },
        devDependencies: {
          typescript: "^5.0.0",
          vitest: "^3.0.0",
          "@biomejs/biome": "^2.0.0",
        },
      }),
    );
    fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), "{}");
    fs.mkdirSync(path.join(tmpDir, "test"));

    const profile = analyzeProject(tmpDir);
    expect(profile.language).toBe("typescript");
    expect(profile.frameworks).toContain("react");
    expect(profile.frameworks).toContain("express");
    expect(profile.frameworks).toContain("prisma");
    expect(profile.tools).toContain("vitest");
    expect(profile.tools).toContain("biome");
    expect(profile.hasTests).toBe(true);
  });
});
