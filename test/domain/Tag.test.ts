import { describe, expect, it } from "vitest";
import { Tag } from "../../src/domain/value-objects/Tag.js";

describe("Tag (Value Object)", () => {
  it("should create a valid tag", () => {
    const tag = new Tag("frontend");
    expect(tag.value).toBe("frontend");
  });

  it("should format tags to lowercase automatically", () => {
    const tag = new Tag("FRONTend");
    expect(tag.value).toBe("frontend");
  });

  it("should throw error if tag is empty", () => {
    expect(() => new Tag("   ")).toThrowError("Tag cannot be empty");
  });

  it("should trim whitespaces", () => {
    const tag = new Tag("  backend  ");
    expect(tag.value).toBe("backend");
  });

  it("should implement equality (same value means same tag)", () => {
    const tag1 = new Tag("database");
    const tag2 = new Tag("DATABASE ");
    expect(tag1.equals(tag2)).toBe(true);
  });
});
