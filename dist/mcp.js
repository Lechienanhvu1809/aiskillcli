#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { pipeline } from "@xenova/transformers";
//#region src/context.ts
/** Thư mục lưu toàn bộ skill files (~/.ai-skills) */
const SKILLS_DIR = path.join(os.homedir(), ".ai-skills");
function createCliContext(overrides = {}) {
	return {
		skillsDir: SKILLS_DIR,
		verbose: false,
		projectDir: process.cwd(),
		...overrides
	};
}
//#endregion
//#region src/policies/project-analyzer.ts
/** Mapping: dependency name → framework/tool label */
const FRAMEWORK_MAP = {
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
	three: "threejs"
};
const TOOL_MAP = {
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
	docker: "docker"
};
/** Đọc package.json nếu có */
function readPackageJson(dir) {
	const pkgPath = path.join(dir, "package.json");
	if (!fs.existsSync(pkgPath)) return null;
	try {
		return JSON.parse(fs.readFileSync(pkgPath, "utf8"));
	} catch {
		return null;
	}
}
/** Trích xuất dependencies từ package.json */
function extractDeps(pkg) {
	const deps = /* @__PURE__ */ new Set();
	for (const key of [
		"dependencies",
		"devDependencies",
		"optionalDependencies",
		"peerDependencies"
	]) {
		const section = pkg[key];
		if (section && typeof section === "object") for (const dep of Object.keys(section)) deps.add(dep);
	}
	return [...deps];
}
/** Detect frameworks từ dependency list */
function detectFrameworks(deps) {
	const frameworks = /* @__PURE__ */ new Set();
	for (const dep of deps) {
		const fw = FRAMEWORK_MAP[dep];
		if (fw) frameworks.add(fw);
	}
	return [...frameworks].sort();
}
/** Detect tools từ dependency list */
function detectTools(deps) {
	const tools = /* @__PURE__ */ new Set();
	for (const dep of deps) {
		const tool = TOOL_MAP[dep];
		if (tool) tools.add(tool);
	}
	return [...tools].sort();
}
/** Detect ngôn ngữ chính */
function detectLanguage(dir, deps) {
	if (deps.includes("typescript") || fs.existsSync(path.join(dir, "tsconfig.json"))) return "typescript";
	if (fs.existsSync(path.join(dir, "package.json"))) return "javascript";
	for (const marker of [
		"requirements.txt",
		"setup.py",
		"pyproject.toml",
		"Pipfile"
	]) if (fs.existsSync(path.join(dir, marker))) return "python";
	return "unknown";
}
/**
* Phân tích dự án tại thư mục chỉ định.
* Đọc package.json, kiểm tra cấu trúc thư mục, và detect tech stack.
*/
function analyzeProject(projectDir) {
	const resolvedDir = path.resolve(projectDir);
	const pkg = readPackageJson(resolvedDir);
	const deps = pkg ? extractDeps(pkg) : [];
	const dirName = path.basename(resolvedDir);
	return {
		name: pkg?.name ?? dirName,
		language: detectLanguage(resolvedDir, deps),
		frameworks: detectFrameworks(deps),
		tools: detectTools(deps),
		hasTests: [
			"test",
			"tests",
			"__tests__",
			"spec"
		].some((d) => fs.existsSync(path.join(resolvedDir, d))),
		hasCi: [
			".github/workflows",
			".gitlab-ci.yml",
			".circleci",
			"Jenkinsfile"
		].some((p) => fs.existsSync(path.join(resolvedDir, p))),
		hasDocker: [
			"Dockerfile",
			"docker-compose.yml",
			"docker-compose.yaml"
		].some((f) => fs.existsSync(path.join(resolvedDir, f)))
	};
}
//#endregion
//#region src/utils/frontmatter.ts
function parseFrontmatter(content) {
	const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
	if (!match) return {};
	const result = {};
	for (const line of match[1].split("\n")) {
		const colonIdx = line.indexOf(":");
		if (colonIdx > 0) {
			const key = line.slice(0, colonIdx).trim();
			const valueStr = line.slice(colonIdx + 1).trim();
			if (key === "tags" || key === "requires") {
				let cleaned = valueStr;
				if (cleaned.startsWith("[") && cleaned.endsWith("]")) cleaned = cleaned.slice(1, -1);
				result[key] = cleaned.split(",").map((t) => t.trim()).filter(Boolean);
			} else result[key] = valueStr;
		}
	}
	return result;
}
//#endregion
//#region src/policies/text-search.ts
const STOPWORDS = /* @__PURE__ */ new Set([
	"a",
	"an",
	"the",
	"is",
	"are",
	"was",
	"were",
	"be",
	"been",
	"being",
	"have",
	"has",
	"had",
	"do",
	"does",
	"did",
	"will",
	"would",
	"could",
	"should",
	"may",
	"might",
	"shall",
	"can",
	"need",
	"dare",
	"ought",
	"used",
	"to",
	"of",
	"in",
	"for",
	"on",
	"with",
	"at",
	"by",
	"from",
	"as",
	"into",
	"through",
	"during",
	"before",
	"after",
	"above",
	"below",
	"between",
	"out",
	"off",
	"over",
	"under",
	"again",
	"further",
	"then",
	"once",
	"here",
	"there",
	"when",
	"where",
	"why",
	"how",
	"all",
	"both",
	"each",
	"few",
	"more",
	"most",
	"other",
	"some",
	"such",
	"no",
	"nor",
	"not",
	"only",
	"own",
	"same",
	"so",
	"than",
	"too",
	"very",
	"just",
	"because",
	"but",
	"and",
	"or",
	"if",
	"while",
	"about",
	"up",
	"its",
	"it",
	"this",
	"that",
	"these",
	"those",
	"i",
	"me",
	"my",
	"we",
	"our",
	"you",
	"your",
	"he",
	"him",
	"his",
	"she",
	"her",
	"they",
	"them",
	"their",
	"what",
	"which",
	"who",
	"whom",
	"và",
	"hoặc",
	"của",
	"là",
	"các",
	"những",
	"cho",
	"để",
	"trong",
	"trên",
	"dưới",
	"với",
	"như",
	"một",
	"sẽ",
	"đã",
	"đang",
	"thì",
	"mà",
	"có",
	"không",
	"khi",
	"làm"
]);
/** Tách text thành tokens đã normalize */
function tokenize(text) {
	const words = text.toLowerCase().match(/[\p{L}\d-]+/gu);
	if (!words) return [];
	return words.filter((w) => w.length > 1 && !STOPWORDS.has(w));
}
const prevRow = /* @__PURE__ */ new Int32Array(256);
const currRow = /* @__PURE__ */ new Int32Array(256);
/** Tính Levenshtein distance giữa 2 string */
function levenshtein(a, b) {
	const la = a.length;
	const lb = b.length;
	if (la === 0) return lb;
	if (lb === 0) return la;
	let prev = lb < 256 ? prevRow : new Int32Array(lb + 1);
	let curr = lb < 256 ? currRow : new Int32Array(lb + 1);
	for (let i = 0; i <= lb; i++) prev[i] = i;
	for (let i = 1; i <= la; i++) {
		curr[0] = i;
		for (let j = 1; j <= lb; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
		}
		const temp = prev;
		prev = curr;
		curr = temp;
	}
	return prev[lb];
}
/** Kiểm tra fuzzy match: distance <= threshold dựa trên độ dài từ */
function isFuzzyMatch(word, target, maxRatio = .3) {
	const maxDist = Math.max(1, Math.floor(target.length * maxRatio));
	return levenshtein(word, target) <= maxDist;
}
/**
* Trích snippet chứa từ khóa (±context words xung quanh).
* Trả về dòng đầu tiên chứa bất kỳ query token nào.
*/
function extractSnippet(content, queryTokens, maxLen = 120) {
	const lines = content.split("\n").filter((l) => l.trim().length > 0);
	const lowerTokens = queryTokens.map((t) => t.toLowerCase());
	for (const line of lines) {
		const lowerLine = line.toLowerCase();
		if (lowerTokens.some((t) => lowerLine.includes(t))) {
			const trimmed = line.trim();
			if (trimmed.length <= maxLen) return trimmed;
			return `${trimmed.slice(0, maxLen - 3)}...`;
		}
	}
	const first = lines.find((l) => !l.startsWith("---"))?.trim() ?? "";
	if (first.length <= maxLen) return first;
	return `${first.slice(0, maxLen - 3)}...`;
}
/** Tính term frequency: số lần xuất hiện / tổng tokens */
function tf(term, tokens) {
	if (tokens.length === 0) return 0;
	return tokens.filter((t) => t === term).length / tokens.length;
}
/** Tính inverse document frequency: log(N / df) */
function idf(term, docs) {
	const df = docs.filter((d) => d.tokens.includes(term)).length;
	if (df === 0) return 0;
	return Math.log(docs.length / df);
}
/** Tính TF-IDF + fuzzy score cho một document với query tokens */
function scoreDocAgainstQuery(doc, queryTokens, idfScores, allDocs) {
	let tfidfScore = 0;
	let exactHits = 0;
	let fuzzyHits = 0;
	for (const term of queryTokens) {
		const termTf = tf(term, doc.tokens);
		const termIdf = idfScores.get(term) ?? 0;
		tfidfScore += termTf * termIdf;
		if (termTf > 0) exactHits++;
		else {
			const fuzzyToken = doc.tokens.find((t) => isFuzzyMatch(t, term));
			if (fuzzyToken) {
				fuzzyHits++;
				const fuzzyIdf = idf(fuzzyToken, allDocs);
				tfidfScore += .3 * (fuzzyIdf > 0 ? fuzzyIdf : 1);
			}
		}
	}
	return {
		tfidfScore,
		exactHits,
		fuzzyHits
	};
}
/** Normalize raw TF-IDF score to 0..1 range với name bonus */
function normalizeScore(rawScore, queryTokens, idfScores, docName) {
	const maxPossible = queryTokens.reduce((sum, t) => sum + (idfScores.get(t) ?? 0), 0);
	const normalized = maxPossible > 0 ? Math.min(1, rawScore / maxPossible) : Math.min(1, rawScore);
	const nameBonus = queryTokens.some((t) => docName.toLowerCase().includes(t)) ? .2 : 0;
	return Math.min(1, normalized + nameBonus);
}
/** Phân loại match type dựa trên exact/fuzzy hit counts */
function classifyMatchType(exactHits, fuzzyHits) {
	if (exactHits > 0 && fuzzyHits === 0) return "exact";
	if (fuzzyHits > 0 && exactHits === 0) return "fuzzy";
	return "tfidf";
}
const docTokenCache = /* @__PURE__ */ new Map();
/**
* Tìm kiếm thông minh với TF-IDF + fuzzy matching.
* @param docs Map<skillName, fileContent>
* @param query Chuỗi tìm kiếm
* @returns Kết quả sắp xếp theo score giảm dần
*/
function searchWithTfIdf(docs, query) {
	const queryTokens = tokenize(query);
	if (queryTokens.length === 0) return [];
	const docTokensList = [];
	for (const [name, content] of docs) {
		let tokens;
		const cached = docTokenCache.get(name);
		if (cached && cached.content === content) tokens = cached.tokens;
		else {
			tokens = tokenize(`${name} ${content}`);
			docTokenCache.set(name, {
				content,
				tokens
			});
		}
		docTokensList.push({
			name,
			tokens,
			content
		});
	}
	const idfScores = /* @__PURE__ */ new Map();
	for (const term of queryTokens) idfScores.set(term, idf(term, docTokensList));
	const results = [];
	for (const doc of docTokensList) {
		const { tfidfScore, exactHits, fuzzyHits } = scoreDocAgainstQuery(doc, queryTokens, idfScores, docTokensList);
		if (tfidfScore <= 0) continue;
		const finalScore = normalizeScore(tfidfScore, queryTokens, idfScores, doc.name);
		results.push({
			name: doc.name,
			score: Math.round(finalScore * 100) / 100,
			matchType: classifyMatchType(exactHits, fuzzyHits),
			snippet: extractSnippet(doc.content, queryTokens)
		});
	}
	results.sort((a, b) => b.score - a.score);
	return results;
}
//#endregion
//#region src/policies/skill-registry.ts
var SkillRegistryError = class extends Error {
	code;
	constructor(message, code) {
		super(message);
		this.code = code;
		this.name = "SkillRegistryError";
	}
};
/** Đảm bảo thư mục kho skill tồn tại */
function ensureSkillsDir(ctx) {
	if (!fs.existsSync(ctx.skillsDir)) fs.mkdirSync(ctx.skillsDir, { recursive: true });
}
/** Lấy path của một skill file */
function skillPath(ctx, name) {
	return path.join(ctx.skillsDir, `${name}.md`);
}
/** Liệt kê tất cả skills */
function listSkills(ctx) {
	ensureSkillsDir(ctx);
	return fs.readdirSync(ctx.skillsDir).filter((f) => f.endsWith(".md")).map((f) => ({
		name: f.replace(/\.md$/, ""),
		path: path.join(ctx.skillsDir, f)
	}));
}
/** Đọc nội dung một skill */
function getSkill(ctx, name) {
	const p = skillPath(ctx, name);
	if (!fs.existsSync(p)) throw new SkillRegistryError(`Không tìm thấy skill "${name}".`, "NOT_FOUND");
	return fs.readFileSync(p, "utf8").replace(/\r\n?/g, "\n");
}
/** Tìm kiếm thông minh với TF-IDF + fuzzy matching */
function searchSkillsSemantic(ctx, query, tag) {
	ensureSkillsDir(ctx);
	const lowerTag = tag?.toLowerCase();
	const files = fs.readdirSync(ctx.skillsDir).filter((f) => f.endsWith(".md"));
	const docs = /* @__PURE__ */ new Map();
	for (const file of files) {
		const name = file.replace(/\.md$/, "");
		const content = fs.readFileSync(path.join(ctx.skillsDir, file), "utf8");
		if (lowerTag) {
			if (!(parseFrontmatter(content).tags ?? []).map((t) => t.toLowerCase()).includes(lowerTag)) continue;
		}
		docs.set(name, content);
	}
	return searchWithTfIdf(docs, query);
}
/**
* Lấy nội dung của một skill kèm theo nội dung các skill phụ thuộc (requires)
*/
function getSkillWithDependencies(ctx, name, maxDepth = 2) {
	const visited = /* @__PURE__ */ new Set();
	const output = [];
	function fetchRecursive(currentName, depth) {
		if (visited.has(currentName) || depth > maxDepth) return;
		visited.add(currentName);
		try {
			const content = getSkill(ctx, currentName);
			output.push(`\n<!-- ===== BẮT ĐẦU SKILL: ${currentName} ===== -->\n`);
			output.push(content);
			output.push(`\n<!-- ===== KẾT THÚC SKILL: ${currentName} ===== -->\n`);
			const reqs = parseFrontmatter(content).requires || [];
			if (Array.isArray(reqs)) for (const req of reqs) fetchRecursive(req, depth + 1);
		} catch (e) {
			if (depth === 0) throw e;
			const errMsg = e instanceof Error ? e.message : String(e);
			output.push(`\n<!-- [LỖI] Không thể lấy phụ thuộc: ${currentName} (${errMsg}) -->\n`);
		}
	}
	fetchRecursive(name, 0);
	return output.join("").trim();
}
/**
* Lưu trực tiếp nội dung string vào file skill
*/
async function saveSkill(ctx, name, content) {
	ensureSkillsDir(ctx);
	const dest = skillPath(ctx, name);
	await fs.promises.writeFile(dest, content, "utf8");
}
//#endregion
//#region src/policies/semantic-search.ts
const MODEL_ID = "Xenova/all-MiniLM-L6-v2";
let pipelineInstance = null;
async function getPipeline() {
	if (!pipelineInstance) pipelineInstance = await pipeline("feature-extraction", MODEL_ID, { quantized: true });
	return pipelineInstance;
}
/**
* Tạo vector 384 chiều từ văn bản
*/
async function embedText(text) {
	const output = await (await getPipeline())(text, {
		pooling: "mean",
		normalize: true
	});
	return Array.from(output.data);
}
/**
* Tính cosine similarity giữa 2 vector đã normalize
*/
function cosineSimilarity(a, b) {
	if (a.length !== b.length) return 0;
	let sum = 0;
	for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
	return sum;
}
function getVectorDbPath(ctx) {
	ensureSkillsDir(ctx);
	return path.join(ctx.skillsDir, "vectors.json");
}
/**
* Đọc tất cả vector từ đĩa
*/
function loadVectors(ctx) {
	const dbPath = getVectorDbPath(ctx);
	if (!fs.existsSync(dbPath)) return {};
	try {
		const content = fs.readFileSync(dbPath, "utf8");
		return JSON.parse(content);
	} catch {
		return {};
	}
}
/**
* Tìm kiếm theo ngữ nghĩa
*/
async function searchSemantic(ctx, query, threshold = .5) {
	const queryVector = await embedText(query);
	const vectors = loadVectors(ctx);
	const results = [];
	for (const [name, vector] of Object.entries(vectors)) {
		const score = cosineSimilarity(queryVector, vector);
		if (score >= threshold) results.push({
			name,
			score
		});
	}
	return results.sort((a, b) => b.score - a.score);
}
//#endregion
//#region src/version.ts
/** Single source of truth cho CLI version — đồng bộ với package.json */
const CLI_VERSION = "1.3.0";
//#endregion
//#region src/mcp.ts
const ctx = createCliContext();
const server = new Server({
	name: "ai-skills-mcp",
	version: CLI_VERSION
}, { capabilities: { tools: {} } });
const SearchSkillsSchema = z.object({
	query: z.string().describe("Từ khóa tìm kiếm (ví dụ: 'react', 'bash', 'frontend')"),
	threshold: z.number().optional().describe("Điểm tối thiểu (mặc định 0.1)")
});
const GetSkillSchema = z.object({ name: z.string().describe("Tên chính xác của kỹ năng (ví dụ: 'coding-guide')") });
const LearnSkillSchema = z.object({
	name: z.string().describe("Tên kỹ năng (chỉ gồm chữ cái thường, số và dấu gạch ngang, ví dụ: 'react-components')"),
	description: z.string().describe("Mô tả ngắn gọn về kỹ năng này"),
	content: z.string().describe("Nội dung hoàn chỉnh của file Markdown, bắt buộc phải chứa YAML frontmatter hợp lệ ở đầu (có name, tags).")
});
const SemanticSearchSchema = z.object({
	query: z.string().describe("Câu hỏi hoặc vấn đề cần tìm (ví dụ: 'cách tạo component mới')"),
	threshold: z.number().optional().describe("Điểm độ tương đồng tối thiểu (mặc định 0.5)")
});
const InjectContextSchema = z.object({ projectDir: z.string().optional().describe("Đường dẫn tuyệt đối đến thư mục dự án (mặc định là thư mục hiện tại)") });
/** Chuyển Zod schema → JSON Schema (draft-7, bỏ $schema key) */
function toInputSchema(schema) {
	const { $schema: _, ...rest } = schema.toJSONSchema({ target: "draft-7" });
	return rest;
}
server.setRequestHandler(ListToolsRequestSchema, async () => {
	return { tools: [
		{
			name: "autoskills_list",
			description: "Liệt kê tất cả các kỹ năng hiện có trong kho lưu trữ local.",
			inputSchema: {
				type: "object",
				properties: {}
			}
		},
		{
			name: "autoskills_search",
			description: "Tìm kiếm kỹ năng trong kho dựa trên từ khóa (sử dụng TF-IDF).",
			inputSchema: toInputSchema(SearchSkillsSchema)
		},
		{
			name: "autoskills_get",
			description: "Lấy toàn bộ nội dung markdown của một kỹ năng cụ thể.",
			inputSchema: toInputSchema(GetSkillSchema)
		},
		{
			name: "autoskills_learn",
			description: "Tự động ghi nhớ kiến thức, công cụ hoặc workflow mới vào registry. Lưu thành file markdown.",
			inputSchema: toInputSchema(LearnSkillSchema)
		},
		{
			name: "autoskills_semantic_search",
			description: "Tìm kiếm kỹ năng bằng AI embedding (Semantic Vector Search) dựa trên ý nghĩa câu hỏi, vượt trội hơn khớp từ khóa.",
			inputSchema: toInputSchema(SemanticSearchSchema)
		},
		{
			name: "autoskills_inject_context",
			description: "Tự động phân tích dự án và trả về toàn văn nội dung của tối đa 2 kỹ năng liên quan nhất để bơm vào ngữ cảnh.",
			inputSchema: toInputSchema(InjectContextSchema)
		}
	] };
});
async function handleList() {
	const skills = listSkills(ctx);
	return { content: [{
		type: "text",
		text: skills.length > 0 ? `Các kỹ năng hiện có:\n- ${skills.map((s) => s.name).join("\n- ")}` : "Kho kỹ năng hiện đang trống."
	}] };
}
async function handleSearch(args) {
	const { query, threshold = .1 } = SearchSkillsSchema.parse(args);
	const results = searchSkillsSemantic(ctx, query).filter((r) => r.score >= threshold);
	if (results.length === 0) return { content: [{
		type: "text",
		text: `Không tìm thấy kỹ năng nào phù hợp với từ khóa "${query}".`
	}] };
	const formattedResults = results.map((r) => `- **${r.name}** (score: ${r.score}):\n  > ${r.snippet}`).join("\n\n");
	return { content: [{
		type: "text",
		text: `Tìm thấy ${results.length} kỹ năng:\n\n${formattedResults}`
	}] };
}
async function handleGet(args) {
	const { name } = GetSkillSchema.parse(args);
	try {
		return { content: [{
			type: "text",
			text: getSkillWithDependencies(ctx, name, 2)
		}] };
	} catch {
		return {
			content: [{
				type: "text",
				text: `Lỗi: Kỹ năng "${name}" không tồn tại trong kho.`
			}],
			isError: true
		};
	}
}
async function handleLearn(args) {
	const { name, content } = LearnSkillSchema.parse(args);
	try {
		await saveSkill(ctx, name, content);
		return { content: [{
			type: "text",
			text: `Đã lưu thành công kỹ năng "${name}" vào registry. Hãy kiểm tra lại bằng autoskills_get nếu cần.`
		}] };
	} catch (err) {
		return {
			content: [{
				type: "text",
				text: `Lỗi khi lưu kỹ năng: ${err instanceof Error ? err.message : String(err)}`
			}],
			isError: true
		};
	}
}
async function handleSemanticSearch(args) {
	const { query, threshold = .5 } = SemanticSearchSchema.parse(args);
	try {
		const results = await searchSemantic(ctx, query, threshold);
		if (results.length === 0) return { content: [{
			type: "text",
			text: `Không tìm thấy kỹ năng nào phù hợp về mặt ý nghĩa với query "${query}". Hãy thử dùng autoskills_search với từ khóa (TF-IDF).`
		}] };
		return { content: [{
			type: "text",
			text: `Tìm kiếm Semantic Search cho "${query}":\n\n${results.map((r) => `- **${r.name}** (Cosine similarity: ${r.score.toFixed(3)})`).join("\n")}\n\nDùng công cụ autoskills_get để đọc nội dung chi tiết.`
		}] };
	} catch (err) {
		return {
			content: [{
				type: "text",
				text: `Lỗi khi thực hiện Semantic Search: ${err instanceof Error ? err.message : String(err)}`
			}],
			isError: true
		};
	}
}
async function handleInjectContext(args) {
	const { projectDir = process.cwd() } = InjectContextSchema.parse(args);
	try {
		const profile = analyzeProject(projectDir);
		const query = `${profile.language} ${profile.frameworks.join(" ")} ${profile.tools.join(" ")}`.trim();
		if (!query || query === "unknown") return { content: [{
			type: "text",
			text: `Không nhận diện được công nghệ cụ thể nào trong dự án tại ${projectDir}.`
		}] };
		const topResults = (await searchSemantic(ctx, query, .1)).slice(0, 2);
		if (topResults.length === 0) return { content: [{
			type: "text",
			text: `Phân tích dự án: ${query}.\nKhông tìm thấy kỹ năng nào trong registry phù hợp.`
		}] };
		const contents = topResults.map((r) => {
			try {
				return getSkillWithDependencies(ctx, r.name, 1);
			} catch {
				return `Lỗi: Không thể đọc file kỹ năng ${r.name}`;
			}
		});
		return { content: [{
			type: "text",
			text: `Phân tích dự án thành công: [${query}].\n\nĐã bơm ngữ cảnh ${topResults.length} kỹ năng liên quan nhất:\n\n` + contents.map((c, i) => `--- BẮT ĐẦU SKILL: ${topResults[i].name} (Độ phù hợp: ${topResults[i].score.toFixed(2)}) ---\n${c}\n--- KẾT THÚC SKILL ---`).join("\n\n")
		}] };
	} catch (err) {
		return {
			content: [{
				type: "text",
				text: `Lỗi khi bơm ngữ cảnh: ${err instanceof Error ? err.message : String(err)}`
			}],
			isError: true
		};
	}
}
server.setRequestHandler(CallToolRequestSchema, async (request) => {
	try {
		const name = request.params.name;
		const args = request.params.arguments;
		switch (name) {
			case "autoskills_list": return await handleList();
			case "autoskills_search": return await handleSearch(args);
			case "autoskills_get": return await handleGet(args);
			case "autoskills_learn": return await handleLearn(args);
			case "autoskills_semantic_search": return await handleSemanticSearch(args);
			case "autoskills_inject_context": return await handleInjectContext(args);
			default: throw new Error(`Tool không được hỗ trợ: ${name}`);
		}
	} catch (error) {
		return {
			content: [{
				type: "text",
				text: `Đã xảy ra lỗi: ${error instanceof Error ? error.message : String(error)}`
			}],
			isError: true
		};
	}
});
async function main() {
	const transport = new StdioServerTransport();
	await server.connect(transport);
	console.error("ai-skills MCP Server is running on stdio");
}
main().catch((err) => {
	console.error("Fatal error running MCP Server:", err);
	process.exit(1);
});
//#endregion
export {};
