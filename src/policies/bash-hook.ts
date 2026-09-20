/**
 * Policy: Trích xuất bash script từ nội dung Markdown.
 *
 * ⚠️ BẢO MẬT: Thực thi code tùy ý từ file Markdown.
 */
export function extractBashHook(content: string): string | null {
  // Loại bỏ \r trên Windows để không gây lỗi khi script chạy qua bash
  const normalized = content.replace(/\r\n?/g, "\n");
  const regex = /```bash[ \t]+(?:hook|pre-hook)\b[^\n]*\n([\s\S]*?)```/;
  const match = normalized.match(regex);
  return match?.[1]?.trim() ?? null;
}
