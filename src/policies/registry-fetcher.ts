import crypto from "node:crypto";

/**
 * Policy: Fetch skills từ autoskills online registry.
 * Verify SHA-256 hash trước khi accept bất kỳ content nào.
 * Không có console.log — chỉ trả về data hoặc throw.
 */

const REGISTRY_BASE = "https://registry.autoskills.sh";
const MANIFEST_URL = `${REGISTRY_BASE}/manifest.json`;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RemoteSkillEntry {
  /** Tên skill trong registry */
  name: string;
  /** URL để download content */
  url: string;
  /** SHA-256 hash của content (hex) */
  hash: string;
  /** Bundle/tác giả sở hữu skill này */
  source: string;
  /** Mô tả ngắn */
  description?: string;
}

export interface RegistryManifest {
  version: number;
  updatedAt: string;
  skills: Record<string, RemoteSkillEntry>;
}

export class FetchError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "NETWORK_ERROR"
      | "HASH_MISMATCH"
      | "NOT_FOUND"
      | "INVALID_MANIFEST"
      | "UNSUPPORTED_VERSION",
  ) {
    super(message);
    this.name = "FetchError";
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Verify SHA-256 của một string content */
export function verifySha256(content: string, expectedHash: string): boolean {
  const actual = crypto.createHash("sha256").update(content, "utf8").digest("hex");
  return actual === expectedHash;
}

/** Parse và validate manifest JSON */
export function parseManifest(raw: string): RegistryManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new FetchError("Manifest không hợp lệ (JSON parse lỗi).", "INVALID_MANIFEST");
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>).version !== "number" ||
    typeof (parsed as Record<string, unknown>).skills !== "object"
  ) {
    throw new FetchError("Manifest thiếu trường bắt buộc (version, skills).", "INVALID_MANIFEST");
  }
  const manifest = parsed as RegistryManifest;
  if (manifest.version > 2) {
    throw new FetchError(
      `Manifest version ${manifest.version} chưa được hỗ trợ. Hãy cập nhật ai-skill-cli.`,
      "UNSUPPORTED_VERSION",
    );
  }
  return manifest;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch và parse manifest từ registry.
 * Có thể truyền custom manifestUrl để test.
 */
export async function fetchManifest(manifestUrl = MANIFEST_URL): Promise<RegistryManifest> {
  let raw: string;
  try {
    const res = await fetch(manifestUrl);
    if (!res.ok) {
      throw new FetchError(
        `Lỗi kết nối registry (HTTP ${res.status}): ${manifestUrl}`,
        "NETWORK_ERROR",
      );
    }
    raw = await res.text();
  } catch (err) {
    if (err instanceof FetchError) throw err;
    throw new FetchError(
      `Không thể kết nối registry: ${err instanceof Error ? err.message : String(err)}`,
      "NETWORK_ERROR",
    );
  }
  return parseManifest(raw);
}

/**
 * Tìm một skill entry trong manifest theo tên (case-insensitive).
 */
export function findSkillInManifest(
  manifest: RegistryManifest,
  name: string,
): RemoteSkillEntry | undefined {
  const lower = name.toLowerCase();
  // exact match ưu tiên hơn
  if (manifest.skills[name]) return manifest.skills[name];
  // case-insensitive fallback
  const found = Object.values(manifest.skills).find((s) => s.name.toLowerCase() === lower);
  return found;
}

/**
 * Tìm tất cả skills thuộc một bundle (source).
 */
export function findSkillsByBundle(
  manifest: RegistryManifest,
  bundleId: string,
): RemoteSkillEntry[] {
  const lower = bundleId.toLowerCase();
  return Object.values(manifest.skills).filter((s) => s.source.toLowerCase() === lower);
}

/**
 * Download content của một skill, verify hash.
 * Throws FetchError nếu network lỗi hoặc hash không khớp.
 */
export async function downloadSkill(entry: RemoteSkillEntry): Promise<string> {
  let content: string;
  try {
    const res = await fetch(entry.url);
    if (!res.ok) {
      throw new FetchError(
        `Không thể tải skill "${entry.name}" (HTTP ${res.status})`,
        "NETWORK_ERROR",
      );
    }
    content = await res.text();
  } catch (err) {
    if (err instanceof FetchError) throw err;
    throw new FetchError(
      `Lỗi network khi tải "${entry.name}": ${err instanceof Error ? err.message : String(err)}`,
      "NETWORK_ERROR",
    );
  }

  if (!verifySha256(content, entry.hash)) {
    throw new FetchError(
      `Hash mismatch cho skill "${entry.name}" — nội dung có thể đã bị thay đổi.`,
      "HASH_MISMATCH",
    );
  }

  return content;
}

/**
 * Liệt kê tất cả skills trong manifest, sorted theo name.
 */
export function listRemoteSkills(manifest: RegistryManifest): RemoteSkillEntry[] {
  return Object.values(manifest.skills).sort((a, b) => a.name.localeCompare(b.name));
}
