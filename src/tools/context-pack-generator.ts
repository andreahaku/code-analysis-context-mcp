/**
 * Context Pack Generator Tool
 *
 * Build optimal AI context given a task, respecting token limits and maximizing relevance.
 */

import * as path from "path";
import * as fs from "fs/promises";
import * as glob from "fast-glob";
import { ASTParser } from "../services/ast-parser.js";
import { FrameworkDetector } from "../utils/framework-detector.js";
import { analyzeArchitecture } from "./architecture-analyzer.js";
import type {
  ContextPackParams,
  ContextPackResult,
  TaskAnalysis,
  TaskType,
  FileRelevance,
  ContextFile,
  TokenBudget,
  OptimizationStrategy,
} from "../types/index.js";

export async function generateContextPack(
  params: ContextPackParams
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const {
    task,
    projectPath = process.cwd(),
    maxTokens = 50000,
    includeTypes = ["relevant-files", "architecture", "dependencies"],
    focusAreas = [],
    includeHistory = false,
    format = "markdown",
    includeLineNumbers = true,
    optimizationStrategy = "relevance",
  } = params;

  if (!task) {
    throw new Error("Task description is required");
  }

  // Step 1: Analyze task to understand intent
  const taskAnalysis = analyzeTask(task);

  // Step 2: Detect framework
  const frameworkResult = await FrameworkDetector.detect(projectPath);
  const framework = frameworkResult.framework;

  // Step 3: Find all project files
  const includeGlobs = getFrameworkGlobs(framework);
  const excludeGlobs = ["**/node_modules/**", "**/dist/**", "**/build/**", "**/.git/**", "**/coverage/**"];

  const files = await glob.glob(includeGlobs, {
    cwd: projectPath,
    ignore: excludeGlobs,
    absolute: true,
  });

  // Step 4: Score file relevance
  const scoredFiles = await scoreFiles(files, taskAnalysis, projectPath, focusAreas);

  // Step 5: Get architectural context (if requested)
  let architectureContext: any = null;
  if (includeTypes.includes("architecture")) {
    try {
      const archResult = await analyzeArchitecture({
        projectPath,
        depth: "overview",
        includeMetrics: false,
        generateDiagrams: false,
      });
      architectureContext = JSON.parse(archResult.content[0].text);
    } catch (error) {
      // Continue without architecture if it fails
    }
  }

  // Step 6: Allocate token budget
  const budget = allocateTokenBudget(maxTokens, includeTypes, optimizationStrategy);

  // Step 7: Select files based on budget and strategy
  const selectedFiles = await selectFiles(
    scoredFiles,
    budget,
    includeTypes,
    optimizationStrategy,
    projectPath
  );

  // Step 8: Add git history (if requested)
  if (includeHistory) {
    await enrichWithGitHistory(selectedFiles, projectPath);
  }

  // Step 9: Format output
  const formattedOutput = formatOutput(
    task,
    taskAnalysis,
    selectedFiles,
    architectureContext,
    format,
    includeLineNumbers
  );

  // Step 10: Build result
  const result: ContextPackResult = {
    task,
    taskAnalysis,
    strategy: optimizationStrategy,
    tokenBudget: {
      max: maxTokens,
      used: calculateTokensUsed(selectedFiles, architectureContext),
      remaining: maxTokens - calculateTokensUsed(selectedFiles, architectureContext),
      breakdown: {
        architecture: architectureContext ? estimateTokens(JSON.stringify(architectureContext)) : 0,
        relevantFiles: selectedFiles
          .filter((f) => f.category === "primary")
          .reduce((sum, f) => sum + f.tokenCount, 0),
        dependencies: selectedFiles
          .filter((f) => f.category === "dependency")
          .reduce((sum, f) => sum + f.tokenCount, 0),
        tests: selectedFiles
          .filter((f) => f.category === "test")
          .reduce((sum, f) => sum + f.tokenCount, 0),
        types: selectedFiles
          .filter((f) => f.category === "type")
          .reduce((sum, f) => sum + f.tokenCount, 0),
      },
    },
    architecture: architectureContext
      ? {
          framework: architectureContext.project.type,
          structure: architectureContext.project.structure,
          stateManagement: architectureContext.stateManagement.pattern,
          navigation: architectureContext.navigation.pattern || "unknown",
          overview: generateArchitectureOverview(architectureContext),
        }
      : undefined,
    files: selectedFiles,
    relatedTests: selectedFiles.filter((f) => f.category === "test").map((f) => f.path),
    conventions: extractConventions(architectureContext),
    patterns: extractPatterns(selectedFiles),
    suggestions: generateSuggestions(taskAnalysis, selectedFiles, architectureContext),
    formattedOutput,
    metadata: {
      totalFilesAnalyzed: files.length,
      filesIncluded: selectedFiles.length,
      avgRelevanceScore:
        selectedFiles.reduce((sum, f) => sum + f.relevanceScore, 0) / selectedFiles.length || 0,
      generatedAt: new Date().toISOString(),
    },
  };

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

/**
 * Analyze task description to extract keywords and intent
 */
function analyzeTask(task: string): TaskAnalysis {
  const lowerTask = task.toLowerCase();

  // Detect task type
  let type: TaskType = "general";
  if (
    lowerTask.includes("add") ||
    lowerTask.includes("create") ||
    lowerTask.includes("implement") ||
    lowerTask.includes("build")
  ) {
    type = "feature";
  } else if (
    lowerTask.includes("fix") ||
    lowerTask.includes("bug") ||
    lowerTask.includes("error") ||
    lowerTask.includes("issue")
  ) {
    type = "bug";
  } else if (
    lowerTask.includes("refactor") ||
    lowerTask.includes("improve") ||
    lowerTask.includes("optimize") ||
    lowerTask.includes("clean")
  ) {
    type = "refactor";
  } else if (
    lowerTask.includes("investigate") ||
    lowerTask.includes("understand") ||
    lowerTask.includes("analyze") ||
    lowerTask.includes("explore")
  ) {
    type = "investigation";
  } else if (lowerTask.includes("document") || lowerTask.includes("docs") || lowerTask.includes("readme")) {
    type = "documentation";
  }

  // Extract action verbs
  const actionVerbs = [];
  const verbPatterns = [
    "add",
    "create",
    "implement",
    "build",
    "fix",
    "resolve",
    "refactor",
    "improve",
    "optimize",
    "update",
    "modify",
    "remove",
    "delete",
    "investigate",
    "debug",
    "test",
    "document",
  ];
  for (const verb of verbPatterns) {
    if (lowerTask.includes(verb)) {
      actionVerbs.push(verb);
    }
  }

  // Extract framework concepts
  const frameworkConcepts = [];
  const frameworkPatterns = [
    "component",
    "hook",
    "composable",
    "store",
    "provider",
    "context",
    "state",
    "reducer",
    "action",
    "middleware",
    "route",
    "navigation",
    "screen",
    "page",
    "layout",
    "api",
    "service",
    "util",
    "helper",
    "model",
    "type",
    "interface",
    // Mobile-specific concepts
    "gesture",
    "animation",
    "touchable",
    "flatlist",
    "scrollview",
    "modal",
    "tab",
    "drawer",
    "stack",
    "native",
    "platform",
    "ios",
    "android",
    "expo",
  ];
  for (const concept of frameworkPatterns) {
    if (lowerTask.includes(concept)) {
      frameworkConcepts.push(concept);
    }
  }

  // Extract domain concepts
  const domainConcepts = [];
  const domainPatterns = [
    "auth",
    "login",
    "signup",
    "user",
    "profile",
    "payment",
    "checkout",
    "cart",
    "product",
    "order",
    "shipping",
    "notification",
    "email",
    "search",
    "filter",
    "sort",
    "upload",
    "download",
    "form",
    "validation",
    "error",
    "loading",
    "dashboard",
    "admin",
    "settings",
    "analytics",
    // Mobile-specific domain concepts
    "camera",
    "photo",
    "image",
    "location",
    "map",
    "gps",
    "permission",
    "push",
    "biometric",
    "fingerprint",
    "face-id",
    "share",
    "haptic",
    "vibration",
    "orientation",
    "accelerometer",
    "sensor",
    "bluetooth",
    "nfc",
    "storage",
    "asyncstorage",
    "deeplink",
    "universal-link",
  ];
  for (const concept of domainPatterns) {
    if (lowerTask.includes(concept)) {
      domainConcepts.push(concept);
    }
  }

  // Extract mentioned files/paths
  const mentionedFiles: string[] = [];
  const filePattern = /(?:src\/|components\/|pages\/|app\/|lib\/)[\w\/-]+\.[\w]+/g;
  const matches = task.match(filePattern);
  if (matches) {
    mentionedFiles.push(...matches);
  }

  // Extract all keywords (words longer than 3 chars, excluding common words)
  const stopWords = new Set([
    "the",
    "and",
    "for",
    "with",
    "that",
    "this",
    "from",
    "have",
    "will",
    "can",
    "should",
    "would",
    "could",
    "need",
    "want",
    "make",
    "use",
    "work",
  ]);
  const words = task.toLowerCase().match(/\b\w{4,}\b/g) || [];
  const keywords = [...new Set(words.filter((w) => !stopWords.has(w)))];

  return {
    type,
    keywords,
    mentionedFiles,
    frameworkConcepts,
    domainConcepts,
    actionVerbs,
  };
}

/**
 * Score files based on relevance to task
 */
async function scoreFiles(
  files: string[],
  taskAnalysis: TaskAnalysis,
  projectPath: string,
  focusAreas: string[]
): Promise<FileRelevance[]> {
  const scoredFiles: FileRelevance[] = [];

  for (const file of files) {
    const relPath = path.relative(projectPath, file);
    const reasons: string[] = [];
    let score = 0;

    // Check if file is in focus areas (highest priority)
    if (focusAreas.length > 0) {
      for (const area of focusAreas) {
        if (relPath.includes(area)) {
          score += 50;
          reasons.push(`In focus area: ${area}`);
        }
      }
    }

    // Check if file is explicitly mentioned
    if (taskAnalysis.mentionedFiles.some((mentioned) => relPath.includes(mentioned))) {
      score += 100;
      reasons.push("Explicitly mentioned in task");
    }

    // Score path matches
    const lowerPath = relPath.toLowerCase();
    for (const keyword of taskAnalysis.keywords) {
      if (lowerPath.includes(keyword)) {
        score += 15;
        reasons.push(`Path contains keyword: ${keyword}`);
      }
    }

    for (const concept of taskAnalysis.domainConcepts) {
      if (lowerPath.includes(concept)) {
        score += 20;
        reasons.push(`Path contains domain concept: ${concept}`);
      }
    }

    for (const concept of taskAnalysis.frameworkConcepts) {
      if (lowerPath.includes(concept)) {
        score += 10;
        reasons.push(`Path contains framework concept: ${concept}`);
      }
    }

    // Read file content and score keyword matches
    try {
      const content = await fs.readFile(file, "utf-8");
      const lowerContent = content.toLowerCase();

      for (const keyword of taskAnalysis.keywords) {
        const matches = (lowerContent.match(new RegExp(keyword, "gi")) || []).length;
        if (matches > 0) {
          score += Math.min(matches * 2, 20); // Max 20 points per keyword
          reasons.push(`Content contains "${keyword}" (${matches} times)`);
        }
      }

      for (const concept of taskAnalysis.domainConcepts) {
        const matches = (lowerContent.match(new RegExp(concept, "gi")) || []).length;
        if (matches > 0) {
          score += Math.min(matches * 3, 30); // Max 30 points per domain concept
          reasons.push(`Content contains domain concept "${concept}" (${matches} times)`);
        }
      }

      // Boost score for test files if task is about bugs/testing
      if (taskAnalysis.type === "bug" || lowerContent.includes("test")) {
        if (relPath.includes(".test.") || relPath.includes(".spec.") || relPath.includes("__tests__")) {
          score += 15;
          reasons.push("Test file relevant for bug fixing");
        }
      }

      // Estimate tokens
      const tokens = estimateTokens(content);

      scoredFiles.push({
        path: relPath,
        score,
        reasons,
        tokens,
      });
    } catch (error) {
      // Skip files that can't be read
      continue;
    }
  }

  // Sort by score descending
  return scoredFiles.sort((a, b) => b.score - a.score);
}

/**
 * Allocate token budget across categories
 */
function allocateTokenBudget(
  maxTokens: number,
  includeTypes: string[],
  strategy: OptimizationStrategy
): TokenBudget {
  let architecture = 0;
  let relevantFiles = 0;
  let dependencies = 0;
  let tests = 0;
  let types = 0;

  if (strategy === "relevance") {
    // Focus on most relevant files
    architecture = includeTypes.includes("architecture") ? maxTokens * 0.1 : 0;
    relevantFiles = maxTokens * 0.6;
    dependencies = includeTypes.includes("dependencies") ? maxTokens * 0.15 : 0;
    tests = includeTypes.includes("tests") ? maxTokens * 0.1 : 0;
    types = includeTypes.includes("types") ? maxTokens * 0.05 : 0;
  } else if (strategy === "breadth") {
    // Include more files with less detail
    architecture = includeTypes.includes("architecture") ? maxTokens * 0.15 : 0;
    relevantFiles = maxTokens * 0.5;
    dependencies = includeTypes.includes("dependencies") ? maxTokens * 0.2 : 0;
    tests = includeTypes.includes("tests") ? maxTokens * 0.1 : 0;
    types = includeTypes.includes("types") ? maxTokens * 0.05 : 0;
  } else {
    // depth - Focus on few files with full context
    architecture = includeTypes.includes("architecture") ? maxTokens * 0.05 : 0;
    relevantFiles = maxTokens * 0.7;
    dependencies = includeTypes.includes("dependencies") ? maxTokens * 0.15 : 0;
    tests = includeTypes.includes("tests") ? maxTokens * 0.05 : 0;
    types = includeTypes.includes("types") ? maxTokens * 0.05 : 0;
  }

  return {
    max: maxTokens,
    used: 0,
    remaining: maxTokens,
    breakdown: {
      architecture: Math.floor(architecture),
      relevantFiles: Math.floor(relevantFiles),
      dependencies: Math.floor(dependencies),
      tests: Math.floor(tests),
      types: Math.floor(types),
    },
  };
}

/**
 * Select files based on budget and strategy
 */
async function selectFiles(
  scoredFiles: FileRelevance[],
  budget: TokenBudget,
  includeTypes: string[],
  _strategy: OptimizationStrategy,
  projectPath: string
): Promise<ContextFile[]> {
  const selected: ContextFile[] = [];

  // Primary files (highest relevance)
  const primaryBudget = budget.breakdown.relevantFiles;
  let primaryTokens = 0;

  for (const file of scoredFiles) {
    if (primaryTokens >= primaryBudget) break;

    const fullPath = path.join(projectPath, file.path);
    let content = await fs.readFile(fullPath, "utf-8");
    let truncated = false;

    // Truncate if needed
    const availableTokens = primaryBudget - primaryTokens;
    if (file.tokens > availableTokens) {
      content = truncateContent(content, availableTokens);
      truncated = true;
    }

    const actualTokens = estimateTokens(content);
    primaryTokens += actualTokens;

    selected.push({
      path: file.path,
      relevanceScore: file.score,
      reasons: file.reasons,
      content,
      lineNumbers: true,
      truncated,
      tokenCount: actualTokens,
      category: "primary",
    });

    // Stop if we've used most of the budget (save some for dependencies/tests)
    if (primaryTokens > primaryBudget * 0.9) break;
  }

  // Add dependencies if requested
  if (includeTypes.includes("dependencies")) {
    const dependencyFiles = await findDependencies(selected, scoredFiles, projectPath);
    const dependencyBudget = budget.breakdown.dependencies;
    let dependencyTokens = 0;

    for (const depFile of dependencyFiles) {
      if (dependencyTokens >= dependencyBudget) break;

      const fullPath = path.join(projectPath, depFile.path);
      let content = await fs.readFile(fullPath, "utf-8");
      let truncated = false;

      const availableTokens = dependencyBudget - dependencyTokens;
      if (depFile.tokens > availableTokens) {
        content = truncateContent(content, availableTokens);
        truncated = true;
      }

      const actualTokens = estimateTokens(content);
      dependencyTokens += actualTokens;

      selected.push({
        path: depFile.path,
        relevanceScore: depFile.score,
        reasons: depFile.reasons,
        content,
        lineNumbers: true,
        truncated,
        tokenCount: actualTokens,
        category: "dependency",
      });
    }
  }

  // Add tests if requested
  if (includeTypes.includes("tests")) {
    const testFiles = scoredFiles.filter(
      (f) =>
        (f.path.includes(".test.") || f.path.includes(".spec.") || f.path.includes("__tests__")) &&
        !selected.some((s) => s.path === f.path)
    );
    const testBudget = budget.breakdown.tests;
    let testTokens = 0;

    for (const testFile of testFiles) {
      if (testTokens >= testBudget) break;

      const fullPath = path.join(projectPath, testFile.path);
      let content = await fs.readFile(fullPath, "utf-8");
      let truncated = false;

      const availableTokens = testBudget - testTokens;
      if (testFile.tokens > availableTokens) {
        content = truncateContent(content, availableTokens);
        truncated = true;
      }

      const actualTokens = estimateTokens(content);
      testTokens += actualTokens;

      selected.push({
        path: testFile.path,
        relevanceScore: testFile.score,
        reasons: testFile.reasons,
        content,
        lineNumbers: true,
        truncated,
        tokenCount: actualTokens,
        category: "test",
      });
    }
  }

  return selected;
}

/**
 * Find dependency files for selected files
 */
async function findDependencies(
  selectedFiles: ContextFile[],
  allFiles: FileRelevance[],
  projectPath: string
): Promise<FileRelevance[]> {
  const dependencies = new Set<string>();

  for (const file of selectedFiles) {
    const fullPath = path.join(projectPath, file.path);
    try {
      const ast = await ASTParser.parseFile(fullPath);
      const imports = ASTParser.extractImports(ast);

      for (const imp of imports) {
        if (imp.source.startsWith(".")) {
          // Relative import - resolve it
          const resolvedPath = path.resolve(path.dirname(fullPath), imp.source);
          const relPath = path.relative(projectPath, resolvedPath);

          // Try different extensions
          const extensions = [".ts", ".tsx", ".js", ".jsx", ".vue"];
          for (const ext of extensions) {
            const withExt = relPath + ext;
            if (allFiles.some((f) => f.path === withExt)) {
              dependencies.add(withExt);
              break;
            }
          }
        }
      }
    } catch (error) {
      // Skip files that can't be parsed
      continue;
    }
  }

  // Return dependency files sorted by score
  return allFiles.filter((f) => dependencies.has(f.path)).slice(0, 10); // Limit to top 10 dependencies
}

/**
 * Enrich files with git history
 */
async function enrichWithGitHistory(_files: ContextFile[], _projectPath: string): Promise<void> {
  // TODO: Implement git history integration
  // This would use child_process to run git commands
  // For now, this is a placeholder
}

/**
 * Format output in requested format
 */
function formatOutput(
  task: string,
  taskAnalysis: TaskAnalysis,
  files: ContextFile[],
  architecture: any,
  format: "markdown" | "json" | "xml",
  includeLineNumbers: boolean
): string {
  if (format === "json") {
    return JSON.stringify({ task, taskAnalysis, files, architecture }, null, 2);
  }

  if (format === "xml") {
    return `<?xml version="1.0" encoding="UTF-8"?>
<context-pack>
  <task>${escapeXml(task)}</task>
  <files>
    ${files.map((f) => `<file path="${escapeXml(f.path)}">${escapeXml(f.content)}</file>`).join("\n    ")}
  </files>
</context-pack>`;
  }

  // Markdown format (default)
  let output = `# Context Pack: ${task}\n\n`;
  output += `**Task Type**: ${taskAnalysis.type}\n`;
  output += `**Keywords**: ${taskAnalysis.keywords.join(", ")}\n\n`;

  if (architecture) {
    output += `## Architecture Overview\n\n`;
    output += `- **Framework**: ${architecture.framework}\n`;
    output += `- **Structure**: ${architecture.structure}\n`;
    output += `- **State Management**: ${architecture.stateManagement}\n`;
    output += `- **Navigation**: ${architecture.navigation}\n\n`;
  }

  output += `## Relevant Files (${files.length})\n\n`;

  for (const file of files) {
    output += `### ${file.path}\n\n`;
    output += `**Relevance**: ${file.relevanceScore.toFixed(1)} | `;
    output += `**Category**: ${file.category} | `;
    output += `**Tokens**: ${file.tokenCount}\n\n`;
    if (file.reasons.length > 0) {
      output += `**Why relevant**: ${file.reasons.slice(0, 3).join(", ")}\n\n`;
    }
    output += "```\n";
    if (includeLineNumbers) {
      const lines = file.content.split("\n");
      output += lines.map((line, idx) => `${idx + 1}  ${line}`).join("\n");
    } else {
      output += file.content;
    }
    output += "\n```\n\n";

    if (file.truncated) {
      output += "_[Content truncated to fit token budget]_\n\n";
    }
  }

  return output;
}

/**
 * Generate architecture overview summary
 */
function generateArchitectureOverview(architecture: any): string {
  const layers = architecture.architecture?.layers || [];
  const components = architecture.components?.total || 0;
  const hooks = architecture.hooks?.total || 0;
  const composables = architecture.composables?.total || 0;

  return `${architecture.project.type} project with ${layers.length} layers, ${components} components, ${hooks || composables} hooks/composables`;
}

/**
 * Extract conventions from architecture
 */
function extractConventions(architecture: any): string[] {
  if (!architecture) return [];

  const conventions: string[] = [];

  if (architecture.project.type === "nuxt3") {
    conventions.push("Auto-imports enabled for composables and components");
    conventions.push("File-based routing in pages/ directory");
  }

  if (architecture.stateManagement.pattern === "pinia") {
    conventions.push("Pinia stores in stores/ directory");
  }

  // React Native / Expo conventions
  if (architecture.project.type === "react-native" || architecture.project.type === "expo") {
    conventions.push("Platform-specific code with .ios.tsx/.android.tsx extensions");
    conventions.push("Screens organized in screens/ or app/ directory");
    conventions.push("React Navigation for navigation patterns");

    if (architecture.project.type === "expo") {
      conventions.push("Expo Router file-based navigation (if app/ directory exists)");
      conventions.push("Expo SDK modules for native functionality");
    }

    if (architecture.navigation?.pattern?.includes("stack")) {
      conventions.push("Stack navigation pattern for screen hierarchy");
    }
    if (architecture.navigation?.pattern?.includes("tab")) {
      conventions.push("Tab-based navigation for primary app sections");
    }

    conventions.push("AsyncStorage for persistent data storage");
    conventions.push("StyleSheet.create for component styling");
  }

  return conventions;
}

/**
 * Extract patterns from selected files
 */
function extractPatterns(files: ContextFile[]): string[] {
  const patterns = new Set<string>();

  for (const file of files) {
    if (file.content.includes("useState") || file.content.includes("useEffect")) {
      patterns.add("React Hooks");
    }
    if (file.content.includes("createContext")) {
      patterns.add("Context API");
    }
    if (file.content.includes("defineStore")) {
      patterns.add("Pinia Stores");
    }
    if (file.content.includes("useRouter") || file.content.includes("useRoute")) {
      patterns.add("Vue Router");
    }
    if (file.content.includes("async") && file.content.includes("await")) {
      patterns.add("Async/Await");
    }

    // Mobile-specific patterns
    if (
      file.content.includes("useNavigation") ||
      file.content.includes("NavigationContainer") ||
      file.content.includes("createStackNavigator")
    ) {
      patterns.add("React Navigation");
    }
    if (file.content.includes("Platform.OS") || file.content.includes("Platform.select")) {
      patterns.add("Platform-Specific Code");
    }
    if (
      file.content.includes("Animated.") ||
      file.content.includes("useAnimatedStyle") ||
      file.content.includes("withTiming")
    ) {
      patterns.add("React Native Animations");
    }
    if (
      file.content.includes("GestureDetector") ||
      file.content.includes("PanGestureHandler") ||
      file.content.includes("TapGestureHandler")
    ) {
      patterns.add("Gesture Handlers");
    }
    if (file.content.includes("AsyncStorage") || file.content.includes("SecureStore")) {
      patterns.add("Mobile Storage");
    }
    if (file.content.includes("Permissions.") || file.content.includes("requestPermission")) {
      patterns.add("Permission Handling");
    }
    if (file.content.includes("Notifications.") || file.content.includes("registerForPushNotifications")) {
      patterns.add("Push Notifications");
    }
    if (file.content.includes("Camera") || file.content.includes("ImagePicker")) {
      patterns.add("Media/Camera Access");
    }
    if (file.content.includes("Location.") || file.content.includes("getCurrentPosition")) {
      patterns.add("Location Services");
    }
    if (
      file.content.includes("NativeModules.") ||
      file.content.includes("NativeEventEmitter") ||
      file.content.includes("requireNativeComponent")
    ) {
      patterns.add("Native Modules");
    }
    if (file.content.includes("Linking.") || file.content.includes("getInitialURL")) {
      patterns.add("Deep Linking");
    }
  }

  return Array.from(patterns);
}

/**
 * Generate suggestions for the developer
 */
function generateSuggestions(
  taskAnalysis: TaskAnalysis,
  files: ContextFile[],
  architecture: any
): string[] {
  const suggestions: string[] = [];

  if (files.length === 0) {
    suggestions.push("⚠️ No relevant files found. Try broadening your task description or specifying focus areas.");
    return suggestions;
  }

  if (taskAnalysis.type === "feature") {
    suggestions.push("💡 Review similar components/hooks to follow existing patterns");
    const testFiles = files.filter((f) => f.category === "test");
    if (testFiles.length === 0) {
      suggestions.push("💡 Consider adding tests for your new feature");
    }
  }

  if (taskAnalysis.type === "bug") {
    suggestions.push("💡 Check related test files to understand expected behavior");
    suggestions.push("💡 Look for error handling patterns in similar code");
  }

  if (taskAnalysis.type === "refactor") {
    suggestions.push("💡 Review existing patterns to maintain consistency");
    suggestions.push("💡 Consider impact on dependent files before refactoring");
  }

  const highRelevanceFiles = files.filter((f) => f.relevanceScore > 50);
  if (highRelevanceFiles.length > 0) {
    suggestions.push(
      `✅ Found ${highRelevanceFiles.length} highly relevant files - great starting point!`
    );
  }

  // Mobile-specific suggestions
  if (architecture?.project?.type === "react-native" || architecture?.project?.type === "expo") {
    const hasPlatformSpecific = files.some(
      (f) => f.path.includes(".ios.") || f.path.includes(".android.")
    );
    if (hasPlatformSpecific) {
      suggestions.push("📱 Platform-specific files detected - ensure changes work on both iOS and Android");
    }

    const hasNavigation = files.some(
      (f) =>
        f.content.includes("useNavigation") ||
        f.content.includes("NavigationContainer") ||
        f.path.includes("navigation")
    );
    if (hasNavigation) {
      suggestions.push("🧭 Navigation changes detected - verify navigation flows and deep linking");
    }

    const hasNativeModules = files.some(
      (f) => f.content.includes("NativeModules") || f.content.includes("requireNativeComponent")
    );
    if (hasNativeModules) {
      suggestions.push("🔧 Native modules involved - rebuild app after changes");
    }

    const hasPermissions = files.some(
      (f) => f.content.includes("Permissions") || f.content.includes("requestPermission")
    );
    if (hasPermissions) {
      suggestions.push("🔐 Permission handling detected - test on real devices, not just simulators");
    }

    const hasAnimations = files.some(
      (f) => f.content.includes("Animated") || f.content.includes("useAnimatedStyle")
    );
    if (hasAnimations) {
      suggestions.push("✨ Animations involved - test performance on low-end devices");
    }

    if (taskAnalysis.frameworkConcepts.includes("screen")) {
      suggestions.push("📱 Screen component work - consider navigation params, focus effects, and back handling");
    }

    if (taskAnalysis.domainConcepts.some((c) => ["camera", "location", "push", "biometric"].includes(c))) {
      suggestions.push("🎯 Native feature integration - ensure proper permission handling and error states");
    }
  }

  return suggestions;
}

/**
 * Estimate tokens (rough: chars / 4)
 */
function estimateTokens(content: string): number {
  return Math.ceil(content.length / 4);
}

/**
 * Calculate total tokens used
 */
function calculateTokensUsed(files: ContextFile[], architecture: any): number {
  const fileTokens = files.reduce((sum, f) => sum + f.tokenCount, 0);
  const archTokens = architecture ? estimateTokens(JSON.stringify(architecture)) : 0;
  return fileTokens + archTokens;
}

/**
 * Truncate content to fit token budget
 */
function truncateContent(content: string, maxTokens: number): string {
  const maxChars = maxTokens * 4;
  if (content.length <= maxChars) return content;

  // Keep first 60% and last 20% (skip middle)
  const keepStart = Math.floor(maxChars * 0.6);
  const keepEnd = Math.floor(maxChars * 0.2);

  const start = content.substring(0, keepStart);
  const end = content.substring(content.length - keepEnd);

  return start + "\n\n... [content truncated] ...\n\n" + end;
}

/**
 * Get framework-specific glob patterns
 */
function getFrameworkGlobs(framework: string): string[] {
  const baseGlobs = ["src/**/*.{ts,tsx,js,jsx,vue}", "lib/**/*.{ts,tsx,js,jsx}"];

  if (framework === "nuxt3") {
    return [
      ...baseGlobs,
      "pages/**/*.vue",
      "components/**/*.vue",
      "composables/**/*.ts",
      "stores/**/*.ts",
      "server/**/*.ts",
    ];
  }

  if (framework === "vue3") {
    return [...baseGlobs, "components/**/*.vue", "composables/**/*.ts", "stores/**/*.ts"];
  }

  if (framework === "expo") {
    return [
      ...baseGlobs,
      "app/**/*.{ts,tsx,js,jsx}", // Expo Router
      "screens/**/*.{tsx,jsx}",
      "components/**/*.{tsx,jsx}",
      "hooks/**/*.{ts,tsx}",
      "navigation/**/*.{tsx,ts}",
      "contexts/**/*.{tsx,ts}",
      "providers/**/*.{tsx,ts}",
      "services/**/*.{ts,tsx}",
      "api/**/*.{ts,tsx}",
      "utils/**/*.ts",
      "constants/**/*.ts",
      "config/**/*.ts",
      "types/**/*.ts",
      // Platform-specific
      "**/*.ios.{ts,tsx,js,jsx}",
      "**/*.android.{ts,tsx,js,jsx}",
      "**/*.native.{ts,tsx,js,jsx}",
      "**/*.web.{ts,tsx,js,jsx}",
    ];
  }

  if (framework === "react-native") {
    return [
      ...baseGlobs,
      "app/**/*.{ts,tsx,js,jsx}",
      "screens/**/*.{tsx,jsx}",
      "components/**/*.{tsx,jsx}",
      "hooks/**/*.{ts,tsx}",
      "navigation/**/*.{tsx,ts}",
      "contexts/**/*.{tsx,ts}",
      "providers/**/*.{tsx,ts}",
      "services/**/*.{ts,tsx}",
      "api/**/*.{ts,tsx}",
      "utils/**/*.ts",
      "constants/**/*.ts",
      "config/**/*.ts",
      "types/**/*.ts",
      // Platform-specific
      "**/*.ios.{ts,tsx,js,jsx}",
      "**/*.android.{ts,tsx,js,jsx}",
      "**/*.native.{ts,tsx,js,jsx}",
    ];
  }

  if (framework === "react") {
    return [
      ...baseGlobs,
      "components/**/*.{tsx,jsx}",
      "hooks/**/*.{ts,tsx}",
      "screens/**/*.{tsx,jsx}",
      "pages/**/*.{tsx,jsx}",
    ];
  }

  return baseGlobs;
}

/**
 * Escape XML special characters
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
