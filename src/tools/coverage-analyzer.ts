/**
 * Coverage Analyzer Tool
 *
 * Identify untested code with actionable, meaningful test suggestions.
 * Focuses on core files with high complexity and criticality.
 */

import * as path from "path";
import * as fs from "fs/promises";
import * as glob from "fast-glob";
import { ASTParser } from "../services/ast-parser.js";
import { FrameworkDetector } from "../utils/framework-detector.js";
import type {
  CoverageAnalysisParams,
  CoverageAnalysisResult,
  FileCoverage,
  CoverageGap,
  TestSuggestion,
  ExistingTestPattern,
  TestFramework,
  GapPriority,
  FileCriticality,
  CoverageThreshold,
  FrameworkType,
} from "../types/index.js";

export async function analyzeCoverageGaps(
  params: CoverageAnalysisParams
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const {
    projectPath = process.cwd(),
    coverageReportPath,
    framework,
    threshold = { lines: 80, functions: 80, branches: 75, statements: 80 },
    priority = "all",
    includeGlobs = ["src/**/*.{ts,tsx,js,jsx,vue}"],
    excludeGlobs = ["**/*.test.*", "**/*.spec.*", "**/__tests__/**", "**/node_modules/**"],
    suggestTests = true,
    analyzeComplexity = true,
  } = params;

  // Step 1: Detect framework and test framework
  const frameworkResult = await FrameworkDetector.detect(projectPath);
  const detectedFramework = frameworkResult.framework;

  let testFramework: TestFramework | undefined = framework;
  if (!testFramework) {
    testFramework = await detectTestFramework(projectPath);
  }

  // Step 2: Parse coverage report if provided
  let coverageData: Map<string, FileCoverage> | null = null;
  let overallCoverage = { lines: 0, functions: 0, branches: 0, statements: 0 };

  if (coverageReportPath) {
    try {
      coverageData = await parseCoverageReport(coverageReportPath, projectPath);
      overallCoverage = calculateOverallCoverage(coverageData);
    } catch (error) {
      console.error(`Failed to parse coverage report: ${error}`);
    }
  }

  // Step 3: Find all source files
  const files = await glob.glob(includeGlobs, {
    cwd: projectPath,
    ignore: excludeGlobs,
    absolute: true,
  });

  // Step 4: Analyze each file for gaps
  const gaps: CoverageGap[] = [];

  for (const file of files) {
    const relPath = path.relative(projectPath, file);
    const fileCoverage = coverageData?.get(relPath);

    // Calculate criticality and complexity
    const criticality = await calculateFileCriticality(file, files, projectPath);
    const complexity = analyzeComplexity ? await calculateFileComplexity(file) : 0;

    // Determine if this is a gap
    const isGap = !fileCoverage || isSignificantGap(fileCoverage, threshold);

    if (isGap) {
      const gapPriority = determinePriority(
        fileCoverage,
        criticality,
        complexity,
        threshold
      );

      // Skip low priority gaps unless "all" requested
      if (priority !== "all" && shouldSkipGap(gapPriority, priority as GapPriority)) {
        continue;
      }

      const untestedFunctions = await identifyUntestedFunctions(file, fileCoverage);
      const untestedLines = fileCoverage?.lines.uncovered || [];

      const gap: CoverageGap = {
        file: relPath,
        priority: gapPriority,
        criticality,
        complexity,
        coverage: {
          lines: fileCoverage?.lines.percentage || 0,
          functions: fileCoverage?.functions.percentage || 0,
          branches: fileCoverage?.branches.percentage || 0,
          statements: fileCoverage?.statements.percentage || 0,
        },
        reasons: generateGapReasons(fileCoverage, criticality, complexity, threshold),
        untestedFunctions,
        untestedLines,
        testSuggestions: [],
      };

      gaps.push(gap);
    }
  }

  // Step 5: Detect existing test patterns
  let existingPatterns: ExistingTestPattern | undefined;
  if (suggestTests && testFramework) {
    existingPatterns = await detectExistingTestPatterns(projectPath, testFramework);
  }

  // Step 6: Generate test suggestions for gaps
  if (suggestTests && testFramework && existingPatterns) {
    for (const gap of gaps) {
      gap.testSuggestions = await generateTestSuggestions(
        gap,
        path.join(projectPath, gap.file),
        testFramework,
        detectedFramework,
        existingPatterns
      );
    }
  }

  // Step 7: Sort gaps by priority
  gaps.sort((a, b) => {
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (priorityDiff !== 0) return priorityDiff;

    // Secondary sort by complexity
    return b.complexity - a.complexity;
  });

  // Step 8: Identify critical gaps
  const criticalGaps = gaps.filter(
    (g) => g.priority === "critical" || g.priority === "high"
  );

  // Step 9: Generate recommendations
  const recommendations = generateRecommendations(
    gaps,
    criticalGaps,
    overallCoverage,
    threshold
  );

  const result: CoverageAnalysisResult = {
    project: {
      name: path.basename(projectPath),
      totalFiles: files.length,
      framework: detectedFramework,
    },
    summary: {
      overallCoverage,
      testedFiles: files.length - gaps.length,
      untestedFiles: gaps.filter((g) => g.coverage.lines === 0).length,
      partiallyTestedFiles: gaps.filter((g) => g.coverage.lines > 0 && g.coverage.lines < 100).length,
      testFramework,
    },
    threshold,
    gaps,
    criticalGaps,
    existingTestPatterns: existingPatterns,
    recommendations,
    metadata: {
      coverageReportPath,
      analyzedAt: new Date().toISOString(),
      gapsAboveThreshold: gaps.filter((g) => g.priority === "critical" || g.priority === "high").length,
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
 * Detect test framework from package.json and test files
 */
async function detectTestFramework(projectPath: string): Promise<TestFramework | undefined> {
  try {
    const packageJson = JSON.parse(
      await fs.readFile(path.join(projectPath, "package.json"), "utf-8")
    );

    const allDeps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    // Priority order: vitest > jest > playwright > mocha > ava
    if (allDeps["vitest"]) return "vitest";
    if (allDeps["jest"] || allDeps["@jest/core"]) return "jest";
    if (allDeps["@playwright/test"]) return "playwright";
    if (allDeps["mocha"]) return "mocha";
    if (allDeps["ava"]) return "ava";
  } catch (error) {
    // package.json not found or invalid
  }

  // Try to detect from test files
  const testFiles = await glob.glob(["**/*.test.{ts,tsx,js,jsx}", "**/*.spec.{ts,tsx,js,jsx}"], {
    cwd: projectPath,
    ignore: ["**/node_modules/**"],
    absolute: true,
  });

  if (testFiles.length > 0) {
    const content = await fs.readFile(testFiles[0], "utf-8");
    if (content.includes("import { describe, it") || content.includes("from 'vitest'")) {
      return "vitest";
    }
    if (content.includes("from '@jest/globals'") || content.includes("jest.")) {
      return "jest";
    }
    if (content.includes("@playwright/test")) {
      return "playwright";
    }
  }

  return undefined;
}

/**
 * Parse coverage report (LCOV or JSON format)
 */
async function parseCoverageReport(
  reportPath: string,
  projectPath: string
): Promise<Map<string, FileCoverage>> {
  const content = await fs.readFile(reportPath, "utf-8");

  // Detect format
  if (reportPath.endsWith(".json") || content.trim().startsWith("{")) {
    return parseJsonCoverage(content, projectPath);
  } else if (reportPath.includes("lcov") || content.includes("TN:")) {
    return parseLcovCoverage(content, projectPath);
  }

  throw new Error("Unsupported coverage format. Use LCOV or JSON.");
}

/**
 * Parse JSON coverage format (Istanbul/NYC)
 */
function parseJsonCoverage(content: string, projectPath: string): Map<string, FileCoverage> {
  const coverage = new Map<string, FileCoverage>();
  const data = JSON.parse(content);

  for (const [filePath, fileData] of Object.entries(data)) {
    const relPath = path.relative(projectPath, filePath);

    const file: any = fileData;
    const lines = file.l || file.lines || {};
    const functions = file.f || file.fnMap || {};
    const branches = file.b || file.branchMap || {};
    const statements = file.s || file.statementMap || {};

    const lineCoverage = calculateCoverage(lines);
    const functionCoverage = calculateCoverage(functions);
    const branchCoverage = calculateCoverage(branches);
    const statementCoverage = calculateCoverage(statements);

    coverage.set(relPath, {
      path: relPath,
      lines: lineCoverage,
      functions: functionCoverage,
      branches: branchCoverage,
      statements: statementCoverage,
    });
  }

  return coverage;
}

/**
 * Parse LCOV coverage format
 */
function parseLcovCoverage(content: string, projectPath: string): Map<string, FileCoverage> {
  const coverage = new Map<string, FileCoverage>();
  const sections = content.split("end_of_record");

  for (const section of sections) {
    if (!section.trim()) continue;

    const lines = section.split("\n");
    let currentFile = "";
    const lineData: { found: number; hit: number; uncovered: number[] } = {
      found: 0,
      hit: 0,
      uncovered: [],
    };
    const functionData: { found: number; hit: number; uncovered: string[] } = {
      found: 0,
      hit: 0,
      uncovered: [],
    };
    const branchData: { found: number; hit: number } = { found: 0, hit: 0 };

    for (const line of lines) {
      if (line.startsWith("SF:")) {
        const filePath = line.substring(3);
        currentFile = path.relative(projectPath, filePath);
      } else if (line.startsWith("DA:")) {
        const [lineNum, hitCount] = line.substring(3).split(",").map(Number);
        lineData.found++;
        if (hitCount > 0) {
          lineData.hit++;
        } else {
          lineData.uncovered.push(lineNum);
        }
      } else if (line.startsWith("FN:")) {
        functionData.found++;
      } else if (line.startsWith("FNDA:")) {
        const hitCount = parseInt(line.substring(5).split(",")[0]);
        if (hitCount > 0) {
          functionData.hit++;
        }
      } else if (line.startsWith("BRF:")) {
        branchData.found = parseInt(line.substring(4));
      } else if (line.startsWith("BRH:")) {
        branchData.hit = parseInt(line.substring(4));
      }
    }

    if (currentFile) {
      coverage.set(currentFile, {
        path: currentFile,
        lines: {
          total: lineData.found,
          covered: lineData.hit,
          percentage: lineData.found > 0 ? (lineData.hit / lineData.found) * 100 : 0,
          uncovered: lineData.uncovered,
        },
        functions: {
          total: functionData.found,
          covered: functionData.hit,
          percentage: functionData.found > 0 ? (functionData.hit / functionData.found) * 100 : 0,
          uncovered: functionData.uncovered,
        },
        branches: {
          total: branchData.found,
          covered: branchData.hit,
          percentage: branchData.found > 0 ? (branchData.hit / branchData.found) * 100 : 0,
        },
        statements: {
          total: lineData.found,
          covered: lineData.hit,
          percentage: lineData.found > 0 ? (lineData.hit / lineData.found) * 100 : 0,
        },
      });
    }
  }

  return coverage;
}

/**
 * Helper to calculate coverage from data object
 */
function calculateCoverage(data: any): {
  total: number;
  covered: number;
  percentage: number;
  uncovered: any[];
} {
  const entries = Object.entries(data);
  const total = entries.length;
  const covered = entries.filter(([_, value]) => (value as number) > 0).length;
  const uncovered = entries
    .filter(([_, value]) => (value as number) === 0)
    .map(([key]) => key);

  return {
    total,
    covered,
    percentage: total > 0 ? (covered / total) * 100 : 0,
    uncovered,
  };
}

/**
 * Calculate overall coverage from all files
 */
function calculateOverallCoverage(coverage: Map<string, FileCoverage>): {
  lines: number;
  functions: number;
  branches: number;
  statements: number;
} {
  let totalLines = 0,
    coveredLines = 0;
  let totalFunctions = 0,
    coveredFunctions = 0;
  let totalBranches = 0,
    coveredBranches = 0;
  let totalStatements = 0,
    coveredStatements = 0;

  for (const file of coverage.values()) {
    totalLines += file.lines.total;
    coveredLines += file.lines.covered;
    totalFunctions += file.functions.total;
    coveredFunctions += file.functions.covered;
    totalBranches += file.branches.total;
    coveredBranches += file.branches.covered;
    totalStatements += file.statements.total;
    coveredStatements += file.statements.covered;
  }

  return {
    lines: totalLines > 0 ? (coveredLines / totalLines) * 100 : 0,
    functions: totalFunctions > 0 ? (coveredFunctions / totalFunctions) * 100 : 0,
    branches: totalBranches > 0 ? (coveredBranches / totalBranches) * 100 : 0,
    statements: totalStatements > 0 ? (coveredStatements / totalStatements) * 100 : 0,
  };
}

/**
 * Calculate file criticality based on import frequency and directory
 */
async function calculateFileCriticality(
  file: string,
  allFiles: string[],
  projectPath: string
): Promise<FileCriticality> {
  const relPath = path.relative(projectPath, file);
  const lowerPath = relPath.toLowerCase();

  // Core utilities and services are most critical
  if (
    lowerPath.includes("/utils/") ||
    lowerPath.includes("/lib/") ||
    lowerPath.includes("/core/") ||
    lowerPath.includes("/services/") ||
    lowerPath.includes("/api/") ||
    lowerPath.includes("/store") ||
    lowerPath.includes("/composables/")
  ) {
    return "core";
  }

  // Hooks and providers are important
  if (
    lowerPath.includes("/hooks/") ||
    lowerPath.includes("/providers/") ||
    lowerPath.includes("/context/")
  ) {
    return "important";
  }

  // Count how many files import this file (in-degree)
  let importCount = 0;
  for (const otherFile of allFiles.slice(0, 100)) {
    // Sample to avoid slowness
    if (otherFile === file) continue;

    try {
      const content = await fs.readFile(otherFile, "utf-8");
      const fileBasename = path.basename(file, path.extname(file));
      if (content.includes(fileBasename)) {
        importCount++;
      }
    } catch {
      // Skip files that can't be read
    }
  }

  // High import count = important or core
  if (importCount >= 5) {
    return "core";
  } else if (importCount >= 3) {
    return "important";
  }

  // Components are standard
  if (lowerPath.includes("/components/") || lowerPath.includes("/pages/")) {
    return "standard";
  }

  // Everything else is peripheral
  return "peripheral";
}

/**
 * Calculate file complexity using AST
 */
async function calculateFileComplexity(file: string): Promise<number> {
  try {
    const ast = await ASTParser.parseFile(file);
    return ASTParser.calculateComplexity(ast);
  } catch {
    return 0;
  }
}

/**
 * Determine if coverage gap is significant
 */
function isSignificantGap(
  coverage: FileCoverage,
  threshold: CoverageThreshold
): boolean {
  return (
    (threshold.lines !== undefined && coverage.lines.percentage < threshold.lines) ||
    (threshold.functions !== undefined && coverage.functions.percentage < threshold.functions) ||
    (threshold.branches !== undefined && coverage.branches.percentage < threshold.branches) ||
    (threshold.statements !== undefined && coverage.statements.percentage < threshold.statements)
  );
}

/**
 * Determine gap priority based on criticality, complexity, and coverage
 */
function determinePriority(
  coverage: FileCoverage | undefined,
  criticality: FileCriticality,
  complexity: number,
  threshold: CoverageThreshold
): GapPriority {
  const linesCoverage = coverage?.lines.percentage || 0;

  // Critical: Core files with 0 coverage and high complexity
  if (criticality === "core" && linesCoverage === 0 && complexity > 30) {
    return "critical";
  }

  // Critical: Core files below threshold
  if (
    criticality === "core" &&
    threshold.lines &&
    linesCoverage < threshold.lines
  ) {
    return "critical";
  }

  // High: Important files with low coverage
  if (
    criticality === "important" &&
    (linesCoverage === 0 || (threshold.lines && linesCoverage < threshold.lines))
  ) {
    return "high";
  }

  // High: High complexity files with low coverage
  if (complexity > 50 && linesCoverage < 50) {
    return "high";
  }

  // Medium: Standard files below threshold
  if (
    criticality === "standard" &&
    threshold.lines &&
    linesCoverage < threshold.lines
  ) {
    return "medium";
  }

  // Low: Peripheral files or above threshold
  return "low";
}

/**
 * Check if gap should be skipped based on priority filter
 */
function shouldSkipGap(gapPriority: GapPriority, filterPriority: GapPriority): boolean {
  const priorityOrder: Record<GapPriority, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  return priorityOrder[gapPriority] > priorityOrder[filterPriority];
}

/**
 * Generate reasons why this is a coverage gap
 */
function generateGapReasons(
  coverage: FileCoverage | undefined,
  criticality: FileCriticality,
  complexity: number,
  threshold: CoverageThreshold
): string[] {
  const reasons: string[] = [];

  if (!coverage || coverage.lines.percentage === 0) {
    reasons.push("No test coverage");
  } else {
    if (threshold.lines && coverage.lines.percentage < threshold.lines) {
      reasons.push(`Line coverage ${coverage.lines.percentage.toFixed(1)}% below threshold ${threshold.lines}%`);
    }
    if (threshold.functions && coverage.functions.percentage < threshold.functions) {
      reasons.push(`Function coverage ${coverage.functions.percentage.toFixed(1)}% below threshold ${threshold.functions}%`);
    }
  }

  if (criticality === "core") {
    reasons.push("Core utility - high impact if bugs present");
  } else if (criticality === "important") {
    reasons.push("Important file - widely used across codebase");
  }

  if (complexity > 50) {
    reasons.push(`High complexity (${complexity}) - error-prone`);
  } else if (complexity > 30) {
    reasons.push(`Moderate complexity (${complexity}) - needs testing`);
  }

  return reasons;
}

/**
 * Identify untested functions in a file
 */
async function identifyUntestedFunctions(
  file: string,
  coverage: FileCoverage | undefined
): Promise<Array<{ name: string; line?: number; complexity: number }>> {
  try {
    const ast = await ASTParser.parseFile(file);
    const exports = ASTParser.extractExports(ast);

    // Simple heuristic: if file has 0% function coverage, all exports are untested
    if (!coverage || coverage.functions.percentage === 0) {
      return exports.map((name) => ({ name, complexity: 0 }));
    }

    // Return uncovered functions from coverage data
    return (coverage.functions.uncovered || []).map((name) => ({
      name,
      complexity: 0,
    }));
  } catch {
    return [];
  }
}

/**
 * Detect existing test patterns in the project
 */
async function detectExistingTestPatterns(
  projectPath: string,
  framework: TestFramework
): Promise<ExistingTestPattern> {
  const testFiles = await glob.glob(
    ["**/*.test.{ts,tsx,js,jsx}", "**/*.spec.{ts,tsx,js,jsx}", "**/__tests__/**/*.{ts,tsx,js,jsx}"],
    {
      cwd: projectPath,
      ignore: ["**/node_modules/**"],
      absolute: true,
    }
  );

  const patterns: ExistingTestPattern = {
    framework,
    patterns: {
      importStatements: [],
      setupPatterns: [],
      assertionLibrary: "expect",
      mockingLibrary: undefined,
      renderFunction: undefined,
      commonHelpers: [],
    },
    exampleFiles: testFiles.slice(0, 5).map((f) => path.relative(projectPath, f)),
  };

  if (testFiles.length === 0) {
    return patterns;
  }

  // Analyze first few test files to extract patterns
  for (const testFile of testFiles.slice(0, 5)) {
    try {
      const content = await fs.readFile(testFile, "utf-8");

      // Extract import statements
      const importRegex = /import\s+.*\s+from\s+['"](.+)['"]/g;
      let match;
      while ((match = importRegex.exec(content)) !== null) {
        if (!patterns.patterns.importStatements.includes(match[0])) {
          patterns.patterns.importStatements.push(match[0]);
        }
      }

      // Detect mocking library
      if (content.includes("vi.mock") || content.includes("vitest")) {
        patterns.patterns.mockingLibrary = "vi.mock";
      } else if (content.includes("jest.mock")) {
        patterns.patterns.mockingLibrary = "jest.mock";
      }

      // Detect render function
      if (content.includes("render(")) {
        patterns.patterns.renderFunction = "render";
      } else if (content.includes("mount(")) {
        patterns.patterns.renderFunction = "mount";
      }

      // Detect assertion library
      if (content.includes("expect(")) {
        patterns.patterns.assertionLibrary = "expect";
      } else if (content.includes("assert.")) {
        patterns.patterns.assertionLibrary = "assert";
      }

      // Detect setup patterns
      if (content.includes("beforeEach")) {
        patterns.patterns.setupPatterns.push("beforeEach");
      }
      if (content.includes("afterEach")) {
        patterns.patterns.setupPatterns.push("afterEach");
      }
      if (content.includes("beforeAll")) {
        patterns.patterns.setupPatterns.push("beforeAll");
      }
    } catch {
      continue;
    }
  }

  return patterns;
}

/**
 * Generate test suggestions for a coverage gap
 */
async function generateTestSuggestions(
  gap: CoverageGap,
  filePath: string,
  testFramework: TestFramework,
  projectFramework: FrameworkType,
  existingPatterns: ExistingTestPattern
): Promise<TestSuggestion[]> {
  const suggestions: TestSuggestion[] = [];

  try {
    const ast = await ASTParser.parseFile(filePath);
    const exports = ASTParser.extractExports(ast);

    // Determine file type
    const isComponent = filePath.endsWith(".tsx") || filePath.endsWith(".jsx") || filePath.endsWith(".vue");
    const isScreen = filePath.includes("screens") || filePath.includes("app/") && (projectFramework === "react-native" || projectFramework === "expo");
    const isHook = path.basename(filePath).startsWith("use") && (filePath.includes("hooks") || filePath.includes("composables"));
    const isStore = filePath.includes("/stores/") || filePath.includes("/store/");
    const isNuxtServerRoute = filePath.includes("/server/") && (filePath.includes("/api/") || filePath.includes("/routes/"));
    const isUtil = filePath.includes("utils") || filePath.includes("lib") || filePath.includes("helpers");

    // Generate appropriate test scaffold
    if ((isComponent || isScreen) && (projectFramework === "react-native" || projectFramework === "expo")) {
      suggestions.push(
        generateReactNativeComponentTest(gap, filePath, exports, testFramework, existingPatterns, isScreen)
      );
    } else if (isHook && (projectFramework === "react-native" || projectFramework === "expo")) {
      suggestions.push(
        generateReactNativeHookTest(gap, filePath, exports, testFramework, existingPatterns)
      );
    } else if (isComponent && projectFramework === "react") {
      suggestions.push(
        generateReactComponentTest(gap, filePath, exports, testFramework, existingPatterns)
      );
    } else if (isHook && projectFramework === "react") {
      suggestions.push(
        generateReactHookTest(gap, filePath, exports, testFramework, existingPatterns)
      );
    } else if (isStore && (projectFramework === "vue3" || projectFramework === "nuxt3")) {
      // Pinia store test
      suggestions.push(
        generatePiniaStoreTest(gap, filePath, exports, testFramework, existingPatterns)
      );
    } else if (isNuxtServerRoute && projectFramework === "nuxt3") {
      // Nuxt server route test
      suggestions.push(
        generateNuxtServerRouteTest(gap, filePath, exports, testFramework, existingPatterns)
      );
    } else if (isComponent && (projectFramework === "vue3" || projectFramework === "nuxt3")) {
      suggestions.push(
        generateVueComponentTest(gap, filePath, exports, testFramework, existingPatterns)
      );
    } else if (isHook && (projectFramework === "vue3" || projectFramework === "nuxt3")) {
      suggestions.push(
        generateVueComposableTest(gap, filePath, exports, testFramework, existingPatterns)
      );
    } else if (isUtil) {
      suggestions.push(
        generateUtilityTest(gap, filePath, exports, testFramework, existingPatterns)
      );
    } else {
      // Generic unit test
      suggestions.push(
        generateGenericTest(gap, filePath, exports, testFramework, existingPatterns)
      );
    }
  } catch (error) {
    // Fallback to generic test if parsing fails
    suggestions.push(
      generateGenericTest(gap, filePath, [], testFramework, existingPatterns)
    );
  }

  return suggestions;
}

/**
 * Generate React component test scaffold
 */
function generateReactComponentTest(
  gap: CoverageGap,
  filePath: string,
  exports: string[],
  framework: TestFramework,
  patterns: ExistingTestPattern
): TestSuggestion {
  const componentName = exports[0] || "Component";
  const testPath = filePath.replace(/\.(tsx|jsx)$/, ".test.$1");
  const importPath = "./" + path.basename(filePath, path.extname(filePath));

  const renderFunc = patterns.patterns.renderFunction || "render";
  const assertLib = patterns.patterns.assertionLibrary;

  const scaffold = `import { ${framework === "vitest" ? "describe, it, expect" : "describe, it, expect"} } from '${framework === "vitest" ? "vitest" : "@jest/globals"}';
import { ${renderFunc}, screen } from '@testing-library/react';
import ${componentName} from '${importPath}';

describe('${componentName}', () => {
  it('should render without crashing', () => {
    const { container } = ${renderFunc}(<${componentName} />);
    ${assertLib}(container).toBeTruthy();
  });

  it('should render with correct props', () => {
    ${renderFunc}(<${componentName} />);
    // Add assertions based on component props
  });

  ${gap.untestedFunctions.slice(1).map(fn => `
  it('should handle ${fn.name} correctly', () => {
    ${renderFunc}(<${componentName} />);
    // Test ${fn.name} functionality
  });`).join('\n')}
});
`;

  return {
    type: "component",
    framework,
    testFilePath: testPath,
    scaffold,
    description: `Component test for ${componentName} with ${gap.untestedFunctions.length} untested functions`,
    priority: gap.priority,
    estimatedEffort: gap.complexity > 50 ? "high" : gap.complexity > 30 ? "medium" : "low",
  };
}

/**
 * Generate React hook test scaffold
 */
function generateReactHookTest(
  gap: CoverageGap,
  filePath: string,
  exports: string[],
  framework: TestFramework,
  _patterns: ExistingTestPattern
): TestSuggestion {
  const hookName = exports[0] || "useHook";
  const testPath = filePath.replace(/\.(ts|tsx)$/, ".test.$1");
  const importPath = "./" + path.basename(filePath, path.extname(filePath));

  const scaffold = `import { ${framework === "vitest" ? "describe, it, expect" : "describe, it, expect"} } from '${framework === "vitest" ? "vitest" : "@jest/globals"}';
import { renderHook, act } from '@testing-library/react';
import { ${hookName} } from '${importPath}';

describe('${hookName}', () => {
  it('should initialize with correct default values', () => {
    const { result } = renderHook(() => ${hookName}());
    expect(result.current).toBeDefined();
  });

  it('should update state correctly', () => {
    const { result } = renderHook(() => ${hookName}());

    act(() => {
      // Trigger state updates
    });

    // Add assertions
  });

  ${gap.untestedFunctions.slice(1).map(fn => `
  it('should handle ${fn.name} correctly', () => {
    const { result } = renderHook(() => ${hookName}());
    // Test ${fn.name} functionality
  });`).join('\n')}
});
`;

  return {
    type: "hook",
    framework,
    testFilePath: testPath,
    scaffold,
    description: `Hook test for ${hookName} covering ${gap.untestedFunctions.length} functions`,
    priority: gap.priority,
    estimatedEffort: gap.complexity > 30 ? "medium" : "low",
  };
}

/**
 * Generate React Native component/screen test scaffold
 */
function generateReactNativeComponentTest(
  gap: CoverageGap,
  filePath: string,
  exports: string[],
  framework: TestFramework,
  patterns: ExistingTestPattern,
  isScreen: boolean
): TestSuggestion {
  const componentName = exports[0] || "Component";
  const testPath = filePath.replace(/\.(tsx|jsx)$/, ".test.$1");
  const importPath = "./" + path.basename(filePath, path.extname(filePath));

  const renderFunc = patterns.patterns.renderFunction || "render";
  const assertLib = patterns.patterns.assertionLibrary;

  const scaffold = `import { ${framework === "vitest" ? "describe, it, expect" : "describe, it, expect"} } from '${framework === "vitest" ? "vitest" : "@jest/globals"}';
import { ${renderFunc}, screen, fireEvent } from '@testing-library/react-native';
${isScreen ? "import { NavigationContainer } from '@react-navigation/native';" : ""}
import ${componentName} from '${importPath}';

${isScreen ? `// Mock navigation
const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  setOptions: jest.fn(),
};

const mockRoute = {
  params: {},
  key: 'test',
  name: '${componentName}',
};
` : ""}
describe('${componentName}', () => {
  it('should render without crashing', () => {
    ${isScreen ? `
    const { container } = ${renderFunc}(
      <NavigationContainer>
        <${componentName} navigation={mockNavigation} route={mockRoute} />
      </NavigationContainer>
    );` : `
    const { container } = ${renderFunc}(<${componentName} />);`}
    ${assertLib}(container).toBeTruthy();
  });

  it('should render with correct props', () => {
    ${isScreen ? `
    ${renderFunc}(
      <NavigationContainer>
        <${componentName} navigation={mockNavigation} route={mockRoute} />
      </NavigationContainer>
    );` : `
    ${renderFunc}(<${componentName} />);`}
    // Add assertions based on component props
    ${assertLib}(screen.getByTestId('${componentName.toLowerCase()}')).toBeDefined();
  });

  ${isScreen ? `
  it('should handle navigation correctly', () => {
    ${renderFunc}(
      <NavigationContainer>
        <${componentName} navigation={mockNavigation} route={mockRoute} />
      </NavigationContainer>
    );

    // Test navigation interactions
    // fireEvent.press(screen.getByText('Navigate'));
    // ${assertLib}(mockNavigation.navigate).toHaveBeenCalled();
  });
  ` : ""}

  ${gap.untestedFunctions.slice(1).map(fn => `
  it('should handle ${fn.name} correctly', () => {
    ${isScreen ? `
    ${renderFunc}(
      <NavigationContainer>
        <${componentName} navigation={mockNavigation} route={mockRoute} />
      </NavigationContainer>
    );` : `
    ${renderFunc}(<${componentName} />);`}
    // Test ${fn.name} functionality
  });`).join('\n')}
});
`;

  return {
    type: isScreen ? "component" : "component",
    framework,
    testFilePath: testPath,
    scaffold,
    description: `React Native ${isScreen ? 'screen' : 'component'} test for ${componentName} with ${gap.untestedFunctions.length} untested functions`,
    priority: gap.priority,
    estimatedEffort: gap.complexity > 50 ? "high" : gap.complexity > 30 ? "medium" : "low",
  };
}

/**
 * Generate React Native hook test scaffold
 */
function generateReactNativeHookTest(
  gap: CoverageGap,
  filePath: string,
  exports: string[],
  framework: TestFramework,
  _patterns: ExistingTestPattern
): TestSuggestion {
  const hookName = exports[0] || "useHook";
  const testPath = filePath.replace(/\.(ts|tsx)$/, ".test.$1");
  const importPath = "./" + path.basename(filePath, path.extname(filePath));

  const scaffold = `import { ${framework === "vitest" ? "describe, it, expect" : "describe, it, expect"} } from '${framework === "vitest" ? "vitest" : "@jest/globals"}';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { ${hookName} } from '${importPath}';

describe('${hookName}', () => {
  it('should initialize with correct default values', () => {
    const { result } = renderHook(() => ${hookName}());
    expect(result.current).toBeDefined();
  });

  it('should update state correctly', async () => {
    const { result } = renderHook(() => ${hookName}());

    await act(async () => {
      // Trigger state updates
    });

    // Add assertions
    expect(result.current).toBeDefined();
  });

  it('should handle async operations', async () => {
    const { result } = renderHook(() => ${hookName}());

    await waitFor(() => {
      expect(result.current).toBeDefined();
    });
  });

  ${gap.untestedFunctions.slice(1).map(fn => `
  it('should handle ${fn.name} correctly', async () => {
    const { result } = renderHook(() => ${hookName}());

    await act(async () => {
      // Test ${fn.name} functionality
    });

    expect(result.current).toBeDefined();
  });`).join('\n')}
});
`;

  return {
    type: "hook",
    framework,
    testFilePath: testPath,
    scaffold,
    description: `React Native hook test for ${hookName} covering ${gap.untestedFunctions.length} functions`,
    priority: gap.priority,
    estimatedEffort: gap.complexity > 30 ? "medium" : "low",
  };
}

/**
 * Generate Vue component test scaffold
 */
function generateVueComponentTest(
  gap: CoverageGap,
  filePath: string,
  exports: string[],
  framework: TestFramework,
  _patterns: ExistingTestPattern
): TestSuggestion {
  const componentName = exports[0] || path.basename(filePath, ".vue");
  const testPath = filePath.replace(".vue", ".test.ts");
  const importPath = "./" + path.basename(filePath);

  // Check if it's a Nuxt component (might need auto-import setup)
  const isNuxtProject = filePath.includes("components/") || filePath.includes("pages/");

  const scaffold = `import { describe, it, expect${isNuxtProject ? ', beforeEach' : ''} } from '${framework}';
import { mount${isNuxtProject ? ', flushPromises' : ''} } from '@vue/test-utils';
${isNuxtProject ? `import { mockNuxtImport } from '@nuxt/test-utils/runtime';
` : ''}import ${componentName} from '${importPath}';

describe('${componentName}', () => {${isNuxtProject ? `
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
  });
` : ''}
  it('should mount successfully', () => {
    const wrapper = mount(${componentName});
    expect(wrapper.exists()).toBe(true);
  });

  it('should render with correct props', async () => {
    const wrapper = mount(${componentName}, {
      props: {
        // Add component props
      }
    });

    expect(wrapper.html()).toBeTruthy();
    expect(wrapper.text()).toContain('expected text');
  });

  it('should emit events correctly', async () => {
    const wrapper = mount(${componentName});

    // Trigger event
    // await wrapper.find('button').trigger('click');

    // Check emitted events
    // expect(wrapper.emitted('submit')).toBeTruthy();
  });

  it('should handle user interactions', async () => {
    const wrapper = mount(${componentName});

    // Simulate user interaction
    // await wrapper.find('input').setValue('test value');

    // Verify component state or DOM changes
    expect(wrapper.vm).toBeDefined();
  });
${isNuxtProject ? `
  it('should work with Nuxt auto-imports', async () => {
    const wrapper = mount(${componentName});

    // Test composables, navigateTo, etc.
    await flushPromises();
    expect(wrapper.vm).toBeDefined();
  });
` : ''}
  ${gap.untestedFunctions.slice(0, 3).map(fn => `
  it('should handle ${fn.name} correctly', async () => {
    const wrapper = mount(${componentName});

    // Test ${fn.name} functionality
    // await wrapper.vm.${fn.name}();

    expect(wrapper.vm).toBeDefined();
  });`).join('\n')}
});
`;

  return {
    type: "component",
    framework,
    testFilePath: testPath,
    scaffold,
    description: `Vue component test for ${componentName} with ${gap.untestedFunctions.length} untested functions`,
    priority: gap.priority,
    estimatedEffort: gap.complexity > 50 ? "high" : gap.complexity > 30 ? "medium" : "low",
  };
}

/**
 * Generate Vue composable test scaffold
 */
function generateVueComposableTest(
  gap: CoverageGap,
  filePath: string,
  exports: string[],
  framework: TestFramework,
  _patterns: ExistingTestPattern
): TestSuggestion {
  const composableName = exports[0] || "useComposable";
  const testPath = filePath.replace(/\.ts$/, ".test.ts");
  const importPath = "./" + path.basename(filePath, ".ts");

  // Check if this is a Nuxt project (composables/ directory)
  const isNuxtProject = filePath.includes("composables/");

  const scaffold = `import { describe, it, expect${isNuxtProject ? ', beforeEach' : ''} } from '${framework}';
${isNuxtProject ? `import { mockNuxtImport } from '@nuxt/test-utils/runtime';
` : ''}import { ${composableName} } from '${importPath}';

describe('${composableName}', () => {${isNuxtProject ? `
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
  });
` : ''}
  it('should return expected values', () => {
    const result = ${composableName}();

    expect(result).toBeDefined();
    // Verify returned refs, computed, or functions
  });

  it('should handle reactive state correctly', () => {
    const { /* destructure returned values */ } = ${composableName}();

    // Test reactive state updates
    // someRef.value = 'new value';
    // expect(someComputed.value).toBe('expected');
  });

  it('should handle async operations', async () => {
    const result = ${composableName}();

    // Test async functionality
    // await result.fetchData();
    // expect(result.data.value).toBeDefined();
  });
${isNuxtProject ? `
  it('should work with Nuxt auto-imports', () => {
    // Test composables that use useRoute, useRouter, navigateTo, etc.
    const result = ${composableName}();

    expect(result).toBeDefined();
  });
` : ''}
  ${gap.untestedFunctions.slice(0, 3).map(fn => `
  it('should handle ${fn.name} correctly', async () => {
    const result = ${composableName}();

    // Test ${fn.name} functionality
    // await result.${fn.name}();

    expect(result).toBeDefined();
  });`).join('\n')}
});
`;

  return {
    type: "composable",
    framework,
    testFilePath: testPath,
    scaffold,
    description: `Composable test for ${composableName} covering ${gap.untestedFunctions.length} functions`,
    priority: gap.priority,
    estimatedEffort: gap.complexity > 30 ? "medium" : "low",
  };
}

/**
 * Generate Pinia store test scaffold
 */
function generatePiniaStoreTest(
  gap: CoverageGap,
  filePath: string,
  exports: string[],
  framework: TestFramework,
  _patterns: ExistingTestPattern
): TestSuggestion {
  const storeName = exports[0] || "useStore";
  const testPath = filePath.replace(/\.ts$/, ".test.ts");
  const importPath = "./" + path.basename(filePath, ".ts");

  const scaffold = `import { describe, it, expect, beforeEach } from '${framework}';
import { setActivePinia, createPinia } from 'pinia';
import { ${storeName} } from '${importPath}';

describe('${storeName}', () => {
  beforeEach(() => {
    // Create a fresh pinia instance for each test
    setActivePinia(createPinia());
  });

  it('should initialize with default state', () => {
    const store = ${storeName}();

    expect(store).toBeDefined();
    // Verify initial state values
  });

  it('should update state correctly', () => {
    const store = ${storeName}();

    // Test state mutations
    // store.someProperty = 'new value';
    // expect(store.someProperty).toBe('new value');
  });

  it('should compute derived state', () => {
    const store = ${storeName}();

    // Test getters
    // expect(store.someGetter).toBe('expected value');
  });

  it('should handle actions correctly', async () => {
    const store = ${storeName}();

    // Test actions
    // await store.fetchData();
    // expect(store.data).toBeDefined();
  });

  ${gap.untestedFunctions.slice(0, 3).map(fn => `
  it('should handle ${fn.name} action', async () => {
    const store = ${storeName}();

    // Test ${fn.name} action
    // await store.${fn.name}();

    expect(store).toBeDefined();
  });`).join('\n')}
});
`;

  return {
    type: "store",
    framework,
    testFilePath: testPath,
    scaffold,
    description: `Pinia store test for ${storeName} with ${gap.untestedFunctions.length} untested actions`,
    priority: gap.priority,
    estimatedEffort: gap.complexity > 30 ? "medium" : "low",
  };
}

/**
 * Generate Nuxt server route test scaffold
 */
function generateNuxtServerRouteTest(
  gap: CoverageGap,
  filePath: string,
  _exports: string[],
  framework: TestFramework,
  _patterns: ExistingTestPattern
): TestSuggestion {
  const routeName = path.basename(filePath, path.extname(filePath));
  const testPath = filePath.replace(/\.ts$/, ".test.ts");
  const importPath = "./" + routeName;

  const scaffold = `import { describe, it, expect, beforeEach } from '${framework}';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import handler from '${importPath}';

describe('Server Route: ${routeName}', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle GET request', async () => {
    const event = {
      node: {
        req: { method: 'GET', url: '/api/test' },
        res: { statusCode: 200 }
      }
    };

    const response = await handler(event);

    expect(response).toBeDefined();
    // Verify response structure
  });

  it('should handle POST request with body', async () => {
    const event = {
      node: {
        req: { method: 'POST', url: '/api/test' },
        res: { statusCode: 200 }
      }
    };

    // Mock readBody
    // mockNuxtImport('readBody', () => vi.fn().mockResolvedValue({ data: 'test' }));

    const response = await handler(event);

    expect(response).toBeDefined();
  });

  it('should handle errors gracefully', async () => {
    const event = {
      node: {
        req: { method: 'GET', url: '/api/test' },
        res: { statusCode: 200 }
      }
    };

    // Simulate error condition
    expect(async () => await handler(event)).not.toThrow();
  });

  ${gap.untestedFunctions.slice(0, 2).map(fn => `
  it('should test ${fn.name} logic', async () => {
    const event = {
      node: {
        req: { method: 'GET', url: '/api/test' },
        res: { statusCode: 200 }
      }
    };

    const response = await handler(event);
    expect(response).toBeDefined();
  });`).join('\n')}
});
`;

  return {
    type: "server-route",
    framework,
    testFilePath: testPath,
    scaffold,
    description: `Nuxt server route test for ${routeName}`,
    priority: gap.priority,
    estimatedEffort: "medium",
  };
}

/**
 * Generate utility function test scaffold
 */
function generateUtilityTest(
  gap: CoverageGap,
  filePath: string,
  exports: string[],
  framework: TestFramework,
  patterns: ExistingTestPattern
): TestSuggestion {
  const utilName = exports[0] || "utility";
  const testPath = filePath.replace(/\.(ts|js)$/, ".test.$1");
  const importPath = "./" + path.basename(filePath, path.extname(filePath));

  const assertLib = patterns.patterns.assertionLibrary;

  const scaffold = `import { describe, it, ${assertLib} } from '${framework === "vitest" ? "vitest" : "@jest/globals"}';
import { ${exports.join(", ")} } from '${importPath}';

describe('${utilName}', () => {
  ${exports.map(fn => `
  describe('${fn}', () => {
    it('should handle valid input', () => {
      const result = ${fn}(/* valid input */);
      ${assertLib}(result).toBeDefined();
    });

    it('should handle edge cases', () => {
      // Test edge cases: null, undefined, empty, etc.
    });

    it('should throw on invalid input', () => {
      ${assertLib}(() => ${fn}(/* invalid input */)).toThrow();
    });
  });`).join('\n')}
});
`;

  return {
    type: "unit",
    framework,
    testFilePath: testPath,
    scaffold,
    description: `Utility tests for ${exports.length} functions: ${exports.join(", ")}`,
    priority: gap.priority,
    estimatedEffort: gap.untestedFunctions.length > 5 ? "high" : "medium",
  };
}

/**
 * Generate generic test scaffold
 */
function generateGenericTest(
  gap: CoverageGap,
  filePath: string,
  exports: string[],
  framework: TestFramework,
  _patterns: ExistingTestPattern
): TestSuggestion {
  const moduleName = path.basename(filePath, path.extname(filePath));
  const testPath = filePath.replace(/\.(ts|tsx|js|jsx)$/, ".test.$1");
  const importPath = "./" + moduleName;

  const scaffold = `import { describe, it, expect } from '${framework === "vitest" ? "vitest" : "@jest/globals"}';
import * as ${moduleName} from '${importPath}';

describe('${moduleName}', () => {
  ${exports.length > 0 ? exports.map(fn => `
  it('should test ${fn}', () => {
    expect(${moduleName}.${fn}).toBeDefined();
    // Add meaningful assertions
  });`).join('\n') : `
  it('should export expected functionality', () => {
    expect(${moduleName}).toBeDefined();
  });`}
});
`;

  return {
    type: "unit",
    framework,
    testFilePath: testPath,
    scaffold,
    description: `Generic test for ${moduleName}`,
    priority: gap.priority,
    estimatedEffort: "medium",
  };
}

/**
 * Generate recommendations based on analysis
 */
function generateRecommendations(
  gaps: CoverageGap[],
  criticalGaps: CoverageGap[],
  overallCoverage: { lines: number; functions: number; branches: number; statements: number },
  threshold: CoverageThreshold
): string[] {
  const recommendations: string[] = [];

  if (criticalGaps.length > 0) {
    recommendations.push(
      `⚠️ CRITICAL: Found ${criticalGaps.length} high-priority coverage gaps in core files. These should be addressed immediately.`
    );
  }

  if (overallCoverage.lines < (threshold.lines || 80)) {
    const deficit = (threshold.lines || 80) - overallCoverage.lines;
    recommendations.push(
      `Line coverage is ${overallCoverage.lines.toFixed(1)}%, ${deficit.toFixed(1)}% below target. Focus on testing untested core utilities first.`
    );
  }

  if (overallCoverage.functions < (threshold.functions || 80)) {
    recommendations.push(
      `Function coverage is ${overallCoverage.functions.toFixed(1)}%. Prioritize testing complex, exported functions.`
    );
  }

  const coreGaps = gaps.filter((g) => g.criticality === "core");
  if (coreGaps.length > 0) {
    recommendations.push(
      `${coreGaps.length} core utility files lack adequate coverage. These are high-impact - start here.`
    );
  }

  const highComplexityGaps = gaps.filter((g) => g.complexity > 50);
  if (highComplexityGaps.length > 0) {
    recommendations.push(
      `${highComplexityGaps.length} high-complexity files (complexity > 50) need tests. Complex code is error-prone.`
    );
  }

  if (gaps.length > 20) {
    recommendations.push(
      `Large number of gaps (${gaps.length}). Consider: (1) Focus on critical/high priority first, (2) Set up CI coverage gates, (3) Make testing part of feature development.`
    );
  }

  // React Native / Expo specific recommendations
  const rnScreenGaps = gaps.filter((g) => g.file.includes("screens") || g.file.includes("app/"));
  if (rnScreenGaps.length > 0 && (gaps.length > 0)) {
    const hasRNTestingLib = gaps.some((g) =>
      g.testSuggestions.some((s) => s.scaffold?.includes("@testing-library/react-native"))
    );

    if (hasRNTestingLib) {
      recommendations.push(
        `📱 ${rnScreenGaps.length} React Native screen components lack tests. Use @testing-library/react-native with Navigation mocks for testing screens.`
      );

      recommendations.push(
        `📱 React Native Testing: Remember to test navigation, user interactions with fireEvent.press(), and async operations with waitFor().`
      );
    }
  }

  // Vue / Nuxt specific recommendations
  const vueComponentGaps = gaps.filter((g) => g.file.endsWith(".vue"));
  if (vueComponentGaps.length > 0) {
    const hasVueTestUtils = gaps.some((g) =>
      g.testSuggestions.some((s) => s.scaffold?.includes("@vue/test-utils"))
    );

    if (hasVueTestUtils) {
      recommendations.push(
        `🎨 ${vueComponentGaps.length} Vue components lack tests. Use @vue/test-utils with mount() for component testing.`
      );
    }
  }

  const composableGaps = gaps.filter((g) => g.file.includes("/composables/"));
  if (composableGaps.length > 0) {
    recommendations.push(
      `🔄 ${composableGaps.length} composables lack tests. Test reactive state, computed values, and async operations.`
    );
  }

  const piniaStoreGaps = gaps.filter((g) => g.file.includes("/stores/") || g.file.includes("/store/"));
  if (piniaStoreGaps.length > 0) {
    recommendations.push(
      `📦 ${piniaStoreGaps.length} Pinia stores lack tests. Test state initialization, getters, and actions with setActivePinia().`
    );
  }

  const nuxtServerGaps = gaps.filter((g) => g.file.includes("/server/"));
  if (nuxtServerGaps.length > 0) {
    const hasNuxtTestUtils = gaps.some((g) =>
      g.testSuggestions.some((s) => s.scaffold?.includes("@nuxt/test-utils"))
    );

    if (hasNuxtTestUtils) {
      recommendations.push(
        `🖥️ ${nuxtServerGaps.length} Nuxt server routes lack tests. Use @nuxt/test-utils for server-side testing.`
      );
    }
  }

  if (recommendations.length === 0) {
    recommendations.push(
      `✅ Coverage is healthy! ${overallCoverage.lines.toFixed(1)}% line coverage meets threshold. Continue maintaining test quality.`
    );
  }

  return recommendations;
}
