import fs from "node:fs/promises";
import { Skill } from "../domain/entities/Skill.js";
import type { ISkillRepository } from "../domain/repositories/ISkillRepository.js";
import { Tag } from "../domain/value-objects/Tag.js";
import { parseSkillFile } from "../utils/frontmatter.js";

export class SkillApplicationService {
  constructor(private readonly skillRepo: ISkillRepository) {}

  async createSkill(
    skillId: string,
    sourceFilePath: string,
    extraTags: string[] = [],
    overwrite = false,
  ): Promise<Skill> {
    const existing = await this.skillRepo.findById(skillId);
    if (existing && !overwrite) {
      throw new Error(`Skill already exists: ${skillId}`);
    }

    const content = await fs.readFile(sourceFilePath, "utf8");
    const { meta, body } = parseSkillFile(content);

    let description = (meta.description as string) || "";
    if (!description) {
      description = body.slice(0, 150).replace(/\n/g, " ").trim();
      if (body.length > 150) description += "...";
    }

    const skill = new Skill(skillId, description, body);

    if (Array.isArray(meta.tags)) {
      for (const t of meta.tags) skill.addTag(new Tag(t));
    }
    if (Array.isArray(meta.requires)) {
      for (const r of meta.requires) skill.addRequirement(r);
    }
    for (const t of extraTags) {
      skill.addTag(new Tag(t));
    }

    await this.skillRepo.save(skill);
    return skill;
  }

  /** Tạo skill mới từ nội dung đã được sinh sẵn (template-generated). */
  async createSkillFromContent(
    skillId: string,
    content: string,
    overwrite = false,
  ): Promise<Skill> {
    const existing = await this.skillRepo.findById(skillId);
    if (existing && !overwrite) {
      throw new Error(`Skill already exists: ${skillId}`);
    }

    const { meta, body } = parseSkillFile(content);

    let description = (meta.description as string) || "";
    if (!description) {
      description = body.slice(0, 150).replace(/\n/g, " ").trim();
      if (body.length > 150) description += "...";
    }

    const skill = new Skill(skillId, description, body);
    if (Array.isArray(meta.tags)) {
      for (const t of meta.tags) skill.addTag(new Tag(t));
    }
    if (Array.isArray(meta.requires)) {
      for (const r of meta.requires) skill.addRequirement(r);
    }

    await this.skillRepo.save(skill);
    return skill;
  }

  /** Append một dòng bài học vào skill. Tự tạo skill mới nếu chưa tồn tại. */
  async appendLesson(
    skillId: string,
    lesson: string,
    initialContent: string,
  ): Promise<{ skill: Skill; isNew: boolean }> {
    const dateStr = new Date().toISOString().split("T")[0];
    const newEntry = `- **[${dateStr}]**: ${lesson}`;

    let skill = await this.skillRepo.findById(skillId);
    const isNew = !skill;

    if (!skill) {
      const { meta, body } = parseSkillFile(initialContent);
      let description = (meta.description as string) || "";
      if (!description) {
        description = body.slice(0, 150).replace(/\n/g, " ").trim();
        if (body.length > 150) description += "...";
      }
      skill = new Skill(skillId, description, body);
      if (Array.isArray(meta.tags)) {
        for (const t of meta.tags) skill.addTag(new Tag(t));
      }
    } else {
      skill.content = `${skill.content.trimEnd()}\n${newEntry}\n`;
    }

    await this.skillRepo.save(skill);
    return { skill, isNew };
  }

  /** Tìm kiếm skills theo keyword trong tên và nội dung. */
  async searchSkills(
    keyword: string,
    tag?: string,
  ): Promise<Array<{ id: string; matchedInName: boolean; matchedInContent: boolean }>> {
    const allSkills = await this.skillRepo.findAll();
    const kw = keyword.toLowerCase();

    return allSkills
      .filter((s) => {
        if (tag) {
          return s.getTags().some((t) => t.value === tag.toLowerCase());
        }
        return true;
      })
      .map((s) => ({
        id: s.id,
        matchedInName: s.id.toLowerCase().includes(kw),
        matchedInContent:
          s.description.toLowerCase().includes(kw) || s.content.toLowerCase().includes(kw),
      }))
      .filter((r) => r.matchedInName || r.matchedInContent);
  }

  async deleteSkill(skillId: string): Promise<void> {
    const skill = await this.skillRepo.findById(skillId);
    if (!skill) throw new Error(`Skill not found: ${skillId}`);
    await this.skillRepo.delete(skillId);
  }

  async getSkill(skillId: string): Promise<Skill | null> {
    return await this.skillRepo.findById(skillId);
  }

  async addTagsToSkill(skillId: string, tagNames: string[]): Promise<Skill> {
    const skill = await this.skillRepo.findById(skillId);
    if (!skill) throw new Error(`Skill not found: ${skillId}`);

    for (const tagName of tagNames) {
      skill.addTag(new Tag(tagName));
    }

    await this.skillRepo.save(skill);
    return skill;
  }

  async removeTagFromSkill(skillId: string, tagName: string): Promise<Skill> {
    const skill = await this.skillRepo.findById(skillId);
    if (!skill) throw new Error(`Skill not found: ${skillId}`);

    skill.removeTag(new Tag(tagName));
    await this.skillRepo.save(skill);
    return skill;
  }

  async getAllSkills(): Promise<Skill[]> {
    return await this.skillRepo.findAll();
  }

  async getTagsOverview(): Promise<{ tagMap: Map<string, string[]>; untagged: string[] }> {
    const allSkills = await this.skillRepo.findAll();
    const tagMap = new Map<string, string[]>();
    const untagged: string[] = [];

    for (const skill of allSkills) {
      const tags = skill.getTags();
      if (tags.length === 0) {
        untagged.push(skill.id);
      } else {
        for (const tag of tags) {
          const val = tag.value;
          if (!tagMap.has(val)) tagMap.set(val, []);
          tagMap.get(val)?.push(skill.id);
        }
      }
    }
    return { tagMap, untagged };
  }

  async renameTag(oldName: string, newName: string): Promise<number> {
    const allSkills = await this.skillRepo.findAll();
    const oldTag = new Tag(oldName);
    const newTag = new Tag(newName);

    let affectedCount = 0;
    for (const skill of allSkills) {
      if (skill.getTags().some((t) => t.equals(oldTag))) {
        skill.removeTag(oldTag);
        skill.addTag(newTag);
        await this.skillRepo.save(skill);
        affectedCount++;
      }
    }
    return affectedCount;
  }
}
