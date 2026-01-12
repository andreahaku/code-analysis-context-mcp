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

// Tool imports
import { analyzeArchitecture } from "./tools/architecture-analyzer.js";
import { analyzeDependencyGraph } from "./tools/dependency-mapper.js";
import { analyzePatterns } from "./tools/pattern-detector.js";
import { analyzeCoverageGaps } from "./tools/coverage-analyzer.js";
import { validateConventions } from "./tools/convention-validator.js";
import { generateContextPack } from "./tools/context-pack-generator.js";
import { analyzeSecurityVulnerabilities } from "./tools/security-analyzer.js";

// Parameter types for tool handlers
import type {
  ArchitectureAnalysisParams,
  DependencyAnalysisParams,
  PatternAnalysisParams,
  CoverageAnalysisParams,
  ConventionValidationParams,
  ContextPackParams,
  SecurityAnalysisParams,
} from "./types/index.js";

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
  {
    name: "security",
    description: "Security vulnerability analysis with OWASP mapping",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Project root" },
        inc: { type: "array", items: { type: "string" }, description: "Include globs" },
        exc: { type: "array", items: { type: "string" }, description: "Exclude globs" },
        sev: {
          type: "array",
          items: { type: "string", enum: ["critical", "high", "medium", "low", "info"] },
          description: "Filter by severity",
        },
        cats: {
          type: "array",
          items: {
            type: "string",
            enum: ["injection", "crypto", "access_control", "misconfiguration", "mobile", "vue_nuxt", "fastify_backend", "data_exposure", "dependencies"],
          },
          description: "Filter by category",
        },
        fw: {
          type: "string",
          enum: ["react", "rn", "expo", "vue3", "nuxt3", "fastify", "node"],
          description: "Override framework",
        },
        pos: { type: "boolean", description: "Include positive patterns (default: true)" },
        report: { type: "boolean", description: "Generate markdown report" },
        page: { type: "number", description: "Page number" },
        pageSize: { type: "number", description: "Items per page" },
      },
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

// Type definitions for parameter mapping
interface ParamMapping {
  short: string;
  long: string;
  transform?: (value: unknown) => unknown;
}

// Value transformers for common patterns
const transforms = {
  depthArchitecture: (v: unknown): unknown => {
    const s = v as string;
    return s === 'o' ? 'overview' : s === 'd' ? 'detailed' : 'deep';
  },
  frameworkShort: (v: unknown): unknown => {
    const s = v as string;
    return s === 'rn' ? 'react-native' : s;
  },
  testFramework: (v: unknown): unknown => {
    const s = v as string;
    return s === 'pw' ? 'playwright' : s;
  },
  priorityShort: (v: unknown): unknown => {
    const s = v as string;
    return s === 'crit' ? 'critical' : s === 'med' ? 'medium' : s;
  },
  severityShort: (v: unknown): unknown => {
    const s = v as string;
    return s === 'err' ? 'error' : s === 'warn' ? 'warning' : s;
  },
  formatShort: (v: unknown): unknown => {
    const s = v as string;
    return s === 'md' ? 'markdown' : s;
  },
  strategyShort: (v: unknown): unknown => {
    const s = v as string;
    const map: Record<string, string> = { rel: 'relevance', wide: 'breadth', deep: 'depth' };
    return map[s] || s;
  },
};

// Common parameter mappings shared across tools
const commonMappings: ParamMapping[] = [
  { short: 'path', long: 'projectPath' },
  { short: 'inc', long: 'includeGlobs' },
  { short: 'exc', long: 'excludeGlobs' },
];

// Tool-specific parameter mappings
const toolMappings: Record<string, ParamMapping[]> = {
  arch: [
    { short: 'depth', long: 'depth', transform: transforms.depthArchitecture },
    { short: 'types', long: 'analyzeTypes' },
    { short: 'diagrams', long: 'generateDiagrams' },
    { short: 'metrics', long: 'includeMetrics' },
    { short: 'details', long: 'includeDetailedMetrics' },
    { short: 'minCx', long: 'minComplexity' },
    { short: 'maxFiles', long: 'maxDetailedFiles' },
    { short: 'memSuggest', long: 'generateMemorySuggestions' },
    { short: 'autoFw', long: 'detectFramework' },
    { short: 'fw', long: 'framework', transform: transforms.frameworkShort },
  ],
  deps: [
    { short: 'depth', long: 'depth' },
    { short: 'circular', long: 'detectCircular' },
    { short: 'metrics', long: 'calculateMetrics' },
    { short: 'diagram', long: 'generateDiagram' },
    { short: 'focus', long: 'focusModule' },
    { short: 'external', long: 'includeExternal' },
  ],
  patterns: [
    { short: 'types', long: 'patternTypes' },
    { short: 'custom', long: 'detectCustomPatterns' },
    { short: 'best', long: 'compareWithBestPractices' },
    { short: 'suggest', long: 'suggestImprovements' },
  ],
  coverage: [
    { short: 'report', long: 'coverageReportPath' },
    { short: 'fw', long: 'framework', transform: transforms.testFramework },
    { short: 'threshold', long: 'threshold' },
    { short: 'priority', long: 'priority', transform: transforms.priorityShort },
    { short: 'tests', long: 'suggestTests' },
    { short: 'cx', long: 'analyzeComplexity' },
  ],
  conventions: [
    { short: 'rules', long: 'conventions' },
    { short: 'auto', long: 'autodetectConventions' },
    { short: 'severity', long: 'severity', transform: transforms.severityShort },
  ],
  context: [
    { short: 'task', long: 'task' },
    { short: 'tokens', long: 'maxTokens' },
    { short: 'include', long: 'includeTypes' },
    { short: 'focus', long: 'focusAreas' },
    { short: 'history', long: 'includeHistory' },
    { short: 'format', long: 'format', transform: transforms.formatShort },
    { short: 'lineNums', long: 'includeLineNumbers' },
    { short: 'strategy', long: 'optimizationStrategy', transform: transforms.strategyShort },
  ],
  security: [
    { short: 'sev', long: 'severity' },
    { short: 'cats', long: 'categories' },
    { short: 'fw', long: 'framework', transform: transforms.frameworkShort },
    { short: 'pos', long: 'includePositive' },
    { short: 'report', long: 'generateReport' },
    { short: 'page', long: 'page' },
    { short: 'pageSize', long: 'pageSize' },
  ],
};

// Apply a single mapping to the result object
function applyMapping(args: Record<string, unknown>, mapped: Record<string, unknown>, mapping: ParamMapping): void {
  if (mapping.short in args) {
    const value = args[mapping.short];
    mapped[mapping.long] = mapping.transform ? mapping.transform(value) : value;
  }
}

// Parameter mapping: short -> long names
function mapParams(tool: string, args: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!args) return {};

  const mapped: Record<string, unknown> = {};

  // Apply common mappings
  for (const mapping of commonMappings) {
    applyMapping(args, mapped, mapping);
  }

  // Apply tool-specific mappings
  const specificMappings = toolMappings[tool];
  if (specificMappings) {
    for (const mapping of specificMappings) {
      applyMapping(args, mapped, mapping);
    }
  }

  return mapped;
}

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    const mappedArgs = mapParams(name, args as Record<string, unknown> | undefined);

    switch (name) {
      case "arch":
        return await analyzeArchitecture(mappedArgs as ArchitectureAnalysisParams);

      case "deps":
        return await analyzeDependencyGraph(mappedArgs as DependencyAnalysisParams);

      case "patterns":
        return await analyzePatterns(mappedArgs as PatternAnalysisParams);

      case "coverage":
        return await analyzeCoverageGaps(mappedArgs as CoverageAnalysisParams);

      case "conventions":
        return await validateConventions(mappedArgs as ConventionValidationParams);

      case "context":
        return await generateContextPack(mappedArgs as unknown as ContextPackParams);

      case "security":
        return await analyzeSecurityVulnerabilities(mappedArgs as SecurityAnalysisParams);

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
