#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { createCliContext } from "./context.js";
import { analyzeProject } from "./policies/project-analyzer.js";
import { searchSemantic } from "./policies/semantic-search.js";
import {
  getSkillWithDependencies,
  listSkills,
  saveSkill,
  searchSkillsSemantic,
} from "./policies/skill-registry.js";
import { CLI_VERSION } from "./version.js";

// Lấy context mặc định (giống như chạy CLI)
const ctx = createCliContext();

const server = new Server(
  {
    name: "ai-skills-mcp",
    version: CLI_VERSION,
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Define Schemas cho tools — dùng Zod 4 .toJSONSchema() để tự sinh JSON Schema
const SearchSkillsSchema = z.object({
  query: z.string().describe("Từ khóa tìm kiếm (ví dụ: 'react', 'bash', 'frontend')"),
  threshold: z.number().optional().describe("Điểm tối thiểu (mặc định 0.1)"),
});

const GetSkillSchema = z.object({
  name: z.string().describe("Tên chính xác của kỹ năng (ví dụ: 'coding-guide')"),
});

const LearnSkillSchema = z.object({
  name: z
    .string()
    .describe(
      "Tên kỹ năng (chỉ gồm chữ cái thường, số và dấu gạch ngang, ví dụ: 'react-components')",
    ),
  description: z.string().describe("Mô tả ngắn gọn về kỹ năng này"),
  content: z
    .string()
    .describe(
      "Nội dung hoàn chỉnh của file Markdown, bắt buộc phải chứa YAML frontmatter hợp lệ ở đầu (có name, tags).",
    ),
});

const SemanticSearchSchema = z.object({
  query: z.string().describe("Câu hỏi hoặc vấn đề cần tìm (ví dụ: 'cách tạo component mới')"),
  threshold: z.number().optional().describe("Điểm độ tương đồng tối thiểu (mặc định 0.5)"),
});

const InjectContextSchema = z.object({
  projectDir: z
    .string()
    .optional()
    .describe("Đường dẫn tuyệt đối đến thư mục dự án (mặc định là thư mục hiện tại)"),
});

/** Chuyển Zod schema → JSON Schema (draft-7, bỏ $schema key) */
function toInputSchema(schema: z.ZodType) {
  const jsonSchema = schema.toJSONSchema({ target: "draft-7" });
  // MCP SDK không cần $schema key — bỏ để tránh conflict
  const { $schema: _, ...rest } = jsonSchema as Record<string, unknown>;
  return rest;
}

// Đăng ký danh sách tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "autoskills_list",
        description: "Liệt kê tất cả các kỹ năng hiện có trong kho lưu trữ local.",
        inputSchema: {
          type: "object" as const,
          properties: {},
        },
      },
      {
        name: "autoskills_search",
        description: "Tìm kiếm kỹ năng trong kho dựa trên từ khóa (sử dụng TF-IDF).",
        inputSchema: toInputSchema(SearchSkillsSchema),
      },
      {
        name: "autoskills_get",
        description: "Lấy toàn bộ nội dung markdown của một kỹ năng cụ thể.",
        inputSchema: toInputSchema(GetSkillSchema),
      },
      {
        name: "autoskills_learn",
        description:
          "Tự động ghi nhớ kiến thức, công cụ hoặc workflow mới vào registry. Lưu thành file markdown.",
        inputSchema: toInputSchema(LearnSkillSchema),
      },
      {
        name: "autoskills_semantic_search",
        description:
          "Tìm kiếm kỹ năng bằng AI embedding (Semantic Vector Search) dựa trên ý nghĩa câu hỏi, vượt trội hơn khớp từ khóa.",
        inputSchema: toInputSchema(SemanticSearchSchema),
      },
      {
        name: "autoskills_inject_context",
        description:
          "Tự động phân tích dự án và trả về toàn văn nội dung của tối đa 2 kỹ năng liên quan nhất để bơm vào ngữ cảnh.",
        inputSchema: toInputSchema(InjectContextSchema),
      },
    ],
  };
});

// CÁC HÀM HANDLER TÁCH LẺ
async function handleList() {
  const skills = listSkills(ctx);
  return {
    content: [
      {
        type: "text",
        text:
          skills.length > 0
            ? `Các kỹ năng hiện có:\n- ${skills.map((s) => s.name).join("\n- ")}`
            : "Kho kỹ năng hiện đang trống.",
      },
    ],
  };
}

async function handleSearch(args: unknown) {
  const { query, threshold = 0.1 } = SearchSkillsSchema.parse(args);
  const results = searchSkillsSemantic(ctx, query).filter((r) => r.score >= threshold);

  if (results.length === 0) {
    return {
      content: [
        { type: "text", text: `Không tìm thấy kỹ năng nào phù hợp với từ khóa "${query}".` },
      ],
    };
  }

  const formattedResults = results
    .map((r) => `- **${r.name}** (score: ${r.score}):\n  > ${r.snippet}`)
    .join("\n\n");

  return {
    content: [{ type: "text", text: `Tìm thấy ${results.length} kỹ năng:\n\n${formattedResults}` }],
  };
}

async function handleGet(args: unknown) {
  const { name } = GetSkillSchema.parse(args);
  try {
    const content = getSkillWithDependencies(ctx, name, 2);
    return { content: [{ type: "text", text: content }] };
  } catch {
    return {
      content: [{ type: "text", text: `Lỗi: Kỹ năng "${name}" không tồn tại trong kho.` }],
      isError: true,
    };
  }
}

async function handleLearn(args: unknown) {
  const { name, content } = LearnSkillSchema.parse(args);
  try {
    await saveSkill(ctx, name, content);
    return {
      content: [
        {
          type: "text",
          text: `Đã lưu thành công kỹ năng "${name}" vào registry. Hãy kiểm tra lại bằng autoskills_get nếu cần.`,
        },
      ],
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text", text: `Lỗi khi lưu kỹ năng: ${errMsg}` }], isError: true };
  }
}

async function handleSemanticSearch(args: unknown) {
  const { query, threshold = 0.5 } = SemanticSearchSchema.parse(args);
  try {
    const results = await searchSemantic(ctx, query, threshold);
    if (results.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `Không tìm thấy kỹ năng nào phù hợp về mặt ý nghĩa với query "${query}". Hãy thử dùng autoskills_search với từ khóa (TF-IDF).`,
          },
        ],
      };
    }
    const formattedResults = results
      .map((r) => `- **${r.name}** (Cosine similarity: ${r.score.toFixed(3)})`)
      .join("\n");
    return {
      content: [
        {
          type: "text",
          text: `Tìm kiếm Semantic Search cho "${query}":\n\n${formattedResults}\n\nDùng công cụ autoskills_get để đọc nội dung chi tiết.`,
        },
      ],
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `Lỗi khi thực hiện Semantic Search: ${errMsg}` }],
      isError: true,
    };
  }
}

async function handleInjectContext(args: unknown) {
  const { projectDir = process.cwd() } = InjectContextSchema.parse(args);
  try {
    const profile = analyzeProject(projectDir);
    const query =
      `${profile.language} ${profile.frameworks.join(" ")} ${profile.tools.join(" ")}`.trim();

    if (!query || query === "unknown") {
      return {
        content: [
          {
            type: "text",
            text: `Không nhận diện được công nghệ cụ thể nào trong dự án tại ${projectDir}.`,
          },
        ],
      };
    }

    const results = await searchSemantic(ctx, query, 0.1);
    const topResults = results.slice(0, 2);

    if (topResults.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `Phân tích dự án: ${query}.\nKhông tìm thấy kỹ năng nào trong registry phù hợp.`,
          },
        ],
      };
    }

    const contents = topResults.map((r) => {
      try {
        return getSkillWithDependencies(ctx, r.name, 1);
      } catch {
        return `Lỗi: Không thể đọc file kỹ năng ${r.name}`;
      }
    });

    const textOutput =
      `Phân tích dự án thành công: [${query}].\n\n` +
      `Đã bơm ngữ cảnh ${topResults.length} kỹ năng liên quan nhất:\n\n` +
      contents
        .map(
          (c, i) =>
            `--- BẮT ĐẦU SKILL: ${topResults[i].name} (Độ phù hợp: ${topResults[i].score.toFixed(2)}) ---\n${c}\n--- KẾT THÚC SKILL ---`,
        )
        .join("\n\n");

    return { content: [{ type: "text", text: textOutput }] };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text", text: `Lỗi khi bơm ngữ cảnh: ${errMsg}` }], isError: true };
  }
}

// Xử lý logic gọi tools
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const name = request.params.name;
    const args = request.params.arguments;

    switch (name) {
      case "autoskills_list":
        return await handleList();
      case "autoskills_search":
        return await handleSearch(args);
      case "autoskills_get":
        return await handleGet(args);
      case "autoskills_learn":
        return await handleLearn(args);
      case "autoskills_semantic_search":
        return await handleSemanticSearch(args);
      case "autoskills_inject_context":
        return await handleInjectContext(args);
      default:
        throw new Error(`Tool không được hỗ trợ: ${name}`);
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Đã xảy ra lỗi: ${errMsg}` }],
      isError: true,
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
