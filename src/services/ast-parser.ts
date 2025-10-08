/**
 * AST Parser Service
 *
 * Handles parsing of multiple file types:
 * - JavaScript/TypeScript (using @babel/parser)
 * - Vue SFC (using @vue/compiler-sfc)
 * - JSX/TSX
 */

import { parse as babelParse, ParserPlugin } from "@babel/parser";
import { parse as vueParse } from "@vue/compiler-sfc";
import * as fs from "fs/promises";
import * as path from "path";
import type { ASTNode } from "../types/index.js";

export interface ParseOptions {
  sourceType?: "module" | "script";
  plugins?: ParserPlugin[];
}

export class ASTParser {
  private static readonly DEFAULT_BABEL_PLUGINS: ParserPlugin[] = [
    "jsx",
    "typescript",
    "decorators-legacy",
    "classProperties",
    "objectRestSpread",
    "optionalChaining",
    "nullishCoalescingOperator",
    "dynamicImport",
  ];

  /**
   * Parse a file and return its AST
   */
  static async parseFile(filePath: string, options: ParseOptions = {}): Promise<ASTNode> {
    const content = await fs.readFile(filePath, "utf-8");
    const ext = path.extname(filePath);

    if (ext === ".vue") {
      return this.parseVueFile(content, filePath);
    }

    return this.parseJavaScriptFile(content, options);
  }

  /**
   * Parse JavaScript/TypeScript content
   */
  static parseJavaScriptFile(content: string, options: ParseOptions = {}): ASTNode {
    try {
      const ast = babelParse(content, {
        sourceType: options.sourceType || "module",
        plugins: options.plugins || this.DEFAULT_BABEL_PLUGINS,
      });
      return ast as unknown as ASTNode;
    } catch (error) {
      throw new Error(`Failed to parse JavaScript: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Parse Vue Single File Component
   */
  static parseVueFile(content: string, filePath: string): ASTNode {
    try {
      const { descriptor, errors } = vueParse(content, {
        filename: filePath,
      });

      if (errors.length > 0) {
        throw new Error(`Vue parsing errors: ${errors.map((e) => e.message).join(", ")}`);
      }

      // Parse script block if exists
      let scriptAST: ASTNode | null = null;
      if (descriptor.script || descriptor.scriptSetup) {
        const scriptContent = descriptor.scriptSetup?.content || descriptor.script?.content || "";
        const scriptLang = descriptor.scriptSetup?.lang || descriptor.script?.lang || "js";

        scriptAST = this.parseJavaScriptFile(scriptContent, {
          sourceType: "module",
          plugins: scriptLang === "ts" || scriptLang === "tsx"
            ? this.DEFAULT_BABEL_PLUGINS
            : this.DEFAULT_BABEL_PLUGINS.filter((p) => p !== "typescript"),
        });
      }

      // Return combined AST structure
      return {
        type: "VueSFC",
        template: descriptor.template?.ast || null,
        script: scriptAST,
        scriptSetup: descriptor.scriptSetup ? true : false,
        styles: descriptor.styles,
        customBlocks: descriptor.customBlocks,
      } as unknown as ASTNode;
    } catch (error) {
      throw new Error(`Failed to parse Vue SFC: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Extract imports from AST
   */
  static extractImports(ast: ASTNode): Array<{ source: string; specifiers: string[] }> {
    const imports: Array<{ source: string; specifiers: string[] }> = [];

    // Handle Vue SFC
    if (ast.type === "VueSFC" && ast.script) {
      return this.extractImports(ast.script);
    }

    // Handle regular JS/TS
    if (!ast.program?.body) return imports;

    for (const node of ast.program.body) {
      if (node.type === "ImportDeclaration") {
        const specifiers = node.specifiers.map((spec: any) => {
          if (spec.type === "ImportDefaultSpecifier") return spec.local.name;
          if (spec.type === "ImportNamespaceSpecifier") return `* as ${spec.local.name}`;
          if (spec.type === "ImportSpecifier") {
            return spec.imported.name !== spec.local.name
              ? `${spec.imported.name} as ${spec.local.name}`
              : spec.imported.name;
          }
          return "";
        }).filter(Boolean);

        imports.push({
          source: node.source.value,
          specifiers,
        });
      }
    }

    return imports;
  }

  /**
   * Extract exports from AST
   */
  static extractExports(ast: ASTNode): string[] {
    const exports: string[] = [];

    // Handle Vue SFC
    if (ast.type === "VueSFC" && ast.script) {
      return this.extractExports(ast.script);
    }

    // Handle regular JS/TS
    if (!ast.program?.body) return exports;

    for (const node of ast.program.body) {
      if (node.type === "ExportNamedDeclaration") {
        if (node.declaration) {
          if (node.declaration.type === "VariableDeclaration") {
            for (const declarator of node.declaration.declarations) {
              if (declarator.id.type === "Identifier") {
                exports.push(declarator.id.name);
              }
            }
          } else if (
            node.declaration.type === "FunctionDeclaration" ||
            node.declaration.type === "ClassDeclaration"
          ) {
            if (node.declaration.id) {
              exports.push(node.declaration.id.name);
            }
          }
        }
        if (node.specifiers) {
          for (const spec of node.specifiers) {
            exports.push(spec.exported.name);
          }
        }
      } else if (node.type === "ExportDefaultDeclaration") {
        exports.push("default");
      }
    }

    return exports;
  }

  /**
   * Calculate cyclomatic complexity
   */
  static calculateComplexity(ast: ASTNode): number {
    let complexity = 1;

    const traverse = (node: any) => {
      if (!node || typeof node !== "object") return;

      // Increment complexity for decision points
      if (
        node.type === "IfStatement" ||
        node.type === "ConditionalExpression" ||
        node.type === "ForStatement" ||
        node.type === "WhileStatement" ||
        node.type === "DoWhileStatement" ||
        node.type === "CaseClause" ||
        node.type === "LogicalExpression" ||
        node.type === "CatchClause"
      ) {
        complexity++;
      }

      // Recursively traverse
      for (const key in node) {
        if (Array.isArray(node[key])) {
          node[key].forEach(traverse);
        } else if (typeof node[key] === "object") {
          traverse(node[key]);
        }
      }
    };

    traverse(ast);
    return complexity;
  }

  /**
   * Detect framework-specific patterns
   */
  static detectFrameworkPatterns(ast: ASTNode): {
    isReact: boolean;
    isVue: boolean;
    hasHooks: boolean;
    hasComposables: boolean;
  } {
    const imports = this.extractImports(ast);
    const hasReactImport = imports.some((imp) => imp.source === "react" || imp.source === "react-native");
    const hasVueImport = imports.some((imp) => imp.source === "vue" || imp.source.startsWith("@vue/"));

    // Check for hooks (use* pattern)
    let hasHooks = false;
    let hasComposables = false;

    if (ast.type === "VueSFC") {
      hasComposables = true; // Vue files likely use composables
    }

    const checkNames = (node: any) => {
      if (!node || typeof node !== "object") return;

      if (node.type === "Identifier" && node.name.startsWith("use")) {
        if (hasReactImport) hasHooks = true;
        if (hasVueImport) hasComposables = true;
      }

      for (const key in node) {
        if (Array.isArray(node[key])) {
          node[key].forEach(checkNames);
        } else if (typeof node[key] === "object") {
          checkNames(node[key]);
        }
      }
    };

    checkNames(ast);

    return {
      isReact: hasReactImport,
      isVue: hasVueImport || ast.type === "VueSFC",
      hasHooks,
      hasComposables,
    };
  }
}
