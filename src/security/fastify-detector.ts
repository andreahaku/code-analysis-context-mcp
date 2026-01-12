/**
 * Fastify/Backend Security Detector
 * Fastify and General Backend Specific
 *
 * Detects:
 * - Routes without schema validation
 * - Missing rate limiting
 * - Missing authentication hooks
 * - Database credentials in code
 * - Kafka/messaging credentials exposure
 * - Sensitive data in logs
 * - Missing input sanitization
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
  return `FASTIFY-${String(++vulnIdCounter).padStart(3, "0")}`;
}

function generatePositiveId(): string {
  return `FASTIFY-POS-${String(++positiveIdCounter).padStart(3, "0")}`;
}

/**
 * Main Fastify security detector
 */
export async function detectFastifyVulnerabilities(
  ctx: SecurityDetectionContext
): Promise<SecurityDetectorResult> {
  const { framework } = ctx;

  // Only run for Fastify/Node backends
  if (framework !== "fastify" && framework !== "node") {
    return { vulnerabilities: [], positivePatterns: [] };
  }

  const vulnerabilities: SecurityVulnerability[] = [];
  const positivePatterns: PositiveSecurityPractice[] = [];

  // Run all sub-detectors
  vulnerabilities.push(...detectMissingSchemaValidation(ctx));
  vulnerabilities.push(...detectMissingRateLimiting(ctx));
  vulnerabilities.push(...detectDatabaseCredentials(ctx));
  vulnerabilities.push(...detectKafkaCredentials(ctx));
  vulnerabilities.push(...detectMissingAuthHooks(ctx));
  vulnerabilities.push(...detectSensitiveLogs(ctx));

  // Detect positive patterns
  positivePatterns.push(...detectPositiveFastifyPatterns(ctx));

  return { vulnerabilities, positivePatterns };
}

/**
 * Detect routes without schema validation
 */
function detectMissingSchemaValidation(ctx: SecurityDetectionContext): SecurityVulnerability[] {
  const vulnerabilities: SecurityVulnerability[] = [];
  const { ast, relativePath, content, framework } = ctx;

  const checkNode = (node: any) => {
    if (!node || typeof node !== "object") return;

    // Check Fastify route definitions
    if (
      node.type === "CallExpression" &&
      node.callee?.type === "MemberExpression"
    ) {
      const methodName = node.callee?.property?.name?.toLowerCase();
      const httpMethods = ["post", "put", "patch"];

      if (httpMethods.includes(methodName)) {
        const args = node.arguments || [];

        // Routes with body should have schema
        let hasSchema = false;

        for (const arg of args) {
          if (arg.type === "ObjectExpression") {
            hasSchema = arg.properties?.some(
              (prop: any) => prop.key?.name === "schema"
            );
          }
        }

        if (!hasSchema) {
          const pathArg = args[0];
          const path = pathArg?.value || pathArg?.quasis?.[0]?.value?.raw || "unknown";

          vulnerabilities.push({
            id: generateVulnId(),
            category: "input_validation",
            owasp: "A03:2021-Injection",
            severity: "medium",
            status: "review",
            title: "Route Without Schema Validation",
            description: `${methodName.toUpperCase()} route '${path}' does not have schema validation`,
            location: {
              file: relativePath,
              line: node.loc?.start?.line || 0,
              codeSnippet: getCodeSnippet(content, node.loc?.start?.line),
            },
            risk: "Routes without schema validation are vulnerable to injection and malformed input attacks",
            remediation: "Add JSON Schema validation: { schema: { body: { type: 'object', properties: {...} } } }",
            cweId: "CWE-20",
            confidence: 0.7,
            framework,
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
 * Detect missing rate limiting
 */
function detectMissingRateLimiting(ctx: SecurityDetectionContext): SecurityVulnerability[] {
  const vulnerabilities: SecurityVulnerability[] = [];
  const { content, relativePath, imports, framework } = ctx;

  // Check if this is a routes/server file
  const isRouteFile =
    relativePath.includes("route") ||
    relativePath.includes("server") ||
    relativePath.includes("app") ||
    relativePath.includes("index");

  if (!isRouteFile) return vulnerabilities;

  // Check for rate limiting plugins/middleware
  const hasRateLimiting =
    imports.some(
      (imp) =>
        imp.source.includes("rate-limit") ||
        imp.source.includes("ratelimit") ||
        imp.source === "@fastify/rate-limit"
    ) ||
    content.includes("rateLimit") ||
    content.includes("rate-limit");

  // Check for auth endpoints that need rate limiting
  const authEndpointPatterns = [
    /\.(post|get)\s*\(\s*['"`].*login/gi,
    /\.(post|get)\s*\(\s*['"`].*auth/gi,
    /\.(post|get)\s*\(\s*['"`].*register/gi,
    /\.(post|get)\s*\(\s*['"`].*password/gi,
    /\.(post|get)\s*\(\s*['"`].*forgot/gi,
    /\.(post|get)\s*\(\s*['"`].*reset/gi,
  ];

  const hasAuthEndpoints = authEndpointPatterns.some((p) => p.test(content));

  if (hasAuthEndpoints && !hasRateLimiting) {
    vulnerabilities.push({
      id: generateVulnId(),
      category: "security_misconfiguration",
      owasp: "A05:2021-Security Misconfiguration",
      severity: "medium",
      status: "needs_fix",
      title: "Authentication Endpoints Without Rate Limiting",
      description: "Authentication endpoints do not appear to have rate limiting",
      location: { file: relativePath, line: 0 },
      risk: "Without rate limiting, authentication endpoints are vulnerable to brute force attacks",
      remediation: "Add @fastify/rate-limit plugin: fastify.register(require('@fastify/rate-limit'), { max: 5, timeWindow: '1 minute' })",
      cweId: "CWE-307",
      confidence: 0.7,
      framework,
      autoFixable: false,
    });
  }

  return vulnerabilities;
}

/**
 * Detect database credentials in code
 */
function detectDatabaseCredentials(ctx: SecurityDetectionContext): SecurityVulnerability[] {
  const vulnerabilities: SecurityVulnerability[] = [];
  const { content, relativePath, framework } = ctx;

  // PostgreSQL connection strings
  const pgConnectionPatterns = [
    {
      regex: /postgres(ql)?:\/\/[^:]+:[^@]+@[^/]+/gi,
      type: "PostgreSQL connection string",
    },
    {
      regex: /host\s*[:=]\s*['"`][^'"`]+['"`]\s*,?\s*user\s*[:=]\s*['"`][^'"`]+['"`]\s*,?\s*password\s*[:=]\s*['"`][^'"`]+['"`]/gi,
      type: "PostgreSQL config object",
    },
    {
      regex: /connectionString\s*[:=]\s*['"`]postgres/gi,
      type: "PostgreSQL connection string",
    },
  ];

  for (const pattern of pgConnectionPatterns) {
    const matches = content.matchAll(pattern.regex);
    for (const match of matches) {
      // Skip if it's from env variable
      if (match[0].includes("process.env") || match[0].includes("${")) continue;

      const lineNumber = content.substring(0, match.index).split("\n").length;

      vulnerabilities.push({
        id: generateVulnId(),
        category: "cryptographic_failures",
        owasp: "A02:2021-Cryptographic Failures",
        severity: "critical",
        status: "needs_fix",
        title: `Hardcoded ${pattern.type}`,
        description: "Database credentials hardcoded in source code",
        location: {
          file: relativePath,
          line: lineNumber,
          codeSnippet: match[0].substring(0, 50) + "...",
        },
        risk: "Database credentials in code can be extracted from version control or deployed bundles",
        remediation: "Use environment variables: process.env.DATABASE_URL",
        cweId: "CWE-798",
        confidence: 0.95,
        framework,
        autoFixable: false,
      });
    }
  }

  // MySQL/MariaDB patterns
  const mysqlPatterns = [
    /mysql:\/\/[^:]+:[^@]+@[^/]+/gi,
    /createConnection\s*\(\s*\{\s*[^}]*password\s*:\s*['"`][^'"`]+['"`]/gi,
  ];

  for (const pattern of mysqlPatterns) {
    const matches = content.matchAll(pattern);
    for (const match of matches) {
      if (match[0].includes("process.env")) continue;

      const lineNumber = content.substring(0, match.index).split("\n").length;

      vulnerabilities.push({
        id: generateVulnId(),
        category: "cryptographic_failures",
        owasp: "A02:2021-Cryptographic Failures",
        severity: "critical",
        status: "needs_fix",
        title: "Hardcoded MySQL Credentials",
        description: "MySQL database credentials hardcoded in source code",
        location: {
          file: relativePath,
          line: lineNumber,
          codeSnippet: match[0].substring(0, 50) + "...",
        },
        risk: "Database credentials in code can be extracted and used to access the database",
        remediation: "Use environment variables for database credentials",
        cweId: "CWE-798",
        confidence: 0.95,
        framework,
        autoFixable: false,
      });
    }
  }

  // MongoDB patterns
  const mongoPatterns = [
    /mongodb(\+srv)?:\/\/[^:]+:[^@]+@[^/]+/gi,
  ];

  for (const pattern of mongoPatterns) {
    const matches = content.matchAll(pattern);
    for (const match of matches) {
      if (match[0].includes("process.env")) continue;

      const lineNumber = content.substring(0, match.index).split("\n").length;

      vulnerabilities.push({
        id: generateVulnId(),
        category: "cryptographic_failures",
        owasp: "A02:2021-Cryptographic Failures",
        severity: "critical",
        status: "needs_fix",
        title: "Hardcoded MongoDB Credentials",
        description: "MongoDB connection string with credentials hardcoded",
        location: {
          file: relativePath,
          line: lineNumber,
          codeSnippet: match[0].substring(0, 50) + "...",
        },
        risk: "Database credentials in code can be extracted from source control",
        remediation: "Use environment variables: process.env.MONGODB_URI",
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
 * Detect Kafka and messaging credentials
 */
function detectKafkaCredentials(ctx: SecurityDetectionContext): SecurityVulnerability[] {
  const vulnerabilities: SecurityVulnerability[] = [];
  const { content, relativePath, framework } = ctx;

  // Kafka configurations with credentials
  const kafkaPatterns = [
    {
      regex: /sasl\s*:\s*\{[^}]*username\s*:\s*['"`][^'"`]+['"`]/gi,
      type: "Kafka SASL credentials",
    },
    {
      regex: /sasl\s*:\s*\{[^}]*password\s*:\s*['"`][^'"`]+['"`]/gi,
      type: "Kafka SASL password",
    },
    {
      regex: /brokers\s*:\s*\[[^\]]*\]\s*,\s*[^}]*password/gi,
      type: "Kafka broker config",
    },
  ];

  for (const pattern of kafkaPatterns) {
    const matches = content.matchAll(pattern.regex);
    for (const match of matches) {
      // Skip env variables
      if (match[0].includes("process.env") || match[0].includes("${")) continue;

      const lineNumber = content.substring(0, match.index).split("\n").length;

      vulnerabilities.push({
        id: generateVulnId(),
        category: "cryptographic_failures",
        owasp: "A02:2021-Cryptographic Failures",
        severity: "high",
        status: "needs_fix",
        title: `Hardcoded ${pattern.type}`,
        description: "Kafka/messaging credentials hardcoded in source code",
        location: {
          file: relativePath,
          line: lineNumber,
          codeSnippet: match[0].substring(0, 50) + "...",
        },
        risk: "Messaging system credentials can be used to intercept or inject messages",
        remediation: "Use environment variables for Kafka credentials",
        cweId: "CWE-798",
        confidence: 0.9,
        framework,
        autoFixable: false,
      });
    }
  }

  // RabbitMQ patterns
  const rabbitPatterns = [
    /amqp:\/\/[^:]+:[^@]+@[^/]+/gi,
  ];

  for (const pattern of rabbitPatterns) {
    const matches = content.matchAll(pattern);
    for (const match of matches) {
      if (match[0].includes("process.env")) continue;

      const lineNumber = content.substring(0, match.index).split("\n").length;

      vulnerabilities.push({
        id: generateVulnId(),
        category: "cryptographic_failures",
        owasp: "A02:2021-Cryptographic Failures",
        severity: "high",
        status: "needs_fix",
        title: "Hardcoded RabbitMQ Credentials",
        description: "RabbitMQ connection string with credentials hardcoded",
        location: {
          file: relativePath,
          line: lineNumber,
          codeSnippet: match[0].substring(0, 50) + "...",
        },
        risk: "Message broker credentials can be used to access or manipulate messages",
        remediation: "Use environment variables: process.env.RABBITMQ_URL",
        cweId: "CWE-798",
        confidence: 0.9,
        framework,
        autoFixable: false,
      });
    }
  }

  // Redis patterns
  const redisPatterns = [
    /redis:\/\/[^:]*:[^@]+@[^/]+/gi,
    /rediss:\/\/[^:]*:[^@]+@[^/]+/gi,
  ];

  for (const pattern of redisPatterns) {
    const matches = content.matchAll(pattern);
    for (const match of matches) {
      if (match[0].includes("process.env")) continue;

      const lineNumber = content.substring(0, match.index).split("\n").length;

      vulnerabilities.push({
        id: generateVulnId(),
        category: "cryptographic_failures",
        owasp: "A02:2021-Cryptographic Failures",
        severity: "high",
        status: "needs_fix",
        title: "Hardcoded Redis Credentials",
        description: "Redis connection string with password hardcoded",
        location: {
          file: relativePath,
          line: lineNumber,
          codeSnippet: match[0].substring(0, 50) + "...",
        },
        risk: "Redis credentials can be used to access cached data or session storage",
        remediation: "Use environment variables: process.env.REDIS_URL",
        cweId: "CWE-798",
        confidence: 0.9,
        framework,
        autoFixable: false,
      });
    }
  }

  return vulnerabilities;
}

/**
 * Detect missing authentication hooks
 */
function detectMissingAuthHooks(ctx: SecurityDetectionContext): SecurityVulnerability[] {
  const vulnerabilities: SecurityVulnerability[] = [];
  const { ast, relativePath, content, framework } = ctx;

  // Check if this is a routes file
  const isRouteFile =
    relativePath.includes("route") ||
    relativePath.includes("controller") ||
    relativePath.includes("api");

  if (!isRouteFile) return vulnerabilities;

  // Check for auth middleware/hook imports
  const hasAuthImport =
    content.includes("authenticate") ||
    content.includes("verifyToken") ||
    content.includes("requireAuth") ||
    content.includes("preHandler") && content.includes("auth");

  const checkNode = (node: any) => {
    if (!node || typeof node !== "object") return;

    // Fastify routes without preHandler for sensitive paths
    if (
      node.type === "CallExpression" &&
      node.callee?.type === "MemberExpression"
    ) {
      const methodName = node.callee?.property?.name?.toLowerCase();
      const httpMethods = ["get", "post", "put", "delete", "patch"];

      if (httpMethods.includes(methodName)) {
        const args = node.arguments || [];
        const pathArg = args[0];
        const path = pathArg?.value || pathArg?.quasis?.[0]?.value?.raw || "";

        // Sensitive paths
        const sensitivePatterns = [
          /\/users?/i,
          /\/admin/i,
          /\/account/i,
          /\/settings/i,
          /\/profile/i,
          /\/api\/private/i,
          /\/payment/i,
          /\/order/i,
        ];

        const isSensitivePath = sensitivePatterns.some((p) => p.test(path));

        if (isSensitivePath) {
          // Check if route has preHandler
          let hasPreHandler = false;

          for (const arg of args) {
            if (arg.type === "ObjectExpression") {
              hasPreHandler = arg.properties?.some(
                (prop: any) =>
                  prop.key?.name === "preHandler" ||
                  prop.key?.name === "onRequest" ||
                  prop.key?.name === "beforeHandler"
              );
            }
          }

          if (!hasPreHandler && !hasAuthImport) {
            vulnerabilities.push({
              id: generateVulnId(),
              category: "access_control",
              owasp: "A01:2021-Broken Access Control",
              severity: "high",
              status: "review",
              title: "Sensitive Route Without Auth Hook",
              description: `Sensitive route '${path}' may lack authentication hook`,
              location: {
                file: relativePath,
                line: node.loc?.start?.line || 0,
                codeSnippet: getCodeSnippet(content, node.loc?.start?.line),
              },
              risk: "Sensitive endpoints without authentication can be accessed by anyone",
              remediation: "Add preHandler hook: { preHandler: [fastify.authenticate] }",
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
 * Detect sensitive data in logs
 */
function detectSensitiveLogs(ctx: SecurityDetectionContext): SecurityVulnerability[] {
  const vulnerabilities: SecurityVulnerability[] = [];
  const { content, relativePath, framework } = ctx;

  // Skip test files
  if (relativePath.includes(".test.") || relativePath.includes(".spec.")) {
    return vulnerabilities;
  }

  // Patterns for logging sensitive data
  const sensitiveLogPatterns = [
    { regex: /(?:console|logger|log)\s*\.\s*(?:log|info|debug|error)\s*\([^)]*password/gi, data: "password" },
    { regex: /(?:console|logger|log)\s*\.\s*(?:log|info|debug|error)\s*\([^)]*token/gi, data: "token" },
    { regex: /(?:console|logger|log)\s*\.\s*(?:log|info|debug|error)\s*\([^)]*secret/gi, data: "secret" },
    { regex: /(?:console|logger|log)\s*\.\s*(?:log|info|debug|error)\s*\([^)]*apiKey/gi, data: "API key" },
    { regex: /(?:console|logger|log)\s*\.\s*(?:log|info|debug|error)\s*\([^)]*credential/gi, data: "credential" },
    { regex: /(?:console|logger|log)\s*\.\s*(?:log|info|debug|error)\s*\([^)]*req\.body\)/gi, data: "request body" },
  ];

  for (const pattern of sensitiveLogPatterns) {
    const matches = content.matchAll(pattern.regex);
    for (const match of matches) {
      const lineNumber = content.substring(0, match.index).split("\n").length;

      vulnerabilities.push({
        id: generateVulnId(),
        category: "security_misconfiguration",
        owasp: "A09:2021-Security Logging and Monitoring Failures",
        severity: "medium",
        status: "needs_fix",
        title: `Logging Sensitive Data: ${pattern.data}`,
        description: `${pattern.data} may be written to logs`,
        location: {
          file: relativePath,
          line: lineNumber,
          codeSnippet: match[0].substring(0, 100),
        },
        risk: "Sensitive data in logs can be accessed by operators or leaked in log aggregation systems",
        remediation: "Remove sensitive data from logs or redact it: logger.info('Auth attempt', { user: userId })",
        cweId: "CWE-532",
        confidence: 0.75,
        framework,
        autoFixable: false,
      });
    }
  }

  // Check for logging full error stacks with potentially sensitive info
  if (/logger\s*\.\s*error\s*\([^)]*err(?:or)?\s*\)/gi.test(content)) {
    const matches = content.matchAll(/logger\s*\.\s*error\s*\([^)]*err(?:or)?\s*\)/gi);
    for (const match of matches) {
      const lineNumber = content.substring(0, match.index).split("\n").length;

      vulnerabilities.push({
        id: generateVulnId(),
        category: "security_misconfiguration",
        owasp: "A09:2021-Security Logging and Monitoring Failures",
        severity: "low",
        status: "review",
        title: "Full Error Object Logging",
        description: "Logging full error objects may expose stack traces and sensitive info",
        location: {
          file: relativePath,
          line: lineNumber,
          codeSnippet: match[0],
        },
        risk: "Stack traces in logs can reveal internal architecture and potentially sensitive data",
        remediation: "Log only necessary error properties: logger.error({ message: err.message, code: err.code })",
        cweId: "CWE-209",
        confidence: 0.5,
        framework,
        autoFixable: false,
      });
    }
  }

  return vulnerabilities;
}

/**
 * Detect positive Fastify security patterns
 */
function detectPositiveFastifyPatterns(ctx: SecurityDetectionContext): PositiveSecurityPractice[] {
  const patterns: PositiveSecurityPractice[] = [];
  const { imports, relativePath, content, framework } = ctx;

  // Check for schema validation
  if (content.includes("schema:") && content.includes("body:")) {
    patterns.push({
      id: generatePositiveId(),
      category: "input_validation",
      title: "Schema Validation",
      description: "Uses JSON Schema for request validation",
      location: { file: relativePath },
      benefit: "Prevents injection attacks and malformed input",
      framework,
    });
  }

  // Check for rate limiting
  if (
    imports.some((imp) => imp.source === "@fastify/rate-limit") ||
    content.includes("rateLimit")
  ) {
    patterns.push({
      id: generatePositiveId(),
      category: "security_misconfiguration",
      title: "Rate Limiting",
      description: "Implements rate limiting on endpoints",
      location: { file: relativePath },
      benefit: "Protects against brute force and DoS attacks",
      framework,
    });
  }

  // Check for Helmet security headers
  if (
    imports.some((imp) => imp.source === "@fastify/helmet" || imp.source === "helmet") ||
    content.includes("helmet")
  ) {
    patterns.push({
      id: generatePositiveId(),
      category: "security_misconfiguration",
      title: "Security Headers (Helmet)",
      description: "Uses Helmet for security headers",
      location: { file: relativePath },
      benefit: "Sets various HTTP headers for security",
      framework,
    });
  }

  // Check for preHandler auth hooks
  if (content.includes("preHandler") && (content.includes("auth") || content.includes("verify"))) {
    patterns.push({
      id: generatePositiveId(),
      category: "access_control",
      title: "Authentication Hooks",
      description: "Uses preHandler hooks for authentication",
      location: { file: relativePath },
      benefit: "Ensures authentication before route handlers",
      framework,
    });
  }

  // Check for environment variable usage for credentials
  if (
    content.includes("process.env.DATABASE") ||
    content.includes("process.env.DB_") ||
    content.includes("process.env.REDIS") ||
    content.includes("process.env.KAFKA")
  ) {
    patterns.push({
      id: generatePositiveId(),
      category: "cryptographic_failures",
      title: "Environment Variables for Credentials",
      description: "Uses environment variables for database/service credentials",
      location: { file: relativePath },
      benefit: "Keeps credentials out of source code",
      framework,
    });
  }

  // Check for parameterized queries
  if (content.includes("$1") || content.includes("$2") || content.includes("?")) {
    if (content.includes(".query(") || content.includes("execute(")) {
      patterns.push({
        id: generatePositiveId(),
        category: "injection",
        title: "Parameterized Queries",
        description: "Uses parameterized queries for database operations",
        location: { file: relativePath },
        benefit: "Prevents SQL injection attacks",
        framework,
      });
    }
  }

  // Check for CORS configuration with specific origins
  if (content.includes("@fastify/cors") || content.includes("cors")) {
    if (content.includes("origin:") && !content.includes("origin: '*'") && !content.includes('origin: "*')) {
      patterns.push({
        id: generatePositiveId(),
        category: "access_control",
        title: "Configured CORS",
        description: "CORS configured with specific origins",
        location: { file: relativePath },
        benefit: "Restricts cross-origin requests to trusted domains",
        framework,
      });
    }
  }

  // Check for input sanitization
  if (
    imports.some(
      (imp) =>
        imp.source.includes("sanitize") ||
        imp.source.includes("xss") ||
        imp.source.includes("validator")
    ) ||
    content.includes("sanitize") ||
    content.includes("escape")
  ) {
    patterns.push({
      id: generatePositiveId(),
      category: "injection",
      title: "Input Sanitization",
      description: "Uses input sanitization/validation library",
      location: { file: relativePath },
      benefit: "Prevents XSS and injection attacks",
      framework,
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
export function resetFastifyCounters(): void {
  vulnIdCounter = 0;
  positiveIdCounter = 0;
}
