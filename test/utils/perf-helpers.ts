/**
 * Helpers dung rieng cho performance benchmark tests.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Skill } from "../../src/domain/entities/Skill.js";
import { Tag } from "../../src/domain/value-objects/Tag.js";
import { FileSystemSkillRepository } from "../../src/infrastructure/FileSystemSkillRepository.js";

export function createTempRepo(): {
  dir: string;
  repo: FileSystemSkillRepository;
  cleanup: () => void;
} {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-skills-perf-"));
  const repo = new FileSystemSkillRepository(dir);
  return { dir, repo, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

export async function seedSkills(
  repo: FileSystemSkillRepository,
  count: number,
): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const pad = String(i).padStart(4, "0");
    const id = `perf-skill-${pad}`;
    const skill = new Skill(id, `Description for skill ${i}`, `# ${id}`);
    skill.addTag(new Tag(i % 2 === 0 ? "even" : "odd"));
    skill.addTag(new Tag("perf"));
    if (i > 0) skill.addRequirement(`perf-skill-${String(i - 1).padStart(4, "0")}`);
    await repo.save(skill);
    ids.push(id);
  }
  return ids;
}

export async function bench(
  fn: () => Promise<void>,
  iterations = 50,
): Promise<{ mean: number; min: number; max: number; p95: number }> {
  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  const mean = times.reduce((s, t) => s + t, 0) / times.length;
  const p95 = times[Math.floor(times.length * 0.95)];
  return { mean, min: times[0], max: times[times.length - 1], p95 };
}
