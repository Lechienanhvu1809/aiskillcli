import type { CliContext } from "../context.js";
import { syncPull } from "../policies/git-sync.js";
import { analyzeProject } from "../policies/project-analyzer.js";
import { recommendSkills } from "../policies/recommender.js";
import { listSkills } from "../policies/skill-registry.js";
import { c, info } from "../utils/output.js";

export interface RecommendOptions {
  dir?: string;
}

export function runRecommend(ctx: CliContext, opts: RecommendOptions): void {
  syncPull(ctx);

  const projectDir = opts.dir ?? process.cwd();
  const profile = analyzeProject(projectDir);

  // Hiển thị thông tin dự án
  console.log(c.bold("📁 Phân tích dự án:\n"));
  console.log(`  Tên:        ${c.accent(profile.name)}`);
  console.log(`  Ngôn ngữ:   ${profile.language}`);
  console.log(
    `  Frameworks: ${profile.frameworks.length > 0 ? profile.frameworks.join(", ") : c.dim("không phát hiện")}`,
  );
  console.log(
    `  Tools:      ${profile.tools.length > 0 ? profile.tools.join(", ") : c.dim("không phát hiện")}`,
  );
  console.log(`  Tests:      ${profile.hasTests ? c.ok("✓") : c.dim("✗")}`);
  console.log(`  CI/CD:      ${profile.hasCi ? c.ok("✓") : c.dim("✗")}`);
  console.log(`  Docker:     ${profile.hasDocker ? c.ok("✓") : c.dim("✗")}`);
  console.log();

  // Gợi ý skills
  const skills = listSkills(ctx);
  if (skills.length === 0) {
    info("Kho kỹ năng đang trống. Thêm kỹ năng bằng: ai-skills add <tên> <file>");
    return;
  }

  const recommendations = recommendSkills(profile, skills);

  if (recommendations.length === 0) {
    info("Không tìm thấy kỹ năng phù hợp với dự án này.");
    info(
      `Kho hiện có ${skills.length} kỹ năng. Thử thêm skills liên quan đến ${profile.frameworks.join(", ") || profile.language}.`,
    );
    return;
  }

  console.log(c.bold(`🎯 Gợi ý kỹ năng (${recommendations.length}):\n`));

  const confidenceIcon: Record<string, string> = {
    high: c.ok("★★★"),
    medium: c.warn("★★☆"),
    low: c.dim("★☆☆"),
  };

  for (const rec of recommendations) {
    console.log(`  ${confidenceIcon[rec.confidence]} ${c.accent(rec.skillName)}`);
    console.log(`    ${c.dim(rec.reason)}`);
  }

  console.log();
  info(`Apply bằng: ai-skills apply <tên>`);
}
