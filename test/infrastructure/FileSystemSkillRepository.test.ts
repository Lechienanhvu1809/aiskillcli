import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Skill } from "../../src/domain/entities/Skill.js";
import { Tag } from "../../src/domain/value-objects/Tag.js";
import { FileSystemSkillRepository } from "../../src/infrastructure/FileSystemSkillRepository.js";

describe("FileSystemSkillRepository", () => {
  let tempDir: string;
  let repo: FileSystemSkillRepository;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-skills-test-"));
    repo = new FileSystemSkillRepository(tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("should return null for non-existent skill", async () => {
    const skill = await repo.findById("ghost-skill");
    expect(skill).toBeNull();
  });

  it("should save and retrieve a skill", async () => {
    const skill = new Skill("my-new-skill", "A great skill");
    skill.addTag(new Tag("awesome"));
    skill.addRequirement("other-skill");

    await repo.save(skill);

    const retrieved = await repo.findById("my-new-skill");
    expect(retrieved).not.toBeNull();
    expect(retrieved?.id).toBe("my-new-skill");
    expect(retrieved?.description).toBe("A great skill");

    const tags = retrieved?.getTags() || [];
    expect(tags.length).toBe(1);
    expect(tags[0].value).toBe("awesome");

    const reqs = retrieved?.getRequirements() || [];
    expect(reqs.length).toBe(1);
    expect(reqs[0]).toBe("other-skill");
  });

  it("should delete a skill", async () => {
    const skill = new Skill("to-delete");
    await repo.save(skill);
    expect(await repo.exists("to-delete")).toBe(true);

    await repo.delete("to-delete");
    expect(await repo.exists("to-delete")).toBe(false);
  });

  it("should list all skills", async () => {
    await repo.save(new Skill("skill-1"));
    await repo.save(new Skill("skill-2"));

    const all = await repo.findAll();
    expect(all.length).toBe(2);
    const ids = all.map((s) => s.id).sort();
    expect(ids).toEqual(["skill-1", "skill-2"]);
  });
});
