#!/usr/bin/env node

/**
 * Code Analysis & Context Engineering MCP Server
 *
 * Provides deep codebase understanding through:
 * - Architectural analysis
 * - Pattern detection
 * - Dependency mapping
 * - Test coverage analysis
 * - Convention validation
 * - AI-optimized context generation
 *
 * Supports: React, React Native, Vue 3, Nuxt 3
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";

// Tool imports (will be implemented)
import { analyzeArchitecture } from "./tools/architecture-analyzer.js";
import { analyzeDependencyGraph } from "./tools/dependency-mapper.js";
import { analyzePatterns } from "./tools/pattern-detector.js";
import { analyzeCoverageGaps } from "./tools/coverage-analyzer.js";
import { validateConventions } from "./tools/convention-validator.js";
import { generateContextPack } from "./tools/context-pack-generator.js";

// Tool definitions
const TOOLS: Tool[] = [
  {
    name: "code_analyze_architecture",
    description: "Generate comprehensive architectural overview with component relationships, data flow, and navigation patterns. Supports React, React Native, Vue 3, and Nuxt 3 projects.",
    inputSchema: {
      type: "object",
      properties: {
        projectPath: {
          type: "string",
          description: "Project root directory (default: current working directory)",
        },
        includeGlobs: {
          type: "array",
          items: { type: "string" },
          description: "File patterns to include (e.g., ['src/**/*', 'components/**/*'])",
        },
        excludeGlobs: {
          type: "array",
          items: { type: "string" },
          description: "File patterns to exclude (e.g., ['node_modules/**', 'dist/**'])",
        },
        depth: {
          type: "string",
          enum: ["overview", "detailed", "deep"],
          description: "Analysis depth level",
        },
        analyzeTypes: {
          type: "array",
          items: {
            type: "string",
            enum: [
              "components",
              "hooks",
              "composables",
              "providers",
              "stores",
              "navigation",
              "state-management",
              "data-flow",
              "api-clients",
              "server-routes",
              "middleware",
              "plugins",
              "layouts",
            ],
          },
          description: "Specific analysis types to perform",
        },
        generateDiagrams: {
          type: "boolean",
          description: "Generate Mermaid diagrams (default: true)",
        },
        includeMetrics: {
          type: "boolean",
          description: "Include code metrics (default: true)",
        },
        includeDetailedMetrics: {
          type: "boolean",
          description: "Include detailed per-file metrics with complexity, lines, imports, exports, and patterns (default: true)",
        },
        minComplexity: {
          type: "number",
          description: "Minimum complexity threshold for files in detailedMetrics (default: 0). Use this to filter out simple files and reduce response size.",
        },
        maxDetailedFiles: {
          type: "number",
          description: "Maximum number of files to include in detailedMetrics. Use this to limit response size for large projects.",
        },
        detectFramework: {
          type: "boolean",
          description: "Auto-detect framework (default: true)",
        },
        framework: {
          type: "string",
          enum: ["react", "react-native", "vue3", "nuxt3"],
          description: "Force specific framework analysis",
        },
      },
    },
  },
  {
    name: "code_analyze_dependency_graph",
    description: "Visualize and analyze module dependencies, circular dependencies, and coupling metrics.",
    inputSchema: {
      type: "object",
      properties: {
        projectPath: {
          type: "string",
          description: "Project root directory",
        },
        includeGlobs: {
          type: "array",
          items: { type: "string" },
          description: "File patterns to include",
        },
        excludeGlobs: {
          type: "array",
          items: { type: "string" },
          description: "File patterns to exclude",
        },
        depth: {
          type: "number",
          description: "Maximum dependency depth to analyze",
        },
        detectCircular: {
          type: "boolean",
          description: "Detect circular dependencies (default: true)",
        },
        calculateMetrics: {
          type: "boolean",
          description: "Calculate coupling and cohesion metrics (default: true)",
        },
        generateDiagram: {
          type: "boolean",
          description: "Generate Mermaid diagram (default: true)",
        },
        focusModule: {
          type: "string",
          description: "Focus analysis on specific module",
        },
        includeExternal: {
          type: "boolean",
          description: "Include node_modules dependencies (default: false)",
        },
      },
    },
  },
  {
    name: "code_analyze_patterns",
    description: "Detect framework-specific patterns, custom implementations, and adherence to best practices.",
    inputSchema: {
      type: "object",
      properties: {
        projectPath: {
          type: "string",
          description: "Project root directory",
        },
        patternTypes: {
          type: "array",
          items: {
            type: "string",
            enum: [
              "hooks",
              "hoc",
              "render-props",
              "compound-components",
              "providers",
              "custom-hooks",
              "navigation",
              "forms",
              "data-fetching",
              "error-handling",
              "testing",
              "composables",
              "pinia-stores",
              "vue-plugins",
              "nuxt-modules",
              "nuxt-middleware",
              "nuxt-server-routes",
              "vue-directives",
            ],
          },
          description: "Pattern types to detect",
        },
        includeGlobs: {
          type: "array",
          items: { type: "string" },
          description: "File patterns to include",
        },
        excludeGlobs: {
          type: "array",
          items: { type: "string" },
          description: "File patterns to exclude",
        },
        detectCustomPatterns: {
          type: "boolean",
          description: "Find project-specific patterns (default: false)",
        },
        compareWithBestPractices: {
          type: "boolean",
          description: "Compare against industry standards (default: false)",
        },
        suggestImprovements: {
          type: "boolean",
          description: "Recommend refactoring (default: false)",
        },
      },
    },
  },
  {
    name: "code_analyze_coverage_gaps",
    description: "Identify untested code with actionable test suggestions based on complexity and criticality.",
    inputSchema: {
      type: "object",
      properties: {
        projectPath: {
          type: "string",
          description: "Project root directory",
        },
        coverageReportPath: {
          type: "string",
          description: "Path to coverage report (lcov or JSON)",
        },
        framework: {
          type: "string",
          enum: ["jest", "vitest", "playwright"],
          description: "Test framework being used",
        },
        threshold: {
          type: "object",
          properties: {
            lines: { type: "number" },
            functions: { type: "number" },
            branches: { type: "number" },
            statements: { type: "number" },
          },
          description: "Minimum coverage thresholds",
        },
        priority: {
          type: "string",
          enum: ["critical", "high", "medium", "low", "all"],
          description: "Filter by priority level",
        },
        includeGlobs: {
          type: "array",
          items: { type: "string" },
          description: "File patterns to include",
        },
        excludeGlobs: {
          type: "array",
          items: { type: "string" },
          description: "File patterns to exclude",
        },
        suggestTests: {
          type: "boolean",
          description: "Generate test scaffolds (default: true)",
        },
        analyzeComplexity: {
          type: "boolean",
          description: "Consider cyclomatic complexity (default: false)",
        },
      },
    },
  },
  {
    name: "code_validate_conventions",
    description: "Validate adherence to project-specific naming, structure, and coding conventions.",
    inputSchema: {
      type: "object",
      properties: {
        projectPath: {
          type: "string",
          description: "Project root directory",
        },
        conventions: {
          type: "object",
          description: "Convention rules to validate against",
        },
        autodetectConventions: {
          type: "boolean",
          description: "Learn conventions from existing code (default: false)",
        },
        includeGlobs: {
          type: "array",
          items: { type: "string" },
          description: "File patterns to include",
        },
        excludeGlobs: {
          type: "array",
          items: { type: "string" },
          description: "File patterns to exclude",
        },
        severity: {
          type: "string",
          enum: ["error", "warning", "info"],
          description: "Minimum severity to report",
        },
      },
    },
  },
  {
    name: "code_generate_context_pack",
    description: "Build optimal AI context given a task, respecting token limits and maximizing relevance.",
    inputSchema: {
      type: "object",
      properties: {
        task: {
          type: "string",
          description: "User's task description (required)",
        },
        projectPath: {
          type: "string",
          description: "Project root directory",
        },
        maxTokens: {
          type: "number",
          description: "Token budget (default: 50000)",
        },
        includeTypes: {
          type: "array",
          items: {
            type: "string",
            enum: [
              "relevant-files",
              "dependencies",
              "tests",
              "types",
              "architecture",
              "conventions",
              "related-code",
              "composables",
              "stores",
              "server-routes",
              "nuxt-config",
            ],
          },
          description: "What to include in context",
        },
        focusAreas: {
          type: "array",
          items: { type: "string" },
          description: "Specific files/directories to prioritize",
        },
        includeHistory: {
          type: "boolean",
          description: "Include recent changes from git (default: false)",
        },
        format: {
          type: "string",
          enum: ["markdown", "json", "xml"],
          description: "Output format (default: markdown)",
        },
        includeLineNumbers: {
          type: "boolean",
          description: "Add line numbers to code (default: true)",
        },
        optimizationStrategy: {
          type: "string",
          enum: ["relevance", "breadth", "depth"],
          description: "Context optimization strategy (default: relevance)",
        },
      },
      required: ["task"],
    },
  },
];

// Create server instance
const server = new Server({
  name: "code-analysis-context-mcp",
  version: "0.1.0",
  capabilities: {
    tools: {},
  },
});

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "code_analyze_architecture":
        return await analyzeArchitecture(args as any);

      case "code_analyze_dependency_graph":
        return await analyzeDependencyGraph(args as any);

      case "code_analyze_patterns":
        return await analyzePatterns(args as any);

      case "code_analyze_coverage_gaps":
        return await analyzeCoverageGaps(args as any);

      case "code_validate_conventions":
        return await validateConventions(args as any);

      case "code_generate_context_pack":
        return await generateContextPack(args as any);

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: `Error executing ${name}: ${errorMessage}`,
        },
      ],
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Server is now running
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
