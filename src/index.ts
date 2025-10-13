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

// Tool definitions (token-optimized)
const TOOLS: Tool[] = [
  {
    name: "arch",
    description: "Analyze architecture, components, patterns. Supports React/RN/Vue/Nuxt",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Project root" },
        inc: { type: "array", items: { type: "string" }, description: "Include globs" },
        exc: { type: "array", items: { type: "string" }, description: "Exclude globs" },
        depth: { type: "string", enum: ["o", "d", "x"], description: "overview/detailed/deep" },
        types: {
          type: "array",
          items: {
            type: "string",
            enum: ["comp", "hooks", "use", "prov", "store", "nav", "state", "flow", "api", "route", "mid", "plug", "layout"],
          },
          description: "Analysis types",
        },
        diagrams: { type: "boolean", description: "Mermaid diagrams" },
        metrics: { type: "boolean", description: "Code metrics" },
        details: { type: "boolean", description: "Per-file metrics" },
        minCx: { type: "number", description: "Min complexity filter" },
        maxFiles: { type: "number", description: "Max files in details" },
        memSuggest: { type: "boolean", description: "LLM memory suggestions" },
        autoFw: { type: "boolean", description: "Auto-detect framework" },
        fw: { type: "string", enum: ["react", "rn", "vue3", "nuxt3"], description: "Force framework" },
      },
    },
  },
  {
    name: "deps",
    description: "Dependency graph, circular deps, coupling metrics",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Project root" },
        inc: { type: "array", items: { type: "string" }, description: "Include globs" },
        exc: { type: "array", items: { type: "string" }, description: "Exclude globs" },
        depth: { type: "number", description: "Max depth" },
        circular: { type: "boolean", description: "Detect circular" },
        metrics: { type: "boolean", description: "Coupling/cohesion" },
        diagram: { type: "boolean", description: "Mermaid diagram" },
        focus: { type: "string", description: "Focus on module" },
        external: { type: "boolean", description: "Include node_modules" },
      },
    },
  },
  {
    name: "patterns",
    description: "Detect framework patterns, best practices",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Project root" },
        types: {
          type: "array",
          items: {
            type: "string",
            enum: ["hooks", "hoc", "rp", "cc", "prov", "nav", "form", "fetch", "err", "test", "use", "pinia", "plug", "mod", "mid", "dir"],
          },
          description: "Pattern types",
        },
        inc: { type: "array", items: { type: "string" }, description: "Include globs" },
        exc: { type: "array", items: { type: "string" }, description: "Exclude globs" },
        custom: { type: "boolean", description: "Custom patterns" },
        best: { type: "boolean", description: "Compare best practices" },
        suggest: { type: "boolean", description: "Improvement suggestions" },
      },
    },
  },
  {
    name: "coverage",
    description: "Test coverage gaps, actionable suggestions",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Project root" },
        report: { type: "string", description: "Coverage report path" },
        fw: { type: "string", enum: ["jest", "vitest", "pw"], description: "Test framework" },
        threshold: {
          type: "object",
          properties: {
            lines: { type: "number" },
            functions: { type: "number" },
            branches: { type: "number" },
            statements: { type: "number" },
          },
          description: "Min thresholds",
        },
        priority: { type: "string", enum: ["crit", "high", "med", "low", "all"], description: "Filter priority" },
        inc: { type: "array", items: { type: "string" }, description: "Include globs" },
        exc: { type: "array", items: { type: "string" }, description: "Exclude globs" },
        tests: { type: "boolean", description: "Generate scaffolds" },
        cx: { type: "boolean", description: "Analyze complexity" },
      },
    },
  },
  {
    name: "conventions",
    description: "Validate naming, structure, code conventions",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Project root" },
        rules: { type: "object", description: "Convention rules" },
        auto: { type: "boolean", description: "Auto-detect conventions" },
        inc: { type: "array", items: { type: "string" }, description: "Include globs" },
        exc: { type: "array", items: { type: "string" }, description: "Exclude globs" },
        severity: { type: "string", enum: ["err", "warn", "info"], description: "Min severity" },
      },
    },
  },
  {
    name: "context",
    description: "Build AI context pack for task",
    inputSchema: {
      type: "object",
      properties: {
        task: { type: "string", description: "Task description" },
        path: { type: "string", description: "Project root" },
        tokens: { type: "number", description: "Token budget" },
        include: {
          type: "array",
          items: { type: "string", enum: ["files", "deps", "tests", "types", "arch", "conv", "code", "use", "store", "route", "cfg"] },
          description: "Content types",
        },
        focus: { type: "array", items: { type: "string" }, description: "Priority files/dirs" },
        history: { type: "boolean", description: "Git changes" },
        format: { type: "string", enum: ["md", "json", "xml"], description: "Output format" },
        lineNums: { type: "boolean", description: "Line numbers" },
        strategy: { type: "string", enum: ["rel", "wide", "deep"], description: "Optimization strategy" },
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

// Parameter mapping: short -> long names
function mapParams(tool: string, args: any): any {
  if (!args) return args;

  const mapped: any = {};

  // Common mappings
  if ('path' in args) mapped.projectPath = args.path;
  if ('inc' in args) mapped.includeGlobs = args.inc;
  if ('exc' in args) mapped.excludeGlobs = args.exc;

  // Tool-specific mappings
  switch (tool) {
    case "arch":
      if ('depth' in args) mapped.depth = args.depth === 'o' ? 'overview' : args.depth === 'd' ? 'detailed' : 'deep';
      if ('types' in args) mapped.analyzeTypes = args.types;
      if ('diagrams' in args) mapped.generateDiagrams = args.diagrams;
      if ('metrics' in args) mapped.includeMetrics = args.metrics;
      if ('details' in args) mapped.includeDetailedMetrics = args.details;
      if ('minCx' in args) mapped.minComplexity = args.minCx;
      if ('maxFiles' in args) mapped.maxDetailedFiles = args.maxFiles;
      if ('memSuggest' in args) mapped.generateMemorySuggestions = args.memSuggest;
      if ('autoFw' in args) mapped.detectFramework = args.autoFw;
      if ('fw' in args) mapped.framework = args.fw === 'rn' ? 'react-native' : args.fw;
      break;

    case "deps":
      if ('depth' in args) mapped.depth = args.depth;
      if ('circular' in args) mapped.detectCircular = args.circular;
      if ('metrics' in args) mapped.calculateMetrics = args.metrics;
      if ('diagram' in args) mapped.generateDiagram = args.diagram;
      if ('focus' in args) mapped.focusModule = args.focus;
      if ('external' in args) mapped.includeExternal = args.external;
      break;

    case "patterns":
      if ('types' in args) mapped.patternTypes = args.types;
      if ('custom' in args) mapped.detectCustomPatterns = args.custom;
      if ('best' in args) mapped.compareWithBestPractices = args.best;
      if ('suggest' in args) mapped.suggestImprovements = args.suggest;
      break;

    case "coverage":
      if ('report' in args) mapped.coverageReportPath = args.report;
      if ('fw' in args) mapped.framework = args.fw === 'pw' ? 'playwright' : args.fw;
      if ('threshold' in args) mapped.threshold = args.threshold;
      if ('priority' in args) {
        const p = args.priority;
        mapped.priority = p === 'crit' ? 'critical' : p === 'med' ? 'medium' : p;
      }
      if ('tests' in args) mapped.suggestTests = args.tests;
      if ('cx' in args) mapped.analyzeComplexity = args.cx;
      break;

    case "conventions":
      if ('rules' in args) mapped.conventions = args.rules;
      if ('auto' in args) mapped.autodetectConventions = args.auto;
      if ('severity' in args) {
        const s = args.severity;
        mapped.severity = s === 'err' ? 'error' : s === 'warn' ? 'warning' : s;
      }
      break;

    case "context":
      if ('task' in args) mapped.task = args.task;
      if ('tokens' in args) mapped.maxTokens = args.tokens;
      if ('include' in args) mapped.includeTypes = args.include;
      if ('focus' in args) mapped.focusAreas = args.focus;
      if ('history' in args) mapped.includeHistory = args.history;
      if ('format' in args) {
        const f = args.format;
        mapped.format = f === 'md' ? 'markdown' : f;
      }
      if ('lineNums' in args) mapped.includeLineNumbers = args.lineNums;
      if ('strategy' in args) {
        const st = args.strategy;
        mapped.optimizationStrategy = st === 'rel' ? 'relevance' : st === 'wide' ? 'breadth' : st === 'deep' ? 'depth' : st;
      }
      break;
  }

  return mapped;
}

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    const mappedArgs = mapParams(name, args);

    switch (name) {
      case "arch":
        return await analyzeArchitecture(mappedArgs as any);

      case "deps":
        return await analyzeDependencyGraph(mappedArgs as any);

      case "patterns":
        return await analyzePatterns(mappedArgs as any);

      case "coverage":
        return await analyzeCoverageGaps(mappedArgs as any);

      case "conventions":
        return await validateConventions(mappedArgs as any);

      case "context":
        return await generateContextPack(mappedArgs as any);

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
