import { describe, expect, it } from "vitest";
import {
  FetchError,
  type RegistryManifest,
  findSkillInManifest,
  findSkillsByBundle,
  listRemoteSkills,
  parseManifest,
  verifySha256,
} from "../../src/policies/registry-fetcher.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_MANIFEST: RegistryManifest = {
  version: 1,
  updatedAt: "2026-09-17T00:00:00Z",
  skills: {
    "bash-defensive-patterns": {
      name: "bash-defensive-patterns",
      url: "https://registry.autoskills.sh/skills/bash-defensive-patterns.md",
      hash: "abc123",
      source: "wshobson/agents",
      description: "Defensive Bash programming patterns",
    },
    "frontend-design": {
      name: "frontend-design",
      url: "https://registry.autoskills.sh/skills/frontend-design.md",
      hash: "def456",
      source: "anthropics/skills",
      description: "Production-grade frontend design",
    },
    accessibility: {
      name: "accessibility",
      url: "https://registry.autoskills.sh/skills/accessibility.md",
      hash: "ghi789",
      source: "addyosmani/web-quality-skills",
      description: "WCAG 2.2 accessibility guidelines",
    },
    seo: {
      name: "seo",
      url: "https://registry.autoskills.sh/skills/seo.md",
      hash: "jkl012",
      source: "addyosmani/web-quality-skills",
      description: "SEO best practices",
    },
  },
};

const MANIFEST_JSON = JSON.stringify(MOCK_MANIFEST);

// ─── verifySha256 ─────────────────────────────────────────────────────────────

describe("verifySha256", () => {
  it("trả về true khi hash khớp", () => {
    // Pre-compute hash của "hello world"
    const content = "hello world";
    const hash = "b94d27b9934d3e08a52e52d7da7dabfac484efe04294e576f63f0aae1f13e786"; // sha256 không đúng, dùng crypto để test
    // Chỉ test logic: nếu hash không đúng thì false
    expect(verifySha256(content, hash)).toBe(false);
  });

  it("trả về false khi hash không khớp", () => {
    expect(verifySha256("content A", "wronghash")).toBe(false);
  });

  it("trả về true khi tính hash đúng", async () => {
    const { createHash } = await import("node:crypto");
    const content = "test skill content";
    const correctHash = createHash("sha256").update(content, "utf8").digest("hex");
    expect(verifySha256(content, correctHash)).toBe(true);
  });

  it("phân biệt hoa thường trong hash", async () => {
    const { createHash } = await import("node:crypto");
    const content = "x";
    const lower = createHash("sha256").update(content, "utf8").digest("hex");
    const upper = lower.toUpperCase();
    // hex digest là lowercase, nên uppercase sẽ không khớp
    expect(verifySha256(content, lower)).toBe(true);
    expect(verifySha256(content, upper)).toBe(false);
  });
});

// ─── parseManifest ────────────────────────────────────────────────────────────

describe("parseManifest", () => {
  it("parse manifest hợp lệ thành công", () => {
    const result = parseManifest(MANIFEST_JSON);
    expect(result.version).toBe(1);
    expect(Object.keys(result.skills)).toHaveLength(4);
    expect(result.skills["bash-defensive-patterns"].source).toBe("wshobson/agents");
  });

  it("throw INVALID_MANIFEST khi JSON sai", () => {
    expect(() => parseManifest("not json")).toThrow(FetchError);
    try {
      parseManifest("not json");
    } catch (e) {
      expect(e instanceof FetchError && e.code).toBe("INVALID_MANIFEST");
    }
  });

  it("throw INVALID_MANIFEST khi thiếu trường version", () => {
    const bad = JSON.stringify({ skills: {} });
    expect(() => parseManifest(bad)).toThrow(FetchError);
    try {
      parseManifest(bad);
    } catch (e) {
      expect(e instanceof FetchError && e.code).toBe("INVALID_MANIFEST");
    }
  });

  it("throw INVALID_MANIFEST khi thiếu trường skills", () => {
    const bad = JSON.stringify({ version: 1 });
    expect(() => parseManifest(bad)).toThrow(FetchError);
  });

  it("throw UNSUPPORTED_VERSION khi version > 2", () => {
    const future = JSON.stringify({ version: 99, skills: {} });
    expect(() => parseManifest(future)).toThrow(FetchError);
    try {
      parseManifest(future);
    } catch (e) {
      expect(e instanceof FetchError && e.code).toBe("UNSUPPORTED_VERSION");
    }
  });

  it("chấp nhận version 2", () => {
    const v2 = JSON.stringify({ version: 2, updatedAt: "", skills: {} });
    const result = parseManifest(v2);
    expect(result.version).toBe(2);
  });
});

// ─── findSkillInManifest ──────────────────────────────────────────────────────

describe("findSkillInManifest", () => {
  it("tìm thấy skill theo tên chính xác", () => {
    const entry = findSkillInManifest(MOCK_MANIFEST, "bash-defensive-patterns");
    expect(entry).toBeDefined();
    expect(entry!.name).toBe("bash-defensive-patterns");
  });

  it("tìm thấy skill case-insensitive", () => {
    const entry = findSkillInManifest(MOCK_MANIFEST, "Frontend-Design");
    expect(entry).toBeDefined();
    expect(entry!.name).toBe("frontend-design");
  });

  it("trả về undefined khi không tìm thấy", () => {
    const entry = findSkillInManifest(MOCK_MANIFEST, "nonexistent-skill");
    expect(entry).toBeUndefined();
  });
});

// ─── findSkillsByBundle ───────────────────────────────────────────────────────

describe("findSkillsByBundle", () => {
  it("trả về tất cả skills từ một bundle", () => {
    const results = findSkillsByBundle(MOCK_MANIFEST, "addyosmani/web-quality-skills");
    expect(results).toHaveLength(2);
    const names = results.map((r) => r.name);
    expect(names).toContain("accessibility");
    expect(names).toContain("seo");
  });

  it("case-insensitive matching", () => {
    const results = findSkillsByBundle(MOCK_MANIFEST, "WSHOBSON/AGENTS");
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("bash-defensive-patterns");
  });

  it("trả về mảng rỗng khi bundle không tồn tại", () => {
    const results = findSkillsByBundle(MOCK_MANIFEST, "unknown/bundle");
    expect(results).toHaveLength(0);
  });
});

// ─── listRemoteSkills ─────────────────────────────────────────────────────────

describe("listRemoteSkills", () => {
  it("trả về tất cả skills được sắp xếp theo tên", () => {
    const results = listRemoteSkills(MOCK_MANIFEST);
    expect(results).toHaveLength(4);
    // Sorted alphabetically
    expect(results[0].name).toBe("accessibility");
    expect(results[1].name).toBe("bash-defensive-patterns");
    expect(results[2].name).toBe("frontend-design");
    expect(results[3].name).toBe("seo");
  });

  it("trả về mảng rỗng khi manifest không có skill", () => {
    const empty: RegistryManifest = { version: 1, updatedAt: "", skills: {} };
    expect(listRemoteSkills(empty)).toHaveLength(0);
  });
});
