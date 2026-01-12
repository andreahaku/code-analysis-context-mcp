/**
 * Security Analyzer Tool
 *
 * Performs comprehensive security vulnerability analysis with OWASP mapping,
 * framework-aware detection, and positive security pattern recognition.
 *
 * Supports: React, React Native, Expo, Vue 3, Nuxt 3, Fastify, Node.js
 */

import * as path from "path";
import * as fs from "fs/promises";
import fg from "fast-glob";
import { FrameworkDetector } from "../utils/framework-detector.js";
import { ASTParser } from "../services/ast-parser.js";
import type {
  SecurityAnalysisParams,
  SecurityAnalysisResult,
  SecurityVulnerability,
  PositiveSecurityPractice,
  SecuritySeveritySummary,
  SecurityCategorySummary,
  SecurityMetrics,
  SecurityRecommendation,
  SecurityDetectionContext,
  SecuritySeverity,
  SecurityCategory,
} from "../types/index.js";

// Import detectors
import { detectInjectionVulnerabilities } from "../security/injection-detector.js";
import { detectCryptoVulnerabilities } from "../security/crypto-detector.js";
import { detectAccessControlVulnerabilities } from "../security/access-control-detector.js";
import { detectMisconfigurationVulnerabilities } from "../security/misconfiguration-detector.js";
import { detectMobileVulnerabilities } from "../security/mobile-detector.js";
import { detectVueNuxtVulnerabilities } from "../security/vue-nuxt-detector.js";
import { detectFastifyVulnerabilities } from "../security/fastify-detector.js";
import { detectReactVulnerabilities } from "../security/react-detector.js";
import { detectPositivePatterns } from "../security/positive-detector.js";
import {
  detectDependencyVulnerabilities,
  type DependencyScanResult,
} from "../security/dependency-detector/index.js";

// MCP Response size limit (25k tokens ≈ 100k chars, use 18k safe threshold)
const MCP_SAFE_TOKEN_LIMIT = 18000;
const CHARS_PER_TOKEN = 4;

/**
 * Main security analysis function
 */
export async function analyzeSecurityVulnerabilities(
  params: SecurityAnalysisParams
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const projectPath = params.projectPath || process.cwd();
  const includePositive = params.includePositive ?? true;
  const generateReport = params.generateReport ?? false;
  const severityFilter = params.severity;
  const categoryFilter = params.categories;
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 50;

  try {
    // Detect framework
    const { framework } = await FrameworkDetector.detect(projectPath);
    const effectiveFramework = params.framework || framework;

    // Get appropriate globs
    const includeGlobs = params.includeGlobs || FrameworkDetector.getDefaultIncludeGlobs(effectiveFramework);
    const excludeGlobs = params.excludeGlobs || FrameworkDetector.getDefaultExcludeGlobs(effectiveFramework);

    // Find files
    const files = await fg(includeGlobs, {
      cwd: projectPath,
      ignore: excludeGlobs,
      absolute: true,
    });

    // Parse all files and create detection contexts
    const contexts: SecurityDetectionContext[] = [];
    let totalLines = 0;
    let totalComplexity = 0;

    for (const file of files) {
      try {
        const content = await fs.readFile(file, "utf-8");
        const lineCount = content.split("\n").length;
        totalLines += lineCount;

        const ast = await ASTParser.parseFile(file);
        const imports = ASTParser.extractImports(ast);
        const exports = ASTParser.extractExports(ast);
        const complexity = ASTParser.calculateComplexity(ast);
        totalComplexity += complexity;

        contexts.push({
          filePath: file,
          relativePath: path.relative(projectPath, file),
          content,
          ast,
          framework: effectiveFramework,
          imports,
          exports,
          complexity,
        });
      } catch (error) {
        // Skip files that can't be parsed
        continue;
      }
    }

    // Run all detectors in parallel
    const allVulnerabilities: SecurityVulnerability[] = [];
    const allPositivePatterns: PositiveSecurityPractice[] = [];

    // Run dependency vulnerability scan (scans package.json, not individual files)
    // Only run if 'dependencies' category is not filtered out
    const shouldScanDeps = !categoryFilter || categoryFilter.length === 0 || categoryFilter.includes("dependencies");
    let dependencyScanResult: DependencyScanResult | undefined;

    if (shouldScanDeps) {
      try {
        dependencyScanResult = await detectDependencyVulnerabilities(projectPath, effectiveFramework);
        allVulnerabilities.push(...dependencyScanResult.vulnerabilities);
        allPositivePatterns.push(...dependencyScanResult.positivePatterns);
      } catch {
        // Dependency scan failed silently - continue with other detectors
        // This can happen if OSV API is unavailable or network issues occur
      }
    }

    for (const ctx of contexts) {
      // Run framework-agnostic detectors
      const [injection, crypto, accessControl, misconfiguration] = await Promise.all([
        detectInjectionVulnerabilities(ctx),
        detectCryptoVulnerabilities(ctx),
        detectAccessControlVulnerabilities(ctx),
        detectMisconfigurationVulnerabilities(ctx),
      ]);

      allVulnerabilities.push(...injection.vulnerabilities);
      allVulnerabilities.push(...crypto.vulnerabilities);
      allVulnerabilities.push(...accessControl.vulnerabilities);
      allVulnerabilities.push(...misconfiguration.vulnerabilities);

      allPositivePatterns.push(...injection.positivePatterns);
      allPositivePatterns.push(...crypto.positivePatterns);
      allPositivePatterns.push(...accessControl.positivePatterns);
      allPositivePatterns.push(...misconfiguration.positivePatterns);

      // Run framework-specific detectors
      if (effectiveFramework === "react-native" || effectiveFramework === "expo") {
        const mobile = await detectMobileVulnerabilities(ctx);
        allVulnerabilities.push(...mobile.vulnerabilities);
        allPositivePatterns.push(...mobile.positivePatterns);
      }

      if (effectiveFramework === "react" || effectiveFramework === "node") {
        // React detector also checks for React code in Node projects
        const react = await detectReactVulnerabilities(ctx);
        allVulnerabilities.push(...react.vulnerabilities);
        allPositivePatterns.push(...react.positivePatterns);
      }

      if (effectiveFramework === "vue3" || effectiveFramework === "nuxt3") {
        const vueNuxt = await detectVueNuxtVulnerabilities(ctx);
        allVulnerabilities.push(...vueNuxt.vulnerabilities);
        allPositivePatterns.push(...vueNuxt.positivePatterns);
      }

      if (effectiveFramework === "fastify" || effectiveFramework === "node") {
        const fastify = await detectFastifyVulnerabilities(ctx);
        allVulnerabilities.push(...fastify.vulnerabilities);
        allPositivePatterns.push(...fastify.positivePatterns);
      }

      // Run positive pattern detector for all frameworks
      if (includePositive) {
        const positive = await detectPositivePatterns(ctx);
        allPositivePatterns.push(...positive.positivePatterns);
      }
    }

    // Deduplicate vulnerabilities by location
    const seenVulns = new Set<string>();
    const uniqueVulnerabilities = allVulnerabilities.filter((v) => {
      const key = `${v.location.file}:${v.location.line}:${v.title}`;
      if (seenVulns.has(key)) return false;
      seenVulns.add(key);
      return true;
    });

    // Deduplicate positive patterns by title and file
    const seenPositive = new Set<string>();
    const uniquePositivePatterns = allPositivePatterns.filter((p) => {
      const key = `${p.location.file}:${p.title}`;
      if (seenPositive.has(key)) return false;
      seenPositive.add(key);
      return true;
    });

    // Apply severity filter
    let filteredVulnerabilities = uniqueVulnerabilities;
    if (severityFilter && severityFilter.length > 0) {
      filteredVulnerabilities = filteredVulnerabilities.filter((v) =>
        severityFilter.includes(v.severity)
      );
    }

    // Apply category filter
    if (categoryFilter && categoryFilter.length > 0) {
      filteredVulnerabilities = filteredVulnerabilities.filter((v) =>
        categoryFilter.includes(v.category as SecurityCategory)
      );
    }

    // Sort vulnerabilities by severity
    const severityOrder: Record<SecuritySeverity, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
      info: 4,
    };
    filteredVulnerabilities.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    // Calculate summaries
    const severitySummary: SecuritySeveritySummary = {
      critical: filteredVulnerabilities.filter((v) => v.severity === "critical").length,
      high: filteredVulnerabilities.filter((v) => v.severity === "high").length,
      medium: filteredVulnerabilities.filter((v) => v.severity === "medium").length,
      low: filteredVulnerabilities.filter((v) => v.severity === "low").length,
      info: filteredVulnerabilities.filter((v) => v.severity === "info").length,
      total: filteredVulnerabilities.length,
    };

    const categorySummary: SecurityCategorySummary = {
      injection: filteredVulnerabilities.filter((v) => v.category === "injection").length,
      crypto: filteredVulnerabilities.filter((v) => v.category === "crypto" || v.category === "cryptographic_failures" as any).length,
      access_control: filteredVulnerabilities.filter((v) => v.category === "access_control").length,
      misconfiguration: filteredVulnerabilities.filter((v) => v.category === "misconfiguration" || v.category === "security_misconfiguration" as any).length,
      mobile: filteredVulnerabilities.filter((v) => v.category === "mobile").length,
      vue_nuxt: filteredVulnerabilities.filter((v) => v.category === "vue_nuxt").length,
      fastify_backend: filteredVulnerabilities.filter((v) => v.category === "fastify_backend" || v.category === "input_validation" as any).length,
      data_exposure: filteredVulnerabilities.filter((v) => v.category === "data_exposure").length,
      dependencies: filteredVulnerabilities.filter((v) => v.category === "dependencies").length,
    };

    const statusSummary = {
      needs_fix: filteredVulnerabilities.filter((v) => v.status === "needs_fix").length,
      review: filteredVulnerabilities.filter((v) => v.status === "review").length,
      acceptable: filteredVulnerabilities.filter((v) => v.status === "acceptable").length,
    };

    // Calculate security score (0-100)
    const securityScore = calculateSecurityScore(severitySummary, uniquePositivePatterns.length, contexts.length);
    const riskLevel = getRiskLevel(securityScore);

    // Calculate metrics
    const metrics: SecurityMetrics = {
      filesAnalyzed: contexts.length,
      linesAnalyzed: totalLines,
      securityRelatedFiles: contexts.filter((c) => isSecurityRelatedFile(c.relativePath)).length,
      averageComplexity: contexts.length > 0 ? totalComplexity / contexts.length : 0,
      highComplexityFiles: contexts.filter((c) => c.complexity > 20).length,
      securityScore,
      riskLevel,
      totalPatterns: uniquePositivePatterns.length,
      antiPatterns: filteredVulnerabilities.length,
    };

    // Generate recommendations
    const recommendations = generateRecommendations(filteredVulnerabilities, severitySummary);

    // Apply pagination
    const totalItems = filteredVulnerabilities.length;
    const totalPages = Math.ceil(totalItems / pageSize);
    const startIndex = (page - 1) * pageSize;
    const paginatedVulnerabilities = filteredVulnerabilities.slice(startIndex, startIndex + pageSize);

    // Build result
    const result: SecurityAnalysisResult = {
      projectPath,
      framework: effectiveFramework,
      analyzedAt: new Date().toISOString(),
      severitySummary,
      categorySummary,
      statusSummary,
      vulnerabilities: paginatedVulnerabilities,
      positivePatterns: includePositive ? uniquePositivePatterns : [],
      metrics,
      recommendations,
      _pagination: {
        currentPage: page,
        pageSize,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
      },
    };

    // Generate markdown report if requested
    if (generateReport) {
      result.markdownReport = generateMarkdownReport(result);
    }

    // Apply MCP response optimization
    const mcpOptimizations: string[] = [];
    let responseText = JSON.stringify(result, null, 2);
    let estimatedTokens = Math.ceil(responseText.length / CHARS_PER_TOKEN);

    // Progressive optimization stages
    if (estimatedTokens > MCP_SAFE_TOKEN_LIMIT) {
      // Stage 1: Remove markdown report
      if (result.markdownReport) {
        result.markdownReport = "[Report truncated - use generateReport separately for full report]";
        mcpOptimizations.push("Truncated markdown report");
        responseText = JSON.stringify(result, null, 2);
        estimatedTokens = Math.ceil(responseText.length / CHARS_PER_TOKEN);
      }
    }

    if (estimatedTokens > MCP_SAFE_TOKEN_LIMIT) {
      // Stage 2: Truncate code snippets
      result.vulnerabilities = result.vulnerabilities.map((v) => ({
        ...v,
        location: {
          ...v.location,
          codeSnippet: v.location.codeSnippet?.substring(0, 100),
        },
      }));
      mcpOptimizations.push("Truncated code snippets to 100 chars");
      responseText = JSON.stringify(result, null, 2);
      estimatedTokens = Math.ceil(responseText.length / CHARS_PER_TOKEN);
    }

    if (estimatedTokens > MCP_SAFE_TOKEN_LIMIT) {
      // Stage 3: Reduce vulnerabilities to top 30
      result.vulnerabilities = result.vulnerabilities.slice(0, 30);
      mcpOptimizations.push("Limited vulnerabilities to top 30");
      responseText = JSON.stringify(result, null, 2);
      estimatedTokens = Math.ceil(responseText.length / CHARS_PER_TOKEN);
    }

    if (estimatedTokens > MCP_SAFE_TOKEN_LIMIT) {
      // Stage 4: Reduce positive patterns
      result.positivePatterns = result.positivePatterns.slice(0, 15);
      mcpOptimizations.push("Limited positive patterns to 15");
      responseText = JSON.stringify(result, null, 2);
      estimatedTokens = Math.ceil(responseText.length / CHARS_PER_TOKEN);
    }

    if (estimatedTokens > MCP_SAFE_TOKEN_LIMIT) {
      // Stage 5: Remove remediation details
      result.vulnerabilities = result.vulnerabilities.map((v) => ({
        ...v,
        remediation: v.remediation.substring(0, 80) + "...",
        risk: v.risk.substring(0, 80) + "...",
      }));
      mcpOptimizations.push("Truncated remediation and risk text");
      responseText = JSON.stringify(result, null, 2);
      estimatedTokens = Math.ceil(responseText.length / CHARS_PER_TOKEN);
    }

    if (estimatedTokens > MCP_SAFE_TOKEN_LIMIT) {
      // Stage 6: Emergency - minimal response
      result.vulnerabilities = result.vulnerabilities.slice(0, 10).map((v) => ({
        id: v.id,
        title: v.title,
        severity: v.severity,
        category: v.category,
        owasp: v.owasp,
        status: v.status,
        location: { file: v.location.file, line: v.location.line },
        risk: v.risk.substring(0, 50),
        remediation: v.remediation.substring(0, 50),
        confidence: v.confidence,
        autoFixable: v.autoFixable,
        description: v.description.substring(0, 50),
      })) as any;
      result.positivePatterns = [];
      mcpOptimizations.push("Emergency reduction - minimal vulnerability details");
    }

    // Add optimization metadata
    if (mcpOptimizations.length > 0) {
      result.metadata = {
        responseOptimized: true,
        mcpOptimizations,
        tokenEstimate: estimatedTokens,
      };

      // Add notification to recommendations
      result.recommendations.unshift({
        priority: "low",
        title: "Response Optimized",
        description: `Response was optimized to fit MCP token limits: ${mcpOptimizations.join(", ")}. Use pagination (page/pageSize) or filters (severity/categories) for full details.`,
        effort: "low",
        impact: "low",
        affectedFiles: [],
        relatedFindings: [],
      });
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: errorMessage }, null, 2),
        },
      ],
    };
  }
}

/**
 * Calculate security score based on findings
 */
function calculateSecurityScore(
  severity: SecuritySeveritySummary,
  positiveCount: number,
  fileCount: number
): number {
  // Start with 100, deduct based on vulnerabilities
  let score = 100;

  // Critical vulnerabilities have major impact
  score -= severity.critical * 15;
  // High vulnerabilities
  score -= severity.high * 8;
  // Medium vulnerabilities
  score -= severity.medium * 4;
  // Low vulnerabilities
  score -= severity.low * 1;

  // Bonus for positive patterns (up to +10 points)
  const positiveBonus = Math.min(10, positiveCount * 2);
  score += positiveBonus;

  // Normalize based on project size (larger projects get slight boost)
  if (fileCount > 100) {
    score += 5;
  }

  // Clamp to 0-100
  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Get risk level from security score
 */
function getRiskLevel(score: number): "critical" | "high" | "moderate" | "low" | "minimal" {
  if (score < 20) return "critical";
  if (score < 40) return "high";
  if (score < 60) return "moderate";
  if (score < 80) return "low";
  return "minimal";
}

/**
 * Check if file is security-related
 */
function isSecurityRelatedFile(relativePath: string): boolean {
  const securityPatterns = [
    /auth/i,
    /login/i,
    /security/i,
    /crypto/i,
    /session/i,
    /permission/i,
    /cors/i,
    /token/i,
    /password/i,
    /credential/i,
  ];
  return securityPatterns.some((p) => p.test(relativePath));
}

/**
 * Generate prioritized recommendations
 */
function generateRecommendations(
  vulnerabilities: SecurityVulnerability[],
  severity: SecuritySeveritySummary
): SecurityRecommendation[] {
  const recommendations: SecurityRecommendation[] = [];

  // Critical issues need immediate attention
  if (severity.critical > 0) {
    const criticalVulns = vulnerabilities.filter((v) => v.severity === "critical");
    const affectedFiles = [...new Set(criticalVulns.map((v) => v.location.file))];

    recommendations.push({
      priority: "immediate",
      title: "Address Critical Security Vulnerabilities",
      description: `${severity.critical} critical vulnerability(s) found including: ${criticalVulns
        .slice(0, 3)
        .map((v) => v.title)
        .join(", ")}. These pose immediate security risks.`,
      effort: "medium",
      impact: "high",
      affectedFiles,
      relatedFindings: criticalVulns.map((v) => v.id),
    });
  }

  // High severity issues
  if (severity.high > 0) {
    const highVulns = vulnerabilities.filter((v) => v.severity === "high");
    const affectedFiles = [...new Set(highVulns.map((v) => v.location.file))];

    recommendations.push({
      priority: "high",
      title: "Fix High-Severity Issues",
      description: `${severity.high} high-severity issue(s) found. These should be addressed in the next sprint.`,
      effort: "medium",
      impact: "high",
      affectedFiles: affectedFiles.slice(0, 10),
      relatedFindings: highVulns.slice(0, 10).map((v) => v.id),
    });
  }

  // Hardcoded secrets specifically
  const secretVulns = vulnerabilities.filter(
    (v) => v.title.toLowerCase().includes("hardcoded") || v.title.toLowerCase().includes("secret")
  );
  if (secretVulns.length > 0) {
    recommendations.push({
      priority: "immediate",
      title: "Remove Hardcoded Secrets",
      description: `${secretVulns.length} hardcoded secret(s) found. Move all secrets to environment variables immediately.`,
      effort: "low",
      impact: "high",
      affectedFiles: [...new Set(secretVulns.map((v) => v.location.file))],
      relatedFindings: secretVulns.map((v) => v.id),
    });
  }

  // Injection vulnerabilities
  const injectionVulns = vulnerabilities.filter((v) => v.category === "injection");
  if (injectionVulns.length > 0) {
    recommendations.push({
      priority: "high",
      title: "Address Injection Vulnerabilities",
      description: `${injectionVulns.length} potential injection point(s) found. Implement parameterized queries and proper input sanitization.`,
      effort: "medium",
      impact: "high",
      affectedFiles: [...new Set(injectionVulns.map((v) => v.location.file))],
      relatedFindings: injectionVulns.map((v) => v.id),
    });
  }

  // Access control issues
  const accessVulns = vulnerabilities.filter((v) => v.category === "access_control");
  if (accessVulns.length > 0) {
    recommendations.push({
      priority: "high",
      title: "Review Access Control Implementation",
      description: `${accessVulns.length} access control issue(s) found. Verify authentication and authorization on all sensitive routes.`,
      effort: "medium",
      impact: "high",
      affectedFiles: [...new Set(accessVulns.map((v) => v.location.file))],
      relatedFindings: accessVulns.map((v) => v.id),
    });
  }

  // Medium severity batch
  if (severity.medium > 5) {
    recommendations.push({
      priority: "medium",
      title: "Address Medium-Severity Issues",
      description: `${severity.medium} medium-severity issues found. Consider addressing these in upcoming maintenance work.`,
      effort: "medium",
      impact: "medium",
      affectedFiles: [],
      relatedFindings: vulnerabilities
        .filter((v) => v.severity === "medium")
        .slice(0, 10)
        .map((v) => v.id),
    });
  }

  // General improvement recommendations
  if (severity.total > 0) {
    recommendations.push({
      priority: "medium",
      title: "Implement Security Review Process",
      description: "Consider adding security-focused code review checklist and automated security scanning to CI/CD pipeline.",
      effort: "medium",
      impact: "high",
      affectedFiles: [],
      relatedFindings: [],
    });
  }

  // Sort by priority
  const priorityOrder = { immediate: 0, high: 1, medium: 2, low: 3 };
  recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return recommendations;
}

/**
 * Generate markdown report
 */
function generateMarkdownReport(result: SecurityAnalysisResult): string {
  const lines: string[] = [];

  lines.push("# Security Analysis Report");
  lines.push("");
  lines.push(`**Project:** ${result.projectPath}`);
  lines.push(`**Framework:** ${result.framework}`);
  lines.push(`**Analyzed:** ${result.analyzedAt}`);
  lines.push(`**Security Score:** ${result.metrics.securityScore}/100 (${result.metrics.riskLevel})`);
  lines.push("");

  // Summary table
  lines.push("## Summary");
  lines.push("");
  lines.push("| Severity | Count |");
  lines.push("|----------|-------|");
  lines.push(`| Critical | ${result.severitySummary.critical} |`);
  lines.push(`| High | ${result.severitySummary.high} |`);
  lines.push(`| Medium | ${result.severitySummary.medium} |`);
  lines.push(`| Low | ${result.severitySummary.low} |`);
  lines.push(`| Info | ${result.severitySummary.info} |`);
  lines.push(`| **Total** | **${result.severitySummary.total}** |`);
  lines.push("");

  // Critical and high findings
  const criticalAndHigh = result.vulnerabilities.filter(
    (v) => v.severity === "critical" || v.severity === "high"
  );

  if (criticalAndHigh.length > 0) {
    lines.push("## Critical & High Severity Findings");
    lines.push("");

    for (const vuln of criticalAndHigh) {
      lines.push(`### ${vuln.id}: ${vuln.title}`);
      lines.push("");
      lines.push(`- **Severity:** ${vuln.severity.toUpperCase()}`);
      lines.push(`- **Category:** ${vuln.owasp}`);
      lines.push(`- **Location:** \`${vuln.location.file}:${vuln.location.line}\``);
      lines.push(`- **Status:** ${vuln.status}`);
      lines.push("");
      lines.push(`**Risk:** ${vuln.risk}`);
      lines.push("");
      lines.push(`**Remediation:** ${vuln.remediation}`);
      lines.push("");
    }
  }

  // Positive patterns
  if (result.positivePatterns.length > 0) {
    lines.push("## Positive Security Practices");
    lines.push("");

    for (const pattern of result.positivePatterns.slice(0, 10)) {
      lines.push(`- **${pattern.title}**: ${pattern.description} (\`${pattern.location.file}\`)`);
    }
    lines.push("");
  }

  // Top recommendations
  lines.push("## Recommendations");
  lines.push("");

  for (const rec of result.recommendations.slice(0, 5)) {
    lines.push(`### ${rec.priority.toUpperCase()}: ${rec.title}`);
    lines.push("");
    lines.push(rec.description);
    lines.push("");
  }

  return lines.join("\n");
}
