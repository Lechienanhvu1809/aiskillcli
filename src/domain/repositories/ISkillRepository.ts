import type { Skill } from "../entities/Skill.js";

export interface ISkillRepository {
  findById(id: string): Promise<Skill | null>;
  findAll(): Promise<Skill[]>;
  save(skill: Skill): Promise<void>;
  delete(id: string): Promise<void>;
  exists(id: string): Promise<boolean>;
}
