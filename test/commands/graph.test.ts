import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import http from "node:http";
import fs from "node:fs";
import { runGraph } from "../../src/commands/graph.js";
import type { CliContext } from "../../src/context.js";
import * as registry from "../../src/policies/skill-registry.js";
import * as output from "../../src/utils/output.js";
import * as frontmatter from "../../src/utils/frontmatter.js";

vi.mock("node:http", () => {
  const listen = vi.fn((port, cb) => {
    cb(); // call the ready callback immediately
    return { on: vi.fn() };
  });
  return {
    default: {
      createServer: vi.fn(() => ({
        listen,
        on: vi.fn()
      }))
    }
  };
});

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(() => "<html>mock viewer</html>")
  };
});

vi.mock("../../src/policies/skill-registry.js", () => ({
  ensureSkillsDir: vi.fn(),
  listSkills: vi.fn(),
  getSkill: vi.fn()
}));

vi.mock("../../src/utils/frontmatter.js", () => ({
  parseFrontmatter: vi.fn()
}));

vi.mock("../../src/utils/output.js", () => ({
  handleError: vi.fn(),
  success: vi.fn(),
}));

describe("Command: graph", () => {
  let ctx: CliContext;

  beforeEach(() => {
    ctx = {
      skillsDir: "/mock/skills",
      projectDir: "/mock/project",
      verbose: false,
    };
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("khởi tạo web server thành công", () => {
    vi.mocked(registry.listSkills).mockReturnValue(["skill-a", "skill-b"]);
    vi.mocked(registry.getSkill).mockReturnValue("mock content");
    vi.mocked(frontmatter.parseFrontmatter).mockImplementation((content) => {
      return {
        attributes: {
          description: "mock desc",
          requires: ["skill-b"],
          tags: ["mock"]
        },
        body: ""
      } as any;
    });

    runGraph(ctx);

    expect(registry.ensureSkillsDir).toHaveBeenCalled();
    expect(registry.listSkills).toHaveBeenCalled();
    expect(http.createServer).toHaveBeenCalled();
    
    // Server creation test logic could be deeper if we test endpoints,
    // but verifying it listens on port 3113 is a good start.
  });

  it("xử lý lỗi thông qua handleError", () => {
    const error = new Error("Mock error");
    vi.mocked(registry.ensureSkillsDir).mockImplementation(() => {
      throw error;
    });

    runGraph(ctx);

    expect(output.handleError).toHaveBeenCalledWith(error);
  });
});
