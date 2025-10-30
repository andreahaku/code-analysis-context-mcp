/**
 * Framework Detection Utility
 *
 * Detects project type and framework from package.json and file structure
 */

import * as fs from "fs/promises";
import * as path from "path";
import type { FrameworkType } from "../types/index.js";

export interface FrameworkDetectionResult {
  framework: FrameworkType;
  version?: string;
  confidence: number;
  evidence: string[];
}

export class FrameworkDetector {
  /**
   * Detect framework from project directory
   */
  static async detect(projectPath: string): Promise<FrameworkDetectionResult> {
    const packageJsonPath = path.join(projectPath, "package.json");

    try {
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf-8"));
      return this.detectFromPackageJson(packageJson, projectPath);
    } catch {
      // Fallback to file structure detection
      return this.detectFromFileStructure(projectPath);
    }
  }

  /**
   * Detect from package.json dependencies
   */
  private static async detectFromPackageJson(
    packageJson: any,
    projectPath: string
  ): Promise<FrameworkDetectionResult> {
    const deps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    const evidence: string[] = [];

    // Check for Nuxt 3
    if (deps.nuxt) {
      const version = deps.nuxt.replace(/[\^~]/, "");
      const isNuxt3 = version.startsWith("3.");

      if (isNuxt3) {
        evidence.push("nuxt v3 dependency found");

        // Check for nuxt.config.ts/js
        const hasNuxtConfig = await this.fileExists(projectPath, "nuxt.config.ts") ||
                              await this.fileExists(projectPath, "nuxt.config.js");
        if (hasNuxtConfig) evidence.push("nuxt.config found");

        return {
          framework: "nuxt3",
          version,
          confidence: hasNuxtConfig ? 1.0 : 0.9,
          evidence,
        };
      }
    }

    // Check for Vue 3
    if (deps.vue) {
      const version = deps.vue.replace(/[\^~]/, "");
      const isVue3 = version.startsWith("3.");

      if (isVue3) {
        evidence.push("vue v3 dependency found");

        // Check for typical Vue project files
        const hasViteConfig = await this.fileExists(projectPath, "vite.config.ts") ||
                             await this.fileExists(projectPath, "vite.config.js");
        if (hasViteConfig) evidence.push("vite config found");

        return {
          framework: "vue3",
          version,
          confidence: 0.95,
          evidence,
        };
      }
    }

    // Check for Expo
    if (deps.expo) {
      evidence.push("expo dependency found");

      const hasAppJson = await this.fileExists(projectPath, "app.json");
      if (hasAppJson) evidence.push("app.json found");

      return {
        framework: "expo",
        version: deps.expo.replace(/[\^~]/, ""),
        confidence: hasAppJson ? 1.0 : 0.9,
        evidence,
      };
    }

    // Check for React Native
    if (deps["react-native"]) {
      evidence.push("react-native dependency found");

      const hasMetroConfig = await this.fileExists(projectPath, "metro.config.js");
      if (hasMetroConfig) evidence.push("metro.config.js found");

      return {
        framework: "react-native",
        version: deps["react-native"].replace(/[\^~]/, ""),
        confidence: hasMetroConfig ? 1.0 : 0.9,
        evidence,
      };
    }

    // Check for Fastify
    if (deps.fastify) {
      evidence.push("fastify dependency found");

      // Check for typical Fastify project structure
      const hasRoutesDir = await this.directoryExists(projectPath, "routes") ||
                          await this.directoryExists(projectPath, "src/routes");
      const hasPluginsDir = await this.directoryExists(projectPath, "plugins") ||
                           await this.directoryExists(projectPath, "src/plugins");
      const hasServerFile = await this.fileExists(projectPath, "server.js") ||
                           await this.fileExists(projectPath, "app.js") ||
                           await this.fileExists(projectPath, "src/server.ts") ||
                           await this.fileExists(projectPath, "src/app.ts");

      if (hasRoutesDir) evidence.push("routes directory found");
      if (hasPluginsDir) evidence.push("plugins directory found");
      if (hasServerFile) evidence.push("server entry file found");

      return {
        framework: "fastify",
        version: deps.fastify.replace(/[\^~]/, ""),
        confidence: (hasRoutesDir || hasPluginsDir || hasServerFile) ? 0.95 : 0.85,
        evidence,
      };
    }

    // Check for React
    if (deps.react) {
      evidence.push("react dependency found");

      // Check if it's a web project
      const hasPublicDir = await this.directoryExists(projectPath, "public");
      const hasIndexHtml = await this.fileExists(projectPath, "index.html") ||
                          await this.fileExists(projectPath, "public/index.html");

      if (hasPublicDir || hasIndexHtml) {
        evidence.push("web project structure detected");
      }

      return {
        framework: "react",
        version: deps.react.replace(/[\^~]/, ""),
        confidence: 0.85,
        evidence,
      };
    }

    // Default to node
    return {
      framework: "node",
      confidence: 0.5,
      evidence: ["no specific framework detected"],
    };
  }

  /**
   * Detect from file structure when package.json is unavailable
   */
  private static async detectFromFileStructure(
    projectPath: string
  ): Promise<FrameworkDetectionResult> {
    const evidence: string[] = [];

    // Check for Nuxt
    const hasNuxtConfig = await this.fileExists(projectPath, "nuxt.config.ts") ||
                         await this.fileExists(projectPath, "nuxt.config.js");
    const hasNuxtDirs = await this.directoryExists(projectPath, "pages") &&
                       await this.directoryExists(projectPath, "components");

    if (hasNuxtConfig && hasNuxtDirs) {
      evidence.push("nuxt.config found", "nuxt directory structure detected");
      return {
        framework: "nuxt3",
        confidence: 0.8,
        evidence,
      };
    }

    // Check for Vue
    const hasViteConfig = await this.fileExists(projectPath, "vite.config.ts");
    const hasSrcDir = await this.directoryExists(projectPath, "src");

    if (hasViteConfig && hasSrcDir) {
      // Check for .vue files
      try {
        const srcFiles = await fs.readdir(path.join(projectPath, "src"));
        const hasVueFiles = srcFiles.some((file) => file.endsWith(".vue"));

        if (hasVueFiles) {
          evidence.push("Vue SFC files found", "Vite config found");
          return {
            framework: "vue3",
            confidence: 0.75,
            evidence,
          };
        }
      } catch {
        // Ignore error
      }
    }

    // Check for React Native
    const hasMetroConfig = await this.fileExists(projectPath, "metro.config.js");
    const hasAndroidIos = await this.directoryExists(projectPath, "android") &&
                         await this.directoryExists(projectPath, "ios");

    if (hasMetroConfig || hasAndroidIos) {
      evidence.push("React Native structure detected");
      return {
        framework: "react-native",
        confidence: 0.7,
        evidence,
      };
    }

    // Default
    return {
      framework: "node",
      confidence: 0.3,
      evidence: ["no clear framework indicators found"],
    };
  }

  /**
   * Check if file exists
   */
  private static async fileExists(dir: string, filename: string): Promise<boolean> {
    try {
      await fs.access(path.join(dir, filename));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if directory exists
   */
  private static async directoryExists(dir: string, subdir: string): Promise<boolean> {
    try {
      const stat = await fs.stat(path.join(dir, subdir));
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Get default include globs for framework
   */
  static getDefaultIncludeGlobs(framework: FrameworkType): string[] {
    switch (framework) {
      case "nuxt3":
        return [
          "components/**/*.vue",
          "composables/**/*.ts",
          "composables/**/*.js",
          "pages/**/*.vue",
          "layouts/**/*.vue",
          "middleware/**/*.ts",
          "middleware/**/*.js",
          "server/**/*.ts",
          "stores/**/*.ts",
          "stores/**/*.js",
          "utils/**/*.ts",
          "utils/**/*.js",
          "plugins/**/*.ts",
          "plugins/**/*.js",
          // Support src/ prefix structure
          "src/components/**/*.vue",
          "src/composables/**/*.ts",
          "src/composables/**/*.js",
          "src/pages/**/*.vue",
          "src/layouts/**/*.vue",
          "src/middleware/**/*.ts",
          "src/middleware/**/*.js",
          "src/server/**/*.ts",
          "src/stores/**/*.ts",
          "src/stores/**/*.js",
          "src/utils/**/*.ts",
          "src/utils/**/*.js",
          "src/plugins/**/*.ts",
          "src/plugins/**/*.js",
          // Catch-all patterns for src directory (services, models, api, lib, etc.)
          "src/**/*.vue",
          "src/**/*.ts",
          "src/**/*.js",
        ];

      case "vue3":
        return [
          "src/**/*.vue",
          "src/**/*.ts",
          "src/**/*.js",
          "components/**/*.vue",
        ];

      case "react-native":
      case "expo":
        return [
          // Standard patterns
          "src/**/*.{ts,tsx,js,jsx}",
          "app/**/*.{ts,tsx,js,jsx}", // Expo Router
          "screens/**/*.{tsx,jsx}",
          "components/**/*.{tsx,jsx}",
          "navigation/**/*.{tsx,ts}",
          "hooks/**/*.{ts,tsx}",
          "contexts/**/*.{tsx,ts}",
          "providers/**/*.{tsx,ts}",
          "services/**/*.{ts,tsx}",
          "api/**/*.{ts,tsx}",
          "utils/**/*.ts",
          "helpers/**/*.ts",
          "constants/**/*.ts",
          "theme/**/*.ts",
          "config/**/*.ts",
          "types/**/*.ts",
          "@types/**/*.ts",
          // Platform-specific patterns
          "**/*.ios.{ts,tsx,js,jsx}",
          "**/*.android.{ts,tsx,js,jsx}",
          "**/*.native.{ts,tsx,js,jsx}",
          "**/*.web.{ts,tsx,js,jsx}",
        ];

      case "react":
        return [
          "src/**/*.ts",
          "src/**/*.tsx",
          "src/**/*.js",
          "src/**/*.jsx",
          "components/**/*.tsx",
          "hooks/**/*.ts",
        ];

      case "fastify":
        return [
          // Main source patterns
          "src/**/*.ts",
          "src/**/*.js",
          // Fastify-specific patterns
          "routes/**/*.ts",
          "routes/**/*.js",
          "src/routes/**/*.ts",
          "src/routes/**/*.js",
          "plugins/**/*.ts",
          "plugins/**/*.js",
          "src/plugins/**/*.ts",
          "src/plugins/**/*.js",
          "hooks/**/*.ts",
          "hooks/**/*.js",
          "src/hooks/**/*.ts",
          "src/hooks/**/*.js",
          "schemas/**/*.ts",
          "schemas/**/*.js",
          "src/schemas/**/*.ts",
          "src/schemas/**/*.js",
          // Services, models, database
          "services/**/*.ts",
          "services/**/*.js",
          "src/services/**/*.ts",
          "src/services/**/*.js",
          "models/**/*.ts",
          "models/**/*.js",
          "src/models/**/*.ts",
          "src/models/**/*.js",
          "db/**/*.ts",
          "db/**/*.js",
          "src/db/**/*.ts",
          "src/db/**/*.js",
          "database/**/*.ts",
          "database/**/*.js",
          "src/database/**/*.ts",
          "src/database/**/*.js",
          // Messaging/streaming
          "consumers/**/*.ts",
          "consumers/**/*.js",
          "src/consumers/**/*.ts",
          "src/consumers/**/*.js",
          "producers/**/*.ts",
          "producers/**/*.js",
          "src/producers/**/*.ts",
          "src/producers/**/*.js",
          "streams/**/*.ts",
          "streams/**/*.js",
          "src/streams/**/*.ts",
          "src/streams/**/*.js",
          // Config, utils, middleware
          "config/**/*.ts",
          "config/**/*.js",
          "src/config/**/*.ts",
          "src/config/**/*.js",
          "utils/**/*.ts",
          "utils/**/*.js",
          "src/utils/**/*.ts",
          "src/utils/**/*.js",
          "middleware/**/*.ts",
          "middleware/**/*.js",
          "src/middleware/**/*.ts",
          "src/middleware/**/*.js",
          // Entry points
          "server.ts",
          "server.js",
          "app.ts",
          "app.js",
          "index.ts",
          "index.js",
          "src/server.ts",
          "src/server.js",
          "src/app.ts",
          "src/app.js",
          "src/index.ts",
          "src/index.js",
        ];

      default:
        return ["src/**/*.ts", "src/**/*.js"];
    }
  }

  /**
   * Get default exclude globs
   */
  static getDefaultExcludeGlobs(framework: FrameworkType): string[] {
    const common = [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
      "**/*.test.ts",
      "**/*.test.tsx",
      "**/*.test.js",
      "**/*.spec.ts",
      "**/*.spec.js",
    ];

    switch (framework) {
      case "nuxt3":
        return [...common, "**/.nuxt/**", "**/.output/**"];

      case "react-native":
      case "expo":
        return [
          ...common,
          "**/android/**",
          "**/ios/**",
          "**/.expo/**",
          "**/.expo-shared/**",
          "**/web-build/**",
        ];

      default:
        return common;
    }
  }
}
