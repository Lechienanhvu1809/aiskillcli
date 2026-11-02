import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SkillApplicationService } from "../../src/application/SkillApplicationService.js";
import type { FileSystemSkillRepository } from "../../src/infrastructure/FileSystemSkillRepository.js";
import { bench, createTempRepo, seedSkills } from "../utils/perf-helpers.js";

let repo: FileSystemSkillRepository;
let svc: SkillApplicationService;
let cleanup: () => void;
let seededIds: string[];
const SEED_COUNT = 50;

beforeAll(async () => {
  const t = createTempRepo();
  repo = t.repo;
  cleanup = t.cleanup;
  svc = new SkillApplicationService(repo);
  seededIds = await seedSkills(repo, SEED_COUNT);
});

afterAll(() => cleanup());

describe("FileSystemSkillRepository — performance", () => {
  it("findById: mean < 10ms", async () => {
    const id = seededIds[25];
    const r = await bench(() => repo.findById(id));
    console.log("[findById]", r);
    expect(r.mean).toBeLessThan(10);
  });

  it("findAll (50 skills): mean < 200ms", async () => {
    const r = await bench(() => repo.findAll(), 20);
    console.log("[findAll x50]", r);
    expect(r.mean).toBeLessThan(200);
  });

  it("save: mean < 30ms", async () => {
    const { Skill } = await import("../../src/domain/entities/Skill.js");
    let i = 0;
    const r = await bench(async () => {
      const sk = new Skill(`save-bench-${String(i++).padStart(4, "0")}`, "bench");
      await repo.save(sk);
    }, 30);
    console.log("[save]", r);
    expect(r.mean).toBeLessThan(30);
  });

  it("exists: mean < 5ms", async () => {
    const id = seededIds[0];
    const r = await bench(() => repo.exists(id));
    console.log("[exists]", r);
    expect(r.mean).toBeLessThan(5);
  });

  it("delete: mean < 10ms", async () => {
    const { Skill } = await import("../../src/domain/entities/Skill.js");
    let i = 0;
    const r = await bench(async () => {
      const id = `del-bench-${String(i++).padStart(4, "0")}`;
      await repo.save(new Skill(id, "del"));
      await repo.delete(id);
    }, 30);
    console.log("[delete]", r);
    expect(r.mean).toBeLessThan(10);
  });
});

describe("SkillApplicationService — performance", () => {
  it("searchSkills keyword: mean < 300ms", async () => {
    const r = await bench(() => svc.searchSkills("skill"), 20);
    console.log("[searchSkills]", r);
    expect(r.mean).toBeLessThan(300);
  });

  it("searchSkills tag filter: mean < 300ms", async () => {
    const r = await bench(() => svc.searchSkills("perf", "even"), 20);
    console.log("[searchSkills tag]", r);
    expect(r.mean).toBeLessThan(300);
  });

  it("getAllSkills (50): mean < 200ms", async () => {
    const r = await bench(() => svc.getAllSkills(), 20);
    console.log("[getAllSkills]", r);
    expect(r.mean).toBeLessThan(200);
  });

  it("getTagsOverview (50): mean < 250ms", async () => {
    const r = await bench(() => svc.getTagsOverview(), 20);
    console.log("[getTagsOverview]", r);
    expect(r.mean).toBeLessThan(250);
  });

  it("appendLesson: mean < 40ms", async () => {
    const id = seededIds[5];
    const r = await bench(
      () => svc.appendLesson(id, "Learned something", "---\ndescription: init\n---\n"),
      20,
    );
    console.log("[appendLesson]", r);
    expect(r.mean).toBeLessThan(40);
  });

  it("addTagsToSkill: mean < 20ms", async () => {
    const id = seededIds[10];
    const r = await bench(() => svc.addTagsToSkill(id, ["bench-tag"]), 20);
    console.log("[addTagsToSkill]", r);
    expect(r.mean).toBeLessThan(20);
  });

  it("renameTag (50 skills): mean < 400ms", async () => {
    let t = 0;
    const r = await bench(
      () =>
        svc.renameTag(
          t++ % 2 === 0 ? "perf" : "perf-renamed",
          t % 2 === 0 ? "perf-renamed" : "perf",
        ),
      10,
    );
    console.log("[renameTag]", r);
    expect(r.mean).toBeLessThan(400);
  });
});

describe("Concurrency — parallel reads/writes", () => {
  it("10 concurrent findById: total < 100ms", async () => {
    const id = seededIds[0];
    const start = performance.now();
    await Promise.all(Array.from({ length: 10 }, () => repo.findById(id)));
    const elapsed = performance.now() - start;
    console.log("[concurrent findById x10]", elapsed.toFixed(2), "ms");
    expect(elapsed).toBeLessThan(100);
  });

  it("10 concurrent saves: no errors, total < 200ms", async () => {
    const { Skill } = await import("../../src/domain/entities/Skill.js");
    const start = performance.now();
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        repo.save(new Skill(`concurrent-${String(i).padStart(3, "0")}`, "concurrent")),
      ),
    );
    const elapsed = performance.now() - start;
    console.log("[concurrent save x10]", elapsed.toFixed(2), "ms");
    expect(elapsed).toBeLessThan(200);
  });
});
