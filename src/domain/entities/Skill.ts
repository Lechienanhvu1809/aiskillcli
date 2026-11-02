import { Tag } from "../value-objects/Tag.js";

export class Skill {
  public readonly id: string;
  public readonly name: string;
  public description: string;
  public content: string;
  private tags: Set<string>;
  private requirements: Set<string>;

  constructor(id: string, description: string = "", content: string = "") {
    if (!/^[a-z0-9-]+$/.test(id)) {
      throw new Error(`Invalid skill ID: ${id}. Must be lowercase alphanumeric with hyphens.`);
    }
    this.id = id;
    this.name = id;
    this.description = description;
    this.content = content;
    this.tags = new Set();
    this.requirements = new Set();
  }

  public addTag(tag: Tag): void {
    this.tags.add(tag.value);
  }

  public removeTag(tag: Tag): void {
    this.tags.delete(tag.value);
  }

  public getTags(): Tag[] {
    return Array.from(this.tags).map((t) => new Tag(t));
  }

  public addRequirement(skillId: string): void {
    this.requirements.add(skillId);
  }

  public getRequirements(): string[] {
    return Array.from(this.requirements);
  }

  public equals(other: Skill): boolean {
    return this.id === other.id;
  }
}
