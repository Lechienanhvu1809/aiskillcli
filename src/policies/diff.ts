import { execSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export class DiffError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DiffError";
  }
}

/**
 * Generate a visual text diff between two contents using `git diff --no-index`.
 * Throws DiffError if git is not available or execution fails.
 */
export function generateDiff(skillName: string, contentOld: string, contentNew: string): string {
  // If contents are identical, no need to run git diff
  if (contentOld === contentNew) {
    return `Kỹ năng "${skillName}" không có thay đổi nào.`;
  }

  const tmpDir = os.tmpdir();
  const sessionId = crypto.randomBytes(8).toString("hex");

  const fileA = path.join(tmpDir, `${skillName}_old_${sessionId}.md`);
  const fileB = path.join(tmpDir, `${skillName}_new_${sessionId}.md`);

  try {
    fs.writeFileSync(fileA, contentOld, "utf8");
    fs.writeFileSync(fileB, contentNew, "utf8");

    // git diff --no-index returns 0 if no differences, 1 if differences found.
    // So we need to handle the Exit status 1 as a normal successful diff output.
    try {
      execSync(`git diff --no-index --color=always "${fileA}" "${fileB}"`, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      return ""; // No diff found
    } catch (err: any) {
      if (err.status === 1 && err.stdout) {
        let diffStr = err.stdout as string;
        // Clean up the temp paths in the diff output so it looks nicer to the user
        // Replace `a/path/to/fileA` with `a/current` and `b/path/to/fileB` with `b/incoming`
        diffStr = diffStr.replace(
          new RegExp(`a/${fileA.replace(/\\/g, "/")}`, "g"),
          `a/${skillName}.md (current)`,
        );
        diffStr = diffStr.replace(
          new RegExp(`b/${fileB.replace(/\\/g, "/")}`, "g"),
          `b/${skillName}.md (incoming)`,
        );

        // Also handle Windows paths format in diff
        diffStr = diffStr.replace(
          new RegExp(`--- a/.*${skillName}_old.*\\.md`),
          `--- a/${skillName}.md (current)`,
        );
        diffStr = diffStr.replace(
          new RegExp(`\\+\\+\\+ b/.*${skillName}_new.*\\.md`),
          `+++ b/${skillName}.md (incoming)`,
        );

        return diffStr;
      }

      throw new DiffError(
        `Không thể chạy lệnh git diff. Vui lòng đảm bảo Git đã được cài đặt: ${err.message}`,
      );
    }
  } finally {
    // Cleanup temp files
    if (fs.existsSync(fileA)) fs.unlinkSync(fileA);
    if (fs.existsSync(fileB)) fs.unlinkSync(fileB);
  }
}
