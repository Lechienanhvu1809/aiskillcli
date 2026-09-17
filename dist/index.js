import { program } from "commander";
import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import crypto from "node:crypto";
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
			stdio: "ignore"
		});
		return true;
	} catch {
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
				stdio: "ignore"
			});
			return {
				ok: true,
				message: "Thiết lập Git Sync thành công!"
			};
		} catch {
			return {
				ok: true,
				message: "Git Sync đã thiết lập cục bộ, nhưng chưa push được. Hãy đảm bảo repo đã được tạo trên GitHub."
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
//#region src/policies/name-validation.ts
/**
* Business Rule: Validate và sanitize tên skill.
* Chặn path traversal, ký tự đặc biệt, tên quá dài.
* Trả về tên đã clean hoặc throw SkillValidationError.
*/
var SkillValidationError = class extends Error {
	constructor(message) {
		super(message);
		this.name = "SkillValidationError";
	}
};
const MAX_SKILL_NAME_LENGTH = 100;
const VALID_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;
/**
* Validate và normalize tên skill.
* - Loại bỏ extension .md nếu có
* - Reject path traversal (../ hoặc /)
* - Reject ký tự đặc biệt
* - Reject tên quá dài hoặc quá ngắn
*/
function validateSkillName(rawName) {
	if (!rawName || typeof rawName !== "string") throw new SkillValidationError("Tên skill không được để trống.");
	const withoutExt = rawName.replace(/\.md$/i, "");
	if (withoutExt.includes("/") || withoutExt.includes("\\")) throw new SkillValidationError(`Tên skill không được chứa dấu "/" hoặc "\\". Nhận được: "${rawName}"`);
	const basename = path.basename(withoutExt);
	if (basename !== withoutExt) throw new SkillValidationError(`Tên skill không hợp lệ (phát hiện path traversal): "${rawName}"`);
	if (basename.length === 0) throw new SkillValidationError("Tên skill không được để trống sau khi xử lý.");
	if (basename.length > MAX_SKILL_NAME_LENGTH) throw new SkillValidationError(`Tên skill quá dài (tối đa ${MAX_SKILL_NAME_LENGTH} ký tự). Nhận được: ${basename.length} ký tự.`);
	if (!VALID_NAME_PATTERN.test(basename)) throw new SkillValidationError(`Tên skill chỉ được chứa chữ cái (a-z, A-Z), số (0-9), gạch ngang (-), gạch dưới (_). Nhận được: "${basename}"`);
	return basename;
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
			if (key === "tags") {
				let cleaned = valueStr;
				if (cleaned.startsWith("[") && cleaned.endsWith("]")) cleaned = cleaned.slice(1, -1);
				result.tags = cleaned.split(",").map((t) => t.trim()).filter(Boolean);
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
//#region src/utils/output.ts
/** Các color helpers cho terminal output */
const c = {
	ok: pc.green,
	warn: pc.yellow,
	err: pc.red,
	dim: pc.dim,
	bold: pc.bold,
	cmd: (s) => pc.bold(pc.cyan(s)),
	accent: (s) => pc.bold(pc.yellow(s))
};
/** In thông báo lỗi và exit với code 1 */
function fatal(message) {
	console.error(`${c.err("✗")} ${message}`);
	process.exit(1);
}
/** In thông báo thành công */
function success(message) {
	console.log(`${c.ok("✓")} ${message}`);
}
/** In thông báo cảnh báo */
function warn(message) {
	console.warn(`${c.warn("⚠")} ${message}`);
}
/** In thông tin */
function info(message) {
	console.log(`${c.dim("ℹ")} ${message}`);
}
/** Handle SkillValidationError và SkillRegistryError, gọi fatal cho cả hai */
function handleError(err) {
	if (err instanceof Error) fatal(err.message);
	fatal(String(err));
}
//#endregion
//#region src/commands/add.ts
function runAdd(ctx, rawName, filePath, opts) {
	try {
		const name = validateSkillName(rawName);
		if (skillExists(ctx, name) && !opts.force) {
			warn(`Skill "${name}" đã tồn tại. Dùng --force để ghi đè.`);
			process.exit(1);
		}
		if (skillExists(ctx, name) && opts.force) warn(`Đang ghi đè skill "${name}"...`);
		addSkill(ctx, name, filePath, {
			overwrite: opts.force,
			tags: opts.tags
		});
		success(`Đã thêm kỹ năng "${name}" vào kho lưu trữ!`);
		syncPush(ctx, `Auto-sync: Add skill ${name}`);
	} catch (err) {
		handleError(err);
	}
}
//#endregion
//#region src/commands/apply.ts
function runApply(ctx, rawName) {
	try {
		const name = validateSkillName(rawName);
		const sourcePath = skillPath(ctx, name);
		if (!fs.existsSync(sourcePath)) handleError(/* @__PURE__ */ new Error(`Không tìm thấy kỹ năng "${name}" trong kho tổng.`));
		const targetDir = path.join(process.cwd(), ".agents", "skills", name);
		const targetPath = path.join(targetDir, "SKILL.md");
		fs.mkdirSync(targetDir, { recursive: true });
		if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
		let method = "Copy";
		try {
			fs.symlinkSync(sourcePath, targetPath, "file");
			method = "Symlink";
		} catch {
			try {
				fs.linkSync(sourcePath, targetPath);
				method = "Hardlink";
			} catch {
				fs.copyFileSync(sourcePath, targetPath);
				method = "Copy";
			}
		}
		success(`Đã apply kỹ năng "${name}" vào dự án! (phương thức: ${method})`);
		info(`Đường dẫn: ${targetPath}`);
	} catch (err) {
		handleError(err);
	}
}
//#endregion
//#region src/policies/templates.ts
function frontmatter(name, description, tags) {
	return `---\nname: ${name}\ndescription: ${description}${tags && tags.length > 0 ? `\ntags: [${tags.join(", ")}]` : ""}\n---`;
}
/** Tất cả templates có sẵn, sắp xếp theo thứ tự ưu tiên */
const TEMPLATES = [
	{
		id: "coding-guide",
		label: "Coding Guide",
		description: "Hướng dẫn coding chuẩn — rules, examples, anti-patterns",
		generate(name, description, tags) {
			return `${frontmatter(name, description, tags)}

# ${name}

${description}

## When to Use

- Describe the situations where this skill should be activated.

## Rules

1. Rule one — explain clearly.
2. Rule two — provide rationale.
3. Rule three — include edge cases.

## Examples

### Good ✅

\`\`\`typescript
// Example of correct usage
\`\`\`

### Bad ❌

\`\`\`typescript
// Example of what to avoid
\`\`\`

## Anti-Patterns

- Describe common mistakes and why they are problematic.
`;
		}
	},
	{
		id: "bash-automation",
		label: "Bash Automation",
		description: "Script tự động hóa với bash hook có thể thực thi",
		generate(name, description, tags) {
			return `${frontmatter(name, description, tags)}

# ${name}

${description}

## Prerequisites

- List any tools or dependencies required.

## What This Does

Describe what the automation script accomplishes.

## Usage

Run this skill with:

\`\`\`
ai-skills run ${name}
\`\`\`

\`\`\`bash hook
#!/bin/bash
# ${description}
echo "Running ${name}..."

# Add your automation commands here

echo "Done!"
\`\`\`

## Notes

- Add any important notes or caveats here.
`;
		}
	},
	{
		id: "checklist",
		label: "Checklist",
		description: "Danh sách kiểm tra — pre-launch, code review, deployment",
		generate(name, description, tags) {
			return `${frontmatter(name, description, tags)}

# ${name}

${description}

## Pre-Check

- [ ] Item one — verify before starting.
- [ ] Item two — confirm prerequisites.
- [ ] Item three — check dependencies.

## Main Checklist

- [ ] Step 1 — describe the action.
- [ ] Step 2 — describe the action.
- [ ] Step 3 — describe the action.
- [ ] Step 4 — describe the action.
- [ ] Step 5 — describe the action.

## Post-Check

- [ ] Verify the outcome.
- [ ] Document any issues found.
- [ ] Notify stakeholders if needed.

## Rollback Plan

If something goes wrong:

1. Step to revert changes.
2. Step to restore previous state.
3. Step to notify the team.
`;
		}
	},
	{
		id: "blank",
		label: "Blank",
		description: "Template trống — chỉ có frontmatter cơ bản",
		generate(name, description, tags) {
			return `${frontmatter(name, description, tags)}

# ${name}

${description}
`;
		}
	}
];
/** Tìm template theo ID. Trả về undefined nếu không tìm thấy. */
function getTemplate(id) {
	return TEMPLATES.find((t) => t.id === id);
}
/** Liệt kê tất cả template IDs */
function listTemplates() {
	return [...TEMPLATES];
}
//#endregion
//#region src/commands/create.ts
function runCreate(ctx, rawName, opts) {
	try {
		if (opts.listTemplates) {
			const templates = listTemplates();
			console.log(c.bold(`Templates có sẵn (${templates.length}):\n`));
			for (const t of templates) {
				const isDefault = t.id === "coding-guide" ? c.dim(" (mặc định)") : "";
				console.log(`  ${c.ok("•")} ${c.accent(t.id)}${isDefault}`);
				console.log(`    ${c.dim(t.description)}`);
			}
			return;
		}
		if (!rawName) handleError(/* @__PURE__ */ new Error("Vui lòng cung cấp tên skill. Ví dụ: ai-skills create my-skill"));
		const name = validateSkillName(rawName);
		if (skillExists(ctx, name) && !opts.force) {
			warn(`Skill "${name}" đã tồn tại. Dùng --force để ghi đè.`);
			process.exit(1);
		}
		if (skillExists(ctx, name) && opts.force) warn(`Đang ghi đè skill "${name}"...`);
		const templateId = opts.template ?? "coding-guide";
		const template = getTemplate(templateId);
		if (!template) {
			const available = listTemplates().map((t) => t.id).join(", ");
			handleError(/* @__PURE__ */ new Error(`Template "${templateId}" không tồn tại. Các template có sẵn: ${available}`));
		}
		const description = opts.description ?? `Kỹ năng ${name}`;
		const content = template.generate(name, description, opts.tags);
		ensureSkillsDir(ctx);
		fs.writeFileSync(skillPath(ctx, name), content, "utf8");
		success(`Đã tạo kỹ năng "${name}" từ template "${template.id}"!`);
		info(`Đường dẫn: ${skillPath(ctx, name)}`);
		info(`Chỉnh sửa file và thêm nội dung phù hợp với dự án của bạn.`);
		syncPush(ctx, `Auto-sync: Create skill ${name}`);
	} catch (err) {
		handleError(err);
	}
}
//#endregion
//#region src/policies/registry-fetcher.ts
const MANIFEST_URL = `https://registry.autoskills.sh/manifest.json`;
var FetchError = class extends Error {
	code;
	constructor(message, code) {
		super(message);
		this.code = code;
		this.name = "FetchError";
	}
};
/** Verify SHA-256 của một string content */
function verifySha256(content, expectedHash) {
	return crypto.createHash("sha256").update(content, "utf8").digest("hex") === expectedHash;
}
/** Parse và validate manifest JSON */
function parseManifest(raw) {
	let parsed;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw new FetchError("Manifest không hợp lệ (JSON parse lỗi).", "INVALID_MANIFEST");
	}
	if (typeof parsed !== "object" || parsed === null || typeof parsed.version !== "number" || typeof parsed.skills !== "object") throw new FetchError("Manifest thiếu trường bắt buộc (version, skills).", "INVALID_MANIFEST");
	const manifest = parsed;
	if (manifest.version > 2) throw new FetchError(`Manifest version ${manifest.version} chưa được hỗ trợ. Hãy cập nhật ai-skill-cli.`, "UNSUPPORTED_VERSION");
	return manifest;
}
/**
* Fetch và parse manifest từ registry.
* Có thể truyền custom manifestUrl để test.
*/
async function fetchManifest(manifestUrl = MANIFEST_URL) {
	let raw;
	try {
		const res = await fetch(manifestUrl);
		if (!res.ok) throw new FetchError(`Lỗi kết nối registry (HTTP ${res.status}): ${manifestUrl}`, "NETWORK_ERROR");
		raw = await res.text();
	} catch (err) {
		if (err instanceof FetchError) throw err;
		throw new FetchError(`Không thể kết nối registry: ${err instanceof Error ? err.message : String(err)}`, "NETWORK_ERROR");
	}
	return parseManifest(raw);
}
/**
* Tìm một skill entry trong manifest theo tên (case-insensitive).
*/
function findSkillInManifest(manifest, name) {
	const lower = name.toLowerCase();
	if (manifest.skills[name]) return manifest.skills[name];
	return Object.values(manifest.skills).find((s) => s.name.toLowerCase() === lower);
}
/**
* Tìm tất cả skills thuộc một bundle (source).
*/
function findSkillsByBundle(manifest, bundleId) {
	const lower = bundleId.toLowerCase();
	return Object.values(manifest.skills).filter((s) => s.source.toLowerCase() === lower);
}
/**
* Download content của một skill, verify hash.
* Throws FetchError nếu network lỗi hoặc hash không khớp.
*/
async function downloadSkill(entry) {
	let content;
	try {
		const res = await fetch(entry.url);
		if (!res.ok) throw new FetchError(`Không thể tải skill "${entry.name}" (HTTP ${res.status})`, "NETWORK_ERROR");
		content = await res.text();
	} catch (err) {
		if (err instanceof FetchError) throw err;
		throw new FetchError(`Lỗi network khi tải "${entry.name}": ${err instanceof Error ? err.message : String(err)}`, "NETWORK_ERROR");
	}
	if (!verifySha256(content, entry.hash)) throw new FetchError(`Hash mismatch cho skill "${entry.name}" — nội dung có thể đã bị thay đổi.`, "HASH_MISMATCH");
	return content;
}
/**
* Liệt kê tất cả skills trong manifest, sorted theo name.
*/
function listRemoteSkills(manifest) {
	return Object.values(manifest.skills).sort((a, b) => a.name.localeCompare(b.name));
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
//#region src/commands/fetch.ts
function printSkillEntry(entry, installed) {
	const status = installed ? c.ok("✓ installed") : c.dim("○ available");
	const desc = entry.description ? c.dim(` — ${entry.description}`) : "";
	console.log(`  ${status}  ${c.accent(entry.name)}${desc}`);
	console.log(`            ${c.dim(`source: ${entry.source}`)}`);
}
async function writeSkill(ctx, entry, force) {
	if (skillExists(ctx, entry.name) && !force) {
		console.log(`  ${c.warn("⚠")}  ${entry.name} ${c.dim("đã tồn tại — dùng --force để ghi đè")}`);
		return false;
	}
	process.stdout.write(`  ${c.dim("↓")}  Đang tải ${c.accent(entry.name)}...`);
	const content = await downloadSkill(entry);
	fs.mkdirSync(path.dirname(skillPath(ctx, entry.name)), { recursive: true });
	fs.writeFileSync(skillPath(ctx, entry.name), content, "utf8");
	process.stdout.write(` ${c.ok("✓")}\n`);
	return true;
}
async function runFetch(ctx, name, opts = {}) {
	if (opts.list) {
		console.log(`\n${c.bold("Skills trong autoskills registry:")}\n`);
		let manifest;
		try {
			manifest = await fetchManifest();
		} catch (err) {
			fatal(err instanceof FetchError ? err.message : String(err));
		}
		const entries = listRemoteSkills(manifest);
		for (const e of entries) printSkillEntry(e, skillExists(ctx, e.name));
		console.log(`\n${c.dim(`Tổng: ${entries.length} skills`)}`);
		return;
	}
	console.log(`\n${c.dim("Đang kết nối autoskills registry...")}`);
	let manifest;
	try {
		manifest = await fetchManifest();
	} catch (err) {
		fatal(err instanceof FetchError ? err.message : String(err));
		return;
	}
	console.log(`${c.ok("✓")} Kết nối thành công (${Object.keys(manifest.skills).length} skills có sẵn)\n`);
	if (opts.auto) {
		const profile = analyzeProject(process.cwd());
		const keywords = [
			profile.language,
			...profile.frameworks,
			...profile.tools
		].filter(Boolean);
		console.log(`${c.bold("Dự án hiện tại:")} ${profile.name} (${profile.language})`);
		console.log(`${c.dim("Tech stack:")} ${keywords.join(", ") || "unknown"}\n`);
		const matched = listRemoteSkills(manifest).filter((e) => {
			const searchStr = `${e.name} ${e.description ?? ""} ${e.source}`.toLowerCase();
			return keywords.some((kw) => searchStr.includes(kw.toLowerCase()));
		});
		if (matched.length === 0) {
			console.log(c.dim("Không tìm thấy skill phù hợp với tech stack của dự án."));
			return;
		}
		console.log(`${c.bold(`Tìm thấy ${matched.length} skill phù hợp:`)}\n`);
		let installed = 0;
		for (const entry of matched) if (await writeSkill(ctx, entry, opts.force ?? false)) installed++;
		console.log(`\n${c.ok("✓")} Đã cài ${installed}/${matched.length} skills.`);
		return;
	}
	if (opts.from) {
		const entries = findSkillsByBundle(manifest, opts.from);
		if (entries.length === 0) {
			fatal(`Không tìm thấy bundle "${opts.from}" trong registry.`);
			return;
		}
		console.log(`${c.bold(`Bundle "${opts.from}":`)} ${entries.length} skills\n`);
		let installed = 0;
		for (const entry of entries) if (await writeSkill(ctx, entry, opts.force ?? false)) installed++;
		console.log(`\n${c.ok("✓")} Đã cài ${installed}/${entries.length} skills từ "${opts.from}".`);
		return;
	}
	if (!name) {
		fatal("Cần truyền tên skill, --from <bundle>, hoặc --auto.\nVí dụ: ai-skills fetch bash-defensive-patterns");
		return;
	}
	const entry = findSkillInManifest(manifest, name);
	if (!entry) {
		fatal(`Không tìm thấy skill "${name}" trong registry.\nChạy ${c.accent("ai-skills fetch --list")} để xem danh sách.`);
		return;
	}
	if (await writeSkill(ctx, entry, opts.force ?? false)) {
		console.log(`\n${c.ok("✓")} Skill "${entry.name}" đã được thêm vào kho local.`);
		console.log(c.dim(`   Dùng ${c.accent(`ai-skills apply ${entry.name}`)} để nhúng vào dự án.`));
	}
}
//#endregion
//#region src/commands/get.ts
function runGet(ctx, rawName) {
	try {
		const name = validateSkillName(rawName);
		syncPull(ctx);
		const content = getSkill(ctx, name);
		console.log(content);
	} catch (err) {
		handleError(err);
	}
}
//#endregion
//#region src/commands/init-sync.ts
function runInitSync(ctx, url) {
	info(`Đang thiết lập Git Sync với repo: ${url}...`);
	const result = initSync(ctx, url);
	if (result.ok) {
		success(result.message);
		info("Từ giờ mọi thay đổi sẽ tự động đồng bộ ngầm.");
	} else warn(result.message);
}
//#endregion
//#region src/commands/list.ts
function runList(ctx) {
	syncPull(ctx);
	const skills = listSkills(ctx);
	if (skills.length === 0) {
		console.log(c.dim("Kho kỹ năng đang trống. Thêm kỹ năng bằng: ai-skills add <tên> <đường_dẫn_file>"));
		return;
	}
	console.log(c.bold(`Danh sách kỹ năng (${skills.length}):`));
	for (const skill of skills) console.log(`  ${c.ok("•")} ${skill.name}`);
}
//#endregion
//#region src/policies/recommender.ts
/** Kiểm tra keyword xuất hiện trong name, content, hoặc description */
function matchesAny(keyword, ...sources) {
	return sources.some((s) => s.includes(keyword));
}
/** Tính điểm từ frameworks và tools */
function matchKeywords(profile, lowerName, lowerContent, description, tags) {
	let score = 0;
	const reasons = [];
	for (const fw of profile.frameworks) if (matchesAny(fw, lowerContent, lowerName, description, ...tags)) {
		score += 3;
		reasons.push(`Phù hợp với framework "${fw}"`);
	}
	for (const tool of profile.tools) if (matchesAny(tool, lowerContent, lowerName, description, ...tags)) {
		score += 2;
		reasons.push(`Liên quan đến tool "${tool}"`);
	}
	if (matchesAny(profile.language, lowerContent, lowerName, description, ...tags)) {
		score += 2;
		reasons.push(`Phù hợp với ngôn ngữ "${profile.language}"`);
	}
	return {
		score,
		reasons
	};
}
/** Tính điểm contextual (tests, CI, Docker) */
function matchContextual(profile, lowerName, lowerContent) {
	let score = 0;
	const reasons = [];
	if (profile.hasTests && matchesAny("test", lowerContent, lowerName)) {
		score += 1;
		reasons.push("Dự án có tests — skill liên quan đến testing");
	}
	if (profile.hasCi && (lowerContent.includes("ci") || lowerContent.includes("deploy"))) {
		score += 1;
		reasons.push("Dự án có CI/CD — skill liên quan đến automation");
	}
	if (profile.hasDocker && (lowerContent.includes("docker") || lowerContent.includes("container"))) {
		score += 1;
		reasons.push("Dự án dùng Docker — skill liên quan đến containerization");
	}
	return {
		score,
		reasons
	};
}
/** Tính relevance score giữa skill content và project profile */
function computeRelevance(skillName, content, profile) {
	const lowerContent = content.toLowerCase();
	const lowerName = skillName.toLowerCase();
	const frontmatter = parseFrontmatter(content);
	const keywords = matchKeywords(profile, lowerName, lowerContent, frontmatter.description?.toLowerCase() ?? "", (frontmatter.tags ?? []).map((t) => t.toLowerCase()));
	const contextual = matchContextual(profile, lowerName, lowerContent);
	return {
		score: keywords.score + contextual.score,
		reasons: [...keywords.reasons, ...contextual.reasons]
	};
}
/** Chuyển score thành confidence level */
function scoreToConfidence(score) {
	if (score >= 5) return "high";
	if (score >= 2) return "medium";
	return "low";
}
/**
* Gợi ý skills phù hợp với project profile.
* Đọc nội dung từng skill, so sánh với profile, trả về top matches.
* @param maxResults Số kết quả tối đa trả về (mặc định 5)
*/
function recommendSkills(profile, availableSkills, maxResults = 5) {
	const recommendations = [];
	for (const skill of availableSkills) {
		let content;
		try {
			content = fs.readFileSync(skill.path, "utf8");
		} catch {
			continue;
		}
		const { score, reasons } = computeRelevance(skill.name, content, profile);
		if (score <= 0 || reasons.length === 0) continue;
		recommendations.push({
			skillName: skill.name,
			reason: reasons.slice(0, 3).join("; "),
			confidence: scoreToConfidence(score),
			score
		});
	}
	recommendations.sort((a, b) => b.score - a.score);
	return recommendations.slice(0, maxResults);
}
//#endregion
//#region src/commands/recommend.ts
function runRecommend(ctx, opts) {
	syncPull(ctx);
	const profile = analyzeProject(opts.dir ?? process.cwd());
	console.log(c.bold("📁 Phân tích dự án:\n"));
	console.log(`  Tên:        ${c.accent(profile.name)}`);
	console.log(`  Ngôn ngữ:   ${profile.language}`);
	console.log(`  Frameworks: ${profile.frameworks.length > 0 ? profile.frameworks.join(", ") : c.dim("không phát hiện")}`);
	console.log(`  Tools:      ${profile.tools.length > 0 ? profile.tools.join(", ") : c.dim("không phát hiện")}`);
	console.log(`  Tests:      ${profile.hasTests ? c.ok("✓") : c.dim("✗")}`);
	console.log(`  CI/CD:      ${profile.hasCi ? c.ok("✓") : c.dim("✗")}`);
	console.log(`  Docker:     ${profile.hasDocker ? c.ok("✓") : c.dim("✗")}`);
	console.log();
	const skills = listSkills(ctx);
	if (skills.length === 0) {
		info("Kho kỹ năng đang trống. Thêm kỹ năng bằng: ai-skills add <tên> <file>");
		return;
	}
	const recommendations = recommendSkills(profile, skills);
	if (recommendations.length === 0) {
		info("Không tìm thấy kỹ năng phù hợp với dự án này.");
		info(`Kho hiện có ${skills.length} kỹ năng. Thử thêm skills liên quan đến ${profile.frameworks.join(", ") || profile.language}.`);
		return;
	}
	console.log(c.bold(`🎯 Gợi ý kỹ năng (${recommendations.length}):\n`));
	const confidenceIcon = {
		high: c.ok("★★★"),
		medium: c.warn("★★☆"),
		low: c.dim("★☆☆")
	};
	for (const rec of recommendations) {
		console.log(`  ${confidenceIcon[rec.confidence]} ${c.accent(rec.skillName)}`);
		console.log(`    ${c.dim(rec.reason)}`);
	}
	console.log();
	info(`Apply bằng: ai-skills apply <tên>`);
}
//#endregion
//#region src/commands/remove.ts
function runRemove(ctx, rawName) {
	try {
		const name = validateSkillName(rawName);
		removeSkill(ctx, name);
		success(`Đã xóa kỹ năng "${name}".`);
		syncPush(ctx, `Auto-sync: Remove skill ${name}`);
	} catch (err) {
		handleError(err);
	}
}
//#endregion
//#region src/commands/run.ts
/**
* Policy: Trích xuất và chạy bash script từ nội dung Markdown.
*
* ⚠️ BẢO MẬT: Lệnh này thực thi code tùy ý từ file Markdown.
* Chỉ chạy các skill từ nguồn đáng tin cậy.
* Trong tương lai nên sandbox bằng Docker hoặc deno.
*/
function extractBashHook(content) {
	return content.match(/```bash\s+(?:hook|pre-hook)[^\n]*\n([\s\S]*?)```/)?.[1]?.trim() ?? null;
}
function runRun(ctx, rawName) {
	try {
		const name = validateSkillName(rawName);
		let skillFilePath = path.join(process.cwd(), ".agents", "skills", name, "SKILL.md");
		if (!fs.existsSync(skillFilePath)) skillFilePath = skillPath(ctx, name);
		if (!fs.existsSync(skillFilePath)) handleError(/* @__PURE__ */ new Error(`Không tìm thấy kỹ năng "${name}".`));
		let scriptContent = extractBashHook(fs.readFileSync(skillFilePath, "utf8"));
		if (!scriptContent) {
			info(`Kỹ năng "${name}" không chứa khối mã \`\`\`bash để thực thi.`);
			return;
		}
		warn("Đang thực thi code từ file Markdown. Chỉ chạy các skill từ nguồn đáng tin cậy!");
		console.log(`\n🚀 Thực thi kỹ năng "${name}"...\n`);
		if (os.platform() === "win32") scriptContent = scriptContent.split("\n").filter((line) => !line.trim().startsWith("#")).join("\n");
		const output = execSync(scriptContent, {
			encoding: "utf8",
			stdio: "pipe"
		});
		console.log(output);
	} catch (err) {
		if (err instanceof Error && "stdout" in err) {
			const execErr = err;
			if (execErr.stdout) console.log(execErr.stdout);
			if (execErr.stderr) console.error(execErr.stderr);
			handleError(/* @__PURE__ */ new Error(`Lỗi khi thực thi: ${err.message}`));
		}
		handleError(err);
	}
}
//#endregion
//#region src/commands/search.ts
/** Hiển thị kết quả TF-IDF/fuzzy search */
function displaySemanticResults(results, keyword) {
	console.log(`Kết quả tìm kiếm thông minh cho ${c.accent(`"${keyword}"`)}: \n`);
	if (results.length === 0) {
		console.log(c.dim("Không tìm thấy kỹ năng nào khớp với từ khóa."));
		return;
	}
	for (const r of results) {
		const scoreBar = "█".repeat(Math.round(r.score * 10)).padEnd(10, "░");
		const scoreLabel = c.dim(`[${scoreBar}] ${(r.score * 100).toFixed(0)}%`);
		const typeLabel = r.matchType === "exact" ? c.ok("exact") : r.matchType === "fuzzy" ? c.warn("fuzzy") : c.dim("tfidf");
		console.log(`  ${c.ok("•")} ${r.name}  ${scoreLabel}  ${typeLabel}`);
		if (r.snippet) console.log(`    ${c.dim(r.snippet)}`);
	}
}
/** Hiển thị kết quả brute-force search */
function displayBruteForceResults(results, keyword) {
	console.log(`Kết quả tìm kiếm cho ${c.accent(`"${keyword}"`)}: \n`);
	if (results.length === 0) {
		console.log(c.dim("Không tìm thấy kỹ năng nào khớp với từ khóa."));
		return;
	}
	for (const r of results) {
		const tags = [];
		if (r.matchedInName) tags.push("tên");
		if (r.matchedInContent) tags.push("nội dung");
		console.log(`  ${c.ok("•")} ${r.name} ${c.dim(`(khớp trong: ${tags.join(", ")})`)}`);
	}
}
function runSearch(ctx, keyword, opts = {}) {
	syncPull(ctx);
	if (opts.semantic) displaySemanticResults(searchSkillsSemantic(ctx, keyword, opts.tag), keyword);
	else displayBruteForceResults(searchSkills(ctx, keyword, opts.tag), keyword);
}
//#endregion
//#region src/commands/stats.ts
function runStats(ctx) {
	try {
		const skills = listSkills(ctx);
		if (skills.length === 0) {
			console.log(c.dim("Kho kỹ năng trống. Hãy dùng lệnh `create` hoặc `add` để thêm."));
			return;
		}
		const tagCounts = /* @__PURE__ */ new Map();
		for (const skill of skills) {
			const tags = (parseFrontmatter(getSkill(ctx, skill.name)).tags ?? []).map((t) => t.toLowerCase());
			for (const tag of tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
		}
		success(`Thống kê kho kỹ năng:`);
		console.log(`  ${c.ok("•")} Tổng số kỹ năng: ${c.bold(skills.length)}`);
		if (tagCounts.size > 0) {
			console.log(`  ${c.ok("•")} Phân bố tags:`);
			const sortedTags = Array.from(tagCounts.entries()).sort((a, b) => b[1] - a[1]);
			for (const [tag, count] of sortedTags) console.log(`      - ${c.accent(tag)}: ${count}`);
		} else console.log(c.dim(`  (Không có tags nào được sử dụng)`));
	} catch (err) {
		handleError(err);
	}
}
//#endregion
//#region src/commands/tag.ts
/**
* Subcommand `tag` — quản lý tags của skills.
* Dùng như: ai-skills tag <action> [args...]
*/
function runTagAdd(ctx, skillName, tags) {
	if (tags.length === 0) {
		fatal("Cần ít nhất 1 tag. Ví dụ: ai-skills tag add my-skill frontend web");
		return;
	}
	if (!skillExists(ctx, skillName)) {
		fatal(`Không tìm thấy skill "${skillName}".`);
		return;
	}
	const p = skillPath(ctx, skillName);
	const content = fs.readFileSync(p, "utf8");
	const current = getTags(content);
	const lower = new Set(current.map((t) => t.toLowerCase()));
	const toAdd = tags.filter((t) => !lower.has(t.toLowerCase()));
	if (toAdd.length === 0) {
		console.log(`${c.warn("⚠")}  Tất cả tags đã tồn tại trong "${skillName}": ${current.map((t) => c.accent(t)).join(", ")}`);
		return;
	}
	const next = [...current, ...toAdd];
	const updated = injectTags(content, next);
	fs.writeFileSync(p, updated, "utf8");
	console.log(`${c.ok("✓")}  Tags của "${skillName}":`);
	console.log(`   ${next.map((t) => c.accent(t)).join("  ")}`);
	if (toAdd.length < tags.length) {
		const skipped = tags.filter((t) => lower.has(t.toLowerCase()));
		console.log(`${c.dim(`   (bỏ qua đã có: ${skipped.join(", ")})`)}`);
	}
}
function runTagRemove(ctx, skillName, tag) {
	if (!skillExists(ctx, skillName)) {
		fatal(`Không tìm thấy skill "${skillName}".`);
		return;
	}
	const p = skillPath(ctx, skillName);
	const content = fs.readFileSync(p, "utf8");
	const { content: updated, removed } = removeTag(content, tag);
	if (!removed) {
		console.log(`${c.warn("⚠")}  Tag "${tag}" không tồn tại trong skill "${skillName}".`);
		const current = getTags(content);
		if (current.length > 0) console.log(`   Tags hiện tại: ${current.map((t) => c.accent(t)).join("  ")}`);
		return;
	}
	fs.writeFileSync(p, updated, "utf8");
	const remaining = getTags(updated);
	console.log(`${c.ok("✓")}  Đã xóa tag "${tag}" khỏi "${skillName}".`);
	if (remaining.length > 0) console.log(`   Tags còn lại: ${remaining.map((t) => c.accent(t)).join("  ")}`);
	else console.log(`   ${c.dim("(không còn tag nào)")}`);
}
function runTagList(ctx) {
	const skills = listSkills(ctx);
	if (skills.length === 0) {
		console.log(c.dim("Kho kỹ năng trống."));
		return;
	}
	const tagMap = /* @__PURE__ */ new Map();
	let untaggedCount = 0;
	for (const skill of skills) {
		const tags = getTags(fs.readFileSync(skill.path, "utf8"));
		if (tags.length === 0) {
			untaggedCount++;
			continue;
		}
		for (const tag of tags) {
			const existing = tagMap.get(tag) ?? [];
			existing.push(skill.name);
			tagMap.set(tag, existing);
		}
	}
	if (tagMap.size === 0 && untaggedCount === 0) {
		console.log(c.dim("Không có skill nào."));
		return;
	}
	console.log(`\n${c.bold("Tags trong kho kỹ năng:")}\n`);
	const sortedTags = [...tagMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
	for (const [tag, names] of sortedTags) {
		const count = c.dim(`(${names.length} skill)`);
		console.log(`  ${c.accent(tag.padEnd(24))} ${count}`);
		for (const n of names.sort()) console.log(`    ${c.dim("•")} ${n}`);
	}
	if (untaggedCount > 0) console.log(`\n  ${c.dim(`(untagged: ${untaggedCount} skills)`)}`);
	console.log(`\n${c.dim(`Tổng: ${tagMap.size} tags, ${skills.length} skills`)}`);
}
function runTagRename(ctx, oldTag, newTag) {
	if (!newTag || newTag.trim() === "") {
		fatal("Tên tag mới không được để trống.");
		return;
	}
	const skills = listSkills(ctx);
	let renamedCount = 0;
	for (const skill of skills) {
		const { content: updated, renamed } = renameTag(fs.readFileSync(skill.path, "utf8"), oldTag, newTag);
		if (renamed) {
			fs.writeFileSync(skill.path, updated, "utf8");
			renamedCount++;
			console.log(`  ${c.ok("✓")}  ${skill.name}`);
		}
	}
	if (renamedCount === 0) {
		console.log(`${c.warn("⚠")}  Tag "${oldTag}" không tìm thấy trong bất kỳ skill nào.`);
		return;
	}
	console.log(`\n${c.ok("✓")} Đã đổi "${oldTag}" → "${newTag}" trong ${renamedCount} skill.`);
}
function runTag(ctx, action, args) {
	switch (action) {
		case "add": {
			const [skill, ...tags] = args;
			if (!skill) {
				fatal("Usage: ai-skills tag add <skill> <tag1> [tag2...]");
				return;
			}
			runTagAdd(ctx, skill, tags);
			break;
		}
		case "remove":
		case "rm": {
			const [skill, tag] = args;
			if (!skill || !tag) {
				fatal("Usage: ai-skills tag remove <skill> <tag>");
				return;
			}
			runTagRemove(ctx, skill, tag);
			break;
		}
		case "list":
		case "ls":
			runTagList(ctx);
			break;
		case "rename":
		case "mv": {
			const [oldTag, newTag] = args;
			if (!oldTag || !newTag) {
				fatal("Usage: ai-skills tag rename <old-tag> <new-tag>");
				return;
			}
			runTagRename(ctx, oldTag, newTag);
			break;
		}
		default: fatal(`Action không hợp lệ: "${action}". Dùng: add | remove | list | rename`);
	}
}
//#endregion
//#region src/commands/update.ts
function runUpdate(ctx) {
	try {
		info("Đang cập nhật kỹ năng từ Cloud (Git)...");
		if (syncPull(ctx)) success("Đã cập nhật kho kỹ năng thành công!");
		else warn("Không thể cập nhật. Kho kỹ năng chưa được cấu hình Git (dùng lệnh init-sync) hoặc đang bị lỗi mạng/conflict.");
	} catch (err) {
		handleError(err);
	}
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
//#region src/index.ts
const ctx = createCliContext();
program.name("ai-skills").description("CLI Tool — Thư viện lưu trữ Kỹ năng cho AI (Local AI Skill Registry)").version("1.0.0");
program.command("init-sync <url>").description("Khởi tạo đồng bộ Git cho kho kỹ năng (liên kết với Cloud repo)").action((url) => runInitSync(ctx, url));
program.command("list").description("Liệt kê danh sách tất cả các kỹ năng đang có").action(() => runList(ctx));
program.command("get <name>").description("Đọc và in ra nội dung của một kỹ năng cụ thể").action((name) => runGet(ctx, name));
program.command("add <name> <file_path>").description("Thêm một kỹ năng mới từ file Markdown có sẵn").option("--force", "Ghi đè nếu skill đã tồn tại").option("--tags <tags...>", "Danh sách tags (cách nhau bởi dấu cách)").action((name, filePath, opts) => runAdd(ctx, name, filePath, opts));
program.command("remove <name>").alias("rm").description("Xóa một kỹ năng khỏi kho lưu trữ").action((name) => runRemove(ctx, name));
program.command("search <keyword>").description("Tìm kiếm kỹ năng theo tên hoặc nội dung").option("-s, --semantic", "Tìm kiếm thông minh với TF-IDF + fuzzy matching").option("--tag <tag>", "Lọc kết quả theo tag").action((keyword, opts) => runSearch(ctx, keyword, opts));
program.command("apply <name>").description("Bơm kỹ năng từ kho tổng vào dự án hiện tại (tạo Symlink)").action((name) => runApply(ctx, name));
program.command("run <name>").description("Thực thi các khối mã (script/hook) bên trong file Markdown của kỹ năng").action((name) => runRun(ctx, name));
program.command("create [name]").description("Tạo kỹ năng mới từ template có sẵn").option("-t, --template <id>", "Chọn template (mặc định: basic)").option("-d, --description <text>", "Mô tả ngắn cho kỹ năng").option("--tags <tags...>", "Danh sách tags (cách nhau bởi dấu cách)").option("--force", "Ghi đè nếu skill đã tồn tại").option("--list-templates", "Liệt kê các template có sẵn").action((name, opts) => runCreate(ctx, name, opts));
program.command("recommend").description("Phân tích dự án và gợi ý kỹ năng phù hợp").option("--dir <path>", "Thư mục dự án cần phân tích (mặc định: thư mục hiện tại)").action((opts) => runRecommend(ctx, opts));
program.command("update").description("Cập nhật kho kỹ năng từ Cloud (Git Pull)").action(() => runUpdate(ctx));
program.command("stats").description("Xem thống kê kho kỹ năng và tags").action(() => runStats(ctx));
program.command("fetch [name]").description("Tải skill từ autoskills registry về kho local").option("--from <bundle>", "Tải toàn bộ skills từ một bundle (vd: wshobson/agents)").option("--auto", "Tự động detect tech stack và fetch skills phù hợp").option("--force", "Ghi đè skill đã tồn tại").option("--list", "Chỉ hiển thị danh sách skills có sẵn, không tải").action((name, opts) => runFetch(ctx, name, opts));
program.command("tag <action> [args...]").description("Quản lý tags của skills (add | remove | list | rename)").addHelpText("after", [
	"",
	"  Actions:",
	"    add <skill> <tag...>       Thêm tags vào skill",
	"    remove <skill> <tag>       Xóa tag khỏi skill",
	"    list                       Liệt kê tất cả tags",
	"    rename <old-tag> <new-tag> Đổi tên tag trên toàn bộ kho",
	"",
	"  Ví dụ:",
	"    ai-skills tag add my-skill frontend web",
	"    ai-skills tag remove my-skill web",
	"    ai-skills tag list",
	"    ai-skills tag rename frontend ui"
].join("\n")).action((action, args) => runTag(ctx, action, args));
program.parse();
//#endregion
export {};
