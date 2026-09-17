import fs from "node:fs";
import path from "node:path";

/**
 * Business Rule: Phân tích dự án hiện tại để hiểu tech stack.
 * Đọc package.json, cấu trúc thư mục, config files.
 * Không có side effects — chỉ đọc filesystem và trả về data.
 */

export interface ProjectProfile {
  /** Tên dự án (từ package.json hoặc tên thư mục) */
  name: string;
  /** Ngôn ngữ chính */
  language: "typescript" | "javascript" | "python" | "unknown";
  /** Frameworks phát hiện được */
  frameworks: string[];
  /** Tools phát hiện được */
  tools: string[];
  /** Có thư mục test không */
  hasTests: boolean;
  /** Có CI/CD config không */
  hasCi: boolean;
  /** Có Docker config không */
  hasDocker: boolean;
}

/** Mapping: dependency name → framework/tool label */
const FRAMEWORK_MAP: Record<string, string> = {
  react: "react",
  "react-dom": "react",
  next: "nextjs",
  vue: "vue",
  nuxt: "nuxt",
  svelte: "svelte",
  "@sveltejs/kit": "sveltekit",
  angular: "angular",
  "@angular/core": "angular",
  express: "express",
  fastify: "fastify",
  koa: "koa",
  hono: "hono",
  nestjs: "nestjs",
  "@nestjs/core": "nestjs",
  prisma: "prisma",
  "@prisma/client": "prisma",
  drizzle: "drizzle",
  "drizzle-orm": "drizzle",
  mongoose: "mongoose",
  sequelize: "sequelize",
  "socket.io": "socketio",
  graphql: "graphql",
  "@apollo/server": "apollo",
  trpc: "trpc",
  "@trpc/server": "trpc",
  tailwindcss: "tailwind",
  "styled-components": "styled-components",
  electron: "electron",
  "react-native": "react-native",
  expo: "expo",
  three: "threejs",
};

const TOOL_MAP: Record<string, string> = {
  vitest: "vitest",
  jest: "jest",
  mocha: "mocha",
  cypress: "cypress",
  playwright: "playwright",
  "@testing-library/react": "testing-library",
  eslint: "eslint",
  "@biomejs/biome": "biome",
  prettier: "prettier",
  typescript: "typescript",
  tsx: "tsx",
  tsdown: "tsdown",
  tsup: "tsup",
  vite: "vite",
  webpack: "webpack",
  esbuild: "esbuild",
  rollup: "rollup",
  commander: "commander",
  yargs: "yargs",
  zod: "zod",
  joi: "joi",
  dotenv: "dotenv",
  husky: "husky",
  "lint-staged": "lint-staged",
  storybook: "storybook",
  "@storybook/react": "storybook",
  docker: "docker",
};

/** Đọc package.json nếu có */
function readPackageJson(dir: string): Record<string, unknown> | null {
  const pkgPath = path.join(dir, "package.json");
  if (!fs.existsSync(pkgPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  } catch {
    return null;
  }
}

/** Trích xuất dependencies từ package.json */
function extractDeps(pkg: Record<string, unknown>): string[] {
  const deps = new Set<string>();
  for (const key of [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
  ]) {
    const section = pkg[key];
    if (section && typeof section === "object") {
      for (const dep of Object.keys(section as Record<string, unknown>)) {
        deps.add(dep);
      }
    }
  }
  return [...deps];
}

/** Detect frameworks từ dependency list */
function detectFrameworks(deps: string[]): string[] {
  const frameworks = new Set<string>();
  for (const dep of deps) {
    const fw = FRAMEWORK_MAP[dep];
    if (fw) frameworks.add(fw);
  }
  return [...frameworks].sort();
}

/** Detect tools từ dependency list */
function detectTools(deps: string[]): string[] {
  const tools = new Set<string>();
  for (const dep of deps) {
    const tool = TOOL_MAP[dep];
    if (tool) tools.add(tool);
  }
  return [...tools].sort();
}

/** Detect ngôn ngữ chính */
function detectLanguage(dir: string, deps: string[]): ProjectProfile["language"] {
  if (deps.includes("typescript") || fs.existsSync(path.join(dir, "tsconfig.json"))) {
    return "typescript";
  }
  if (fs.existsSync(path.join(dir, "package.json"))) {
    return "javascript";
  }
  // Python markers
  for (const marker of ["requirements.txt", "setup.py", "pyproject.toml", "Pipfile"]) {
    if (fs.existsSync(path.join(dir, marker))) return "python";
  }
  return "unknown";
}

/**
 * Phân tích dự án tại thư mục chỉ định.
 * Đọc package.json, kiểm tra cấu trúc thư mục, và detect tech stack.
 */
export function analyzeProject(projectDir: string): ProjectProfile {
  const resolvedDir = path.resolve(projectDir);
  const pkg = readPackageJson(resolvedDir);
  const deps = pkg ? extractDeps(pkg) : [];
  const dirName = path.basename(resolvedDir);

  return {
    name: (pkg?.name as string) ?? dirName,
    language: detectLanguage(resolvedDir, deps),
    frameworks: detectFrameworks(deps),
    tools: detectTools(deps),
    hasTests: ["test", "tests", "__tests__", "spec"].some((d) =>
      fs.existsSync(path.join(resolvedDir, d)),
    ),
    hasCi: [".github/workflows", ".gitlab-ci.yml", ".circleci", "Jenkinsfile"].some((p) =>
      fs.existsSync(path.join(resolvedDir, p)),
    ),
    hasDocker: ["Dockerfile", "docker-compose.yml", "docker-compose.yaml"].some((f) =>
      fs.existsSync(path.join(resolvedDir, f)),
    ),
  };
}
