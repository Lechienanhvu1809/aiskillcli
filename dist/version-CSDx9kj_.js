import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "@xenova/transformers";
import os from "node:os";
//#region src/policies/git-sync.ts
/**
* Business Rule: Git sync cho skill registry.
* Transparent — lỗi git không làm crash CLI, chỉ silently fail.
* Trả về boolean để caller biết có sync thành công không.
*/
function isGitRepo(ctx) {
	return fs.existsSync(path.join(ctx.skillsDir, ".git"));
}
function runGit(ctx, args) {
	try {
		if (!isGitRepo(ctx)) return false;
		execFileSync("git", args, {
			cwd: ctx.skillsDir,
			stdio: "ignore",
			timeout: 15e3,
			env: {
				...process.env,
				GIT_TERMINAL_PROMPT: "0"
			}
		});
		return true;
	} catch (err) {
		if (args.includes("--rebase")) try {
			execFileSync("git", ["rebase", "--abort"], {
				cwd: ctx.skillsDir,
				stdio: "ignore"
			});
		} catch {}
		return false;
	}
}
/** Pull về từ remote trước khi đọc */
function syncPull(ctx) {
	return runGit(ctx, [
		"pull",
		"origin",
		"main",
		"--rebase"
	]);
}
/** Commit và push sau khi ghi */
function syncPush(ctx, message) {
	const added = runGit(ctx, ["add", "."]);
	const committed = runGit(ctx, [
		"commit",
		"-m",
		message
	]);
	const pushed = runGit(ctx, [
		"push",
		"origin",
		"main"
	]);
	return added && committed && pushed;
}
/** Khởi tạo git repo và link với remote */
function initSync(ctx, remoteUrl) {
	const safeUrl = remoteUrl.replace(/https?:\/\/[^@]+@/, "https://***@");
	try {
		if (!isGitRepo(ctx)) {
			execFileSync("git", ["init"], {
				cwd: ctx.skillsDir,
				stdio: "ignore"
			});
			try {
				execFileSync("git", [
					"commit",
					"--allow-empty",
					"-m",
					"Initial commit"
				], {
					cwd: ctx.skillsDir,
					stdio: "ignore"
				});
			} catch {}
		}
		try {
			execFileSync("git", [
				"remote",
				"set-url",
				"origin",
				remoteUrl
			], {
				cwd: ctx.skillsDir,
				stdio: "ignore"
			});
		} catch {
			try {
				execFileSync("git", [
					"remote",
					"add",
					"origin",
					remoteUrl
				], {
					cwd: ctx.skillsDir,
					stdio: "ignore"
				});
			} catch {}
		}
		execFileSync("git", [
			"branch",
			"-M",
			"main"
		], {
			cwd: ctx.skillsDir,
			stdio: "ignore"
		});
		try {
			execFileSync("git", [
				"push",
				"-u",
				"origin",
				"main"
			], {
				cwd: ctx.skillsDir,
				stdio: "ignore",
				timeout: 15e3,
				env: {
					...process.env,
					GIT_TERMINAL_PROMPT: "0"
				}
			});
			return {
				ok: true,
				message: `Thiết lập Git Sync thành công với remote: ${safeUrl}`
			};
		} catch {
			return {
				ok: false,
				message: `Thiết lập thất bại (push bị từ chối). Repo ${safeUrl} có thể đã chứa dữ liệu, hãy clone thủ công hoặc kiểm tra quyền truy cập.`
			};
		}
	} catch (err) {
		return {
			ok: false,
			message: `Lỗi khi thiết lập Git: ${err instanceof Error ? err.message : String(err)}`
		};
	}
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
/**
* Thêm tags vào frontmatter của nội dung markdown.
* Nếu chưa có frontmatter, sẽ tạo mới.
* Nếu đã có tags, sẽ thay thế bằng tags mới.
*/
function injectTags(content, tags) {
	if (tags.length === 0) return content;
	const tagsStr = `tags: [${tags.join(", ")}]`;
	const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
	if (match) {
		const lines = match[1].split("\n").filter((line) => !line.trim().startsWith("tags:"));
		lines.push(tagsStr);
		const newFrontmatter = `---\n${lines.join("\n")}\n---`;
		return content.replace(/^---\s*\n([\s\S]*?)\n---/, newFrontmatter);
	} else return `---\n${tagsStr}\n---\n\n${content}`;
}
/**
* Lấy danh sách tags hiện tại từ content.
*/
function getTags(content) {
	return parseFrontmatter(content).tags ?? [];
}
/**
* Xóa một tag khỏi frontmatter.
* Trả về content mới và boolean cho biết tag có tồn tại hay không.
*/
function removeTag(content, tag) {
	const current = getTags(content);
	const lower = tag.toLowerCase();
	const next = current.filter((t) => t.toLowerCase() !== lower);
	if (next.length === current.length) return {
		content,
		removed: false
	};
	return {
		content: injectTags(content, next),
		removed: true
	};
}
/**
* Đổi tên một tag trong frontmatter.
* Trả về content mới và boolean cho biết tag có tồn tại hay không.
*/
function renameTag(content, oldTag, newTag) {
	const current = getTags(content);
	const lower = oldTag.toLowerCase();
	let renamed = false;
	const next = current.map((t) => {
		if (t.toLowerCase() === lower) {
			renamed = true;
			return newTag;
		}
		return t;
	});
	if (!renamed) return {
		content,
		renamed: false
	};
	return {
		content: injectTags(content, next),
		renamed: true
	};
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
	return text.toLowerCase().replace(/[^\p{L}0-9-]/gu, " ").split(/\s+/).filter((w) => w.length > 1 && !STOPWORDS.has(w));
}
/** Tính Levenshtein distance giữa 2 string */
function levenshtein(a, b) {
	const la = a.length;
	const lb = b.length;
	if (la === 0) return lb;
	if (lb === 0) return la;
	let prev = Array.from({ length: lb + 1 }, (_, i) => i);
	let curr = new Array(lb + 1);
	for (let i = 1; i <= la; i++) {
		curr[0] = i;
		for (let j = 1; j <= lb; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
		}
		[prev, curr] = [curr, prev];
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
	for (const [name, content] of docs) docTokensList.push({
		name,
		tokens: tokenize(`${name} ${content}`),
		content
	});
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
//#region src/policies/semantic-search.ts
const MODEL_ID = "Xenova/all-MiniLM-L6-v2";
var VectorDatabase = class {
	static pipelineInstance = null;
	static async getPipeline() {
		if (!this.pipelineInstance) this.pipelineInstance = await pipeline("feature-extraction", MODEL_ID, { quantized: true });
		return this.pipelineInstance;
	}
};
/**
* Tạo vector 384 chiều từ văn bản
*/
async function embedText(text) {
	const output = await (await VectorDatabase.getPipeline())(text, {
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
* Lưu 1 vector của skill vào đĩa
*/
function saveVector(ctx, skillName, vector) {
	const vectors = loadVectors(ctx);
	vectors[skillName] = vector;
	const dbPath = getVectorDbPath(ctx);
	fs.writeFileSync(dbPath, JSON.stringify(vectors, null, 2), "utf8");
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
/** Kiểm tra skill có tồn tại không */
function skillExists(ctx, name) {
	return fs.existsSync(skillPath(ctx, name));
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
/** Đọc skill và tự động đệ quy lấy các skill phụ thuộc (Knowledge Graph traversal) */
function getSkillWithDependencies(ctx, name, maxDepth = 2, visited = /* @__PURE__ */ new Set()) {
	if (visited.has(name)) return "";
	visited.add(name);
	const content = getSkill(ctx, name);
	const frontmatter = parseFrontmatter(content);
	let dependenciesContent = "";
	if (frontmatter.requires && frontmatter.requires.length > 0 && maxDepth > 0) {
		for (const dep of frontmatter.requires) if (!visited.has(dep)) try {
			const depContent = getSkillWithDependencies(ctx, dep, maxDepth - 1, visited);
			if (depContent) dependenciesContent += `\n\n--- BẮT ĐẦU ĐIỀU KIỆN TIÊN QUYẾT: ${dep} ---\n${depContent}\n--- KẾT THÚC ĐIỀU KIỆN TIÊN QUYẾT: ${dep} ---\n\n`;
		} catch {}
	}
	return (dependenciesContent + content).trim();
}
/** Thêm skill từ file có sẵn */
function addSkill(ctx, name, sourcePath, opts = {}) {
	ensureSkillsDir(ctx);
	const absoluteSource = path.resolve(process.cwd(), sourcePath);
	if (!fs.existsSync(absoluteSource)) throw new SkillRegistryError(`Không tìm thấy file nguồn tại "${absoluteSource}".`, "SOURCE_NOT_FOUND");
	const dest = skillPath(ctx, name);
	if (fs.existsSync(dest) && !opts.overwrite) throw new SkillRegistryError(`Skill "${name}" đã tồn tại. Dùng --force để ghi đè.`, "ALREADY_EXISTS");
	try {
		if (opts.tags && opts.tags.length > 0) {
			const updatedContent = injectTags(fs.readFileSync(absoluteSource, "utf8"), opts.tags);
			fs.writeFileSync(dest, updatedContent, "utf8");
		} else fs.copyFileSync(absoluteSource, dest);
	} catch (err) {
		throw new SkillRegistryError(`Lỗi khi sao chép file: ${err instanceof Error ? err.message : String(err)}`, "IO_ERROR");
	}
}
/** Xóa một skill */
function removeSkill(ctx, name) {
	const p = skillPath(ctx, name);
	if (!fs.existsSync(p)) throw new SkillRegistryError(`Không tìm thấy skill "${name}".`, "NOT_FOUND");
	try {
		fs.unlinkSync(p);
	} catch (err) {
		throw new SkillRegistryError(`Lỗi khi xóa file: ${err instanceof Error ? err.message : String(err)}`, "IO_ERROR");
	}
}
/** Tìm kiếm skills theo từ khóa */
function searchSkills(ctx, keyword, tag) {
	ensureSkillsDir(ctx);
	const lowerKw = keyword.toLowerCase();
	const lowerTag = tag?.toLowerCase();
	const files = fs.readdirSync(ctx.skillsDir).filter((f) => f.endsWith(".md"));
	const results = [];
	for (const file of files) {
		const name = file.replace(/\.md$/, "");
		const content = fs.readFileSync(path.join(ctx.skillsDir, file), "utf8");
		if (lowerTag) {
			if (!(parseFrontmatter(content).tags ?? []).map((t) => t.toLowerCase()).includes(lowerTag)) continue;
		}
		const matchedInName = name.toLowerCase().includes(lowerKw);
		const matchedInContent = content.toLowerCase().includes(lowerKw);
		if (matchedInName || matchedInContent) results.push({
			name,
			matchedInName,
			matchedInContent
		});
	}
	return results;
}
/** 
* Lưu skill mới hoặc ghi đè, tự động cập nhật vector và push git 
*/
async function saveSkill(ctx, name, content) {
	ensureSkillsDir(ctx);
	const p = skillPath(ctx, name);
	fs.writeFileSync(p, content, "utf8");
	try {
		saveVector(ctx, name, await embedText(content));
	} catch (err) {}
	syncPush(ctx, `Auto-sync: Save skill ${name} via AI learning`);
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
//#region src/version.ts
/** Single source of truth cho CLI version — đồng bộ với package.json */
const CLI_VERSION = "1.3.0";
//#endregion
export { syncPush as C, syncPull as S, injectTags as _, ensureSkillsDir as a, renameTag as b, listSkills as c, searchSkills as d, searchSkillsSemantic as f, getTags as g, searchSemantic as h, addSkill as i, removeSkill as l, skillPath as m, createCliContext as n, getSkill as o, skillExists as p, analyzeProject as r, getSkillWithDependencies as s, CLI_VERSION as t, saveSkill as u, parseFrontmatter as v, initSync as x, removeTag as y };
