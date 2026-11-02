import { describe, expect, it } from "vitest";
import { Skill } from "../../src/domain/entities/Skill.js";
import { Tag } from "../../src/domain/value-objects/Tag.js";

describe("Skill (Entity)", () => {
  it("should create a skill with an identity and basic properties", () => {
    const skill = new Skill("my-skill", "A test skill");
    expect(skill.id).toBe("my-skill");
    expect(skill.name).toBe("my-skill");
    expect(skill.description).toBe("A test skill");
    expect(skill.getTags().length).toBe(0);
    expect(skill.getRequirements().length).toBe(0);
  });

  it("should enforce valid identifiers", () => {
    expect(() => new Skill("Invalid Name!")).toThrowError();
  });

  it("should manage tags correctly", () => {
    const skill = new Skill("api-design");
    skill.addTag(new Tag("backend"));
    skill.addTag(new Tag("architecture"));

    // Duplicate tag logic (case insensitive)
    skill.addTag(new Tag("BACKEND"));

    const tags = skill.getTags();
    expect(tags.length).toBe(2);
    expect(tags[0].value).toBe("backend");
    expect(tags[1].value).toBe("architecture");

    skill.removeTag(new Tag("ARCHITECTURE"));
    expect(skill.getTags().length).toBe(1);
  });

  it("should implement equality based on identity (id)", () => {
    const skill1 = new Skill("frontend-design", "Desc 1");
    const skill2 = new Skill("frontend-design", "Desc 2");
    expect(skill1.equals(skill2)).toBe(true);

    const skill3 = new Skill("backend-design");
    expect(skill1.equals(skill3)).toBe(false);
  });
});
