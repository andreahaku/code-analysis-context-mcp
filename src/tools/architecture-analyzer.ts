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
  const generateMemorySuggestions = params.generateMemorySuggestions ?? false;

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

        // Smart defaults for large projects
        let appliedMinComplexity = minComplexity;
        let appliedMaxFiles = maxDetailedFiles;
        let autoOptimized = false;

        // Auto-optimize for large projects if no filters specified
        if (validFiles.length > 100 && minComplexity === 0 && maxDetailedFiles === undefined) {
          appliedMinComplexity = 10; // Only show files with complexity >= 10
          appliedMaxFiles = 50; // Limit to top 50
          autoOptimized = true;
        }

        // Filter by minimum complexity threshold
        if (appliedMinComplexity > 0) {
          detailedMetrics = detailedMetrics.filter((f) => f.complexity >= appliedMinComplexity);
        }

        // Limit number of files if specified
        if (appliedMaxFiles !== undefined && appliedMaxFiles > 0) {
          detailedMetrics = detailedMetrics.slice(0, appliedMaxFiles);
        }

        result.metrics.detailedMetrics = detailedMetrics;

        // Add optimization note if auto-optimized
        if (autoOptimized) {
          result.recommendations.unshift(
            `📊 Auto-optimized for large project: Showing only files with complexity ≥ ${appliedMinComplexity} (top ${appliedMaxFiles}). ` +
            `Use minComplexity and maxDetailedFiles parameters to customize filtering.`
          );
        }
      }
    }

    // Generate LLM memory suggestions if requested
    if (generateMemorySuggestions) {
      result.memorySuggestions = generateMemorySuggestionsFromAnalysis(result, projectPath);
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

    case "fastify":
      return analyzeFastify(result, files, projectPath);

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
 * React Native specific analysis (includes Expo)
 */
async function analyzeReactNative(
  result: ArchitectureAnalysisResult,
  files: any[],
  projectPath: string
): Promise<ArchitectureAnalysisResult> {
  // Comprehensive layer detection
  result.architecture.layers = [
    {
      name: "Screens",
      description: "Top-level screen components for navigation",
      directories: ["screens/", "src/screens/", "app/screens/"],
      dependencies: ["components/", "hooks/", "contexts/", "services/"],
    },
    {
      name: "Navigation",
      description: "Navigation configuration and navigators",
      directories: ["navigation/", "src/navigation/", "app/navigation/"],
      dependencies: ["screens/", "contexts/"],
    },
    {
      name: "Components",
      description: "Reusable UI components",
      directories: ["components/", "src/components/", "app/components/"],
      dependencies: ["hooks/", "utils/", "theme/"],
    },
    {
      name: "Hooks",
      description: "Custom React hooks for shared logic",
      directories: ["hooks/", "src/hooks/", "app/hooks/"],
      dependencies: ["services/", "contexts/", "utils/"],
    },
    {
      name: "Contexts",
      description: "React Context providers for global state",
      directories: ["contexts/", "src/contexts/", "app/contexts/", "providers/", "src/providers/"],
      dependencies: ["hooks/", "services/"],
    },
    {
      name: "Services",
      description: "API clients, business logic, and external integrations",
      directories: ["services/", "src/services/", "app/services/", "api/", "src/api/"],
      dependencies: ["utils/", "constants/"],
    },
    {
      name: "Utils",
      description: "Utility functions and helpers",
      directories: ["utils/", "src/utils/", "app/utils/", "helpers/", "src/helpers/"],
      dependencies: ["constants/"],
    },
    {
      name: "Constants",
      description: "App constants, theme, and configuration",
      directories: ["constants/", "src/constants/", "app/constants/", "theme/", "config/"],
      dependencies: [],
    },
    {
      name: "Types",
      description: "TypeScript type definitions",
      directories: ["types/", "src/types/", "app/types/", "@types/"],
      dependencies: [],
    },
  ];

  // Count custom hooks
  const hooks = files.filter((f) => f.path.includes("hooks/") || f.path.includes("/hooks."));
  result.hooks = {
    total: hooks.length,
    custom: hooks.map((h) => h.path),
    patterns: [],
  };

  // Detect state management from imports
  let statePattern: "context" | "redux" | "zustand" | "mobx" | "pinia" | "vuex" | "mixed" = "context";
  const hasRedux = files.some(
    (f) =>
      f.imports?.some(
        (imp: any) =>
          imp.source === "redux" ||
          imp.source === "@reduxjs/toolkit" ||
          imp.source === "react-redux"
      )
  );
  const hasZustand = files.some((f) => f.imports?.some((imp: any) => imp.source === "zustand"));
  const hasMobx = files.some(
    (f) => f.imports?.some((imp: any) => imp.source === "mobx" || imp.source === "mobx-react")
  );

  if (hasRedux) statePattern = "redux";
  else if (hasZustand) statePattern = "zustand";
  else if (hasMobx) statePattern = "mobx";
  else if (hasRedux && (hasZustand || hasMobx)) statePattern = "mixed";

  result.stateManagement.pattern = statePattern;

  // React Native specific information
  const reactNativeInfo: import("../types/index.js").ReactNativeArchitectureExtension = {
    mobilePatterns: {
      flatLists: 0,
      scrollViews: 0,
      touchables: 0,
      keyboards: 0,
      safeAreas: 0,
      modals: 0,
      bottomSheets: 0,
    },
    thirdPartyLibraries: {
      navigation: [],
      stateManagement: [],
      ui: [],
      networking: [],
      forms: [],
      animations: [],
      gestures: [],
      media: [],
      maps: [],
    },
  };

  // Detect navigation libraries
  const navFiles = files.filter((f) => f.path.includes("navigation/"));
  const hasReactNavigation = files.some((f) =>
    f.imports?.some((imp: any) => imp.source.startsWith("@react-navigation/"))
  );
  const hasExpoRouter = files.some((f) =>
    f.imports?.some((imp: any) => imp.source === "expo-router" || imp.source.startsWith("expo-router/"))
  );

  if (hasReactNavigation) {
    reactNativeInfo.thirdPartyLibraries!.navigation!.push("@react-navigation/*");
    result.navigation.pattern = "stack"; // Default, could be tab/drawer/mixed
  }
  if (hasExpoRouter) {
    reactNativeInfo.thirdPartyLibraries!.navigation!.push("expo-router");
    result.navigation.pattern = "file-based";
  }

  // Detect UI libraries
  const uiLibraries = [
    { pkg: "react-native-paper", name: "React Native Paper" },
    { pkg: "native-base", name: "Native Base" },
    { pkg: "@shopify/restyle", name: "Shopify Restyle" },
    { pkg: "tamagui", name: "Tamagui" },
    { pkg: "react-native-elements", name: "React Native Elements" },
    { pkg: "@ui-kitten/components", name: "UI Kitten" },
  ];
  for (const lib of uiLibraries) {
    if (files.some((f) => f.imports?.some((imp: any) => imp.source === lib.pkg))) {
      reactNativeInfo.thirdPartyLibraries!.ui!.push(lib.name);
    }
  }

  // Detect networking libraries
  if (files.some((f) => f.imports?.some((imp: any) => imp.source === "axios"))) {
    reactNativeInfo.thirdPartyLibraries!.networking!.push("axios");
  }
  if (files.some((f) => f.imports?.some((imp: any) => imp.source === "@tanstack/react-query"))) {
    reactNativeInfo.thirdPartyLibraries!.networking!.push("React Query");
  }
  if (files.some((f) => f.imports?.some((imp: any) => imp.source === "swr"))) {
    reactNativeInfo.thirdPartyLibraries!.networking!.push("SWR");
  }

  // Detect form libraries
  if (files.some((f) => f.imports?.some((imp: any) => imp.source === "react-hook-form"))) {
    reactNativeInfo.thirdPartyLibraries!.forms!.push("React Hook Form");
  }
  if (files.some((f) => f.imports?.some((imp: any) => imp.source === "formik"))) {
    reactNativeInfo.thirdPartyLibraries!.forms!.push("Formik");
  }

  // Detect animation libraries
  if (files.some((f) => f.imports?.some((imp: any) => imp.source === "react-native-reanimated"))) {
    reactNativeInfo.thirdPartyLibraries!.animations!.push("Reanimated");
  }
  if (files.some((f) => f.imports?.some((imp: any) => imp.source === "lottie-react-native"))) {
    reactNativeInfo.thirdPartyLibraries!.animations!.push("Lottie");
  }

  // Detect gesture handler
  if (files.some((f) => f.imports?.some((imp: any) => imp.source === "react-native-gesture-handler"))) {
    reactNativeInfo.thirdPartyLibraries!.gestures!.push("Gesture Handler");
  }

  // Detect media libraries
  if (files.some((f) => f.imports?.some((imp: any) => imp.source === "react-native-image-picker"))) {
    reactNativeInfo.thirdPartyLibraries!.media!.push("Image Picker");
  }
  if (files.some((f) => f.imports?.some((imp: any) => imp.source === "expo-av"))) {
    reactNativeInfo.thirdPartyLibraries!.media!.push("Expo AV");
  }
  if (files.some((f) => f.imports?.some((imp: any) => imp.source === "react-native-video"))) {
    reactNativeInfo.thirdPartyLibraries!.media!.push("Video");
  }

  // Detect maps
  if (files.some((f) => f.imports?.some((imp: any) => imp.source === "react-native-maps"))) {
    reactNativeInfo.thirdPartyLibraries!.maps!.push("React Native Maps");
  }

  // Count mobile UI patterns from file content
  for (const file of files) {
    const content = await fs.readFile(path.join(projectPath, file.path), "utf-8");
    reactNativeInfo.mobilePatterns!.flatLists! += (content.match(/FlatList/g) || []).length;
    reactNativeInfo.mobilePatterns!.scrollViews! += (content.match(/ScrollView/g) || []).length;
    reactNativeInfo.mobilePatterns!.touchables! += (content.match(/Touchable|Pressable/g) || []).length;
    reactNativeInfo.mobilePatterns!.keyboards! += (content.match(/Keyboard\./g) || []).length;
    reactNativeInfo.mobilePatterns!.safeAreas! += (content.match(/SafeAreaView/g) || []).length;
    reactNativeInfo.mobilePatterns!.modals! += (content.match(/<Modal/g) || []).length;
  }

  result.reactNative = reactNativeInfo;

  // Enhanced recommendations
  const recommendations: string[] = [];

  if (!hasReactNavigation && !hasExpoRouter) {
    recommendations.push("📱 Consider using React Navigation or Expo Router for navigation");
  }

  if (result.stateManagement.pattern === "context" && files.length > 50) {
    recommendations.push("🔄 For larger apps, consider Zustand or Redux for state management");
  }

  if (hooks.length < 5) {
    recommendations.push("🪝 Extract reusable logic into custom hooks");
  }

  if (reactNativeInfo.thirdPartyLibraries!.animations!.length === 0) {
    recommendations.push("✨ Consider React Native Reanimated for smooth 60fps animations");
  }

  if (!navFiles.length) {
    recommendations.push("🧭 Organize navigation in a dedicated navigation/ directory");
  }

  if (reactNativeInfo.mobilePatterns!.flatLists! > 10) {
    recommendations.push("⚡ Optimize FlatList performance with getItemLayout, keyExtractor, and memoization");
  }

  result.recommendations = recommendations;

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

/**
 * Fastify specific analysis
 */
async function analyzeFastify(
  result: ArchitectureAnalysisResult,
  files: any[],
  _projectPath: string
): Promise<ArchitectureAnalysisResult> {
  // Define Fastify backend layers
  result.architecture.layers = [
    {
      name: "Routes",
      description: "API endpoint definitions and route handlers",
      directories: ["routes/", "src/routes/"],
      dependencies: ["services/", "schemas/", "hooks/"],
    },
    {
      name: "Services",
      description: "Business logic and data processing",
      directories: ["services/", "src/services/"],
      dependencies: ["models/", "db/", "utils/"],
    },
    {
      name: "Models",
      description: "Data models and database schemas",
      directories: ["models/", "src/models/", "db/", "src/db/"],
      dependencies: ["database/"],
    },
    {
      name: "Plugins",
      description: "Fastify plugins and middleware",
      directories: ["plugins/", "src/plugins/"],
      dependencies: ["utils/", "config/"],
    },
    {
      name: "Messaging",
      description: "Kafka producers/consumers and stream processing",
      directories: ["consumers/", "producers/", "streams/", "src/consumers/", "src/producers/", "src/streams/"],
      dependencies: ["services/", "utils/"],
    },
    {
      name: "Configuration",
      description: "Application configuration and environment setup",
      directories: ["config/", "src/config/"],
      dependencies: [],
    },
  ];

  // Identify entry points
  result.architecture.entryPoints = files
    .filter((f) =>
      f.path.match(/(^|\/)(?:server|app|index)\.[jt]s$/)
    )
    .map((f) => f.path);

  // Identify core modules
  const coreModules = files
    .filter((f) => f.exports.length > 0)
    .sort((a, b) => b.complexity - a.complexity)
    .slice(0, 10);

  result.architecture.coreModules = coreModules.map((f) => ({
    name: path.basename(f.path, path.extname(f.path)),
    path: f.path,
    purpose: inferPurpose(f.path),
    exports: f.exports,
    dependencies: f.imports.map((imp: any) => imp.source),
  }));

  // Count routes
  const routeFiles = files.filter((f) =>
    f.path.match(/routes\//i) ||
    (f.patterns && f.patterns.fastifyRoutes) ||
    f.exports.some((e: string) => e.includes("route") || e.includes("handler"))
  );

  result.components = {
    total: routeFiles.length,
    byType: {
      routes: routeFiles.length,
      plugins: files.filter((f) => f.path.match(/plugins\//i)).length,
      services: files.filter((f) => f.path.match(/services\//i)).length,
      models: files.filter((f) => f.path.match(/models\//i) || f.path.match(/db\//i)).length,
      consumers: files.filter((f) => f.path.match(/consumers\//i)).length,
      producers: files.filter((f) => f.path.match(/producers\//i)).length,
      streams: files.filter((f) => f.path.match(/streams\//i)).length,
    },
  };

  // Detect state management (database)
  const dbFiles = files.filter((f) =>
    f.path.match(/db\//i) ||
    f.path.match(/database\//i) ||
    f.path.match(/models\//i) ||
    (f.patterns && f.patterns.hasPostgres)
  );

  result.stateManagement = {
    pattern: "mixed",
    flow: "Request → Routes → Services → Database → Response",
    stores: dbFiles.map((f) => ({
      name: path.basename(f.path, path.extname(f.path)),
      path: f.path,
      state: [],
      getters: [],
      actions: f.exports,
    })),
  };

  // Detect server routes
  result.serverRoutes = {
    total: routeFiles.length,
    routes: routeFiles.map((f) => ({
      path: f.path,
      method: "GET", // Default, would need deeper AST analysis
      file: f.path,
      handler: f.exports[0] || "handler",
    })),
  };

  // Data flow
  result.dataFlow = {
    description: `
**Fastify Backend Architecture**

1. **Request Flow**: Client → Fastify Server → Routes → Services → Database
2. **Plugins**: Middleware and cross-cutting concerns registered with Fastify
3. **Database**: PostgreSQL queries and transactions
4. **Messaging**: Kafka producers/consumers for async communication
5. **Stream Processing**: Alyxstream tasks for real-time data processing

**Key Patterns:**
- Route handlers define API endpoints
- Services contain business logic
- Database layer handles data persistence
- Kafka integration for event-driven architecture
- Alyxstream for stream processing pipelines
    `.trim(),
  };

  // Recommendations
  result.recommendations = [
    routeFiles.length === 0
      ? "No route files detected. Consider organizing API endpoints in a routes/ directory"
      : `Found ${routeFiles.length} route files. Good API organization!`,
    files.filter((f) => f.path.match(/plugins\//i)).length > 0
      ? `Using ${files.filter((f) => f.path.match(/plugins\//i)).length} Fastify plugins for modularity`
      : "Consider using Fastify plugins to organize middleware and cross-cutting concerns",
    dbFiles.length > 0
      ? `Database layer detected with ${dbFiles.length} files`
      : "No database layer detected. Consider adding models/ or db/ directory",
    files.some((f) => f.patterns && f.patterns.hasKafka)
      ? "Kafka integration detected for event-driven architecture"
      : "Consider Kafka for async communication and event streaming",
    files.some((f) => f.patterns && f.patterns.hasAlyxstream)
      ? "Alyxstream detected for stream processing"
      : "Consider Alyxstream for real-time stream processing pipelines",
    "Use JSON Schema validation in route definitions for request/response validation",
    "Implement proper error handling with Fastify's error handler plugin",
    "Consider using Fastify hooks for authentication, logging, and request lifecycle management",
  ];

  return result;
}

/**
 * Infer purpose of a module based on its path
 */
function inferPurpose(filePath: string): string {
  if (filePath.match(/routes\//i)) return "API endpoint handler";
  if (filePath.match(/services\//i)) return "Business logic service";
  if (filePath.match(/models\//i)) return "Data model";
  if (filePath.match(/plugins\//i)) return "Fastify plugin";
  if (filePath.match(/hooks\//i)) return "Request lifecycle hook";
  if (filePath.match(/schemas\//i)) return "JSON Schema validation";
  if (filePath.match(/consumers\//i)) return "Kafka consumer";
  if (filePath.match(/producers\//i)) return "Kafka producer";
  if (filePath.match(/streams\//i)) return "Stream processing pipeline";
  if (filePath.match(/db\//i) || filePath.match(/database\//i)) return "Database connection/query";
  if (filePath.match(/config\//i)) return "Application configuration";
  if (filePath.match(/utils\//i)) return "Utility functions";
  if (filePath.match(/middleware\//i)) return "Middleware";
  return "Core module";
}

/**
 * Generate LLM memory suggestions from analysis results
 */
function generateMemorySuggestionsFromAnalysis(
  result: ArchitectureAnalysisResult,
  projectPath: string
): import("../types/index.js").MemorySuggestion[] {
  const suggestions: import("../types/index.js").MemorySuggestion[] = [];
  const projectName = path.basename(projectPath);

  // 1. Store high-complexity files in committed scope (persistent, team-visible)
  if (result.metrics?.detailedMetrics) {
    const criticalFiles = result.metrics.detailedMetrics.filter((f) => f.complexity >= 20);

    if (criticalFiles.length > 0) {
      suggestions.push({
        scope: "committed",
        type: "insight",
        title: `High Complexity Files in ${projectName}`,
        text: `Critical refactoring targets:\n${criticalFiles
          .slice(0, 10)
          .map((f) => `- ${f.path} (complexity: ${f.complexity}, ${f.lines} lines)`)
          .join("\n")}\n\nThese files exceed complexity threshold of 20 and should be prioritized for refactoring.`,
        tags: ["complexity", "refactoring", "technical-debt", result.project.type],
        files: criticalFiles.slice(0, 10).map((f) => f.path),
        confidence: 0.9,
      });
    }
  }

  // 2. Store architecture overview in local scope (current session)
  const layerNames = result.architecture.layers.map((l) => l.name).join(", ");
  suggestions.push({
    scope: "local",
    type: "pattern",
    title: `${projectName} Architecture Pattern`,
    text: `Framework: ${result.project.type}\nState Management: ${result.stateManagement.pattern}\nArchitecture Layers: ${layerNames}\n\nThis project follows a ${result.project.structure} structure with ${result.components.total} components.`,
    tags: ["architecture", result.project.type, "overview"],
    confidence: 0.95,
  });

  // 3. Store framework-specific patterns in global scope (reusable knowledge)
  if (result.project.type === "nuxt3" && result.composables) {
    suggestions.push({
      scope: "global",
      type: "pattern",
      title: `Nuxt 3 Auto-Import Pattern`,
      text: `Nuxt 3 projects auto-import composables and components:\n- Composables from composables/ directory\n- Components from components/ directory\n- No explicit imports needed\n\nDetected ${result.composables.total} composables in this pattern.`,
      tags: ["nuxt3", "composables", "auto-import", "pattern"],
      confidence: 0.85,
      });
  }

  // 4. Store state management configuration
  if (result.stateManagement.stores && result.stateManagement.stores.length > 0) {
    const storeList = result.stateManagement.stores.map((s) => s.name).join(", ");
    suggestions.push({
      scope: "committed",
      type: "config",
      title: `${projectName} State Management Stores`,
      text: `Using ${result.stateManagement.pattern} with ${result.stateManagement.stores.length} stores:\n${storeList}\n\nStore locations: ${result.stateManagement.stores.map((s) => s.path).join(", ")}`,
      tags: ["state-management", result.stateManagement.pattern, "stores"],
      files: result.stateManagement.stores.map((s) => s.path),
      confidence: 1.0,
    });
  }

  // 5. Store project metrics as facts in local scope
  suggestions.push({
    scope: "local",
    type: "fact",
    title: `${projectName} Code Metrics`,
    text: `Total Files: ${result.metrics.totalFiles}\nTotal Lines: ${result.metrics.totalLines}\nAverage Complexity: ${result.metrics.avgComplexity.toFixed(2)}\nMax Complexity: ${result.metrics.maxComplexity}\n\nAnalysis performed: ${new Date().toISOString().split("T")[0]}`,
    tags: ["metrics", "statistics", projectName.toLowerCase()],
    confidence: 1.0,
  });

  return suggestions;
}
