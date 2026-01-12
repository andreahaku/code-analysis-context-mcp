/**
 * Access Control Vulnerability Detector
 * OWASP A01:2021 - Broken Access Control
 *
 * Detects:
 * - CORS misconfigurations (wildcard origins)
 * - Missing authentication checks on routes
 * - Hardcoded roles/permissions
 * - Direct object reference vulnerabilities
 * - Missing authorization middleware
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
  return `AC-${String(++vulnIdCounter).padStart(3, "0")}`;
}

function generatePositiveId(): string {
  return `AC-POS-${String(++positiveIdCounter).padStart(3, "0")}`;
}

/**
 * Main access control detector
 */
export async function detectAccessControlVulnerabilities(
  ctx: SecurityDetectionContext
): Promise<SecurityDetectorResult> {
  const vulnerabilities: SecurityVulnerability[] = [];
  const positivePatterns: PositiveSecurityPractice[] = [];

  // Run all sub-detectors
  vulnerabilities.push(...detectCORSMisconfiguration(ctx));
  vulnerabilities.push(...detectMissingAuth(ctx));
  vulnerabilities.push(...detectHardcodedRoles(ctx));
  vulnerabilities.push(...detectIDOR(ctx));
  vulnerabilities.push(...detectInsecureCookies(ctx));

  // Detect positive patterns
  positivePatterns.push(...detectPositiveAccessControlPatterns(ctx));

  return { vulnerabilities, positivePatterns };
}

/**
 * Detect CORS misconfigurations
 */
function detectCORSMisconfiguration(ctx: SecurityDetectionContext): SecurityVulnerability[] {
  const vulnerabilities: SecurityVulnerability[] = [];
  const { content, relativePath } = ctx;

  // Check for wildcard CORS
  const corsPatterns = [
    { regex: /Access-Control-Allow-Origin['":\s]*['"]\*['"]/gi, type: "header" },
    { regex: /cors\(\s*\{\s*origin:\s*['"]\*['"]/gi, type: "config" },
    { regex: /origin:\s*['"]\*['"]/gi, type: "config" },
    { regex: /cors\(\s*true\s*\)/gi, type: "permissive" },
    { regex: /cors\(\s*\)/gi, type: "default" },
  ];

  for (const pattern of corsPatterns) {
    const matches = content.matchAll(pattern.regex);
    for (const match of matches) {
      const lineNumber = content.substring(0, match.index).split("\n").length;

      const severity = pattern.type === "header" || pattern.type === "config" ? "high" : "medium";
      const status = pattern.type === "default" ? "review" : "needs_fix";

      vulnerabilities.push({
        id: generateVulnId(),
        category: "access_control",
        owasp: "A01:2021-Broken Access Control",
        severity,
        status,
        title: "CORS Misconfiguration",
        description: pattern.type === "default"
          ? "CORS enabled with default settings - may be overly permissive"
          : "CORS allows requests from any origin (wildcard)",
        location: {
          file: relativePath,
          line: lineNumber,
          codeSnippet: match[0],
        },
        risk: "Any website can make authenticated requests to your API, enabling CSRF and data theft",
        remediation: "Specify allowed origins explicitly: cors({ origin: ['https://yourdomain.com'] })",
        cweId: "CWE-942",
        confidence: 0.9,
        autoFixable: false,
        references: ["https://owasp.org/www-community/attacks/CORS_OriginHeaderScrutiny"],
      });
    }
  }

  // Check for credentials with wildcard origin (especially dangerous)
  if (
    content.includes("credentials: true") &&
    (content.includes("origin: '*'") || content.includes('origin: "*'))
  ) {
    vulnerabilities.push({
      id: generateVulnId(),
      category: "access_control",
      owasp: "A01:2021-Broken Access Control",
      severity: "critical",
      status: "needs_fix",
      title: "CORS with Credentials and Wildcard Origin",
      description: "CORS configured with credentials and wildcard origin - this is a severe misconfiguration",
      location: { file: relativePath, line: 0 },
      risk: "Browsers actually block this combination, but if bypassed, any site can make authenticated requests",
      remediation: "Never use wildcard origin with credentials. Specify exact allowed origins.",
      cweId: "CWE-942",
      confidence: 0.95,
      autoFixable: false,
    });
  }

  return vulnerabilities;
}

/**
 * Detect missing authentication checks
 */
function detectMissingAuth(ctx: SecurityDetectionContext): SecurityVulnerability[] {
  const vulnerabilities: SecurityVulnerability[] = [];
  const { ast, relativePath, content, framework } = ctx;

  const checkNode = (node: any) => {
    if (!node || typeof node !== "object") return;

    // Fastify/Express routes without auth middleware
    if (
      node.type === "CallExpression" &&
      node.callee?.type === "MemberExpression"
    ) {
      const methodName = node.callee?.property?.name?.toLowerCase();
      const httpMethods = ["get", "post", "put", "delete", "patch"];

      if (httpMethods.includes(methodName)) {
        const pathArg = node.arguments?.[0];
        const path = pathArg?.value || pathArg?.quasis?.[0]?.value?.raw || "";

        // Check if path looks like it needs auth
        const sensitivePatterns = [
          /\/api\/.*user/i,
          /\/api\/.*admin/i,
          /\/api\/.*account/i,
          /\/api\/.*payment/i,
          /\/api\/.*order/i,
          /\/api\/.*profile/i,
          /\/api\/.*settings/i,
          /\/private\//i,
          /\/internal\//i,
        ];

        const isSensitivePath = sensitivePatterns.some((p) => p.test(path));

        if (isSensitivePath) {
          // Check if there's auth middleware in the route options
          const hasAuthMiddleware = node.arguments?.some((arg: any) => {
            if (arg.type === "ObjectExpression") {
              return arg.properties?.some((prop: any) => {
                const propName = prop.key?.name || "";
                return ["preHandler", "onRequest", "beforeHandler", "middleware"].includes(propName);
              });
            }
            return false;
          });

          if (!hasAuthMiddleware) {
            vulnerabilities.push({
              id: generateVulnId(),
              category: "access_control",
              owasp: "A01:2021-Broken Access Control",
              severity: "medium",
              status: "review",
              title: "Potentially Unprotected Sensitive Route",
              description: `Route '${path}' appears to handle sensitive data but may lack authentication`,
              location: {
                file: relativePath,
                line: node.loc?.start?.line || 0,
                codeSnippet: getCodeSnippet(content, node.loc?.start?.line),
              },
              risk: "Sensitive endpoints without authentication can be accessed by anyone",
              remediation: "Add authentication middleware: { preHandler: [authenticate] }",
              cweId: "CWE-306",
              confidence: 0.6,
              framework,
              autoFixable: false,
            });
          }
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
 * Detect hardcoded roles and permissions
 */
function detectHardcodedRoles(ctx: SecurityDetectionContext): SecurityVulnerability[] {
  const vulnerabilities: SecurityVulnerability[] = [];
  const { content, relativePath } = ctx;

  // Patterns for hardcoded role checks
  const hardcodedRolePatterns = [
    { regex: /role\s*===?\s*['"`]admin['"`]/gi, role: "admin" },
    { regex: /role\s*===?\s*['"`]superadmin['"`]/gi, role: "superadmin" },
    { regex: /isAdmin\s*===?\s*(true|1)/gi, role: "admin" },
    { regex: /user\.role\s*===?\s*['"`][^'"`]+['"`]/gi, role: "custom" },
    { regex: /\.hasRole\s*\(\s*['"`]admin['"`]\s*\)/gi, role: "admin" },
  ];

  for (const pattern of hardcodedRolePatterns) {
    const matches = content.matchAll(pattern.regex);
    for (const match of matches) {
      const lineNumber = content.substring(0, match.index).split("\n").length;

      vulnerabilities.push({
        id: generateVulnId(),
        category: "access_control",
        owasp: "A01:2021-Broken Access Control",
        severity: "low",
        status: "review",
        title: "Hardcoded Role Check",
        description: `Direct role comparison found - consider using a centralized permission system`,
        location: {
          file: relativePath,
          line: lineNumber,
          codeSnippet: match[0],
        },
        risk: "Scattered role checks are error-prone and hard to maintain. May lead to authorization bypass.",
        remediation: "Use a centralized RBAC/ABAC system or permission middleware",
        cweId: "CWE-863",
        confidence: 0.5,
        autoFixable: false,
      });
    }
  }

  return vulnerabilities;
}

/**
 * Detect Insecure Direct Object Reference (IDOR) patterns
 */
function detectIDOR(ctx: SecurityDetectionContext): SecurityVulnerability[] {
  const vulnerabilities: SecurityVulnerability[] = [];
  const { ast, relativePath, content } = ctx;

  const checkNode = (node: any) => {
    if (!node || typeof node !== "object") return;

    // Look for database queries using request parameters directly
    if (
      node.type === "CallExpression" &&
      node.callee?.type === "MemberExpression"
    ) {
      const methodName = node.callee?.property?.name;
      const dbMethods = ["findById", "findByPk", "findOne", "findUnique", "delete", "update", "destroy"];

      if (dbMethods.includes(methodName)) {
        // Check if the ID comes from request params
        const hasRequestParam = node.arguments?.some((arg: any) => {
          const argStr = JSON.stringify(arg);
          return (
            argStr.includes("req.params") ||
            argStr.includes("request.params") ||
            argStr.includes("params.id") ||
            argStr.includes("ctx.params")
          );
        });

        if (hasRequestParam) {
          // Check if there's an ownership check nearby
          const lineNumber = node.loc?.start?.line || 0;
          const surroundingLines = content.split("\n").slice(Math.max(0, lineNumber - 10), lineNumber + 5).join("\n");

          const hasOwnershipCheck =
            surroundingLines.includes("userId") ||
            surroundingLines.includes("ownerId") ||
            surroundingLines.includes("createdBy") ||
            surroundingLines.includes("belongsTo");

          if (!hasOwnershipCheck) {
            vulnerabilities.push({
              id: generateVulnId(),
              category: "access_control",
              owasp: "A01:2021-Broken Access Control",
              severity: "high",
              status: "review",
              title: "Potential IDOR Vulnerability",
              description: `Database query using request parameter without apparent ownership verification`,
              location: {
                file: relativePath,
                line: lineNumber,
                codeSnippet: getCodeSnippet(content, lineNumber),
              },
              risk: "Users may access or modify resources belonging to other users by manipulating IDs",
              remediation: "Verify resource ownership: WHERE id = $1 AND userId = $2",
              cweId: "CWE-639",
              confidence: 0.65,
              autoFixable: false,
            });
          }
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
 * Detect insecure cookie configurations
 */
function detectInsecureCookies(ctx: SecurityDetectionContext): SecurityVulnerability[] {
  const vulnerabilities: SecurityVulnerability[] = [];
  const { content, relativePath } = ctx;

  // Insecure cookie patterns
  const insecureCookiePatterns = [
    {
      regex: /httpOnly\s*:\s*false/gi,
      issue: "Cookie without HttpOnly flag",
      severity: "high" as const,
      risk: "Cookie can be accessed via JavaScript, enabling XSS-based session theft",
      remediation: "Set httpOnly: true for session cookies",
    },
    {
      regex: /secure\s*:\s*false/gi,
      issue: "Cookie without Secure flag",
      severity: "medium" as const,
      risk: "Cookie sent over unencrypted HTTP connections",
      remediation: "Set secure: true to only send cookies over HTTPS",
    },
    {
      regex: /sameSite\s*:\s*['"`]none['"`]/gi,
      issue: "Cookie with SameSite=None",
      severity: "medium" as const,
      risk: "Cookie sent with cross-site requests, potentially enabling CSRF",
      remediation: "Use sameSite: 'strict' or 'lax' unless cross-site is required",
    },
  ];

  for (const pattern of insecureCookiePatterns) {
    const matches = content.matchAll(pattern.regex);
    for (const match of matches) {
      const lineNumber = content.substring(0, match.index).split("\n").length;

      vulnerabilities.push({
        id: generateVulnId(),
        category: "access_control",
        owasp: "A01:2021-Broken Access Control",
        severity: pattern.severity,
        status: "needs_fix",
        title: pattern.issue,
        description: pattern.issue,
        location: {
          file: relativePath,
          line: lineNumber,
          codeSnippet: match[0],
        },
        risk: pattern.risk,
        remediation: pattern.remediation,
        cweId: "CWE-614",
        confidence: 0.9,
        autoFixable: true,
        autoFixSuggestion: pattern.remediation,
      });
    }
  }

  return vulnerabilities;
}

/**
 * Detect positive access control patterns
 */
function detectPositiveAccessControlPatterns(ctx: SecurityDetectionContext): PositiveSecurityPractice[] {
  const patterns: PositiveSecurityPractice[] = [];
  const { imports, relativePath, content } = ctx;

  // Check for RBAC/ABAC libraries
  const authLibraries = [
    { lib: "casl", name: "CASL ABAC" },
    { lib: "@casl/ability", name: "CASL Ability" },
    { lib: "accesscontrol", name: "AccessControl RBAC" },
    { lib: "casbin", name: "Casbin Authorization" },
    { lib: "passport", name: "Passport.js Authentication" },
  ];

  for (const { lib, name } of authLibraries) {
    if (imports.some((imp) => imp.source.includes(lib))) {
      patterns.push({
        id: generatePositiveId(),
        category: "access_control",
        title: `Authorization Library: ${name}`,
        description: `Uses ${name} for access control`,
        location: { file: relativePath },
        benefit: "Centralized, well-tested authorization logic",
      });
      break;
    }
  }

  // Check for authentication middleware
  if (
    content.includes("preHandler") &&
    (content.includes("authenticate") || content.includes("verifyToken") || content.includes("requireAuth"))
  ) {
    patterns.push({
      id: generatePositiveId(),
      category: "access_control",
      title: "Authentication Middleware",
      description: "Routes use authentication middleware (preHandler)",
      location: { file: relativePath },
      benefit: "Ensures requests are authenticated before processing",
    });
  }

  // Check for secure cookie settings
  if (content.includes("httpOnly: true") && content.includes("secure: true")) {
    patterns.push({
      id: generatePositiveId(),
      category: "access_control",
      title: "Secure Cookie Configuration",
      description: "Cookies configured with httpOnly and secure flags",
      location: { file: relativePath },
      benefit: "Protects session cookies from XSS and network interception",
    });
  }

  // Check for CORS with specific origins
  const corsWithOrigins = /cors\s*\(\s*\{[^}]*origin\s*:\s*\[['"][^*]/;
  if (corsWithOrigins.test(content)) {
    patterns.push({
      id: generatePositiveId(),
      category: "access_control",
      title: "CORS with Specific Origins",
      description: "CORS configured with explicit allowed origins",
      location: { file: relativePath },
      benefit: "Restricts cross-origin requests to trusted domains only",
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
export function resetAccessControlCounters(): void {
  vulnIdCounter = 0;
  positiveIdCounter = 0;
}
