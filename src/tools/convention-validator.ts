/**
 * Convention Validator Tool
 *
 * Validate adherence to project-specific naming, structure, and coding conventions.
 * Auto-detect conventions from existing code and provide auto-fix suggestions.
 */

import * as path from "path";
import * as fs from "fs/promises";
import * as glob from "fast-glob";
import { FrameworkDetector } from "../utils/framework-detector.js";
import type {
  ConventionValidationParams,
  ConventionValidationResult,
  ProjectConventions,
  ConventionViolation,
  DetectedConvention,
  ConsistencyScore,
  AutoFixSuggestion,
  ConventionCategory,
  ViolationSeverity,
  CasingStyle,
  FrameworkType,
  NamingConvention,
} from "../types/index.js";

export async function validateConventions(
  params: ConventionValidationParams
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const {
    projectPath = process.cwd(),
    includeGlobs = ["**/*.{ts,tsx,js,jsx,vue}"],
    excludeGlobs = ["**/node_modules/**", "**/dist/**", "**/build/**", "**/.next/**"],
    conventions: userConventions,
    autodetectConventions = true,
    severity = "info",
    autoFix = true,
    applyAutoFixes = false,
    framework: userFramework,
  } = params;

  // Step 1: Detect framework
  const frameworkResult = await FrameworkDetector.detect(projectPath);
  const framework = userFramework || frameworkResult.framework;

  // Step 2: Find all source files
  const files = await glob.glob(includeGlobs, {
    cwd: projectPath,
    ignore: excludeGlobs,
    absolute: true,
  });

  // Step 3: Auto-detect conventions if requested
  let detectedConventions: DetectedConvention[] | undefined;
  let conventions: ProjectConventions;

  if (autodetectConventions && !userConventions) {
    detectedConventions = await detectConventions(files, projectPath, framework);
    conventions = convertDetectedToConventions(detectedConventions, framework);
  } else if (userConventions) {
    conventions = userConventions;
  } else {
    conventions = getDefaultConventions(framework);
  }

  // Step 4: Validate files against conventions
  const violations: ConventionViolation[] = [];

  for (const file of files) {
    const fileViolations = await validateFile(file, projectPath, conventions, framework);
    violations.push(...fileViolations);
  }

  // Step 5: Filter by severity
  const filteredViolations = violations.filter((v) => {
    const severityOrder: Record<ViolationSeverity, number> = {
      error: 0,
      warning: 1,
      info: 2,
    };
    return severityOrder[v.severity] <= severityOrder[severity];
  });

  // Step 6: Calculate consistency score
  const consistency = calculateConsistencyScore(filteredViolations, files.length);

  // Step 7: Generate auto-fix suggestions
  const autoFixSuggestions = autoFix
    ? generateAutoFixSuggestions(filteredViolations)
    : undefined;

  // Step 8: Apply safe auto-fixes if requested
  if (applyAutoFixes && autoFixSuggestions) {
    await applySafeAutoFixes(autoFixSuggestions, projectPath);
  }

  // Step 9: Generate summary and recommendations
  const summary = {
    totalViolations: filteredViolations.length,
    byCategory: countByCategory(filteredViolations),
    bySeverity: countBySeverity(filteredViolations),
    autoFixableCount: filteredViolations.filter((v) => v.autoFixable).length,
  };

  const recommendations = generateRecommendations(
    filteredViolations,
    consistency,
    framework
  );

  const result: ConventionValidationResult = {
    project: {
      name: path.basename(projectPath),
      framework,
      totalFiles: files.length,
    },
    detectedConventions,
    conventions,
    violations: filteredViolations,
    consistency,
    summary,
    autoFixSuggestions,
    recommendations,
    metadata: {
      analyzedAt: new Date().toISOString(),
      filesAnalyzed: files.length,
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
 * Auto-detect conventions from existing codebase
 */
async function detectConventions(
  files: string[],
  projectPath: string,
  framework: FrameworkType
): Promise<DetectedConvention[]> {
  const detected: DetectedConvention[] = [];

  // Detect component naming convention
  const componentFiles = files.filter((f) =>
    f.match(/\/(components?|screens?|pages?|views?)\/.*\.(tsx|jsx|vue)$/)
  );

  if (componentFiles.length > 0) {
    const casingPattern = detectCasingPattern(componentFiles, projectPath);
    detected.push({
      category: "naming",
      rule: "Component naming",
      pattern: casingPattern.pattern,
      confidence: casingPattern.confidence,
      occurrences: componentFiles.length,
      examples: componentFiles.slice(0, 3).map((f) => path.relative(projectPath, f)),
    });
  }

  // Detect hook/composable naming
  const hookFiles = files.filter((f) => {
    const basename = path.basename(f);
    return (
      basename.startsWith("use") &&
      (f.includes("/hooks/") || f.includes("/composables/"))
    );
  });

  if (hookFiles.length > 0) {
    detected.push({
      category: "naming",
      rule: framework === "react" || framework === "react-native" ? "Hook naming" : "Composable naming",
      pattern: "use[A-Z][a-zA-Z]+",
      confidence: 0.95,
      occurrences: hookFiles.length,
      examples: hookFiles.slice(0, 3).map((f) => path.basename(f)),
    });
  }

  // Detect import style
  const importStyle = await detectImportStyle(files.slice(0, 20));
  if (importStyle) {
    detected.push({
      category: "imports",
      rule: "Import style",
      pattern: importStyle.pattern,
      confidence: importStyle.confidence,
      occurrences: importStyle.occurrences,
      examples: importStyle.examples,
    });
  }

  // Detect quote style
  const quoteStyle = await detectQuoteStyle(files.slice(0, 20));
  if (quoteStyle) {
    detected.push({
      category: "style",
      rule: "Quote style",
      pattern: quoteStyle.pattern,
      confidence: quoteStyle.confidence,
      occurrences: quoteStyle.occurrences,
      examples: quoteStyle.examples,
    });
  }

  return detected;
}

/**
 * Detect casing pattern from file names
 */
function detectCasingPattern(
  files: string[],
  _projectPath: string
): { pattern: CasingStyle; confidence: number } {
  const basenames = files.map((f) => path.basename(f, path.extname(f)));

  let pascalCount = 0;
  let camelCount = 0;
  let kebabCount = 0;

  for (const name of basenames) {
    if (/^[A-Z][a-zA-Z0-9]*$/.test(name)) pascalCount++;
    else if (/^[a-z][a-zA-Z0-9]*$/.test(name)) camelCount++;
    else if (/^[a-z][a-z0-9-]*$/.test(name)) kebabCount++;
  }

  const total = basenames.length;
  if (pascalCount / total > 0.7) {
    return { pattern: "PascalCase", confidence: pascalCount / total };
  } else if (kebabCount / total > 0.7) {
    return { pattern: "kebab-case", confidence: kebabCount / total };
  } else if (camelCount / total > 0.7) {
    return { pattern: "camelCase", confidence: camelCount / total };
  }

  // Default to PascalCase for components
  return { pattern: "PascalCase", confidence: 0.5 };
}

/**
 * Detect import style (relative vs absolute)
 */
async function detectImportStyle(
  files: string[]
): Promise<{ pattern: string; confidence: number; occurrences: number; examples: string[] } | null> {
  let relativeCount = 0;
  let absoluteCount = 0;
  const examples: string[] = [];

  for (const file of files) {
    try {
      const content = await fs.readFile(file, "utf-8");
      const imports = content.match(/import\s+.*\s+from\s+['"](.+)['"]/g) || [];

      for (const imp of imports.slice(0, 3)) {
        const match = imp.match(/from\s+['"](.+)['"]/);
        if (match) {
          const importPath = match[1];
          if (importPath.startsWith(".")) {
            relativeCount++;
          } else if (!importPath.match(/^[a-z@]/)) {
            // Not a package
            absoluteCount++;
          }

          if (examples.length < 3) {
            examples.push(imp);
          }
        }
      }
    } catch {
      continue;
    }
  }

  const total = relativeCount + absoluteCount;
  if (total === 0) return null;

  if (relativeCount / total > 0.7) {
    return {
      pattern: "relative",
      confidence: relativeCount / total,
      occurrences: relativeCount,
      examples,
    };
  } else if (absoluteCount / total > 0.7) {
    return {
      pattern: "absolute",
      confidence: absoluteCount / total,
      occurrences: absoluteCount,
      examples,
    };
  }

  return {
    pattern: "mixed",
    confidence: 0.5,
    occurrences: total,
    examples,
  };
}

/**
 * Detect quote style (single vs double)
 */
async function detectQuoteStyle(
  files: string[]
): Promise<{ pattern: string; confidence: number; occurrences: number; examples: string[] } | null> {
  let singleCount = 0;
  let doubleCount = 0;
  const examples: string[] = [];

  for (const file of files) {
    try {
      const content = await fs.readFile(file, "utf-8");
      const lines = content.split("\n").slice(0, 50); // Sample first 50 lines

      for (const line of lines) {
        // Count string literals
        const singleMatches = line.match(/'[^']*'/g) || [];
        const doubleMatches = line.match(/"[^"]*"/g) || [];

        singleCount += singleMatches.length;
        doubleCount += doubleMatches.length;

        if (examples.length < 3 && (singleMatches.length > 0 || doubleMatches.length > 0)) {
          examples.push(line.trim().substring(0, 60));
        }
      }
    } catch {
      continue;
    }
  }

  const total = singleCount + doubleCount;
  if (total === 0) return null;

  if (singleCount / total > 0.7) {
    return {
      pattern: "single",
      confidence: singleCount / total,
      occurrences: singleCount,
      examples,
    };
  } else if (doubleCount / total > 0.7) {
    return {
      pattern: "double",
      confidence: doubleCount / total,
      occurrences: doubleCount,
      examples,
    };
  }

  return {
    pattern: "mixed",
    confidence: 0.5,
    occurrences: total,
    examples,
  };
}

/**
 * Convert detected conventions to ProjectConventions
 */
function convertDetectedToConventions(
  detected: DetectedConvention[],
  framework: FrameworkType
): ProjectConventions {
  const conventions: ProjectConventions = {
    naming: {},
    imports: {},
    style: {},
  };

  for (const d of detected) {
    if (d.category === "naming") {
      if (d.rule === "Component naming") {
        conventions.naming!.components = {
          pattern: d.pattern,
          description: `Components should use ${d.pattern}`,
          examples: d.examples,
        };
      } else if (d.rule.includes("Hook")) {
        conventions.naming!.hooks = {
          pattern: "use[A-Z][a-zA-Z]+",
          description: "Hooks should start with 'use' followed by PascalCase name",
          examples: d.examples,
        };
      } else if (d.rule.includes("Composable")) {
        conventions.naming!.composables = {
          pattern: "use[A-Z][a-zA-Z]+",
          description: "Composables should start with 'use' followed by PascalCase name",
          examples: d.examples,
        };
      }
    } else if (d.category === "imports") {
      conventions.imports!.style = d.pattern as any;
    } else if (d.category === "style") {
      if (d.rule === "Quote style") {
        conventions.style!.quotes = d.pattern as any;
      }
    }
  }

  // Add framework-specific defaults
  if (framework === "react" || framework === "react-native") {
    if (!conventions.naming!.hooks) {
      conventions.naming!.hooks = {
        pattern: "use[A-Z][a-zA-Z]+",
        description: "Hooks should start with 'use' followed by PascalCase name",
      };
    }
  }

  if (framework === "vue3" || framework === "nuxt3") {
    if (!conventions.naming!.composables) {
      conventions.naming!.composables = {
        pattern: "use[A-Z][a-zA-Z]+",
        description: "Composables should start with 'use' followed by PascalCase name",
      };
    }
  }

  return conventions;
}

/**
 * Get default conventions for a framework
 */
function getDefaultConventions(framework: FrameworkType): ProjectConventions {
  const baseConventions: ProjectConventions = {
    naming: {
      components: {
        pattern: "PascalCase",
        description: "Components should use PascalCase",
      },
      utilities: {
        pattern: "camelCase",
        description: "Utility functions should use camelCase",
      },
      constants: {
        pattern: "SCREAMING_SNAKE_CASE",
        description: "Constants should use SCREAMING_SNAKE_CASE",
      },
      types: {
        pattern: "PascalCase",
        description: "Types and interfaces should use PascalCase",
      },
    },
    imports: {
      grouping: true,
      order: ["external", "internal", "relative"],
    },
    style: {
      quotes: "single",
      semicolons: true,
    },
  };

  if (framework === "react" || framework === "react-native") {
    baseConventions.naming!.hooks = {
      pattern: "use[A-Z][a-zA-Z]+",
      description: "Hooks should start with 'use' followed by PascalCase name",
    };
  }

  if (framework === "vue3" || framework === "nuxt3") {
    baseConventions.naming!.composables = {
      pattern: "use[A-Z][a-zA-Z]+",
      description: "Composables should start with 'use' followed by PascalCase name",
    };
  }

  return baseConventions;
}

/**
 * Validate a single file against conventions
 */
async function validateFile(
  file: string,
  projectPath: string,
  conventions: ProjectConventions,
  framework: FrameworkType
): Promise<ConventionViolation[]> {
  const violations: ConventionViolation[] = [];
  const relPath = path.relative(projectPath, file);
  const basename = path.basename(file, path.extname(file));

  // Validate naming conventions
  if (conventions.naming) {
    // Component naming
    if (
      conventions.naming.components &&
      file.match(/\/(components?|screens?|pages?|views?)\/.*\.(tsx|jsx|vue)$/)
    ) {
      const violation = validateNaming(
        basename,
        conventions.naming.components,
        relPath,
        "Component naming"
      );
      if (violation) violations.push(violation);
    }

    // Hook naming
    if (
      conventions.naming.hooks &&
      (file.includes("/hooks/") || file.includes("/composables/")) &&
      (framework === "react" || framework === "react-native")
    ) {
      const violation = validateNaming(
        basename,
        conventions.naming.hooks,
        relPath,
        "Hook naming"
      );
      if (violation) violations.push(violation);
    }

    // Composable naming
    if (
      conventions.naming.composables &&
      file.includes("/composables/") &&
      (framework === "vue3" || framework === "nuxt3")
    ) {
      const violation = validateNaming(
        basename,
        conventions.naming.composables,
        relPath,
        "Composable naming"
      );
      if (violation) violations.push(violation);
    }
  }

  // Validate file content
  try {
    const content = await fs.readFile(file, "utf-8");

    // Validate imports
    if (conventions.imports) {
      const importViolations = await validateImports(
        content,
        relPath,
        conventions.imports
      );
      violations.push(...importViolations);
    }

    // Validate style
    if (conventions.style) {
      const styleViolations = validateStyle(content, relPath, conventions.style);
      violations.push(...styleViolations);
    }
  } catch (error) {
    // Skip files that can't be read
  }

  return violations;
}

/**
 * Validate naming against convention
 */
function validateNaming(
  name: string,
  convention: NamingConvention,
  file: string,
  ruleName: string
): ConventionViolation | null {
  // Check if pattern is a special keyword
  if (convention.pattern === "PascalCase") {
    if (!/^[A-Z][a-zA-Z0-9]*$/.test(name)) {
      return {
        file,
        category: "naming",
        severity: "warning",
        rule: ruleName,
        message: `File name should use PascalCase`,
        expected: "PascalCase (e.g., MyComponent)",
        actual: name,
        autoFixable: true,
        autoFix: {
          type: "rename",
          description: `Rename to ${toPascalCase(name)}`,
          currentValue: name,
          newValue: toPascalCase(name),
          safe: true,
          preview: `${name} → ${toPascalCase(name)}`,
        },
      };
    }
  } else if (convention.pattern === "camelCase") {
    if (!/^[a-z][a-zA-Z0-9]*$/.test(name)) {
      return {
        file,
        category: "naming",
        severity: "warning",
        rule: ruleName,
        message: `File name should use camelCase`,
        expected: "camelCase (e.g., myUtility)",
        actual: name,
        autoFixable: true,
        autoFix: {
          type: "rename",
          description: `Rename to ${toCamelCase(name)}`,
          currentValue: name,
          newValue: toCamelCase(name),
          safe: true,
        },
      };
    }
  } else if (convention.pattern === "kebab-case") {
    if (!/^[a-z][a-z0-9-]*$/.test(name)) {
      return {
        file,
        category: "naming",
        severity: "warning",
        rule: ruleName,
        message: `File name should use kebab-case`,
        expected: "kebab-case (e.g., my-component)",
        actual: name,
        autoFixable: true,
        autoFix: {
          type: "rename",
          description: `Rename to ${toKebabCase(name)}`,
          currentValue: name,
          newValue: toKebabCase(name),
          safe: true,
        },
      };
    }
  } else {
    // Regex pattern
    const regex = new RegExp(convention.pattern);
    if (!regex.test(name)) {
      return {
        file,
        category: "naming",
        severity: "warning",
        rule: ruleName,
        message: convention.description || `File name should match pattern ${convention.pattern}`,
        expected: convention.pattern,
        actual: name,
        autoFixable: false,
      };
    }
  }

  return null;
}

/**
 * Validate imports
 */
async function validateImports(
  content: string,
  file: string,
  importConvention: any
): Promise<ConventionViolation[]> {
  const violations: ConventionViolation[] = [];
  const lines = content.split("\n");

  let importStartLine = -1;
  let lastImportLine = -1;

  // Find import block
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.match(/^import\s+/)) {
      if (importStartLine === -1) importStartLine = i;
      lastImportLine = i;
    }
  }

  if (importStartLine === -1) return violations;

  // Check import grouping
  if (importConvention.grouping) {
    const imports = lines.slice(importStartLine, lastImportLine + 1);
    let hasGrouping = false;

    for (let i = 0; i < imports.length - 1; i++) {
      if (imports[i].trim() === "" && imports[i + 1].match(/^import\s+/)) {
        hasGrouping = true;
        break;
      }
    }

    if (!hasGrouping && imports.length > 3) {
      violations.push({
        file,
        line: importStartLine + 1,
        category: "imports",
        severity: "info",
        rule: "Import grouping",
        message: "Imports should be grouped by type (external, internal, relative)",
        autoFixable: true,
        autoFix: {
          type: "reorder",
          description: "Group imports by type with blank lines",
          safe: true,
        },
      });
    }
  }

  // Check import style
  if (importConvention.style && importConvention.style !== "mixed") {
    const imports = lines.slice(importStartLine, lastImportLine + 1);

    for (let i = 0; i < imports.length; i++) {
      const match = imports[i].match(/from\s+['"](.+)['"]/);
      if (match) {
        const importPath = match[1];
        const isRelative = importPath.startsWith(".");

        if (importConvention.style === "relative" && !isRelative && !importPath.match(/^[a-z@]/)) {
          violations.push({
            file,
            line: importStartLine + i + 1,
            category: "imports",
            severity: "info",
            rule: "Import style",
            message: "Project uses relative imports",
            expected: "relative import",
            actual: importPath,
            autoFixable: false,
          });
        } else if (importConvention.style === "absolute" && isRelative) {
          violations.push({
            file,
            line: importStartLine + i + 1,
            category: "imports",
            severity: "info",
            rule: "Import style",
            message: "Project uses absolute imports",
            expected: "absolute import",
            actual: importPath,
            autoFixable: false,
          });
        }
      }
    }
  }

  return violations;
}

/**
 * Validate style conventions
 */
function validateStyle(
  content: string,
  file: string,
  styleConvention: any
): ConventionViolation[] {
  const violations: ConventionViolation[] = [];
  const lines = content.split("\n");

  // Check quotes
  if (styleConvention.quotes && styleConvention.quotes !== "mixed") {
    for (let i = 0; i < Math.min(lines.length, 100); i++) {
      const line = lines[i];

      if (styleConvention.quotes === "single") {
        // Check for double quotes (excluding JSX)
        if (line.includes('"') && !line.includes("<") && !line.includes('="')) {
          violations.push({
            file,
            line: i + 1,
            category: "style",
            severity: "info",
            rule: "Quote style",
            message: "Project uses single quotes",
            expected: "single quotes (')",
            actual: "double quotes (\")",
            autoFixable: true,
            autoFix: {
              type: "replace",
              description: 'Replace double quotes with single quotes',
              safe: true,
            },
          });
          break; // Report once per file
        }
      } else if (styleConvention.quotes === "double") {
        if (line.includes("'") && !line.match(/\/\/|\/\*/)) {
          violations.push({
            file,
            line: i + 1,
            category: "style",
            severity: "info",
            rule: "Quote style",
            message: "Project uses double quotes",
            expected: 'double quotes (")',
            actual: "single quotes (')",
            autoFixable: true,
            autoFix: {
              type: "replace",
              description: "Replace single quotes with double quotes",
              safe: true,
            },
          });
          break;
        }
      }
    }
  }

  return violations;
}

/**
 * Calculate consistency score
 */
function calculateConsistencyScore(
  violations: ConventionViolation[],
  _totalFiles: number
): ConsistencyScore {
  const byCategory: Record<ConventionCategory, number> = {
    naming: 100,
    structure: 100,
    imports: 100,
    exports: 100,
    style: 100,
    "framework-specific": 100,
  };

  // Reduce score based on violations
  for (const v of violations) {
    const impact = v.severity === "error" ? 10 : v.severity === "warning" ? 5 : 2;
    byCategory[v.category] = Math.max(0, byCategory[v.category] - impact);
  }

  const overall = Math.round(
    Object.values(byCategory).reduce((sum, score) => sum + score, 0) / 6
  );

  const strengths: string[] = [];
  const weaknesses: string[] = [];

  for (const [category, score] of Object.entries(byCategory)) {
    if (score >= 90) {
      strengths.push(`${category}: ${score}% consistent`);
    } else if (score < 70) {
      weaknesses.push(`${category}: ${score}% consistent`);
    }
  }

  return {
    overall,
    byCategory,
    strengths,
    weaknesses,
  };
}

/**
 * Generate auto-fix suggestions
 */
function generateAutoFixSuggestions(
  violations: ConventionViolation[]
): AutoFixSuggestion[] {
  const suggestions: AutoFixSuggestion[] = [];
  const grouped = new Map<string, ConventionViolation[]>();

  // Group violations by category + rule
  for (const v of violations) {
    if (!v.autoFixable || !v.autoFix) continue;

    const key = `${v.category}:${v.rule}`;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(v);
  }

  // Create suggestions for each group
  for (const [key, vios] of grouped.entries()) {
    const [category, rule] = key.split(":");

    suggestions.push({
      category: category as ConventionCategory,
      severity: vios[0].severity,
      affectedFiles: vios.map((v) => v.file),
      description: `Fix ${rule} violations in ${vios.length} file(s)`,
      fixes: vios.map((v) => v.autoFix!),
      estimatedImpact: vios.length > 10 ? "high" : vios.length > 5 ? "medium" : "low",
      safe: vios.every((v) => v.autoFix?.safe),
    });
  }

  return suggestions;
}

/**
 * Apply safe auto-fixes
 */
async function applySafeAutoFixes(
  suggestions: AutoFixSuggestion[],
  _projectPath: string
): Promise<void> {
  for (const suggestion of suggestions) {
    if (!suggestion.safe) continue;

    for (const fix of suggestion.fixes) {
      if (fix.type === "rename" && fix.currentValue && fix.newValue) {
        // Rename would require filesystem operations
        // For now, just log what would be done
        console.log(`Would rename: ${fix.currentValue} → ${fix.newValue}`);
      }
    }
  }
}

/**
 * Count violations by category
 */
function countByCategory(violations: ConventionViolation[]): Record<ConventionCategory, number> {
  const counts: Record<ConventionCategory, number> = {
    naming: 0,
    structure: 0,
    imports: 0,
    exports: 0,
    style: 0,
    "framework-specific": 0,
  };

  for (const v of violations) {
    counts[v.category]++;
  }

  return counts;
}

/**
 * Count violations by severity
 */
function countBySeverity(violations: ConventionViolation[]): Record<ViolationSeverity, number> {
  const counts: Record<ViolationSeverity, number> = {
    error: 0,
    warning: 0,
    info: 0,
  };

  for (const v of violations) {
    counts[v.severity]++;
  }

  return counts;
}

/**
 * Generate recommendations
 */
function generateRecommendations(
  violations: ConventionViolation[],
  consistency: ConsistencyScore,
  framework: FrameworkType
): string[] {
  const recommendations: string[] = [];

  if (consistency.overall >= 90) {
    recommendations.push(
      `✅ Excellent code consistency (${consistency.overall}%)! The project follows conventions well.`
    );
  } else if (consistency.overall >= 70) {
    recommendations.push(
      `Good consistency (${consistency.overall}%), but there's room for improvement.`
    );
  } else {
    recommendations.push(
      `⚠️ Consistency score is ${consistency.overall}%. Consider establishing clearer conventions.`
    );
  }

  // Category-specific recommendations
  const namingViolations = violations.filter((v) => v.category === "naming");
  if (namingViolations.length > 5) {
    recommendations.push(
      `Found ${namingViolations.length} naming inconsistencies. Consider using a consistent casing style for components.`
    );
  }

  const importViolations = violations.filter((v) => v.category === "imports");
  if (importViolations.length > 5) {
    recommendations.push(
      `Found ${importViolations.length} import style inconsistencies. Use a tool like ESLint to enforce import ordering.`
    );
  }

  const styleViolations = violations.filter((v) => v.category === "style");
  if (styleViolations.length > 10) {
    recommendations.push(
      `Found ${styleViolations.length} style inconsistencies. Use Prettier to enforce consistent formatting.`
    );
  }

  // Framework-specific
  if (framework === "nuxt3" || framework === "vue3") {
    const composableViolations = violations.filter((v) => v.rule.includes("Composable"));
    if (composableViolations.length > 0) {
      recommendations.push(
        `Vue composables should start with 'use' prefix (e.g., useAuth, useUser).`
      );
    }
  }

  if (framework === "react" || framework === "react-native") {
    const hookViolations = violations.filter((v) => v.rule.includes("Hook"));
    if (hookViolations.length > 0) {
      recommendations.push(
        `React hooks should start with 'use' prefix (e.g., useAuth, useState).`
      );
    }
  }

  // Auto-fix recommendations
  const autoFixableCount = violations.filter((v) => v.autoFixable).length;
  if (autoFixableCount > 0) {
    recommendations.push(
      `${autoFixableCount} violations can be auto-fixed. Run with applyAutoFixes: true to fix them.`
    );
  }

  return recommendations;
}

// Helper functions for case conversion
function toPascalCase(str: string): string {
  return str
    .replace(/[-_\s](.)/g, (_, c) => c.toUpperCase())
    .replace(/^(.)/, (c) => c.toUpperCase());
}

function toCamelCase(str: string): string {
  return str
    .replace(/[-_\s](.)/g, (_, c) => c.toUpperCase())
    .replace(/^(.)/, (c) => c.toLowerCase());
}

function toKebabCase(str: string): string {
  return str
    .replace(/([A-Z])/g, "-$1")
    .toLowerCase()
    .replace(/^-/, "");
}
