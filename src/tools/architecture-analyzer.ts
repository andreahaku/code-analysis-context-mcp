/**
 * Architecture Analyzer Tool
 *
 * Generates comprehensive architectural overview with component relationships,
 * data flow, and navigation patterns.
 */

import * as path from "path";
import * as fs from "fs/promises";
import fg from "fast-glob";
import { FrameworkDetector } from "../utils/framework-detector.js";
import { ASTParser } from "../services/ast-parser.js";
import { MermaidGenerator } from "../utils/mermaid-generator.js";
import type {
  ArchitectureAnalysisParams,
  ArchitectureAnalysisResult,
  FrameworkType,
} from "../types/index.js";

export async function analyzeArchitecture(
  params: ArchitectureAnalysisParams
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const projectPath = params.projectPath || process.cwd();
  const depth = params.depth || "detailed";
  const generateDiagrams = params.generateDiagrams ?? true;
  const includeMetrics = params.includeMetrics ?? true;
  const includeDetailedMetrics = params.includeDetailedMetrics ?? true;
  const minComplexity = params.minComplexity ?? 0;
  const maxDetailedFiles = params.maxDetailedFiles;

  try {
    // Detect framework
    const { framework } = await FrameworkDetector.detect(projectPath);

    // Get appropriate globs
    const includeGlobs = params.includeGlobs || FrameworkDetector.getDefaultIncludeGlobs(framework);
    const excludeGlobs = params.excludeGlobs || FrameworkDetector.getDefaultExcludeGlobs(framework);

    // Find files
    const files = await fg(includeGlobs, {
      cwd: projectPath,
      ignore: excludeGlobs,
      absolute: true,
    });

    // Parse all files
    const fileResults = await Promise.all(
      files.map(async (file) => {
        try {
          const content = await fs.readFile(file, "utf-8");
          const lineCount = content.split("\n").length;
          const ast = await ASTParser.parseFile(file);
          const imports = ASTParser.extractImports(ast);
          const exports = ASTParser.extractExports(ast);
          const complexity = ASTParser.calculateComplexity(ast);
          const patterns = ASTParser.detectFrameworkPatterns(ast);

          return {
            path: path.relative(projectPath, file),
            ast,
            imports,
            exports,
            complexity,
            patterns,
            lines: lineCount,
          };
        } catch (error) {
          console.error(`Error parsing ${file}:`, error);
          return null;
        }
      })
    );

    const validFiles = fileResults.filter((f) => f !== null);

    // Analyze based on framework
    const result = await analyzeByFramework(framework, validFiles, projectPath, depth);

    // Generate diagrams if requested
    if (generateDiagrams) {
      result.diagrams = {
        architecture: MermaidGenerator.generateArchitectureDiagram(result.architecture.layers),
        dataFlow: MermaidGenerator.generateDataFlowDiagram(result.dataFlow.description),
      };
    }

    // Calculate metrics if requested
    if (includeMetrics) {
      const totalComplexity = validFiles.reduce((sum, f) => sum + f.complexity, 0);
      const totalLines = validFiles.reduce((sum, f) => sum + (f.lines || 0), 0);
      const avgComplexity = validFiles.length > 0 ? totalComplexity / validFiles.length : 0;
      const maxComplexity = validFiles.length > 0 ? Math.max(...validFiles.map((f) => f.complexity)) : 0;

      result.metrics = {
        totalFiles: validFiles.length,
        totalLines,
        avgComplexity,
        maxComplexity,
      };

      // Add detailed per-file metrics if requested
      if (includeDetailedMetrics) {
        let detailedMetrics = validFiles
          .map((f) => ({
            path: f.path,
            lines: f.lines || 0,
            complexity: f.complexity,
            exports: f.exports,
            imports: f.imports.length,
            patterns: f.patterns,
          }))
          .sort((a, b) => b.complexity - a.complexity); // Sort by complexity descending

        // Filter by minimum complexity threshold
        if (minComplexity > 0) {
          detailedMetrics = detailedMetrics.filter((f) => f.complexity >= minComplexity);
        }

        // Limit number of files if specified
        if (maxDetailedFiles !== undefined && maxDetailedFiles > 0) {
          detailedMetrics = detailedMetrics.slice(0, maxDetailedFiles);
        }

        result.metrics.detailedMetrics = detailedMetrics;
      }
    }

    // Format response
    const response = {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };

    return response;
  } catch (error) {
    throw new Error(`Architecture analysis failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Analyze based on detected framework
 */
async function analyzeByFramework(
  framework: FrameworkType,
  files: any[],
  projectPath: string,
  _depth: string
): Promise<ArchitectureAnalysisResult> {
  // Base result structure
  const result: ArchitectureAnalysisResult = {
    project: {
      name: path.basename(projectPath),
      type: framework,
      structure: "modular",
    },
    architecture: {
      layers: [],
      entryPoints: [],
      coreModules: [],
    },
    components: {
      total: 0,
      byType: {},
    },
    stateManagement: {
      pattern: "context",
      flow: "Component → State → UI",
    },
    navigation: {
      routes: [],
    },
    dataFlow: {
      description: "Data flows from user interaction through components to state management",
    },
    metrics: {
      totalFiles: files.length,
      totalLines: 0,
      avgComplexity: 0,
      maxComplexity: 0,
    },
    diagrams: {},
    recommendations: [],
  };

  // Framework-specific analysis
  switch (framework) {
    case "nuxt3":
      return analyzeNuxt3(result, files, projectPath);

    case "vue3":
      return analyzeVue3(result, files, projectPath);

    case "react-native":
    case "expo":
      return analyzeReactNative(result, files, projectPath);

    case "react":
      return analyzeReact(result, files, projectPath);

    default:
      return result;
  }
}

/**
 * Nuxt 3 specific analysis
 */
async function analyzeNuxt3(
  result: ArchitectureAnalysisResult,
  files: any[],
  _projectPath: string
): Promise<ArchitectureAnalysisResult> {
  // Detect Nuxt layers
  result.architecture.layers = [
    {
      name: "Pages",
      description: "File-based routing and page components",
      directories: ["pages/"],
      dependencies: ["components/", "composables/", "stores/"],
    },
    {
      name: "Components",
      description: "Reusable Vue components (auto-imported)",
      directories: ["components/"],
      dependencies: ["composables/"],
    },
    {
      name: "Composables",
      description: "Vue Composition API composables (auto-imported)",
      directories: ["composables/"],
      dependencies: ["stores/", "utils/"],
    },
    {
      name: "Stores",
      description: "Pinia stores for state management",
      directories: ["stores/"],
      dependencies: ["composables/"],
    },
    {
      name: "Server",
      description: "Server routes and API endpoints",
      directories: ["server/"],
      dependencies: [],
    },
  ];

  // Count composables
  const composables = files.filter((f) => f.path.startsWith("composables/"));
  result.composables = {
    total: composables.length,
    custom: composables.map((f) => f.path),
    autoImported: true,
    patterns: [],
  };

  // Detect Pinia stores
  const stores = files.filter((f) => f.path.startsWith("stores/"));
  result.stateManagement.pattern = "pinia";
  result.stateManagement.stores = stores.map((s) => ({
    name: path.basename(s.path, path.extname(s.path)),
    path: s.path,
    state: [],
    getters: [],
    actions: [],
  }));

  // File-based routing
  result.navigation.pattern = "file-based";

  result.recommendations = [
    "Leverage Nuxt auto-imports for components and composables",
    "Use Pinia for centralized state management",
    "Consider using server routes for API endpoints",
  ];

  return result;
}

/**
 * Vue 3 specific analysis
 */
async function analyzeVue3(
  result: ArchitectureAnalysisResult,
  files: any[],
  _projectPath: string
): Promise<ArchitectureAnalysisResult> {
  result.architecture.layers = [
    {
      name: "Components",
      description: "Vue 3 components using Composition API",
      directories: ["src/components/", "components/"],
      dependencies: ["composables/"],
    },
    {
      name: "Composables",
      description: "Reusable composition functions",
      directories: ["src/composables/", "composables/"],
      dependencies: [],
    },
  ];

  const vueFiles = files.filter((f) => f.path.endsWith(".vue"));
  result.components.total = vueFiles.length;

  result.recommendations = [
    "Use Composition API for better code organization",
    "Extract reusable logic into composables",
  ];

  return result;
}

/**
 * React Native specific analysis
 */
async function analyzeReactNative(
  result: ArchitectureAnalysisResult,
  files: any[],
  _projectPath: string
): Promise<ArchitectureAnalysisResult> {
  result.architecture.layers = [
    {
      name: "Screens",
      description: "Top-level screen components",
      directories: ["screens/", "src/screens/"],
      dependencies: ["components/", "hooks/"],
    },
    {
      name: "Components",
      description: "Reusable UI components",
      directories: ["components/", "src/components/"],
      dependencies: ["hooks/"],
    },
    {
      name: "Hooks",
      description: "Custom React hooks",
      directories: ["hooks/", "src/hooks/"],
      dependencies: ["utils/"],
    },
  ];

  const hooks = files.filter((f) => f.path.includes("hooks/"));
  result.hooks = {
    total: hooks.length,
    custom: hooks.map((h) => h.path),
    patterns: [],
  };

  result.recommendations = [
    "Extract complex logic into custom hooks",
    "Use React Context for global state",
  ];

  return result;
}

/**
 * React specific analysis
 */
async function analyzeReact(
  result: ArchitectureAnalysisResult,
  _files: any[],
  _projectPath: string
): Promise<ArchitectureAnalysisResult> {
  result.architecture.layers = [
    {
      name: "Components",
      description: "React components",
      directories: ["src/components/", "components/"],
      dependencies: ["hooks/"],
    },
    {
      name: "Hooks",
      description: "Custom React hooks",
      directories: ["src/hooks/", "hooks/"],
      dependencies: [],
    },
  ];

  result.recommendations = [
    "Follow React best practices",
    "Use hooks for stateful logic",
  ];

  return result;
}
