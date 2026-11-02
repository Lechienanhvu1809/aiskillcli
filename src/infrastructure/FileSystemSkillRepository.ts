import fs from "node:fs/promises";
import path from "node:path";
import { Skill } from "../domain/entities/Skill.js";
import type { ISkillRepository } from "../domain/repositories/ISkillRepository.js";
import { Tag } from "../domain/value-objects/Tag.js";

// We will use existing frontmatter utility for now to ease transition
import { parseSkillFile, serializeFrontmatter } from "../utils/frontmatter.js";

export class FileSystemSkillRepository implements ISkillRepository {
  constructor(private readonly baseDir: string) {}

  private getFilePath(id: string): string {
    const fullPath = path.join(this.baseDir, `${id}.md`);
    if (!fullPath.startsWith(path.normalize(this.baseDir))) {
      throw new Error("Invalid skill ID: Path traversal detected");
    }
    return fullPath;
  }

  async findById(id: string): Promise<Skill | null> {
    const filePath = this.getFilePath(id);
    try {
      const content = await fs.readFile(filePath, "utf-8");
      return this.mapToEntity(id, content);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async findAll(): Promise<Skill[]> {
    try {
      const entries = await fs.readdir(this.baseDir, { withFileTypes: true });
      const promises = entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
        .map((entry) => this.findById(entry.name.replace(/\.md$/, "")));

      const results = await Promise.all(promises);
      const skills = results.filter((s): s is Skill => s !== null);

      return skills;
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  async save(skill: Skill): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true });

    const filePath = this.getFilePath(skill.id);

    const newContent = this.mapToMarkdown(skill);
    await fs.writeFile(filePath, newContent, "utf-8");
  }

  async delete(id: string): Promise<void> {
    const filePath = this.getFilePath(id);
    try {
      await fs.rm(filePath, { force: true });
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  async exists(id: string): Promise<boolean> {
    const filePath = this.getFilePath(id);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  // Mapper methods
  private mapToEntity(id: string, content: string): Skill {
    const { meta, body } = parseSkillFile(content);

    let description = (meta.description as string) || "";
    if (!description) {
      description = body.slice(0, 150).replace(/\n/g, " ").trim();
      if (body.length > 150) description += "...";
    }

    const skill = new Skill(id, description, body);

    if (meta.tags && Array.isArray(meta.tags)) {
      for (const t of meta.tags as string[]) {
        skill.addTag(new Tag(t));
      }
    }

    if (meta.requires && Array.isArray(meta.requires)) {
      for (const r of meta.requires as string[]) {
        skill.addRequirement(r);
      }
    }

    return skill;
  }

  private mapToMarkdown(skill: Skill): string {
    const newFrontmatter = {
      name: skill.name,
      description: skill.description.split("\n")[0] || "", // Keep first line as short desc
      tags: skill.getTags().map((t) => t.value),
      requires: skill.getRequirements(),
    };

    return serializeFrontmatter(newFrontmatter, skill.content);
  }
}
