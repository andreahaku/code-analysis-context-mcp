/**
 * Pattern Detector Tool
 *
 * Detect framework-specific patterns, custom implementations, and adherence to best practices.
 */

import * as path from "path";
import * as glob from "fast-glob";
import { ASTParser } from "../services/ast-parser.js";
import { FrameworkDetector } from "../utils/framework-detector.js";
import type {
  PatternAnalysisParams,
  PatternAnalysisResult,
  PatternOccurrence,
  HOCPattern,
  RenderPropsPattern,
  CompoundComponentPattern,
  PiniaStorePattern,
  VuePluginPattern,
  NuxtModulePattern,
  Antipattern,
  BestPracticeComparison,
  PatternType,
  FrameworkType,
  ASTNode,
} from "../types/index.js";

export async function analyzePatterns(
  params: PatternAnalysisParams
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const {
    projectPath = process.cwd(),
    patternTypes,
    includeGlobs,
    excludeGlobs = ["**/node_modules/**", "**/dist/**", "**/build/**", "**/.next/**"],
    detectCustomPatterns = false,
    compareWithBestPractices = false,
    suggestImprovements = false,
  } = params;

  // Detect framework
  const frameworkInfo = await FrameworkDetector.detect(projectPath);
  const framework = frameworkInfo.framework;

  // Get file patterns
  const defaultGlobs = includeGlobs || FrameworkDetector.getDefaultIncludeGlobs(framework);
  const files = await glob.glob(defaultGlobs, {
    cwd: projectPath,
    ignore: excludeGlobs,
    absolute: true,
  });

  // Initialize result
  const result: PatternAnalysisResult = {
    project: {
      name: path.basename(projectPath),
      type: framework,
      totalFiles: files.length,
    },
    patterns: {},
    recommendations: [],
    summary: {
      totalPatterns: 0,
      byType: {},
      mostCommon: [],
    },
  };

  // Analyze each file for patterns
  for (const file of files) {
    try {
      const ast = await ASTParser.parseFile(file);
      const relPath = path.relative(projectPath, file);

      // Detect patterns based on framework and requested types
      if (framework === "react" || framework === "react-native" || framework === "expo") {
        detectReactPatterns(ast, relPath, result, patternTypes);
      } else if (framework === "vue3" || framework === "nuxt3") {
        detectVuePatterns(ast, relPath, result, patternTypes, framework);
      }

      // Detect common patterns
      detectCommonPatterns(ast, relPath, result, patternTypes);
    } catch (error) {
      // Skip files that can't be parsed
      continue;
    }
  }

  // Detect custom patterns if requested
  if (detectCustomPatterns) {
    result.customPatterns = detectCustomPatternsInProject(result);
  }

  // Compare with best practices if requested
  if (compareWithBestPractices) {
    result.bestPractices = compareBestPractices(result, framework);
  }

  // Detect antipatterns
  result.antipatterns = detectAntipatterns(result);

  // Generate recommendations
  if (suggestImprovements) {
    result.recommendations = generateRecommendations(result, framework);
  } else {
    result.recommendations = generateBasicRecommendations(result);
  }

  // Calculate summary
  calculateSummary(result);

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
 * Detect React-specific patterns
 */
function detectReactPatterns(
  ast: ASTNode,
  file: string,
  result: PatternAnalysisResult,
  requestedTypes?: PatternType[]
): void {
  const shouldDetect = (type: PatternType) => !requestedTypes || requestedTypes.includes(type);

  // Detect hooks
  if (shouldDetect("hooks") || shouldDetect("custom-hooks")) {
    const hooks = detectReactHooks(ast, file);
    if (hooks.standard.length > 0) {
      result.patterns.hooks = result.patterns.hooks || [];
      result.patterns.hooks.push(...hooks.standard);
    }
    if (hooks.custom.length > 0) {
      result.patterns.customHooks = result.patterns.customHooks || [];
      result.patterns.customHooks.push(...hooks.custom);
    }
  }

  // Detect HOCs
  if (shouldDetect("hoc")) {
    const hocs = detectHOCs(ast, file);
    if (hocs.length > 0) {
      result.patterns.hocs = result.patterns.hocs || [];
      result.patterns.hocs.push(...hocs);
    }
  }

  // Detect render props
  if (shouldDetect("render-props")) {
    const renderProps = detectRenderProps(ast, file);
    if (renderProps.length > 0) {
      result.patterns.renderProps = result.patterns.renderProps || [];
      result.patterns.renderProps.push(...renderProps);
    }
  }

  // Detect compound components
  if (shouldDetect("compound-components")) {
    const compounds = detectCompoundComponents(ast, file);
    if (compounds.length > 0) {
      result.patterns.compoundComponents = result.patterns.compoundComponents || [];
      result.patterns.compoundComponents.push(...compounds);
    }
  }

  // Detect providers (Context API)
  if (shouldDetect("providers")) {
    const providers = detectContextProviders(ast, file);
    if (providers.length > 0) {
      result.patterns.providers = result.patterns.providers || [];
      result.patterns.providers.push(...providers);
    }
  }
}

/**
 * Detect Vue-specific patterns
 */
function detectVuePatterns(
  ast: ASTNode,
  file: string,
  result: PatternAnalysisResult,
  requestedTypes?: PatternType[],
  framework?: FrameworkType
): void {
  const shouldDetect = (type: PatternType) => !requestedTypes || requestedTypes.includes(type);

  // Detect composables
  if (shouldDetect("composables")) {
    const composables = detectVueComposables(ast, file);
    if (composables.length > 0) {
      result.patterns.composables = result.patterns.composables || [];
      result.patterns.composables.push(...composables);
    }
  }

  // Detect Pinia stores
  if (shouldDetect("pinia-stores")) {
    const stores = detectPiniaStores(ast, file);
    if (stores.length > 0) {
      result.patterns.piniaStores = result.patterns.piniaStores || [];
      result.patterns.piniaStores.push(...stores);
    }
  }

  // Detect Vue plugins
  if (shouldDetect("vue-plugins")) {
    const plugins = detectVuePlugins(ast, file);
    if (plugins.length > 0) {
      result.patterns.vuePlugins = result.patterns.vuePlugins || [];
      result.patterns.vuePlugins.push(...plugins);
    }
  }

  // Detect Vue directives
  if (shouldDetect("vue-directives")) {
    const directives = detectVueDirectives(ast, file);
    if (directives.length > 0) {
      result.patterns.vueDirectives = result.patterns.vueDirectives || [];
      result.patterns.vueDirectives.push(...directives);
    }
  }

  // Nuxt-specific patterns
  if (framework === "nuxt3") {
    if (shouldDetect("nuxt-modules")) {
      const modules = detectNuxtModules(ast, file);
      if (modules.length > 0) {
        result.patterns.nuxtModules = result.patterns.nuxtModules || [];
        result.patterns.nuxtModules.push(...modules);
      }
    }

    if (shouldDetect("nuxt-middleware")) {
      const middleware = detectNuxtMiddleware(ast, file);
      if (middleware.length > 0) {
        result.patterns.nuxtMiddleware = result.patterns.nuxtMiddleware || [];
        result.patterns.nuxtMiddleware.push(...middleware);
      }
    }
  }
}

/**
 * Detect common patterns across frameworks
 */
function detectCommonPatterns(
  ast: ASTNode,
  file: string,
  result: PatternAnalysisResult,
  requestedTypes?: PatternType[]
): void {
  const shouldDetect = (type: PatternType) => !requestedTypes || requestedTypes.includes(type);

  // Detect data fetching patterns
  if (shouldDetect("data-fetching")) {
    const dataFetching = detectDataFetchingPatterns(ast, file);
    if (dataFetching.length > 0) {
      result.patterns.dataFetching = result.patterns.dataFetching || [];
      result.patterns.dataFetching.push(...dataFetching);
    }
  }

  // Detect error handling patterns
  if (shouldDetect("error-handling")) {
    const errorHandling = detectErrorHandlingPatterns(ast, file);
    if (errorHandling.length > 0) {
      result.patterns.errorHandling = result.patterns.errorHandling || [];
      result.patterns.errorHandling.push(...errorHandling);
    }
  }

  // Detect form patterns
  if (shouldDetect("forms")) {
    const forms = detectFormPatterns(ast, file);
    if (forms.length > 0) {
      result.patterns.forms = result.patterns.forms || [];
      result.patterns.forms.push(...forms);
    }
  }
}

// ====================== React Pattern Detectors ======================

function detectReactHooks(ast: ASTNode, file: string): { standard: PatternOccurrence[]; custom: PatternOccurrence[] } {
  const standard: PatternOccurrence[] = [];
  const custom: PatternOccurrence[] = [];
  const standardHooks = ["useState", "useEffect", "useContext", "useReducer", "useCallback", "useMemo", "useRef", "useImperativeHandle", "useLayoutEffect", "useDebugValue"];

  const checkNode = (node: any) => {
    if (!node || typeof node !== "object") return;

    if (node.type === "CallExpression" && node.callee?.type === "Identifier") {
      const name = node.callee.name;
      if (name.startsWith("use") && name.length > 3) {
        if (standardHooks.includes(name)) {
          standard.push({
            name,
            file,
            line: node.loc?.start?.line,
            type: "hooks",
            confidence: 1.0,
            description: `Standard React hook: ${name}`,
          });
        } else {
          custom.push({
            name,
            file,
            line: node.loc?.start?.line,
            type: "custom-hooks",
            confidence: 0.9,
            description: `Custom React hook: ${name}`,
          });
        }
      }
    }

    // Recursively check all properties
    for (const key in node) {
      if (Array.isArray(node[key])) {
        node[key].forEach(checkNode);
      } else if (typeof node[key] === "object") {
        checkNode(node[key]);
      }
    }
  };

  checkNode(ast);
  return { standard, custom };
}

function detectHOCs(ast: ASTNode, file: string): HOCPattern[] {
  const hocs: HOCPattern[] = [];

  const checkNode = (node: any) => {
    if (!node || typeof node !== "object") return;

    // Look for functions that return functions or components
    if (
      (node.type === "FunctionDeclaration" || node.type === "ArrowFunctionExpression") &&
      node.id?.name.startsWith("with") &&
      node.params.length > 0
    ) {
      hocs.push({
        name: node.id?.name || "anonymous",
        file,
        wrappedComponent: node.params[0]?.name,
        enhancedProps: [],
      });
    }

    // Recursively check
    for (const key in node) {
      if (Array.isArray(node[key])) {
        node[key].forEach(checkNode);
      } else if (typeof node[key] === "object") {
        checkNode(node[key]);
      }
    }
  };

  checkNode(ast);
  return hocs;
}

function detectRenderProps(ast: ASTNode, file: string): RenderPropsPattern[] {
  const renderProps: RenderPropsPattern[] = [];

  // Look for components with render/children props
  const checkNode = (node: any) => {
    if (!node || typeof node !== "object") return;

    if (node.type === "JSXAttribute" && (node.name?.name === "render" || node.name?.name === "children")) {
      if (node.value?.expression?.type === "ArrowFunctionExpression" || node.value?.expression?.type === "FunctionExpression") {
        renderProps.push({
          name: "RenderPropComponent",
          file,
          renderProp: node.name.name,
          parameters: node.value.expression.params?.map((p: any) => p.name) || [],
        });
      }
    }

    for (const key in node) {
      if (Array.isArray(node[key])) {
        node[key].forEach(checkNode);
      } else if (typeof node[key] === "object") {
        checkNode(node[key]);
      }
    }
  };

  checkNode(ast);
  return renderProps;
}

function detectCompoundComponents(ast: ASTNode, file: string): CompoundComponentPattern[] {
  const compounds: CompoundComponentPattern[] = [];

  // Look for patterns like Component.SubComponent = ...
  const checkNode = (node: any) => {
    if (!node || typeof node !== "object") return;

    if (node.type === "AssignmentExpression" &&
        node.left?.type === "MemberExpression" &&
        node.left.object?.type === "Identifier" &&
        node.left.property?.type === "Identifier") {
      const parent = node.left.object.name;
      const child = node.left.property.name;

      // Check if we already have this parent
      let compound = compounds.find(c => c.parent === parent);
      if (!compound) {
        compound = { parent, children: [], file, sharedState: [] };
        compounds.push(compound);
      }
      compound.children.push(child);
    }

    for (const key in node) {
      if (Array.isArray(node[key])) {
        node[key].forEach(checkNode);
      } else if (typeof node[key] === "object") {
        checkNode(node[key]);
      }
    }
  };

  checkNode(ast);
  return compounds;
}

function detectContextProviders(ast: ASTNode, file: string): PatternOccurrence[] {
  const providers: PatternOccurrence[] = [];

  const checkNode = (node: any) => {
    if (!node || typeof node !== "object") return;

    // Look for createContext calls
    if (node.type === "CallExpression" && node.callee?.name === "createContext") {
      providers.push({
        name: "ContextProvider",
        file,
        line: node.loc?.start?.line,
        type: "providers",
        confidence: 0.95,
        description: "Context API Provider pattern",
      });
    }

    // Look for <*.Provider> JSX usage
    if (node.type === "JSXElement" && node.openingElement?.name?.property?.name === "Provider") {
      providers.push({
        name: node.openingElement.name.object?.name + ".Provider",
        file,
        line: node.loc?.start?.line,
        type: "providers",
        confidence: 1.0,
        description: "Context Provider usage",
      });
    }

    for (const key in node) {
      if (Array.isArray(node[key])) {
        node[key].forEach(checkNode);
      } else if (typeof node[key] === "object") {
        checkNode(node[key]);
      }
    }
  };

  checkNode(ast);
  return providers;
}

// ====================== Vue Pattern Detectors ======================

function detectVueComposables(ast: ASTNode, file: string): PatternOccurrence[] {
  const composables: PatternOccurrence[] = [];

  const checkNode = (node: any) => {
    if (!node || typeof node !== "object") return;

    // Look for function declarations or exports starting with "use"
    if ((node.type === "FunctionDeclaration" || node.type === "VariableDeclarator") &&
        node.id?.name?.startsWith("use")) {
      composables.push({
        name: node.id.name,
        file,
        line: node.loc?.start?.line,
        type: "composables",
        confidence: 0.95,
        description: `Vue composable: ${node.id.name}`,
      });
    }

    // Look for exported arrow functions starting with "use"
    if (node.type === "ExportNamedDeclaration" &&
        node.declaration?.type === "VariableDeclaration") {
      for (const declarator of node.declaration.declarations) {
        if (declarator.id?.name?.startsWith("use")) {
          composables.push({
            name: declarator.id.name,
            file,
            line: declarator.loc?.start?.line,
            type: "composables",
            confidence: 0.95,
            description: `Exported Vue composable: ${declarator.id.name}`,
          });
        }
      }
    }

    for (const key in node) {
      if (Array.isArray(node[key])) {
        node[key].forEach(checkNode);
      } else if (typeof node[key] === "object") {
        checkNode(node[key]);
      }
    }
  };

  checkNode(ast);
  return composables;
}

function detectPiniaStores(ast: ASTNode, file: string): PiniaStorePattern[] {
  const stores: PiniaStorePattern[] = [];

  const checkNode = (node: any) => {
    if (!node || typeof node !== "object") return;

    // Look for defineStore calls
    if (node.type === "CallExpression" && node.callee?.name === "defineStore") {
      const storeName = node.arguments[0]?.value || node.arguments[0]?.name || "unknown";
      const storeOptions = node.arguments[1];

      const store: PiniaStorePattern = {
        name: storeName,
        file,
        state: [],
        getters: [],
        actions: [],
        usageCount: 0,
      };

      // Extract state, getters, actions
      if (storeOptions?.type === "ObjectExpression") {
        for (const prop of storeOptions.properties) {
          if (prop.key?.name === "state") {
            // Try to extract state properties
            if (prop.value?.body?.type === "ObjectExpression") {
              store.state = prop.value.body.properties?.map((p: any) => p.key?.name).filter(Boolean) || [];
            }
          } else if (prop.key?.name === "getters") {
            store.getters = prop.value?.properties?.map((p: any) => p.key?.name).filter(Boolean) || [];
          } else if (prop.key?.name === "actions") {
            store.actions = prop.value?.properties?.map((p: any) => p.key?.name).filter(Boolean) || [];
          }
        }
      }

      stores.push(store);
    }

    for (const key in node) {
      if (Array.isArray(node[key])) {
        node[key].forEach(checkNode);
      } else if (typeof node[key] === "object") {
        checkNode(node[key]);
      }
    }
  };

  checkNode(ast);
  return stores;
}

function detectVuePlugins(ast: ASTNode, file: string): VuePluginPattern[] {
  const plugins: VuePluginPattern[] = [];

  const checkNode = (node: any) => {
    if (!node || typeof node !== "object") return;

    // Look for export default with install function
    if (node.type === "ExportDefaultDeclaration" && node.declaration?.type === "ObjectExpression") {
      const hasInstall = node.declaration.properties?.some((p: any) => p.key?.name === "install");
      if (hasInstall) {
        plugins.push({
          name: path.basename(file, path.extname(file)),
          file,
          installFn: true,
          provides: [],
        });
      }
    }

    for (const key in node) {
      if (Array.isArray(node[key])) {
        node[key].forEach(checkNode);
      } else if (typeof node[key] === "object") {
        checkNode(node[key]);
      }
    }
  };

  checkNode(ast);
  return plugins;
}

function detectVueDirectives(ast: ASTNode, file: string): PatternOccurrence[] {
  const directives: PatternOccurrence[] = [];

  const checkNode = (node: any) => {
    if (!node || typeof node !== "object") return;

    // Look for directive definitions (app.directive or export with vDirectiveName)
    if (node.type === "CallExpression" &&
        node.callee?.property?.name === "directive" &&
        node.arguments[0]?.value) {
      directives.push({
        name: node.arguments[0].value,
        file,
        line: node.loc?.start?.line,
        type: "vue-directives",
        confidence: 1.0,
        description: `Vue directive: ${node.arguments[0].value}`,
      });
    }

    for (const key in node) {
      if (Array.isArray(node[key])) {
        node[key].forEach(checkNode);
      } else if (typeof node[key] === "object") {
        checkNode(node[key]);
      }
    }
  };

  checkNode(ast);
  return directives;
}

function detectNuxtModules(ast: ASTNode, file: string): NuxtModulePattern[] {
  const modules: NuxtModulePattern[] = [];

  // Check if this looks like a Nuxt module (has defineNuxtModule)
  const checkNode = (node: any) => {
    if (!node || typeof node !== "object") return;

    if (node.type === "CallExpression" && node.callee?.name === "defineNuxtModule") {
      modules.push({
        name: path.basename(file, path.extname(file)),
        file,
        setup: true,
        hooks: [],
      });
    }

    for (const key in node) {
      if (Array.isArray(node[key])) {
        node[key].forEach(checkNode);
      } else if (typeof node[key] === "object") {
        checkNode(node[key]);
      }
    }
  };

  checkNode(ast);
  return modules;
}

function detectNuxtMiddleware(ast: ASTNode, file: string): PatternOccurrence[] {
  const middleware: PatternOccurrence[] = [];

  // Check if file is in middleware/ and exports default function
  if (file.includes("/middleware/") || file.includes("\\middleware\\")) {
    const checkNode = (node: any) => {
      if (!node || typeof node !== "object") return;

      if (node.type === "ExportDefaultDeclaration" &&
          (node.declaration?.type === "FunctionDeclaration" ||
           node.declaration?.type === "ArrowFunctionExpression")) {
        middleware.push({
          name: path.basename(file, path.extname(file)),
          file,
          line: node.loc?.start?.line,
          type: "nuxt-middleware",
          confidence: 1.0,
          description: "Nuxt middleware",
        });
      }

      for (const key in node) {
        if (Array.isArray(node[key])) {
          node[key].forEach(checkNode);
        } else if (typeof node[key] === "object") {
          checkNode(node[key]);
        }
      }
    };

    checkNode(ast);
  }

  return middleware;
}

// ====================== Common Pattern Detectors ======================

function detectDataFetchingPatterns(ast: ASTNode, file: string): PatternOccurrence[] {
  const patterns: PatternOccurrence[] = [];
  const dataFetchingCalls = ["fetch", "axios", "useFetch", "useAsyncData", "$fetch", "useQuery", "useMutation"];

  const checkNode = (node: any) => {
    if (!node || typeof node !== "object") return;

    if (node.type === "CallExpression" && node.callee?.name &&
        dataFetchingCalls.some(fn => node.callee.name.includes(fn))) {
      patterns.push({
        name: node.callee.name,
        file,
        line: node.loc?.start?.line,
        type: "data-fetching",
        confidence: 0.9,
        description: `Data fetching with ${node.callee.name}`,
      });
    }

    for (const key in node) {
      if (Array.isArray(node[key])) {
        node[key].forEach(checkNode);
      } else if (typeof node[key] === "object") {
        checkNode(node[key]);
      }
    }
  };

  checkNode(ast);
  return patterns;
}

function detectErrorHandlingPatterns(ast: ASTNode, file: string): PatternOccurrence[] {
  const patterns: PatternOccurrence[] = [];

  const checkNode = (node: any) => {
    if (!node || typeof node !== "object") return;

    // Try-catch blocks
    if (node.type === "TryStatement") {
      patterns.push({
        name: "try-catch",
        file,
        line: node.loc?.start?.line,
        type: "error-handling",
        confidence: 1.0,
        description: "Try-catch error handling",
      });
    }

    // Error boundaries (React)
    if (node.type === "ClassDeclaration" && node.id?.name.includes("ErrorBoundary")) {
      patterns.push({
        name: node.id.name,
        file,
        line: node.loc?.start?.line,
        type: "error-handling",
        confidence: 0.95,
        description: "React Error Boundary",
      });
    }

    for (const key in node) {
      if (Array.isArray(node[key])) {
        node[key].forEach(checkNode);
      } else if (typeof node[key] === "object") {
        checkNode(node[key]);
      }
    }
  };

  checkNode(ast);
  return patterns;
}

function detectFormPatterns(ast: ASTNode, file: string): PatternOccurrence[] {
  const patterns: PatternOccurrence[] = [];
  const formLibraries = ["useForm", "Formik", "useFormik", "Controller", "FormProvider"];

  const checkNode = (node: any) => {
    if (!node || typeof node !== "object") return;

    // Detect form library usage
    if (node.type === "CallExpression" && node.callee?.name &&
        formLibraries.some(lib => node.callee.name.includes(lib))) {
      patterns.push({
        name: node.callee.name,
        file,
        line: node.loc?.start?.line,
        type: "forms",
        confidence: 0.9,
        description: `Form management with ${node.callee.name}`,
      });
    }

    // Detect form elements
    if (node.type === "JSXElement" && node.openingElement?.name?.name === "form") {
      patterns.push({
        name: "native-form",
        file,
        line: node.loc?.start?.line,
        type: "forms",
        confidence: 0.8,
        description: "Native HTML form",
      });
    }

    for (const key in node) {
      if (Array.isArray(node[key])) {
        node[key].forEach(checkNode);
      } else if (typeof node[key] === "object") {
        checkNode(node[key]);
      }
    }
  };

  checkNode(ast);
  return patterns;
}

// ====================== Analysis Helpers ======================

function detectCustomPatternsInProject(result: PatternAnalysisResult): Array<{ name: string; occurrences: number; files: string[]; description: string }> {
  // Analyze all patterns to find recurring custom patterns
  const customPatterns: Map<string, { files: Set<string>; description: string }> = new Map();

  // Check for frequently used custom hooks
  if (result.patterns.customHooks && result.patterns.customHooks.length > 5) {
    const hookCounts = new Map<string, Set<string>>();
    for (const hook of result.patterns.customHooks) {
      if (!hookCounts.has(hook.name)) {
        hookCounts.set(hook.name, new Set());
      }
      hookCounts.get(hook.name)!.add(hook.file);
    }

    for (const [name, files] of hookCounts) {
      if (files.size >= 3) {
        customPatterns.set(name, {
          files,
          description: `Frequently used custom hook (${files.size} files)`,
        });
      }
    }
  }

  return Array.from(customPatterns.entries()).map(([name, data]) => ({
    name,
    occurrences: data.files.size,
    files: Array.from(data.files),
    description: data.description,
  }));
}

function compareBestPractices(result: PatternAnalysisResult, framework: FrameworkType): BestPracticeComparison[] {
  const comparisons: BestPracticeComparison[] = [];

  if (framework === "react" || framework === "react-native") {
    // Check if using hooks instead of class components
    comparisons.push({
      pattern: "Functional Components with Hooks",
      status: result.patterns.hooks ? "follows" : "unknown",
      details: result.patterns.hooks
        ? "Project uses React hooks for state management"
        : "Unable to determine component style",
      suggestions: result.patterns.hooks
        ? undefined
        : ["Consider migrating to functional components with hooks"],
    });

    // Check for custom hooks reusability
    if (result.patterns.customHooks && result.patterns.customHooks.length > 10) {
      comparisons.push({
        pattern: "Custom Hooks for Logic Reuse",
        status: "follows",
        details: `Project has ${result.patterns.customHooks.length} custom hooks`,
        suggestions: undefined,
      });
    }
  }

  if (framework === "vue3" || framework === "nuxt3") {
    // Check for Composition API usage
    comparisons.push({
      pattern: "Composition API with Composables",
      status: result.patterns.composables ? "follows" : "unknown",
      details: result.patterns.composables
        ? `Project uses ${result.patterns.composables.length} composables`
        : "Unable to determine API style",
      suggestions: result.patterns.composables
        ? undefined
        : ["Consider using Composition API with composables"],
    });

    // Check for Pinia vs Vuex
    if (result.patterns.piniaStores && result.patterns.piniaStores.length > 0) {
      comparisons.push({
        pattern: "Pinia for State Management",
        status: "follows",
        details: `Project uses Pinia with ${result.patterns.piniaStores.length} stores`,
        suggestions: undefined,
      });
    }
  }

  return comparisons;
}

function detectAntipatterns(result: PatternAnalysisResult): Antipattern[] {
  const antipatterns: Antipattern[] = [];

  // Check for too many state providers (prop drilling indication)
  if (result.patterns.providers && result.patterns.providers.length > 10) {
    antipatterns.push({
      type: "excessive-providers",
      file: "multiple",
      severity: "warning",
      description: `Found ${result.patterns.providers.length} Context providers`,
      suggestion: "Consider consolidating providers or using a state management library",
    });
  }

  // Check for Pinia stores with too many actions (SRP violation)
  if (result.patterns.piniaStores) {
    for (const store of result.patterns.piniaStores) {
      if (store.actions.length > 20) {
        antipatterns.push({
          type: "bloated-store",
          file: store.file,
          severity: "warning",
          description: `Store "${store.name}" has ${store.actions.length} actions`,
          suggestion: "Consider splitting into multiple smaller stores",
        });
      }
    }
  }

  return antipatterns;
}

function generateRecommendations(result: PatternAnalysisResult, framework: FrameworkType): string[] {
  const recommendations: string[] = [];

  // General recommendations
  if (result.summary.totalPatterns === 0) {
    recommendations.push("No framework patterns detected. Consider adopting standard patterns for better maintainability.");
  }

  // React recommendations
  if (framework === "react" || framework === "react-native") {
    if (!result.patterns.customHooks || result.patterns.customHooks.length < 3) {
      recommendations.push("Consider extracting reusable logic into custom hooks.");
    }

    if (result.patterns.providers && result.patterns.providers.length > 5) {
      recommendations.push("Many Context providers detected. Consider using a state management library like Redux or Zustand.");
    }

    if (!result.patterns.errorHandling || result.patterns.errorHandling.length === 0) {
      recommendations.push("No error handling patterns detected. Consider adding Error Boundaries.");
    }
  }

  // Vue/Nuxt recommendations
  if (framework === "vue3" || framework === "nuxt3") {
    if (!result.patterns.composables || result.patterns.composables.length < 3) {
      recommendations.push("Consider creating composables to share logic across components.");
    }

    if (result.patterns.piniaStores && result.patterns.piniaStores.length === 0) {
      recommendations.push("No Pinia stores detected. Consider using Pinia for state management.");
    }
  }

  // Data fetching recommendations
  if (!result.patterns.dataFetching || result.patterns.dataFetching.length < 5) {
    recommendations.push("Consider standardizing data fetching patterns across the application.");
  }

  return recommendations.length > 0 ? recommendations : ["Project follows good patterns. Continue maintaining code quality."];
}

function generateBasicRecommendations(result: PatternAnalysisResult): string[] {
  const recommendations: string[] = [];

  if (result.summary.totalPatterns > 0) {
    recommendations.push(`Found ${result.summary.totalPatterns} patterns across ${result.project.totalFiles} files.`);

    if (result.summary.mostCommon.length > 0) {
      recommendations.push(`Most common patterns: ${result.summary.mostCommon.slice(0, 3).join(", ")}`);
    }
  } else {
    recommendations.push("No specific patterns detected. Run with --compare-best-practices for detailed analysis.");
  }

  return recommendations;
}

function calculateSummary(result: PatternAnalysisResult): void {
  let total = 0;
  const byType: Record<string, number> = {};

  // Count all patterns
  for (const [key, patterns] of Object.entries(result.patterns)) {
    if (Array.isArray(patterns) && patterns.length > 0) {
      byType[key] = patterns.length;
      total += patterns.length;
    }
  }

  result.summary.totalPatterns = total;
  result.summary.byType = byType;

  // Find most common patterns
  result.summary.mostCommon = Object.entries(byType)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([key]) => key);
}
