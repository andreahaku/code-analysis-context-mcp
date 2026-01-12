/**
 * Security Misconfiguration Detector
 * OWASP A05:2021 - Security Misconfiguration
 *
 * Detects:
 * - Debug mode in production
 * - Console logging sensitive data
 * - Verbose error exposure
 * - Default credentials
 * - Missing security headers
 * - Disabled security features
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
  return `MISC-${String(++vulnIdCounter).padStart(3, "0")}`;
}

function generatePositiveId(): string {
  return `MISC-POS-${String(++positiveIdCounter).padStart(3, "0")}`;
}

/**
 * Main misconfiguration detector
 */
export async function detectMisconfigurationVulnerabilities(
  ctx: SecurityDetectionContext
): Promise<SecurityDetectorResult> {
  const vulnerabilities: SecurityVulnerability[] = [];
  const positivePatterns: PositiveSecurityPractice[] = [];

  // Run all sub-detectors
  vulnerabilities.push(...detectDebugMode(ctx));
  vulnerabilities.push(...detectSensitiveLogging(ctx));
  vulnerabilities.push(...detectErrorExposure(ctx));
  vulnerabilities.push(...detectDefaultCredentials(ctx));
  vulnerabilities.push(...detectMissingSecurityHeaders(ctx));
  vulnerabilities.push(...detectDisabledSecurity(ctx));

  // Detect positive patterns
  positivePatterns.push(...detectPositiveMisconfigurationPatterns(ctx));

  return { vulnerabilities, positivePatterns };
}

/**
 * Detect debug mode enabled
 */
function detectDebugMode(ctx: SecurityDetectionContext): SecurityVulnerability[] {
  const vulnerabilities: SecurityVulnerability[] = [];
  const { content, relativePath } = ctx;

  // Skip test files
  if (relativePath.includes(".test.") || relativePath.includes(".spec.")) {
    return vulnerabilities;
  }

  const debugPatterns = [
    { regex: /debug\s*[:=]\s*true/gi, type: "debug flag" },
    { regex: /DEBUG\s*[:=]\s*['"`]true['"`]/gi, type: "DEBUG env" },
    { regex: /NODE_ENV\s*[:=]\s*['"`]development['"`]/gi, type: "NODE_ENV hardcoded" },
    { regex: /devMode\s*[:=]\s*true/gi, type: "dev mode" },
    { regex: /enableDebug\s*[:=]\s*true/gi, type: "debug enabled" },
  ];

  for (const pattern of debugPatterns) {
    const matches = content.matchAll(pattern.regex);
    for (const match of matches) {
      const lineNumber = content.substring(0, match.index).split("\n").length;

      // Check if it's in a config file (higher severity)
      const isConfig = relativePath.includes("config") || relativePath.includes("env");

      vulnerabilities.push({
        id: generateVulnId(),
        category: "misconfiguration",
        owasp: "A05:2021-Security Misconfiguration",
        severity: isConfig ? "medium" : "low",
        status: "review",
        title: `Debug Mode Enabled (${pattern.type})`,
        description: `Debug configuration found - ensure this is not enabled in production`,
        location: {
          file: relativePath,
          line: lineNumber,
          codeSnippet: match[0],
        },
        risk: "Debug mode may expose sensitive information, stack traces, or enable debug endpoints",
        remediation: "Use environment variables and ensure debug is disabled in production",
        cweId: "CWE-489",
        confidence: 0.6,
        autoFixable: false,
      });
    }
  }

  return vulnerabilities;
}

/**
 * Detect sensitive data logging
 */
function detectSensitiveLogging(ctx: SecurityDetectionContext): SecurityVulnerability[] {
  const vulnerabilities: SecurityVulnerability[] = [];
  const { content, relativePath } = ctx;

  // Skip test files
  if (relativePath.includes(".test.") || relativePath.includes(".spec.")) {
    return vulnerabilities;
  }

  // Patterns for logging sensitive data
  const sensitiveLogPatterns = [
    { regex: /console\.(log|info|debug)\s*\([^)]*password/gi, data: "password" },
    { regex: /console\.(log|info|debug)\s*\([^)]*token/gi, data: "token" },
    { regex: /console\.(log|info|debug)\s*\([^)]*secret/gi, data: "secret" },
    { regex: /console\.(log|info|debug)\s*\([^)]*apiKey/gi, data: "API key" },
    { regex: /console\.(log|info|debug)\s*\([^)]*creditCard/gi, data: "credit card" },
    { regex: /console\.(log|info|debug)\s*\([^)]*ssn/gi, data: "SSN" },
    { regex: /logger\.(log|info|debug)\s*\([^)]*password/gi, data: "password" },
    { regex: /logger\.(log|info|debug)\s*\([^)]*token/gi, data: "token" },
  ];

  for (const pattern of sensitiveLogPatterns) {
    const matches = content.matchAll(pattern.regex);
    for (const match of matches) {
      const lineNumber = content.substring(0, match.index).split("\n").length;

      vulnerabilities.push({
        id: generateVulnId(),
        category: "misconfiguration",
        owasp: "A09:2021-Logging Failures",
        severity: "medium",
        status: "needs_fix",
        title: `Sensitive Data in Logs: ${pattern.data}`,
        description: `Potentially logging ${pattern.data} - sensitive data should not appear in logs`,
        location: {
          file: relativePath,
          line: lineNumber,
          codeSnippet: match[0],
        },
        risk: "Sensitive data in logs can be accessed by anyone with log access, stored indefinitely",
        remediation: "Remove sensitive data from logs, or use a logger that automatically redacts sensitive fields",
        cweId: "CWE-532",
        confidence: 0.75,
        autoFixable: false,
      });
    }
  }

  // Detect console.log in production code (non-error)
  const consoleLogMatches = content.matchAll(/console\.(log|info|debug|trace)\s*\(/gi);
  let consoleLogCount = 0;
  for (const _ of consoleLogMatches) {
    consoleLogCount++;
  }

  if (consoleLogCount > 5 && !relativePath.includes("test") && !relativePath.includes("spec")) {
    vulnerabilities.push({
      id: generateVulnId(),
      category: "misconfiguration",
      owasp: "A05:2021-Security Misconfiguration",
      severity: "low",
      status: "review",
      title: "Excessive Console Logging",
      description: `Found ${consoleLogCount} console.log statements - consider using a proper logger`,
      location: { file: relativePath, line: 0 },
      risk: "Console logs may leak information in production and impact performance",
      remediation: "Use a configurable logger (winston, pino) that can be disabled in production",
      cweId: "CWE-532",
      confidence: 0.5,
      autoFixable: false,
    });
  }

  return vulnerabilities;
}

/**
 * Detect error information exposure
 */
function detectErrorExposure(ctx: SecurityDetectionContext): SecurityVulnerability[] {
  const vulnerabilities: SecurityVulnerability[] = [];
  const { content, relativePath, ast } = ctx;

  const checkNode = (node: any) => {
    if (!node || typeof node !== "object") return;

    // Detect sending error objects directly in response
    if (node.type === "CallExpression" && node.callee?.type === "MemberExpression") {
      const methodName = node.callee?.property?.name;

      // res.send(err), res.json(err), res.status(500).send(err)
      if (methodName === "send" || methodName === "json") {
        const arg = node.arguments?.[0];

        // Check if argument is an error identifier
        if (
          arg?.type === "Identifier" &&
          (arg.name === "err" || arg.name === "error" || arg.name === "e")
        ) {
          vulnerabilities.push({
            id: generateVulnId(),
            category: "misconfiguration",
            owasp: "A05:2021-Security Misconfiguration",
            severity: "medium",
            status: "needs_fix",
            title: "Error Object Exposed in Response",
            description: "Raw error object sent in HTTP response may expose sensitive details",
            location: {
              file: relativePath,
              line: node.loc?.start?.line || 0,
              codeSnippet: getCodeSnippet(content, node.loc?.start?.line),
            },
            risk: "Stack traces and internal details help attackers understand system internals",
            remediation: "Return generic error messages: res.status(500).json({ error: 'Internal server error' })",
            cweId: "CWE-209",
            confidence: 0.8,
            autoFixable: false,
          });
        }

        // Check for error.stack or error.message exposure
        if (
          arg?.type === "MemberExpression" &&
          (arg.property?.name === "stack" || arg.property?.name === "message")
        ) {
          vulnerabilities.push({
            id: generateVulnId(),
            category: "misconfiguration",
            owasp: "A05:2021-Security Misconfiguration",
            severity: "medium",
            status: "needs_fix",
            title: "Error Stack/Message Exposed",
            description: `Error ${arg.property.name} sent in response`,
            location: {
              file: relativePath,
              line: node.loc?.start?.line || 0,
            },
            risk: "Error details reveal internal implementation to attackers",
            remediation: "Log detailed errors server-side, return generic messages to clients",
            cweId: "CWE-209",
            confidence: 0.85,
            autoFixable: false,
          });
        }
      }
    }

    // Recurse
    for (const key in node) {
      if (Array.isArray(node[key])) {
        node[key].forEach(checkNode);
      } else if (typeof node[key] === "object") {
        checkNode(node[key]);
      }
    }
  };

  checkNode(ast);
  return vulnerabilities;
}

/**
 * Detect default credentials
 */
function detectDefaultCredentials(ctx: SecurityDetectionContext): SecurityVulnerability[] {
  const vulnerabilities: SecurityVulnerability[] = [];
  const { content, relativePath } = ctx;

  // Common default credentials patterns
  const defaultCredentials = [
    { regex: /['"`](admin|root|administrator)['"`]\s*,\s*['"`](admin|root|password|123456)['"`]/gi, type: "admin/password" },
    { regex: /username\s*[:=]\s*['"`]admin['"`]/gi, type: "admin username" },
    { regex: /password\s*[:=]\s*['"`](password|admin|root|123456|test)['"`]/gi, type: "default password" },
    { regex: /['"`]postgres['"`]\s*,\s*['"`]postgres['"`]/gi, type: "postgres/postgres" },
    { regex: /['"`]sa['"`]\s*,\s*['"`]['"`]/gi, type: "SQL Server sa with empty password" },
  ];

  for (const pattern of defaultCredentials) {
    const matches = content.matchAll(pattern.regex);
    for (const match of matches) {
      // Skip if in test/mock file
      if (relativePath.includes("test") || relativePath.includes("mock") || relativePath.includes("fixture")) {
        continue;
      }

      const lineNumber = content.substring(0, match.index).split("\n").length;

      vulnerabilities.push({
        id: generateVulnId(),
        category: "misconfiguration",
        owasp: "A07:2021-Auth Failures",
        severity: "high",
        status: "needs_fix",
        title: `Default Credentials: ${pattern.type}`,
        description: "Default or common credentials found in code",
        location: {
          file: relativePath,
          line: lineNumber,
          codeSnippet: match[0].substring(0, 50),
        },
        risk: "Default credentials are widely known and first thing attackers try",
        remediation: "Use strong, unique credentials from environment variables or secrets manager",
        cweId: "CWE-798",
        confidence: 0.85,
        autoFixable: false,
      });
    }
  }

  return vulnerabilities;
}

/**
 * Detect missing security headers
 */
function detectMissingSecurityHeaders(ctx: SecurityDetectionContext): SecurityVulnerability[] {
  const vulnerabilities: SecurityVulnerability[] = [];
  const { content, relativePath, imports, framework } = ctx;

  // Only check server-side files
  if (framework === "react" || framework === "react-native" || framework === "expo" || framework === "vue3") {
    return vulnerabilities;
  }

  // Check if this looks like a server setup file
  const isServerFile =
    relativePath.includes("server") ||
    relativePath.includes("app.") ||
    relativePath.includes("index.") ||
    relativePath.includes("main.");

  if (!isServerFile) return vulnerabilities;

  // Check for helmet usage (security headers middleware)
  const hasHelmet =
    imports.some((imp) => imp.source === "helmet" || imp.source === "@fastify/helmet") ||
    content.includes("helmet(");

  if (!hasHelmet && (content.includes("fastify") || content.includes("express"))) {
    vulnerabilities.push({
      id: generateVulnId(),
      category: "misconfiguration",
      owasp: "A05:2021-Security Misconfiguration",
      severity: "medium",
      status: "review",
      title: "Missing Security Headers (Helmet)",
      description: "Server does not appear to use Helmet for security headers",
      location: { file: relativePath, line: 0 },
      risk: "Missing headers like CSP, X-Frame-Options expose app to XSS, clickjacking",
      remediation: "Add Helmet middleware: app.register(require('@fastify/helmet'))",
      cweId: "CWE-693",
      confidence: 0.7,
      autoFixable: false,
    });
  }

  return vulnerabilities;
}

/**
 * Detect disabled security features
 */
function detectDisabledSecurity(ctx: SecurityDetectionContext): SecurityVulnerability[] {
  const vulnerabilities: SecurityVulnerability[] = [];
  const { content, relativePath } = ctx;

  const disabledSecurityPatterns = [
    {
      regex: /rejectUnauthorized\s*:\s*false/gi,
      issue: "SSL Certificate Validation Disabled",
      severity: "high" as const,
      risk: "Allows man-in-the-middle attacks, accepting any certificate",
    },
    {
      regex: /NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"`]?0['"`]?/gi,
      issue: "TLS Validation Globally Disabled",
      severity: "critical" as const,
      risk: "All HTTPS connections will accept invalid certificates",
    },
    {
      regex: /csrf\s*:\s*false/gi,
      issue: "CSRF Protection Disabled",
      severity: "high" as const,
      risk: "Application vulnerable to cross-site request forgery attacks",
    },
    {
      regex: /xssFilter\s*:\s*false/gi,
      issue: "XSS Filter Disabled",
      severity: "medium" as const,
      risk: "Browser XSS protection is disabled",
    },
    {
      regex: /frameguard\s*:\s*false/gi,
      issue: "Frameguard Disabled",
      severity: "medium" as const,
      risk: "Application can be embedded in iframes, enabling clickjacking",
    },
  ];

  for (const pattern of disabledSecurityPatterns) {
    const matches = content.matchAll(pattern.regex);
    for (const match of matches) {
      const lineNumber = content.substring(0, match.index).split("\n").length;

      vulnerabilities.push({
        id: generateVulnId(),
        category: "misconfiguration",
        owasp: "A05:2021-Security Misconfiguration",
        severity: pattern.severity,
        status: "needs_fix",
        title: pattern.issue,
        description: `Security feature explicitly disabled: ${match[0]}`,
        location: {
          file: relativePath,
          line: lineNumber,
          codeSnippet: match[0],
        },
        risk: pattern.risk,
        remediation: "Remove this setting or set to true/enabled",
        cweId: "CWE-693",
        confidence: 0.95,
        autoFixable: true,
        autoFixSuggestion: "Remove this configuration or set to true",
      });
    }
  }

  return vulnerabilities;
}

/**
 * Detect positive misconfiguration patterns
 */
function detectPositiveMisconfigurationPatterns(ctx: SecurityDetectionContext): PositiveSecurityPractice[] {
  const patterns: PositiveSecurityPractice[] = [];
  const { imports, relativePath, content } = ctx;

  // Check for Helmet usage
  if (imports.some((imp) => imp.source === "helmet" || imp.source === "@fastify/helmet")) {
    patterns.push({
      id: generatePositiveId(),
      category: "misconfiguration",
      title: "Security Headers with Helmet",
      description: "Uses Helmet middleware for security headers",
      location: { file: relativePath },
      benefit: "Automatically sets security headers (CSP, X-Frame-Options, etc.)",
    });
  }

  // Check for proper logger usage
  const loggerLibs = ["winston", "pino", "bunyan", "log4js"];
  for (const lib of loggerLibs) {
    if (imports.some((imp) => imp.source === lib)) {
      patterns.push({
        id: generatePositiveId(),
        category: "misconfiguration",
        title: `Production Logger: ${lib}`,
        description: `Uses ${lib} for structured logging`,
        location: { file: relativePath },
        benefit: "Configurable log levels, can filter sensitive data, proper for production",
      });
      break;
    }
  }

  // Check for error handling middleware
  if (content.includes("setErrorHandler") || content.includes("errorHandler")) {
    patterns.push({
      id: generatePositiveId(),
      category: "misconfiguration",
      title: "Centralized Error Handler",
      description: "Application has centralized error handling",
      location: { file: relativePath },
      benefit: "Consistent error responses, prevents leaking sensitive details",
    });
  }

  // Check for NODE_ENV checks
  if (content.includes("process.env.NODE_ENV")) {
    patterns.push({
      id: generatePositiveId(),
      category: "misconfiguration",
      title: "Environment-Aware Configuration",
      description: "Code checks NODE_ENV for environment-specific behavior",
      location: { file: relativePath },
      benefit: "Different configurations for development vs production",
    });
  }

  return patterns;
}

/**
 * Helper to get code snippet around a line
 */
function getCodeSnippet(content: string, line: number | undefined, context: number = 1): string {
  if (!line) return "";
  const lines = content.split("\n");
  const start = Math.max(0, line - 1 - context);
  const end = Math.min(lines.length, line + context);
  return lines.slice(start, end).join("\n").substring(0, 200);
}

/**
 * Reset counters (useful for testing)
 */
export function resetMisconfigurationCounters(): void {
  vulnIdCounter = 0;
  positiveIdCounter = 0;
}
