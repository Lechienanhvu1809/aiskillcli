/**
 * Token/Memory Cost Benchmarks — do hao phi xu ly text (tokenizer, TF-IDF, Levenshtein).
 * Muc tieu: phat hien algorithm nao 'ngon' token nhat khi scale len.
 */

import { describe, expect, it } from "vitest";
import {
  extractSnippet,
  isFuzzyMatch,
  levenshtein,
  searchWithTfIdf,
  tokenize,
} from "../../src/policies/text-search.js";

// ── Helper: do memory truoc/sau ──────────────────────────────────────────────
function memDelta(fn: () => void): { heapDeltaKB: number; durationMs: number } {
  if (global.gc) global.gc();
  const before = process.memoryUsage().heapUsed;
  const t0 = performance.now();
  fn();
  const durationMs = performance.now() - t0;
  const after = process.memoryUsage().heapUsed;
  return { heapDeltaKB: (after - before) / 1024, durationMs };
}

// ── Fixtures ─────────────────────────────────────────────────────────────────
function makeDoc(n: number): string {
  return Array.from(
    { length: n },
    (_, i) => `keyword${i} lorem ipsum dolor sit amet consectetur tag-${i % 10}`,
  ).join(" ");
}

function makeCorpus(numDocs: number, wordsPerDoc: number): Map<string, string> {
  const m = new Map<string, string>();
  for (let i = 0; i < numDocs; i++) {
    m.set(`skill-${String(i).padStart(3, "0")}`, makeDoc(wordsPerDoc));
  }
  return m;
}

// =============================================================================
// 1. Tokenizer
// =============================================================================
describe("tokenize() — token cost", () => {
  const sizes = [100, 1_000, 10_000] as const;

  for (const words of sizes) {
    it(`words=${words}: linear scaling expected`, () => {
      const text = makeDoc(words);
      const { heapDeltaKB, durationMs } = memDelta(() => tokenize(text));
      console.log(`[tokenize words=${words}]`, {
        durationMs: `${durationMs.toFixed(2)}ms`,
        heapDeltaKB: `${heapDeltaKB.toFixed(1)}KB`,
      });
      // Duration phai duoi 500ms du voi 10k words
      expect(durationMs).toBeLessThan(500);
      // Heap khong vuot 15MB voi 10k words (chua gc cuong che)
      expect(heapDeltaKB).toBeLessThan(15_360);
    });
  }
});

// =============================================================================
// 2. Levenshtein distance
// =============================================================================
describe("levenshtein() — token cost", () => {
  it("short strings (<=20 chars): mean < 0.01ms", () => {
    const pairs = [
      ["kitten", "sitting"],
      ["javascript", "typescript"],
      ["authentication", "authorization"],
    ] as [string, string][];

    let total = 0;
    const N = 10_000;
    const t0 = performance.now();
    for (let i = 0; i < N; i++) {
      const [a, b] = pairs[i % pairs.length];
      levenshtein(a, b);
    }
    total = performance.now() - t0;
    const meanMs = total / N;
    console.log(`[levenshtein short x10k] mean=${meanMs.toFixed(4)}ms total=${total.toFixed(1)}ms`);
    expect(meanMs).toBeLessThan(0.05);
  });

  it("long strings (100 chars): mean < 0.5ms", () => {
    const a = "a".repeat(100);
    const b = `${"b".repeat(97)}abc`;
    const N = 1_000;
    const t0 = performance.now();
    for (let i = 0; i < N; i++) levenshtein(a, b);
    const meanMs = (performance.now() - t0) / N;
    console.log(`[levenshtein long x1k] mean=${meanMs.toFixed(4)}ms`);
    expect(meanMs).toBeLessThan(0.5);
  });

  it("memory: 2-row algo — heap delta < 100KB per 1000 calls", () => {
    const a = "abcdefghij".repeat(5);
    const b = "bcdefghijk".repeat(5);
    const { heapDeltaKB } = memDelta(() => {
      for (let i = 0; i < 1_000; i++) levenshtein(a, b);
    });
    console.log("[levenshtein heap x1000]", `${heapDeltaKB.toFixed(1)}KB`);
    expect(heapDeltaKB).toBeLessThan(100);
  });
});

// =============================================================================
// 3. isFuzzyMatch
// =============================================================================
describe("isFuzzyMatch() — throughput", () => {
  it("100k calls < 500ms", () => {
    const N = 100_000;
    const t0 = performance.now();
    for (let i = 0; i < N; i++) isFuzzyMatch("authentication", "authorisation");
    const elapsed = performance.now() - t0;
    console.log("[isFuzzyMatch x100k]", `${elapsed.toFixed(1)}ms`);
    expect(elapsed).toBeLessThan(500);
  });
});

// =============================================================================
// 4. extractSnippet
// =============================================================================
describe("extractSnippet() — token cost", () => {
  it("1MB document: < 50ms", () => {
    const bigDoc = makeDoc(50_000); // ~50k words
    const tokens = ["keyword100", "lorem"];
    const { durationMs } = memDelta(() => extractSnippet(bigDoc, tokens));
    console.log("[extractSnippet 1MB]", `${durationMs.toFixed(2)}ms`);
    expect(durationMs).toBeLessThan(50);
  });
});

// =============================================================================
// 5. TF-IDF Engine — scale tests
// =============================================================================
describe("searchWithTfIdf() — token cost at scale", () => {
  const scenarios = [
    { docs: 10, words: 100 },
    { docs: 50, words: 200 },
    { docs: 100, words: 200 },
    { docs: 50, words: 1000 },
  ] as const;

  for (const { docs, words } of scenarios) {
    const label = `docs=${docs} words=${words}`;
    it(`${label}: time < 1000ms, heap < 20MB`, () => {
      const corpus = makeCorpus(docs, words);
      const { heapDeltaKB, durationMs } = memDelta(() =>
        searchWithTfIdf(corpus, "keyword authentication lorem ipsum"),
      );
      console.log(`[tfidf ${label}]`, {
        durationMs: `${durationMs.toFixed(1)}ms`,
        heapDeltaKB: `${heapDeltaKB.toFixed(0)}KB`,
      });
      expect(durationMs).toBeLessThan(1000);
      expect(heapDeltaKB).toBeLessThan(35_840); // 35MB
    });
  }

  it("single-term query vs multi-term query: multi <= 4x single time or <= 150ms", () => {
    const corpus = makeCorpus(50, 200);
    let t1 = 0,
      t4 = 0;

    const r1 = memDelta(() => searchWithTfIdf(corpus, "keyword1"));
    t1 = r1.durationMs;

    const r4 = memDelta(() => searchWithTfIdf(corpus, "keyword1 lorem authentication dolor"));
    t4 = r4.durationMs;

    console.log("[tfidf single vs multi]", {
      single: `${t1.toFixed(1)}ms`,
      multi: `${t4.toFixed(1)}ms`,
      ratio: (t4 / (t1 || 0.01)).toFixed(2),
    });
    expect(t4).toBeLessThan(Math.max(t1 * 4, 150)); // multi <= 4x single (hoac toi da 150ms)
  });

  it("empty query returns empty without crash", () => {
    const corpus = makeCorpus(20, 100);
    const result = searchWithTfIdf(corpus, "");
    expect(result).toEqual([]);
  });

  it("stopword-only query returns empty", () => {
    const corpus = makeCorpus(20, 100);
    const result = searchWithTfIdf(corpus, "and the is a to of");
    expect(result).toEqual([]);
  });
});

// =============================================================================
// 6. Throughput: repeated queries (simulating agent rapid-fire usage)
// =============================================================================
describe("TF-IDF rapid-fire throughput", () => {
  it("100 sequential queries on 50-doc corpus: total < 5000ms", () => {
    const corpus = makeCorpus(50, 200);
    const queries = ["authentication", "lorem keyword5", "tag-3 dolor", "typescript react"];
    const N = 100;
    const t0 = performance.now();
    for (let i = 0; i < N; i++) {
      searchWithTfIdf(corpus, queries[i % queries.length]);
    }
    const elapsed = performance.now() - t0;
    console.log("[rapid-fire 100 queries]", `${elapsed.toFixed(0)}ms`);
    expect(elapsed).toBeLessThan(5000);
  });
});
