/**
 * Vue/Nuxt Security Detector
 * Vue 3 / Nuxt 3/4 Specific
 *
 * Detects:
 * - v-html XSS vulnerabilities
 * - Exposed API keys in nuxt.config
 * - Missing CSRF protection
 * - Insecure server routes (Nitro)
 * - SSR state exposure
 * - Route guard bypasses
 */

import type {
  SecurityDetectionContext,
  SecurityDetectorResult,
  SecurityVulnerability,
  PositiveSecurityPractice,
} from "../types/index.js";

let vulnIdCounter = 0;
let positiveIdCounter = 0;

function generateVulnId(): string {
  return `VUE-${String(++vulnIdCounter).padStart(3, "0")}`;
}

function generatePositiveId(): string {
  return `VUE-POS-${String(++positiveIdCounter).padStart(3, "0")}`;
}

/**
 * Main Vue/Nuxt security detector
 */
export async function detectVueNuxtVulnerabilities(
  ctx: SecurityDetectionContext
): Promise<SecurityDetectorResult> {
  const { framework } = ctx;

  // Only run for Vue/Nuxt frameworks
  if (framework !== "vue3" && framework !== "nuxt3") {
    return { vulnerabilities: [], positivePatterns: [] };
  }

  const vulnerabilities: SecurityVulnerability[] = [];
  const positivePatterns: PositiveSecurityPractice[] = [];

  // Run all sub-detectors
  vulnerabilities.push(...detectVHTMLXSS(ctx));
  vulnerabilities.push(...detectExposedNuxtConfig(ctx));
  vulnerabilities.push(...detectInsecureServerRoutes(ctx));
  vulnerabilities.push(...detectSSRStateExposure(ctx));
  vulnerabilities.push(...detectRouteGuardIssues(ctx));
  vulnerabilities.push(...detectPiniaStoreIssues(ctx));

  // Detect positive patterns
  positivePatterns.push(...detectPositiveVueNuxtPatterns(ctx));

  return { vulnerabilities, positivePatterns };
}

/**
 * Detect v-html XSS vulnerabilities
 */
function detectVHTMLXSS(ctx: SecurityDetectionContext): SecurityVulnerability[] {
  const vulnerabilities: SecurityVulnerability[] = [];
  const { content, relativePath, framework } = ctx;

  // Check for v-html in Vue files
  if (!relativePath.endsWith(".vue")) return vulnerabilities;

  // Find v-html directives
  const vHtmlRegex = /v-html\s*=\s*["']([^"']+)["']/gi;
  const matches = content.matchAll(vHtmlRegex);

  for (const match of matches) {
    const binding = match[1];
    const lineNumber = content.substring(0, match.index).split("\n").length;

    // Check if binding looks like user input
    const isUserInput =
      binding.includes("user") ||
      binding.includes("input") ||
      binding.includes("form") ||
      binding.includes("data") ||
      binding.includes("content") ||
      binding.includes("html") ||
      binding.includes("message");

    // Check if DOMPurify is used in the file
    const hasSanitization =
      content.includes("DOMPurify") ||
      content.includes("sanitize") ||
      content.includes("xss") ||
      content.includes("escapeHtml");

    if (!hasSanitization) {
      vulnerabilities.push({
        id: generateVulnId(),
        category: "vue_nuxt",
        owasp: "A03:2021-Injection",
        severity: isUserInput ? "high" : "medium",
        status: isUserInput ? "needs_fix" : "review",
        title: "Potential XSS via v-html",
        description: `v-html directive renders "${binding}" as HTML without apparent sanitization`,
        location: {
          file: relativePath,
          line: lineNumber,
          codeSnippet: match[0],
        },
        risk: "Unsanitized HTML can execute malicious scripts in users' browsers",
        remediation: "Sanitize with DOMPurify: v-html=\"DOMPurify.sanitize(content)\" or use v-text",
        cweId: "CWE-79",
        confidence: isUserInput ? 0.85 : 0.65,
        framework,
        autoFixable: false,
      });
    }
  }

  return vulnerabilities;
}

/**
 * Detect exposed secrets in nuxt.config
 */
function detectExposedNuxtConfig(ctx: SecurityDetectionContext): SecurityVulnerability[] {
  const vulnerabilities: SecurityVulnerability[] = [];
  const { content, relativePath, framework } = ctx;

  // Check nuxt.config files
  if (!relativePath.includes("nuxt.config")) return vulnerabilities;

  // Check for secrets in public runtime config
  const publicConfigRegex = /runtimeConfig\s*:\s*\{[^}]*public\s*:\s*\{([^}]+)\}/gs;
  const publicMatch = content.match(publicConfigRegex);

  if (publicMatch) {
    const publicContent = publicMatch[0];
    const sensitiveKeys = ["secret", "password", "apiKey", "privateKey", "token", "auth"];

    for (const key of sensitiveKeys) {
      const keyRegex = new RegExp(`${key}\\s*:`, "gi");
      if (keyRegex.test(publicContent)) {
        const lineNumber = content.substring(0, content.indexOf(publicMatch[0])).split("\n").length;

        vulnerabilities.push({
          id: generateVulnId(),
          category: "vue_nuxt",
          owasp: "A02:2021-Cryptographic Failures",
          severity: "high",
          status: "needs_fix",
          title: `Sensitive Key in Public Runtime Config: ${key}`,
          description: "Sensitive configuration exposed in public runtimeConfig (sent to browser)",
          location: {
            file: relativePath,
            line: lineNumber,
          },
          risk: "Public runtimeConfig is sent to the client and visible in browser",
          remediation: "Move sensitive keys to runtimeConfig root (private, server-only)",
          cweId: "CWE-200",
          confidence: 0.9,
          framework,
          autoFixable: false,
        });
      }
    }
  }

  // Check for hardcoded secrets directly in config
  const hardcodedSecretPatterns = [
    /apiKey\s*:\s*['"`](?!process\.env)[^'"`]{10,}['"`]/gi,
    /secret\s*:\s*['"`](?!process\.env)[^'"`]{10,}['"`]/gi,
    /privateKey\s*:\s*['"`](?!process\.env)[^'"`]{10,}['"`]/gi,
  ];

  for (const pattern of hardcodedSecretPatterns) {
    const matches = content.matchAll(pattern);
    for (const match of matches) {
      const lineNumber = content.substring(0, match.index).split("\n").length;

      vulnerabilities.push({
        id: generateVulnId(),
        category: "vue_nuxt",
        owasp: "A02:2021-Cryptographic Failures",
        severity: "critical",
        status: "needs_fix",
        title: "Hardcoded Secret in nuxt.config",
        description: "Secret value hardcoded in configuration file",
        location: {
          file: relativePath,
          line: lineNumber,
          codeSnippet: maskSecret(match[0]),
        },
        risk: "Secrets in source code can be extracted from version control",
        remediation: "Use environment variables: process.env.API_KEY",
        cweId: "CWE-798",
        confidence: 0.95,
        framework,
        autoFixable: false,
      });
    }
  }

  return vulnerabilities;
}

/**
 * Detect insecure Nitro server routes
 */
function detectInsecureServerRoutes(ctx: SecurityDetectionContext): SecurityVulnerability[] {
  const vulnerabilities: SecurityVulnerability[] = [];
  const { content, relativePath, framework } = ctx;

  // Check server routes (Nitro)
  if (!relativePath.includes("server/") || !relativePath.includes("/api/")) {
    return vulnerabilities;
  }

  // Check for missing input validation
  const hasValidation =
    content.includes("zod") ||
    content.includes("yup") ||
    content.includes("joi") ||
    content.includes("validate") ||
    content.includes("schema");

  // Check for getQuery/readBody usage without validation
  const inputPatterns = [
    { regex: /getQuery\s*\(\s*event\s*\)/gi, method: "getQuery" },
    { regex: /readBody\s*\(\s*event\s*\)/gi, method: "readBody" },
    { regex: /getRouterParam\s*\(/gi, method: "getRouterParam" },
  ];

  for (const pattern of inputPatterns) {
    if (pattern.regex.test(content) && !hasValidation) {
      vulnerabilities.push({
        id: generateVulnId(),
        category: "vue_nuxt",
        owasp: "A03:2021-Injection",
        severity: "medium",
        status: "review",
        title: `Unvalidated Input from ${pattern.method}`,
        description: `${pattern.method} used without apparent input validation`,
        location: { file: relativePath, line: 0 },
        risk: "Unvalidated input can lead to injection attacks",
        remediation: "Validate input with Zod: const body = await readValidatedBody(event, schema.parse)",
        cweId: "CWE-20",
        confidence: 0.6,
        framework,
        autoFixable: false,
      });
    }
  }

  // Check for SQL queries in server routes (should use prepared statements)
  if (content.includes(".query(") && content.includes("${")) {
    vulnerabilities.push({
      id: generateVulnId(),
      category: "vue_nuxt",
      owasp: "A03:2021-Injection",
      severity: "high",
      status: "needs_fix",
      title: "Potential SQL Injection in Server Route",
      description: "Server route appears to use template literals in SQL queries",
      location: { file: relativePath, line: 0 },
      risk: "SQL injection can compromise the database",
      remediation: "Use parameterized queries with placeholders ($1, $2)",
      cweId: "CWE-89",
      confidence: 0.8,
      framework,
      autoFixable: false,
    });
  }

  return vulnerabilities;
}

/**
 * Detect SSR state exposure issues
 */
function detectSSRStateExposure(ctx: SecurityDetectionContext): SecurityVulnerability[] {
  const vulnerabilities: SecurityVulnerability[] = [];
  const { content, relativePath, framework } = ctx;

  // Check for useState/useAsyncData with sensitive data
  const statePatterns = [
    { regex: /useState\s*\(\s*['"`][^'"`]*(?:token|password|secret|auth)[^'"`]*['"`]/gi, method: "useState" },
    { regex: /useAsyncData\s*\(\s*['"`][^'"`]*(?:token|password|secret|auth)[^'"`]*['"`]/gi, method: "useAsyncData" },
  ];

  for (const pattern of statePatterns) {
    const matches = content.matchAll(pattern.regex);
    for (const match of matches) {
      const lineNumber = content.substring(0, match.index).split("\n").length;

      vulnerabilities.push({
        id: generateVulnId(),
        category: "vue_nuxt",
        owasp: "A02:2021-Cryptographic Failures",
        severity: "medium",
        status: "review",
        title: `Sensitive Data in ${pattern.method}`,
        description: `${pattern.method} may expose sensitive data in SSR payload`,
        location: {
          file: relativePath,
          line: lineNumber,
          codeSnippet: match[0],
        },
        risk: "SSR state is serialized to HTML and visible in page source",
        remediation: "Keep sensitive data server-side only, use server routes for sensitive operations",
        cweId: "CWE-200",
        confidence: 0.65,
        framework,
        autoFixable: false,
      });
    }
  }

  return vulnerabilities;
}

/**
 * Detect route guard issues
 */
function detectRouteGuardIssues(ctx: SecurityDetectionContext): SecurityVulnerability[] {
  const vulnerabilities: SecurityVulnerability[] = [];
  const { content, relativePath, framework } = ctx;

  // Check middleware files
  if (relativePath.includes("middleware/")) {
    // Check for client-only redirects without server protection
    if (content.includes("navigateTo") && content.includes("process.client")) {
      // Check if there's also a server-side check
      const hasServerCheck = content.includes("process.server") || content.includes("event.node.req");

      if (!hasServerCheck) {
        vulnerabilities.push({
          id: generateVulnId(),
          category: "vue_nuxt",
          owasp: "A01:2021-Broken Access Control",
          severity: "medium",
          status: "review",
          title: "Client-Only Route Protection",
          description: "Route middleware only protects on client-side, can be bypassed on initial SSR",
          location: { file: relativePath, line: 0 },
          risk: "Users can bypass protection by directly navigating to protected routes",
          remediation: "Add server-side protection in middleware that runs on both client and server",
          cweId: "CWE-284",
          confidence: 0.7,
          framework,
          autoFixable: false,
        });
      }
    }

    // Check for auth middleware that doesn't check on server
    if ((content.includes("auth") || content.includes("Auth")) && !content.includes("abortNavigation")) {
      vulnerabilities.push({
        id: generateVulnId(),
        category: "vue_nuxt",
        owasp: "A01:2021-Broken Access Control",
        severity: "low",
        status: "review",
        title: "Auth Middleware Without Abort",
        description: "Auth middleware doesn't use abortNavigation for unauthorized access",
        location: { file: relativePath, line: 0 },
        risk: "May allow rendering of protected pages during redirect",
        remediation: "Use abortNavigation() to prevent rendering: throw abortNavigation()",
        cweId: "CWE-284",
        confidence: 0.5,
        framework,
        autoFixable: false,
      });
    }
  }

  return vulnerabilities;
}

/**
 * Detect Pinia store security issues
 */
function detectPiniaStoreIssues(ctx: SecurityDetectionContext): SecurityVulnerability[] {
  const vulnerabilities: SecurityVulnerability[] = [];
  const { content, relativePath, framework } = ctx;

  // Check stores
  if (!relativePath.includes("stores/") && !content.includes("defineStore")) {
    return vulnerabilities;
  }

  // Check for sensitive data in store state
  const storeStateRegex = /state\s*:\s*\(\s*\)\s*=>\s*\(\s*\{([^}]+)\}/gs;
  const stateMatch = content.match(storeStateRegex);

  if (stateMatch) {
    const stateContent = stateMatch[0];
    const sensitiveFields = ["password", "secret", "token", "creditCard", "ssn"];

    for (const field of sensitiveFields) {
      if (stateContent.toLowerCase().includes(field)) {
        vulnerabilities.push({
          id: generateVulnId(),
          category: "vue_nuxt",
          owasp: "A02:2021-Cryptographic Failures",
          severity: "medium",
          status: "review",
          title: `Sensitive Field in Pinia Store: ${field}`,
          description: `Pinia store state contains "${field}" - ensure this is intentional`,
          location: { file: relativePath, line: 0 },
          risk: "Pinia state may be serialized for SSR hydration, exposing data in HTML",
          remediation: "Use skipHydrate() for sensitive data or keep server-side only",
          cweId: "CWE-200",
          confidence: 0.6,
          framework,
          autoFixable: false,
        });
      }
    }
  }

  return vulnerabilities;
}

/**
 * Detect positive Vue/Nuxt patterns
 */
function detectPositiveVueNuxtPatterns(ctx: SecurityDetectionContext): PositiveSecurityPractice[] {
  const patterns: PositiveSecurityPractice[] = [];
  const { imports, relativePath, content, framework } = ctx;

  // Check for DOMPurify usage
  if (imports.some((imp) => imp.source === "dompurify" || imp.source === "isomorphic-dompurify")) {
    patterns.push({
      id: generatePositiveId(),
      category: "vue_nuxt",
      title: "XSS Prevention with DOMPurify",
      description: "Uses DOMPurify for HTML sanitization",
      location: { file: relativePath },
      benefit: "Prevents XSS attacks from v-html and innerHTML usage",
      framework,
    });
  }

  // Check for input validation in server routes
  if (relativePath.includes("server/") && (content.includes("readValidatedBody") || content.includes("getValidatedQuery"))) {
    patterns.push({
      id: generatePositiveId(),
      category: "vue_nuxt",
      title: "Validated Server Input",
      description: "Uses Nuxt validation helpers for server route input",
      location: { file: relativePath },
      benefit: "Ensures server-side input validation before processing",
      framework,
    });
  }

  // Check for proper middleware protection
  if (relativePath.includes("middleware/") && content.includes("abortNavigation")) {
    patterns.push({
      id: generatePositiveId(),
      category: "vue_nuxt",
      title: "Proper Route Abort",
      description: "Middleware uses abortNavigation for unauthorized access",
      location: { file: relativePath },
      benefit: "Prevents rendering of protected pages during authorization",
      framework,
    });
  }

  // Check for useRuntimeConfig usage (vs hardcoded)
  if (content.includes("useRuntimeConfig()")) {
    patterns.push({
      id: generatePositiveId(),
      category: "vue_nuxt",
      title: "Runtime Configuration",
      description: "Uses useRuntimeConfig for configuration values",
      location: { file: relativePath },
      benefit: "Separates configuration from code, supports environment variables",
      framework,
    });
  }

  // Check for server-only utilities
  if (content.includes("#imports") && content.includes("server")) {
    patterns.push({
      id: generatePositiveId(),
      category: "vue_nuxt",
      title: "Server-Only Code Isolation",
      description: "Uses server-only imports/utilities",
      location: { file: relativePath },
      benefit: "Ensures sensitive server code is never sent to client",
      framework,
    });
  }

  return patterns;
}

/**
 * Helper to mask secrets in output
 */
function maskSecret(text: string): string {
  if (text.length <= 12) {
    return text.substring(0, 4) + "****";
  }
  return text.substring(0, 4) + "****" + text.substring(text.length - 4);
}

/**
 * Reset counters (useful for testing)
 */
export function resetVueNuxtCounters(): void {
  vulnIdCounter = 0;
  positiveIdCounter = 0;
}
