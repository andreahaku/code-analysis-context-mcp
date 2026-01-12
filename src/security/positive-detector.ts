/**
 * Positive Security Patterns Detector
 * Detects good security practices across all frameworks
 *
 * Detects:
 * - Input validation (Zod, Yup, Joi)
 * - Parameterized queries
 * - Password hashing (bcrypt, argon2)
 * - Security headers (Helmet)
 * - Rate limiting
 * - Secure storage usage
 * - Error boundaries
 * - CSP implementation
 * - Security testing
 */

import type {
  SecurityDetectionContext,
  SecurityDetectorResult,
  PositiveSecurityPractice,
} from "../types/index.js";

let positiveIdCounter = 0;

function generatePositiveId(): string {
  return `POS-${String(++positiveIdCounter).padStart(3, "0")}`;
}

/**
 * Main positive patterns detector
 */
export async function detectPositivePatterns(
  ctx: SecurityDetectionContext
): Promise<SecurityDetectorResult> {
  const positivePatterns: PositiveSecurityPractice[] = [];

  // Run all positive pattern detectors
  positivePatterns.push(...detectInputValidation(ctx));
  positivePatterns.push(...detectSecureQueries(ctx));
  positivePatterns.push(...detectPasswordHashing(ctx));
  positivePatterns.push(...detectSecurityHeaders(ctx));
  positivePatterns.push(...detectRateLimiting(ctx));
  positivePatterns.push(...detectSecureStorage(ctx));
  positivePatterns.push(...detectErrorHandling(ctx));
  positivePatterns.push(...detectSecurityTesting(ctx));
  positivePatterns.push(...detectCSPImplementation(ctx));
  positivePatterns.push(...detectAuthenticationPatterns(ctx));

  // Deduplicate patterns by title + file
  const seen = new Set<string>();
  const uniquePatterns = positivePatterns.filter((p) => {
    const key = `${p.title}:${p.location.file}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { vulnerabilities: [], positivePatterns: uniquePatterns };
}

/**
 * Detect input validation libraries and patterns
 */
function detectInputValidation(ctx: SecurityDetectionContext): PositiveSecurityPractice[] {
  const patterns: PositiveSecurityPractice[] = [];
  const { imports, relativePath, framework } = ctx;

  // Zod validation
  if (imports.some((imp) => imp.source === "zod")) {
    patterns.push({
      id: generatePositiveId(),
      category: "input_validation",
      title: "Zod Schema Validation",
      description: "Uses Zod for runtime type validation and parsing",
      location: { file: relativePath },
      benefit: "Type-safe input validation with excellent TypeScript integration",
      framework,
    });
  }

  // Yup validation
  if (imports.some((imp) => imp.source === "yup")) {
    patterns.push({
      id: generatePositiveId(),
      category: "input_validation",
      title: "Yup Schema Validation",
      description: "Uses Yup for object schema validation",
      location: { file: relativePath },
      benefit: "Declarative validation with good React form integration",
      framework,
    });
  }

  // Joi validation
  if (imports.some((imp) => imp.source === "joi" || imp.source === "@hapi/joi")) {
    patterns.push({
      id: generatePositiveId(),
      category: "input_validation",
      title: "Joi Schema Validation",
      description: "Uses Joi for object schema validation",
      location: { file: relativePath },
      benefit: "Powerful validation library with extensive features",
      framework,
    });
  }

  // Valibot
  if (imports.some((imp) => imp.source === "valibot")) {
    patterns.push({
      id: generatePositiveId(),
      category: "input_validation",
      title: "Valibot Validation",
      description: "Uses Valibot for lightweight schema validation",
      location: { file: relativePath },
      benefit: "Modular, tree-shakeable validation library",
      framework,
    });
  }

  // class-validator (NestJS)
  if (imports.some((imp) => imp.source === "class-validator")) {
    patterns.push({
      id: generatePositiveId(),
      category: "input_validation",
      title: "Class Validator",
      description: "Uses class-validator for decorator-based validation",
      location: { file: relativePath },
      benefit: "Integrates well with NestJS and TypeORM",
      framework,
    });
  }

  // AJV (JSON Schema)
  if (imports.some((imp) => imp.source === "ajv")) {
    patterns.push({
      id: generatePositiveId(),
      category: "input_validation",
      title: "AJV JSON Schema Validation",
      description: "Uses AJV for JSON Schema validation",
      location: { file: relativePath },
      benefit: "Fast JSON Schema validation, great for API validation",
      framework,
    });
  }

  // Express-validator
  if (imports.some((imp) => imp.source === "express-validator")) {
    patterns.push({
      id: generatePositiveId(),
      category: "input_validation",
      title: "Express Validator",
      description: "Uses express-validator for request validation",
      location: { file: relativePath },
      benefit: "Middleware-based validation for Express",
      framework,
    });
  }

  return patterns;
}

/**
 * Detect secure database query patterns
 */
function detectSecureQueries(ctx: SecurityDetectionContext): PositiveSecurityPractice[] {
  const patterns: PositiveSecurityPractice[] = [];
  const { content, relativePath, framework, imports } = ctx;

  // Parameterized queries (PostgreSQL style)
  if (/\.query\s*\([^)]*\$[0-9]+/g.test(content)) {
    patterns.push({
      id: generatePositiveId(),
      category: "injection",
      title: "Parameterized PostgreSQL Queries",
      description: "Uses parameterized queries with $1, $2, etc. placeholders",
      location: { file: relativePath },
      benefit: "Prevents SQL injection by separating SQL from data",
      framework,
    });
  }

  // Parameterized queries (MySQL style)
  if (/\.query\s*\([^)]*\?/g.test(content) || /\.execute\s*\([^)]*\?/g.test(content)) {
    patterns.push({
      id: generatePositiveId(),
      category: "injection",
      title: "Parameterized MySQL Queries",
      description: "Uses parameterized queries with ? placeholders",
      location: { file: relativePath },
      benefit: "Prevents SQL injection by separating SQL from data",
      framework,
    });
  }

  // Prisma ORM
  if (imports.some((imp) => imp.source === "@prisma/client")) {
    patterns.push({
      id: generatePositiveId(),
      category: "injection",
      title: "Prisma ORM Usage",
      description: "Uses Prisma ORM for database access",
      location: { file: relativePath },
      benefit: "Type-safe database queries with built-in SQL injection prevention",
      framework,
    });
  }

  // Drizzle ORM
  if (imports.some((imp) => imp.source.includes("drizzle-orm"))) {
    patterns.push({
      id: generatePositiveId(),
      category: "injection",
      title: "Drizzle ORM Usage",
      description: "Uses Drizzle ORM for database access",
      location: { file: relativePath },
      benefit: "Type-safe SQL builder with prepared statements",
      framework,
    });
  }

  // TypeORM
  if (imports.some((imp) => imp.source === "typeorm")) {
    patterns.push({
      id: generatePositiveId(),
      category: "injection",
      title: "TypeORM Usage",
      description: "Uses TypeORM for database operations",
      location: { file: relativePath },
      benefit: "ORM with built-in query parameterization",
      framework,
    });
  }

  // Knex.js
  if (imports.some((imp) => imp.source === "knex")) {
    patterns.push({
      id: generatePositiveId(),
      category: "injection",
      title: "Knex.js Query Builder",
      description: "Uses Knex.js for database queries",
      location: { file: relativePath },
      benefit: "Query builder with automatic parameterization",
      framework,
    });
  }

  return patterns;
}

/**
 * Detect password hashing patterns
 */
function detectPasswordHashing(ctx: SecurityDetectionContext): PositiveSecurityPractice[] {
  const patterns: PositiveSecurityPractice[] = [];
  const { imports, relativePath, content, framework } = ctx;

  // bcrypt
  if (imports.some((imp) => imp.source === "bcrypt" || imp.source === "bcryptjs")) {
    patterns.push({
      id: generatePositiveId(),
      category: "cryptographic_failures",
      title: "Bcrypt Password Hashing",
      description: "Uses bcrypt for password hashing",
      location: { file: relativePath },
      benefit: "Industry-standard adaptive password hashing",
      framework,
    });
  }

  // Argon2
  if (imports.some((imp) => imp.source === "argon2")) {
    patterns.push({
      id: generatePositiveId(),
      category: "cryptographic_failures",
      title: "Argon2 Password Hashing",
      description: "Uses Argon2 for password hashing",
      location: { file: relativePath },
      benefit: "Winner of Password Hashing Competition, memory-hard algorithm",
      framework,
    });
  }

  // scrypt
  if (content.includes("scrypt") || imports.some((imp) => imp.source.includes("scrypt"))) {
    patterns.push({
      id: generatePositiveId(),
      category: "cryptographic_failures",
      title: "Scrypt Password Hashing",
      description: "Uses scrypt for password hashing",
      location: { file: relativePath },
      benefit: "Memory-hard password hashing algorithm",
      framework,
    });
  }

  return patterns;
}

/**
 * Detect security headers implementation
 */
function detectSecurityHeaders(ctx: SecurityDetectionContext): PositiveSecurityPractice[] {
  const patterns: PositiveSecurityPractice[] = [];
  const { imports, relativePath, content, framework } = ctx;

  // Helmet
  if (
    imports.some(
      (imp) =>
        imp.source === "helmet" ||
        imp.source === "@fastify/helmet"
    )
  ) {
    patterns.push({
      id: generatePositiveId(),
      category: "security_misconfiguration",
      title: "Helmet Security Headers",
      description: "Uses Helmet for HTTP security headers",
      location: { file: relativePath },
      benefit: "Sets CSP, X-Frame-Options, HSTS, and other security headers",
      framework,
    });
  }

  // Manual security headers
  const headerPatterns = [
    { header: "Content-Security-Policy", name: "CSP Header" },
    { header: "X-Frame-Options", name: "X-Frame-Options" },
    { header: "X-Content-Type-Options", name: "X-Content-Type-Options" },
    { header: "Strict-Transport-Security", name: "HSTS Header" },
    { header: "X-XSS-Protection", name: "XSS Protection" },
  ];

  for (const { header, name } of headerPatterns) {
    if (content.includes(header)) {
      patterns.push({
        id: generatePositiveId(),
        category: "security_misconfiguration",
        title: `${name} Implementation`,
        description: `Implements ${header} header`,
        location: { file: relativePath },
        benefit: `Security header protecting against specific attack vectors`,
        framework,
      });
    }
  }

  return patterns;
}

/**
 * Detect rate limiting implementation
 */
function detectRateLimiting(ctx: SecurityDetectionContext): PositiveSecurityPractice[] {
  const patterns: PositiveSecurityPractice[] = [];
  const { imports, relativePath, content, framework } = ctx;

  // Rate limit libraries
  const rateLimitLibraries = [
    { source: "@fastify/rate-limit", name: "Fastify Rate Limit" },
    { source: "express-rate-limit", name: "Express Rate Limit" },
    { source: "rate-limiter-flexible", name: "Rate Limiter Flexible" },
    { source: "@upstash/ratelimit", name: "Upstash Rate Limit" },
  ];

  for (const { source, name } of rateLimitLibraries) {
    if (imports.some((imp) => imp.source === source)) {
      patterns.push({
        id: generatePositiveId(),
        category: "security_misconfiguration",
        title: name,
        description: `Uses ${name} for request rate limiting`,
        location: { file: relativePath },
        benefit: "Protects against brute force, DoS, and abuse",
        framework,
      });
    }
  }

  // Generic rate limiting patterns
  if (content.includes("rateLimit") || content.includes("rateLimiter")) {
    if (!patterns.some((p) => p.title.includes("Rate Limit"))) {
      patterns.push({
        id: generatePositiveId(),
        category: "security_misconfiguration",
        title: "Rate Limiting Implementation",
        description: "Implements rate limiting",
        location: { file: relativePath },
        benefit: "Protects against abuse and DoS attacks",
        framework,
      });
    }
  }

  return patterns;
}

/**
 * Detect secure storage patterns
 */
function detectSecureStorage(ctx: SecurityDetectionContext): PositiveSecurityPractice[] {
  const patterns: PositiveSecurityPractice[] = [];
  const { imports, relativePath, framework } = ctx;

  // Mobile secure storage
  if (imports.some((imp) => imp.source === "expo-secure-store")) {
    patterns.push({
      id: generatePositiveId(),
      category: "cryptographic_failures",
      title: "Expo SecureStore",
      description: "Uses expo-secure-store for sensitive data",
      location: { file: relativePath },
      benefit: "Encrypted storage using iOS Keychain / Android Keystore",
      framework,
    });
  }

  if (imports.some((imp) => imp.source === "react-native-keychain")) {
    patterns.push({
      id: generatePositiveId(),
      category: "cryptographic_failures",
      title: "React Native Keychain",
      description: "Uses react-native-keychain for credentials",
      location: { file: relativePath },
      benefit: "Secure credential storage in device secure enclave",
      framework,
    });
  }

  if (imports.some((imp) => imp.source === "react-native-encrypted-storage")) {
    patterns.push({
      id: generatePositiveId(),
      category: "cryptographic_failures",
      title: "Encrypted Storage",
      description: "Uses react-native-encrypted-storage",
      location: { file: relativePath },
      benefit: "AsyncStorage alternative with encryption",
      framework,
    });
  }

  // Web secure storage patterns
  if (imports.some((imp) => imp.source === "secure-ls")) {
    patterns.push({
      id: generatePositiveId(),
      category: "cryptographic_failures",
      title: "Secure LocalStorage",
      description: "Uses secure-ls for encrypted localStorage",
      location: { file: relativePath },
      benefit: "Encrypts data before storing in localStorage",
      framework,
    });
  }

  return patterns;
}

/**
 * Detect error handling patterns
 */
function detectErrorHandling(ctx: SecurityDetectionContext): PositiveSecurityPractice[] {
  const patterns: PositiveSecurityPractice[] = [];
  const { relativePath, content, framework } = ctx;

  // React Error Boundary
  if (content.includes("ErrorBoundary") || content.includes("componentDidCatch")) {
    patterns.push({
      id: generatePositiveId(),
      category: "security_misconfiguration",
      title: "React Error Boundary",
      description: "Implements Error Boundary for error handling",
      location: { file: relativePath },
      benefit: "Prevents error details from leaking to users",
      framework,
    });
  }

  // Vue error handler
  if (content.includes("app.config.errorHandler") || content.includes("onErrorCaptured")) {
    patterns.push({
      id: generatePositiveId(),
      category: "security_misconfiguration",
      title: "Vue Error Handler",
      description: "Implements global error handler",
      location: { file: relativePath },
      benefit: "Centralized error handling prevents info leakage",
      framework,
    });
  }

  // Fastify error handler
  if (content.includes("setErrorHandler")) {
    patterns.push({
      id: generatePositiveId(),
      category: "security_misconfiguration",
      title: "Fastify Error Handler",
      description: "Custom error handler implementation",
      location: { file: relativePath },
      benefit: "Controls error responses to prevent info disclosure",
      framework,
    });
  }

  // Express error middleware
  if (content.includes("err, req, res, next")) {
    patterns.push({
      id: generatePositiveId(),
      category: "security_misconfiguration",
      title: "Express Error Middleware",
      description: "Error handling middleware",
      location: { file: relativePath },
      benefit: "Centralized error handling prevents stack trace exposure",
      framework,
    });
  }

  return patterns;
}

/**
 * Detect security testing patterns
 */
function detectSecurityTesting(ctx: SecurityDetectionContext): PositiveSecurityPractice[] {
  const patterns: PositiveSecurityPractice[] = [];
  const { content, relativePath, framework } = ctx;

  // Security-focused test patterns
  if (relativePath.includes(".test.") || relativePath.includes(".spec.")) {
    // XSS testing
    if (content.includes("<script>") || content.includes("XSS") || content.includes("xss")) {
      patterns.push({
        id: generatePositiveId(),
        category: "injection",
        title: "XSS Testing",
        description: "Tests include XSS attack scenarios",
        location: { file: relativePath },
        benefit: "Validates XSS protection effectiveness",
        framework,
      });
    }

    // SQL injection testing
    if (
      content.includes("SQL injection") ||
      content.includes("sqlinjection") ||
      content.includes("'; DROP") ||
      content.includes("OR 1=1")
    ) {
      patterns.push({
        id: generatePositiveId(),
        category: "injection",
        title: "SQL Injection Testing",
        description: "Tests include SQL injection scenarios",
        location: { file: relativePath },
        benefit: "Validates SQL injection protection",
        framework,
      });
    }

    // Auth testing
    if (content.includes("unauthorized") || content.includes("401") || content.includes("403")) {
      patterns.push({
        id: generatePositiveId(),
        category: "access_control",
        title: "Authentication Testing",
        description: "Tests validate authentication/authorization",
        location: { file: relativePath },
        benefit: "Ensures access control works correctly",
        framework,
      });
    }
  }

  return patterns;
}

/**
 * Detect CSP implementation
 */
function detectCSPImplementation(ctx: SecurityDetectionContext): PositiveSecurityPractice[] {
  const patterns: PositiveSecurityPractice[] = [];
  const { content, relativePath, framework } = ctx;

  // CSP meta tag
  if (content.includes('http-equiv="Content-Security-Policy"')) {
    patterns.push({
      id: generatePositiveId(),
      category: "injection",
      title: "CSP Meta Tag",
      description: "Implements Content Security Policy via meta tag",
      location: { file: relativePath },
      benefit: "Mitigates XSS by controlling resource loading",
      framework,
    });
  }

  // CSP with nonce
  if (content.includes("nonce-") || content.includes("'nonce-")) {
    patterns.push({
      id: generatePositiveId(),
      category: "injection",
      title: "CSP with Nonce",
      description: "Uses nonce-based CSP for inline scripts",
      location: { file: relativePath },
      benefit: "Allows specific inline scripts while blocking others",
      framework,
    });
  }

  // Nuxt CSP
  if (content.includes("csp:") && (relativePath.includes("nuxt.config") || relativePath.includes("nuxt.config"))) {
    patterns.push({
      id: generatePositiveId(),
      category: "injection",
      title: "Nuxt CSP Configuration",
      description: "Configures CSP in Nuxt config",
      location: { file: relativePath },
      benefit: "Framework-integrated CSP management",
      framework,
    });
  }

  return patterns;
}

/**
 * Detect authentication patterns
 */
function detectAuthenticationPatterns(ctx: SecurityDetectionContext): PositiveSecurityPractice[] {
  const patterns: PositiveSecurityPractice[] = [];
  const { imports, relativePath, content, framework } = ctx;

  // JWT with proper libraries
  if (imports.some((imp) => imp.source === "jsonwebtoken" || imp.source === "jose")) {
    // Check for verify usage (not just sign)
    if (content.includes("verify") || content.includes("jwtVerify")) {
      patterns.push({
        id: generatePositiveId(),
        category: "access_control",
        title: "JWT Token Verification",
        description: "Properly verifies JWT tokens",
        location: { file: relativePath },
        benefit: "Ensures token authenticity and integrity",
        framework,
      });
    }
  }

  // OAuth libraries
  const oauthLibraries = [
    { source: "passport", name: "Passport.js" },
    { source: "@auth/core", name: "Auth.js" },
    { source: "next-auth", name: "NextAuth" },
    { source: "nuxt-auth-utils", name: "Nuxt Auth Utils" },
  ];

  for (const { source, name } of oauthLibraries) {
    if (imports.some((imp) => imp.source === source || imp.source.startsWith(source))) {
      patterns.push({
        id: generatePositiveId(),
        category: "access_control",
        title: `${name} Authentication`,
        description: `Uses ${name} for authentication`,
        location: { file: relativePath },
        benefit: "Battle-tested authentication implementation",
        framework,
      });
    }
  }

  // MFA/2FA patterns
  if (
    imports.some((imp) => imp.source.includes("totp") || imp.source.includes("2fa") || imp.source.includes("otp")) ||
    content.includes("twoFactor") ||
    content.includes("mfa") ||
    content.includes("authenticator")
  ) {
    patterns.push({
      id: generatePositiveId(),
      category: "access_control",
      title: "Multi-Factor Authentication",
      description: "Implements MFA/2FA",
      location: { file: relativePath },
      benefit: "Additional authentication layer beyond password",
      framework,
    });
  }

  // Session management
  if (imports.some((imp) => imp.source.includes("session") || imp.source === "@fastify/session")) {
    patterns.push({
      id: generatePositiveId(),
      category: "access_control",
      title: "Session Management",
      description: "Implements server-side sessions",
      location: { file: relativePath },
      benefit: "Secure session handling with server-side storage",
      framework,
    });
  }

  return patterns;
}

/**
 * Reset counters (useful for testing)
 */
export function resetPositiveCounters(): void {
  positiveIdCounter = 0;
}
