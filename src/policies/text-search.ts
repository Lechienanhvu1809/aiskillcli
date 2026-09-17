/**
 * Business Rule: TF-IDF text search engine.
 * Zero dependencies — chỉ dùng Node.js built-in.
 * Hỗ trợ: exact match, fuzzy match (Levenshtein), TF-IDF scoring, snippet extraction.
 */

export interface ScoredResult {
  /** Tên skill */
  name: string;
  /** Điểm relevance (0.0 → 1.0) */
  score: number;
  /** Loại match */
  matchType: "exact" | "fuzzy" | "tfidf";
  /** Đoạn text chứa từ khóa */
  snippet: string;
}

// --- Stopwords tiếng Anh phổ biến ---
const STOPWORDS = new Set([
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
  // --- Tiếng Việt ---
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
  "làm",
]);

/** Tách text thành tokens đã normalize */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}0-9-]/gu, " ") // Hỗ trợ unicode letters toàn diện
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

/** Tính Levenshtein distance giữa 2 string */
export function levenshtein(a: string, b: string): number {
  const la = a.length;
  const lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;

  // Dùng 2 rows thay vì full matrix để tiết kiệm bộ nhớ
  let prev = Array.from({ length: lb + 1 }, (_, i) => i);
  let curr = new Array<number>(lb + 1);

  for (let i = 1; i <= la; i++) {
    curr[0] = i;
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1, // deletion
        curr[j - 1] + 1, // insertion
        prev[j - 1] + cost, // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[lb];
}

/** Kiểm tra fuzzy match: distance <= threshold dựa trên độ dài từ */
export function isFuzzyMatch(word: string, target: string, maxRatio = 0.3): boolean {
  const maxDist = Math.max(1, Math.floor(target.length * maxRatio));
  return levenshtein(word, target) <= maxDist;
}

/**
 * Trích snippet chứa từ khóa (±context words xung quanh).
 * Trả về dòng đầu tiên chứa bất kỳ query token nào.
 */
export function extractSnippet(content: string, queryTokens: string[], maxLen = 120): string {
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
  // Fallback: dòng đầu tiên có nội dung (bỏ heading markers)
  const first = lines.find((l) => !l.startsWith("---"))?.trim() ?? "";
  if (first.length <= maxLen) return first;
  return `${first.slice(0, maxLen - 3)}...`;
}

// --- TF-IDF Engine ---

interface DocTokens {
  name: string;
  tokens: string[];
  content: string;
}

/** Tính term frequency: số lần xuất hiện / tổng tokens */
function tf(term: string, tokens: string[]): number {
  if (tokens.length === 0) return 0;
  const count = tokens.filter((t) => t === term).length;
  return count / tokens.length;
}

/** Tính inverse document frequency: log(N / df) */
function idf(term: string, docs: DocTokens[]): number {
  const df = docs.filter((d) => d.tokens.includes(term)).length;
  if (df === 0) return 0;
  return Math.log(docs.length / df);
}

interface DocScoring {
  tfidfScore: number;
  exactHits: number;
  fuzzyHits: number;
}

/** Tính TF-IDF + fuzzy score cho một document với query tokens */
function scoreDocAgainstQuery(
  doc: DocTokens,
  queryTokens: string[],
  idfScores: Map<string, number>,
  allDocs: DocTokens[],
): DocScoring {
  let tfidfScore = 0;
  let exactHits = 0;
  let fuzzyHits = 0;

  for (const term of queryTokens) {
    const termTf = tf(term, doc.tokens);
    const termIdf = idfScores.get(term) ?? 0;
    tfidfScore += termTf * termIdf;

    if (termTf > 0) {
      exactHits++;
    } else {
      const fuzzyToken = doc.tokens.find((t) => isFuzzyMatch(t, term));
      if (fuzzyToken) {
        fuzzyHits++;
        const fuzzyIdf = idf(fuzzyToken, allDocs);
        tfidfScore += 0.3 * (fuzzyIdf > 0 ? fuzzyIdf : 1);
      }
    }
  }

  return { tfidfScore, exactHits, fuzzyHits };
}

/** Normalize raw TF-IDF score to 0..1 range với name bonus */
function normalizeScore(
  rawScore: number,
  queryTokens: string[],
  idfScores: Map<string, number>,
  docName: string,
): number {
  const maxPossible = queryTokens.reduce((sum, t) => sum + (idfScores.get(t) ?? 0), 0);
  const normalized = maxPossible > 0 ? Math.min(1, rawScore / maxPossible) : Math.min(1, rawScore);
  const nameBonus = queryTokens.some((t) => docName.toLowerCase().includes(t)) ? 0.2 : 0;
  return Math.min(1, normalized + nameBonus);
}

/** Phân loại match type dựa trên exact/fuzzy hit counts */
function classifyMatchType(exactHits: number, fuzzyHits: number): ScoredResult["matchType"] {
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
export function searchWithTfIdf(docs: Map<string, string>, query: string): ScoredResult[] {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  // Tokenize tất cả documents
  const docTokensList: DocTokens[] = [];
  for (const [name, content] of docs) {
    docTokensList.push({
      name,
      tokens: tokenize(`${name} ${content}`),
      content,
    });
  }

  // Tính IDF cho mỗi query term
  const idfScores = new Map<string, number>();
  for (const term of queryTokens) {
    idfScores.set(term, idf(term, docTokensList));
  }

  const results: ScoredResult[] = [];

  for (const doc of docTokensList) {
    const { tfidfScore, exactHits, fuzzyHits } = scoreDocAgainstQuery(
      doc,
      queryTokens,
      idfScores,
      docTokensList,
    );

    if (tfidfScore <= 0) continue;

    const finalScore = normalizeScore(tfidfScore, queryTokens, idfScores, doc.name);

    results.push({
      name: doc.name,
      score: Math.round(finalScore * 100) / 100,
      matchType: classifyMatchType(exactHits, fuzzyHits),
      snippet: extractSnippet(doc.content, queryTokens),
    });
  }

  // Sort giảm dần theo score
  results.sort((a, b) => b.score - a.score);
  return results;
}
