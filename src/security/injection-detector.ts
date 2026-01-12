/**
 * Injection Vulnerability Detector
 * OWASP A03:2021 - Injection
 *
 * Detects:
 * - SQL Injection (string concatenation/template literals in queries)
 * - XSS (dangerouslySetInnerHTML, v-html, innerHTML)
 * - Command Injection (exec, spawn with user input)
 * - NoSQL Injection (unsanitized MongoDB queries)
 * - Template Injection (eval, new Function)
 * - Path Traversal (unsanitized file paths)
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
  return `INJ-${String(++vulnIdCounter).padStart(3, "0")}`;
}

function generatePositiveId(): string {
  return `INJ-POS-${String(++positiveIdCounter).padStart(3, "0")}`;
}

/**
 * Main injection vulnerability detector
 */
export async function detectInjectionVulnerabilities(
  ctx: SecurityDetectionContext
): Promise<SecurityDetectorResult> {
  const vulnerabilities: SecurityVulnerability[] = [];
  const positivePatterns: PositiveSecurityPractice[] = [];

  // Run all sub-detectors
  vulnerabilities.push(...detectSQLInjection(ctx));
  vulnerabilities.push(...detectXSSVulnerabilities(ctx));
  vulnerabilities.push(...detectCommandInjection(ctx));
  vulnerabilities.push(...detectNoSQLInjection(ctx));
  vulnerabilities.push(...detectTemplateInjection(ctx));
  vulnerabilities.push(...detectPathTraversal(ctx));

  // Detect positive patterns
  positivePatterns.push(...detectPositiveInjectionPatterns(ctx));

  return { vulnerabilities, positivePatterns };
}

/**
 * Detect SQL Injection vulnerabilities
 */
function detectSQLInjection(ctx: SecurityDetectionContext): SecurityVulnerability[] {
  const vulnerabilities: SecurityVulnerability[] = [];
  const { ast, relativePath, content } = ctx;

  const checkNode = (node: any) => {
    if (!node || typeof node !== "object") return;

    // Pattern 1: Template literals with SQL keywords and interpolation
    if (node.type === "TemplateLiteral" && node.expressions?.length > 0) {
      const quasis = node.quasis || [];
      const fullText = quasis.map((q: any) => q.value?.raw || "").join(" ");
      const upperText = fullText.toUpperCase();

      const sqlKeywords = ["SELECT", "INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE", "TRUNCATE"];
      const hasSqlKeyword = sqlKeywords.some((kw) => upperText.includes(kw));

      if (hasSqlKeyword) {
        // Check if this is NOT using parameterized pattern ($1, $2)
        const hasParameterized = /\$\d+/.test(fullText);
        if (!hasParameterized) {
          vulnerabilities.push({
            id: generateVulnId(),
            category: "injection",
            owasp: "A03:2021-Injection",
            severity: "high",
            status: "needs_fix",
            title: "SQL Injection via Template Literal",
            description: `Template literal with SQL keywords contains interpolated values without parameterization`,
            location: {
              file: relativePath,
              line: node.loc?.start?.line || 0,
              codeSnippet: getCodeSnippet(content, node.loc?.start?.line),
            },
            risk: "Attackers can inject malicious SQL to access, modify, or delete database data",
            remediation: "Use parameterized queries with placeholders ($1, $2) instead of string interpolation",
            cweId: "CWE-89",
            confidence: 0.85,
            autoFixable: false,
            references: ["https://owasp.org/Top10/A03_2021-Injection/"],
          });
        }
      }
    }

    // Pattern 2: String concatenation in .query() calls
    if (
      node.type === "CallExpression" &&
      node.callee?.type === "MemberExpression" &&
      node.callee?.property?.name === "query"
    ) {
      const queryArg = node.arguments?.[0];

      // Check for binary expression (string concatenation)
      if (queryArg?.type === "BinaryExpression" && queryArg?.operator === "+") {
        vulnerabilities.push({
          id: generateVulnId(),
          category: "injection",
          owasp: "A03:2021-Injection",
          severity: "high",
          status: "needs_fix",
          title: "SQL Injection via String Concatenation",
          description: "Query uses string concatenation which may include user input",
          location: {
            file: relativePath,
            line: node.loc?.start?.line || 0,
            codeSnippet: getCodeSnippet(content, node.loc?.start?.line),
          },
          risk: "User input can be injected directly into SQL queries",
          remediation: "Use parameterized queries: pool.query('SELECT * FROM users WHERE id = $1', [userId])",
          cweId: "CWE-89",
          confidence: 0.9,
          autoFixable: false,
        });
      }

      // Check for template literal without parameters array
      if (queryArg?.type === "TemplateLiteral" && queryArg?.expressions?.length > 0) {
        // If there's only 1 argument (the query string), no params array
        if (node.arguments?.length === 1) {
          vulnerabilities.push({
            id: generateVulnId(),
            category: "injection",
            owasp: "A03:2021-Injection",
            severity: "high",
            status: "needs_fix",
            title: "SQL Injection - Missing Parameterized Query",
            description: "Query uses template literal with variables but no parameters array",
            location: {
              file: relativePath,
              line: node.loc?.start?.line || 0,
              codeSnippet: getCodeSnippet(content, node.loc?.start?.line),
            },
            risk: "Variables are interpolated directly into SQL without sanitization",
            remediation: "Add parameters array as second argument: pool.query(sql, [param1, param2])",
            cweId: "CWE-89",
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
 * Detect XSS vulnerabilities
 */
function detectXSSVulnerabilities(ctx: SecurityDetectionContext): SecurityVulnerability[] {
  const vulnerabilities: SecurityVulnerability[] = [];
  const { ast, relativePath, content, framework } = ctx;

  const checkNode = (node: any) => {
    if (!node || typeof node !== "object") return;

    // React: dangerouslySetInnerHTML
    if (node.type === "JSXAttribute" && node.name?.name === "dangerouslySetInnerHTML") {
      vulnerabilities.push({
        id: generateVulnId(),
        category: "injection",
        owasp: "A03:2021-Injection",
        severity: "high",
        status: "needs_fix",
        title: "Potential XSS via dangerouslySetInnerHTML",
        description: "Using dangerouslySetInnerHTML can expose the application to XSS attacks",
        location: {
          file: relativePath,
          line: node.loc?.start?.line || 0,
          codeSnippet: getCodeSnippet(content, node.loc?.start?.line),
        },
        risk: "Attackers can inject malicious scripts that execute in users' browsers",
        remediation: "Sanitize HTML content using DOMPurify before rendering, or use safe alternatives",
        cweId: "CWE-79",
        confidence: 0.8,
        framework,
        autoFixable: false,
        references: ["https://react.dev/reference/react-dom/components/common#dangerously-setting-the-inner-html"],
      });
    }

    // Vue: v-html directive
    if (node.type === "VAttribute" || (node.type === "JSXAttribute" && node.name?.name === "v-html")) {
      const attrName = node.name?.name || node.key?.name;
      if (attrName === "v-html") {
        vulnerabilities.push({
          id: generateVulnId(),
          category: "injection",
          owasp: "A03:2021-Injection",
          severity: "high",
          status: "needs_fix",
          title: "Potential XSS via v-html Directive",
          description: "Using v-html can expose the application to XSS attacks if content is not sanitized",
          location: {
            file: relativePath,
            line: node.loc?.start?.line || 0,
            codeSnippet: getCodeSnippet(content, node.loc?.start?.line),
          },
          risk: "User-provided content rendered as HTML can execute malicious scripts",
          remediation: "Sanitize content with DOMPurify, or use v-text for plain text",
          cweId: "CWE-79",
          confidence: 0.8,
          framework,
          autoFixable: false,
        });
      }
    }

    // Direct innerHTML assignment
    if (
      node.type === "AssignmentExpression" &&
      node.left?.type === "MemberExpression" &&
      node.left?.property?.name === "innerHTML"
    ) {
      vulnerabilities.push({
        id: generateVulnId(),
        category: "injection",
        owasp: "A03:2021-Injection",
        severity: "medium",
        status: "needs_fix",
        title: "Potential XSS via innerHTML Assignment",
        description: "Direct innerHTML assignment can lead to XSS if content contains user input",
        location: {
          file: relativePath,
          line: node.loc?.start?.line || 0,
          codeSnippet: getCodeSnippet(content, node.loc?.start?.line),
        },
        risk: "User input in innerHTML can execute arbitrary JavaScript",
        remediation: "Use textContent for plain text, or sanitize HTML with DOMPurify",
        cweId: "CWE-79",
        confidence: 0.75,
        autoFixable: false,
      });
    }

    // document.write
    if (
      node.type === "CallExpression" &&
      node.callee?.type === "MemberExpression" &&
      node.callee?.object?.name === "document" &&
      (node.callee?.property?.name === "write" || node.callee?.property?.name === "writeln")
    ) {
      vulnerabilities.push({
        id: generateVulnId(),
        category: "injection",
        owasp: "A03:2021-Injection",
        severity: "medium",
        status: "needs_fix",
        title: "Potential XSS via document.write",
        description: "document.write can introduce XSS vulnerabilities",
        location: {
          file: relativePath,
          line: node.loc?.start?.line || 0,
          codeSnippet: getCodeSnippet(content, node.loc?.start?.line),
        },
        risk: "Content written to document can execute malicious scripts",
        remediation: "Use DOM manipulation methods like appendChild with createElement",
        cweId: "CWE-79",
        confidence: 0.7,
        autoFixable: false,
      });
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

  // Also check for v-html in Vue template via regex (since Vue templates have different AST)
  if ((framework === "vue3" || framework === "nuxt3") && relativePath.endsWith(".vue")) {
    const vHtmlMatches = content.matchAll(/v-html\s*=\s*["'][^"']*["']/g);
    for (const match of vHtmlMatches) {
      const lineNumber = content.substring(0, match.index).split("\n").length;
      // Avoid duplicates by checking if we already have one at this line
      const alreadyDetected = vulnerabilities.some(
        (v) => v.location.file === relativePath && v.location.line === lineNumber
      );
      if (!alreadyDetected) {
        vulnerabilities.push({
          id: generateVulnId(),
          category: "injection",
          owasp: "A03:2021-Injection",
          severity: "high",
          status: "needs_fix",
          title: "Potential XSS via v-html Directive",
          description: "v-html directive found in Vue template",
          location: {
            file: relativePath,
            line: lineNumber,
            codeSnippet: match[0],
          },
          risk: "User-provided content rendered as HTML can execute malicious scripts",
          remediation: "Sanitize content with DOMPurify, or use v-text/{{ }} for plain text",
          cweId: "CWE-79",
          confidence: 0.8,
          framework,
          autoFixable: false,
        });
      }
    }
  }

  return vulnerabilities;
}

/**
 * Detect Command Injection vulnerabilities
 */
function detectCommandInjection(ctx: SecurityDetectionContext): SecurityVulnerability[] {
  const vulnerabilities: SecurityVulnerability[] = [];
  const { ast, relativePath, content, imports } = ctx;

  // Check if child_process is imported
  const hasChildProcess = imports.some(
    (imp) => imp.source === "child_process" || imp.source === "node:child_process"
  );

  if (!hasChildProcess) return vulnerabilities;

  const checkNode = (node: any) => {
    if (!node || typeof node !== "object") return;

    // exec, execSync, spawn, spawnSync with string concatenation or template literal
    if (node.type === "CallExpression" && node.callee?.type === "Identifier") {
      const funcName = node.callee.name;
      const dangerousFuncs = ["exec", "execSync", "spawn", "spawnSync", "execFile", "execFileSync"];

      if (dangerousFuncs.includes(funcName)) {
        const cmdArg = node.arguments?.[0];

        // Check for template literal with expressions
        if (cmdArg?.type === "TemplateLiteral" && cmdArg?.expressions?.length > 0) {
          vulnerabilities.push({
            id: generateVulnId(),
            category: "injection",
            owasp: "A03:2021-Injection",
            severity: "critical",
            status: "needs_fix",
            title: "Command Injection via Template Literal",
            description: `${funcName}() called with template literal containing interpolated values`,
            location: {
              file: relativePath,
              line: node.loc?.start?.line || 0,
              codeSnippet: getCodeSnippet(content, node.loc?.start?.line),
            },
            risk: "Attackers can execute arbitrary system commands on the server",
            remediation: "Use spawn() with array arguments, or validate/sanitize all input",
            cweId: "CWE-78",
            confidence: 0.95,
            autoFixable: false,
          });
        }

        // Check for string concatenation
        if (cmdArg?.type === "BinaryExpression" && cmdArg?.operator === "+") {
          vulnerabilities.push({
            id: generateVulnId(),
            category: "injection",
            owasp: "A03:2021-Injection",
            severity: "critical",
            status: "needs_fix",
            title: "Command Injection via String Concatenation",
            description: `${funcName}() called with concatenated command string`,
            location: {
              file: relativePath,
              line: node.loc?.start?.line || 0,
              codeSnippet: getCodeSnippet(content, node.loc?.start?.line),
            },
            risk: "User input concatenated into commands can execute arbitrary code",
            remediation: "Use spawn() with command and arguments as separate array elements",
            cweId: "CWE-78",
            confidence: 0.95,
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
 * Detect NoSQL Injection vulnerabilities
 */
function detectNoSQLInjection(ctx: SecurityDetectionContext): SecurityVulnerability[] {
  const vulnerabilities: SecurityVulnerability[] = [];
  const { ast, relativePath, content, imports } = ctx;

  // Check if MongoDB is imported
  const hasMongo = imports.some(
    (imp) => imp.source === "mongodb" || imp.source.includes("mongoose")
  );

  if (!hasMongo) return vulnerabilities;

  const checkNode = (node: any) => {
    if (!node || typeof node !== "object") return;

    // MongoDB operations with object spread or direct variable injection
    if (
      node.type === "CallExpression" &&
      node.callee?.type === "MemberExpression"
    ) {
      const methodName = node.callee?.property?.name;
      const mongoMethods = ["find", "findOne", "findOneAndUpdate", "updateOne", "updateMany", "deleteOne", "deleteMany"];

      if (mongoMethods.includes(methodName)) {
        const queryArg = node.arguments?.[0];

        // Check for spread operator with potential user input
        if (queryArg?.type === "ObjectExpression") {
          const hasSpread = queryArg.properties?.some((p: any) => p.type === "SpreadElement");
          if (hasSpread) {
            vulnerabilities.push({
              id: generateVulnId(),
              category: "injection",
              owasp: "A03:2021-Injection",
              severity: "high",
              status: "review",
              title: "Potential NoSQL Injection via Object Spread",
              description: `MongoDB ${methodName}() uses spread operator which may include unsanitized user input`,
              location: {
                file: relativePath,
                line: node.loc?.start?.line || 0,
                codeSnippet: getCodeSnippet(content, node.loc?.start?.line),
              },
              risk: "Attackers can inject MongoDB operators ($gt, $ne, etc.) to bypass authentication or access unauthorized data",
              remediation: "Validate and sanitize all query parameters, use explicit field assignment",
              cweId: "CWE-943",
              confidence: 0.7,
              autoFixable: false,
            });
          }
        }

        // Check for direct variable as query (not object literal)
        if (queryArg?.type === "Identifier") {
          vulnerabilities.push({
            id: generateVulnId(),
            category: "injection",
            owasp: "A03:2021-Injection",
            severity: "medium",
            status: "review",
            title: "Potential NoSQL Injection - Direct Variable Query",
            description: `MongoDB ${methodName}() receives variable directly as query parameter`,
            location: {
              file: relativePath,
              line: node.loc?.start?.line || 0,
              codeSnippet: getCodeSnippet(content, node.loc?.start?.line),
            },
            risk: "If variable contains user input with MongoDB operators, unauthorized queries can execute",
            remediation: "Validate input structure, reject objects containing $ operators from user input",
            cweId: "CWE-943",
            confidence: 0.6,
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
 * Detect Template Injection (eval, new Function)
 */
function detectTemplateInjection(ctx: SecurityDetectionContext): SecurityVulnerability[] {
  const vulnerabilities: SecurityVulnerability[] = [];
  const { ast, relativePath, content } = ctx;

  const checkNode = (node: any) => {
    if (!node || typeof node !== "object") return;

    // eval() call
    if (
      node.type === "CallExpression" &&
      node.callee?.type === "Identifier" &&
      node.callee?.name === "eval"
    ) {
      vulnerabilities.push({
        id: generateVulnId(),
        category: "injection",
        owasp: "A03:2021-Injection",
        severity: "critical",
        status: "needs_fix",
        title: "Code Injection via eval()",
        description: "eval() executes arbitrary code and should never be used with user input",
        location: {
          file: relativePath,
          line: node.loc?.start?.line || 0,
          codeSnippet: getCodeSnippet(content, node.loc?.start?.line),
        },
        risk: "Attackers can execute arbitrary JavaScript code in the application context",
        remediation: "Remove eval() usage. Use JSON.parse() for JSON data, or safer alternatives",
        cweId: "CWE-94",
        confidence: 0.95,
        autoFixable: false,
      });
    }

    // new Function() with dynamic content
    if (
      node.type === "NewExpression" &&
      node.callee?.type === "Identifier" &&
      node.callee?.name === "Function"
    ) {
      // Check if any argument is a variable or template literal
      const hasDynamicArg = node.arguments?.some(
        (arg: any) =>
          arg.type === "Identifier" ||
          arg.type === "TemplateLiteral" ||
          arg.type === "BinaryExpression"
      );

      if (hasDynamicArg) {
        vulnerabilities.push({
          id: generateVulnId(),
          category: "injection",
          owasp: "A03:2021-Injection",
          severity: "critical",
          status: "needs_fix",
          title: "Code Injection via new Function()",
          description: "new Function() with dynamic content can execute arbitrary code",
          location: {
            file: relativePath,
            line: node.loc?.start?.line || 0,
            codeSnippet: getCodeSnippet(content, node.loc?.start?.line),
          },
          risk: "Similar to eval(), allows execution of attacker-controlled code",
          remediation: "Avoid dynamic Function construction. Use predefined functions or safe alternatives",
          cweId: "CWE-94",
          confidence: 0.9,
          autoFixable: false,
        });
      }
    }

    // setTimeout/setInterval with string argument
    if (
      node.type === "CallExpression" &&
      node.callee?.type === "Identifier" &&
      (node.callee?.name === "setTimeout" || node.callee?.name === "setInterval")
    ) {
      const firstArg = node.arguments?.[0];
      if (firstArg?.type === "StringLiteral" || firstArg?.type === "TemplateLiteral") {
        vulnerabilities.push({
          id: generateVulnId(),
          category: "injection",
          owasp: "A03:2021-Injection",
          severity: "high",
          status: "needs_fix",
          title: `Code Injection via ${node.callee.name}() String Argument`,
          description: `${node.callee.name}() with string argument is evaluated like eval()`,
          location: {
            file: relativePath,
            line: node.loc?.start?.line || 0,
            codeSnippet: getCodeSnippet(content, node.loc?.start?.line),
          },
          risk: "String arguments to timer functions are executed as code",
          remediation: "Pass a function reference instead of a string",
          cweId: "CWE-94",
          confidence: 0.85,
          autoFixable: true,
          autoFixSuggestion: "Replace string with arrow function: () => { /* code */ }",
        });
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
 * Detect Path Traversal vulnerabilities
 */
function detectPathTraversal(ctx: SecurityDetectionContext): SecurityVulnerability[] {
  const vulnerabilities: SecurityVulnerability[] = [];
  const { ast, relativePath, content, imports } = ctx;

  // Check if fs or path is imported
  const hasFs = imports.some(
    (imp) => imp.source === "fs" || imp.source === "node:fs" || imp.source === "fs/promises"
  );

  if (!hasFs) return vulnerabilities;

  const checkNode = (node: any) => {
    if (!node || typeof node !== "object") return;

    // fs operations with template literals or concatenation
    if (node.type === "CallExpression" && node.callee?.type === "MemberExpression") {
      const objName = node.callee?.object?.name;
      const methodName = node.callee?.property?.name;

      const fsMethods = [
        "readFile", "readFileSync", "writeFile", "writeFileSync",
        "readdir", "readdirSync", "unlink", "unlinkSync", "rmdir", "rmdirSync",
        "access", "accessSync", "stat", "statSync", "mkdir", "mkdirSync",
      ];

      if ((objName === "fs" || objName === "promises") && fsMethods.includes(methodName)) {
        const pathArg = node.arguments?.[0];

        // Template literal with expressions
        if (pathArg?.type === "TemplateLiteral" && pathArg?.expressions?.length > 0) {
          vulnerabilities.push({
            id: generateVulnId(),
            category: "injection",
            owasp: "A03:2021-Injection",
            severity: "high",
            status: "needs_fix",
            title: "Path Traversal via Template Literal",
            description: `fs.${methodName}() uses path with interpolated values`,
            location: {
              file: relativePath,
              line: node.loc?.start?.line || 0,
              codeSnippet: getCodeSnippet(content, node.loc?.start?.line),
            },
            risk: "Attackers can use ../ sequences to access files outside intended directory",
            remediation: "Validate and sanitize path input. Use path.resolve() with base directory check",
            cweId: "CWE-22",
            confidence: 0.75,
            autoFixable: false,
          });
        }

        // String concatenation
        if (pathArg?.type === "BinaryExpression" && pathArg?.operator === "+") {
          vulnerabilities.push({
            id: generateVulnId(),
            category: "injection",
            owasp: "A03:2021-Injection",
            severity: "high",
            status: "needs_fix",
            title: "Path Traversal via String Concatenation",
            description: `fs.${methodName}() path is constructed via concatenation`,
            location: {
              file: relativePath,
              line: node.loc?.start?.line || 0,
              codeSnippet: getCodeSnippet(content, node.loc?.start?.line),
            },
            risk: "User input in file paths can traverse to sensitive directories",
            remediation: "Use path.join() with validated base path, reject paths containing '..'",
            cweId: "CWE-22",
            confidence: 0.75,
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
 * Detect positive patterns related to injection prevention
 */
function detectPositiveInjectionPatterns(ctx: SecurityDetectionContext): PositiveSecurityPractice[] {
  const patterns: PositiveSecurityPractice[] = [];
  const { ast, relativePath, imports } = ctx;

  // Check for DOMPurify usage
  const hasDOMPurify = imports.some((imp) => imp.source === "dompurify" || imp.source === "isomorphic-dompurify");
  if (hasDOMPurify) {
    patterns.push({
      id: generatePositiveId(),
      category: "injection_prevention",
      title: "DOMPurify Sanitization",
      description: "Uses DOMPurify library for HTML sanitization",
      location: { file: relativePath },
      benefit: "Prevents XSS attacks by sanitizing HTML content before rendering",
    });
  }

  // Check for parameterized queries (PostgreSQL style)
  const checkNode = (node: any) => {
    if (!node || typeof node !== "object") return;

    // Parameterized query with array
    if (
      node.type === "CallExpression" &&
      node.callee?.type === "MemberExpression" &&
      node.callee?.property?.name === "query" &&
      node.arguments?.length >= 2 &&
      node.arguments[1]?.type === "ArrayExpression"
    ) {
      patterns.push({
        id: generatePositiveId(),
        category: "injection_prevention",
        title: "Parameterized SQL Query",
        description: "Uses parameterized query with placeholder values",
        location: {
          file: relativePath,
          line: node.loc?.start?.line,
        },
        benefit: "Prevents SQL injection by separating query structure from data",
      });
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

  // Check for input validation libraries
  const validationLibs = ["zod", "yup", "joi", "validator", "express-validator"];
  for (const lib of validationLibs) {
    if (imports.some((imp) => imp.source === lib || imp.source.startsWith(`${lib}/`))) {
      patterns.push({
        id: generatePositiveId(),
        category: "injection_prevention",
        title: `Input Validation with ${lib}`,
        description: `Uses ${lib} library for input validation`,
        location: { file: relativePath },
        benefit: "Validates and sanitizes input before processing",
      });
      break; // Only report once per file
    }
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
export function resetInjectionCounters(): void {
  vulnIdCounter = 0;
  positiveIdCounter = 0;
}
