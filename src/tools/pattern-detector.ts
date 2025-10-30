/**
 * Pattern Detector Tool
 *
 * Detect framework-specific patterns, custom implementations, and adherence to best practices.
 */

import * as path from "path";
import glob from "fast-glob";
import { ASTParser } from "../services/ast-parser.js";
import { FrameworkDetector } from "../utils/framework-detector.js";
import { Pagination } from "../utils/pagination.js";
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
  FastifyRoutePattern,
  FastifyPluginPattern,
  FastifyHookPattern,
  PostgresQueryPattern,
  KafkaProducerPattern,
  KafkaConsumerPattern,
  AlyxstreamTaskPattern,
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
    page,
    pageSize,
  } = params;

  // Detect framework
  const frameworkInfo = await FrameworkDetector.detect(projectPath);
  const framework = frameworkInfo.framework;

  // Get file patterns
  const defaultGlobs = includeGlobs || FrameworkDetector.getDefaultIncludeGlobs(framework);
  const files = await glob(defaultGlobs, {
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
      } else if (framework === "fastify") {
        detectFastifyPatterns(ast, relPath, result, patternTypes);
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

  // Auto-optimization for large responses to prevent MCP token limit errors
  let autoOptimized = false;
  let paginatedResult: PatternAnalysisResult & { _pagination?: any } = result;
  let paginationInfo: any = null;

  // Calculate total pattern count across all arrays
  const patternArrays = Object.entries(result.patterns).filter(([_, v]) => Array.isArray(v));
  const totalPatterns = patternArrays.reduce((sum, [_, arr]) => sum + (arr as any[]).length, 0);
  const PATTERN_LIMIT = 200; // Total limit across all pattern types

  // Auto-optimize if there are many patterns and no explicit pagination params
  if (!page && !pageSize && totalPatterns > PATTERN_LIMIT) {
    autoOptimized = true;

    // Proportionally limit each pattern array
    const limitedPatterns: any = {};
    for (const [key, patterns] of patternArrays) {
      const patternArray = patterns as any[];
      const proportion = patternArray.length / totalPatterns;
      const limit = Math.max(5, Math.floor(PATTERN_LIMIT * proportion)); // At least 5 per type
      limitedPatterns[key] = patternArray.slice(0, limit);
    }

    paginatedResult = {
      ...result,
      patterns: limitedPatterns,
    };

    // Add auto-optimization notice to recommendations
    result.recommendations.unshift(
      `📊 Auto-optimized for large response: Showing ${PATTERN_LIMIT} of ${totalPatterns} total patterns. ` +
      `Each pattern type is proportionally limited. Use 'page' and 'pageSize' parameters for full pagination control.`
    );
  } else if (patternArrays.length > 0 && (page || pageSize)) {
    // Manual pagination: paginate the largest pattern collection
    const largestPattern = patternArrays.reduce((max, curr) =>
      (curr[1] as any[]).length > (max[1] as any[]).length ? curr : max
    );

    const [patternKey, patternArray] = largestPattern;
    const paginated = Pagination.smartPaginate(patternArray as any[], { page, pageSize });

    paginatedResult = {
      ...result,
      patterns: {
        ...result.patterns,
        [patternKey]: paginated.items,
      },
    };

    paginationInfo = paginated.pagination;
  }

  // Limit other arrays if auto-optimized
  if (autoOptimized) {
    if (paginatedResult.antipatterns && paginatedResult.antipatterns.length > 20) {
      paginatedResult.antipatterns = paginatedResult.antipatterns.slice(0, 20);
    }
    if (paginatedResult.bestPractices && paginatedResult.bestPractices.length > 20) {
      paginatedResult.bestPractices = paginatedResult.bestPractices.slice(0, 20);
    }
    if (paginatedResult.customPatterns && paginatedResult.customPatterns.length > 20) {
      paginatedResult.customPatterns = paginatedResult.customPatterns.slice(0, 20);
    }
  }

  // Add pagination metadata if paginated
  if (paginationInfo) {
    paginatedResult = Pagination.addPaginationMetadata(paginatedResult, paginationInfo);
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(paginatedResult, null, 2),
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

  // React Native mobile patterns
  if (shouldDetect("rn-navigation")) {
    const navigation = detectReactNavigationPatterns(ast, file);
    if (navigation.length > 0) {
      result.patterns.rnNavigation = result.patterns.rnNavigation || [];
      result.patterns.rnNavigation.push(...navigation);
    }
  }

  if (shouldDetect("rn-platform-specific")) {
    const platform = detectPlatformSpecificPatterns(ast, file);
    if (platform.length > 0) {
      result.patterns.rnPlatformSpecific = result.patterns.rnPlatformSpecific || [];
      result.patterns.rnPlatformSpecific.push(...platform);
    }
  }

  if (shouldDetect("rn-native-modules")) {
    const nativeModules = detectNativeModulePatterns(ast, file);
    if (nativeModules.length > 0) {
      result.patterns.rnNativeModules = result.patterns.rnNativeModules || [];
      result.patterns.rnNativeModules.push(...nativeModules);
    }
  }

  if (shouldDetect("rn-animations")) {
    const animations = detectAnimationPatterns(ast, file);
    if (animations.length > 0) {
      result.patterns.rnAnimations = result.patterns.rnAnimations || [];
      result.patterns.rnAnimations.push(...animations);
    }
  }

  if (shouldDetect("rn-permissions")) {
    const permissions = detectPermissionPatterns(ast, file);
    if (permissions.length > 0) {
      result.patterns.rnPermissions = result.patterns.rnPermissions || [];
      result.patterns.rnPermissions.push(...permissions);
    }
  }

  if (shouldDetect("rn-storage")) {
    const storage = detectStoragePatterns(ast, file);
    if (storage.length > 0) {
      result.patterns.rnStorage = result.patterns.rnStorage || [];
      result.patterns.rnStorage.push(...storage);
    }
  }

  if (shouldDetect("rn-gestures")) {
    const gestures = detectGesturePatterns(ast, file);
    if (gestures.length > 0) {
      result.patterns.rnGestures = result.patterns.rnGestures || [];
      result.patterns.rnGestures.push(...gestures);
    }
  }

  if (shouldDetect("rn-media")) {
    const media = detectMediaPatterns(ast, file);
    if (media.length > 0) {
      result.patterns.rnMedia = result.patterns.rnMedia || [];
      result.patterns.rnMedia.push(...media);
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
  if (framework === "react" || framework === "react-native" || framework === "expo") {
    if (!result.patterns.customHooks || result.patterns.customHooks.length < 3) {
      recommendations.push("Consider extracting reusable logic into custom hooks.");
    }

    if (result.patterns.providers && result.patterns.providers.length > 5) {
      recommendations.push("Many Context providers detected. Consider using a state management library like Redux or Zustand.");
    }

    if (!result.patterns.errorHandling || result.patterns.errorHandling.length === 0) {
      recommendations.push("No error handling patterns detected. Consider adding Error Boundaries.");
    }

    // React Native / Expo specific recommendations
    if (framework === "react-native" || framework === "expo") {
      if (!result.patterns.rnNavigation || result.patterns.rnNavigation.length === 0) {
        recommendations.push("📱 No navigation patterns detected. Consider using React Navigation or Expo Router.");
      }

      if (result.patterns.rnPlatformSpecific && result.patterns.rnPlatformSpecific.length > 10) {
        recommendations.push("📱 Heavy use of Platform-specific code detected. Consider extracting to .ios.tsx/.android.tsx files.");
      }

      if (result.patterns.rnAnimations && result.patterns.rnAnimations.length > 5) {
        recommendations.push("📱 Consider using Reanimated 2/3 for performant animations instead of Animated API.");
      }

      if (result.patterns.rnStorage && result.patterns.rnStorage.length > 3) {
        recommendations.push("📱 Multiple storage operations detected. Consider using MMKV for better performance than AsyncStorage.");
      }

      if (result.patterns.rnNativeModules && result.patterns.rnNativeModules.length > 0) {
        recommendations.push("📱 Native modules detected. Ensure proper error handling and fallbacks for platform differences.");
      }

      if (!result.patterns.rnGestures && result.patterns.rnAnimations && result.patterns.rnAnimations.length > 3) {
        recommendations.push("📱 Consider using React Native Gesture Handler for better gesture performance.");
      }

      if (result.patterns.rnPermissions && result.patterns.rnPermissions.length > 0) {
        recommendations.push("📱 Permission requests detected. Ensure proper user messaging and error handling.");
      }
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

// ====================== React Native Mobile Pattern Detectors ======================

/**
 * Detect React Navigation patterns (navigators, screens, navigation hooks)
 */
function detectReactNavigationPatterns(ast: ASTNode, file: string): PatternOccurrence[] {
  const patterns: PatternOccurrence[] = [];
  const navigators = ["createStackNavigator", "createBottomTabNavigator", "createDrawerNavigator", "createNativeStackNavigator", "createMaterialTopTabNavigator"];
  const navHooks = ["useNavigation", "useRoute", "useFocusEffect", "useIsFocused"];

  const checkNode = (node: any) => {
    if (!node || typeof node !== "object") return;

    // Detect navigator creation
    if (node.type === "CallExpression" && node.callee?.name && navigators.includes(node.callee.name)) {
      patterns.push({
        name: node.callee.name,
        file,
        line: node.loc?.start?.line,
        type: "rn-navigation",
        confidence: 1.0,
        description: `React Navigation: ${node.callee.name}`,
      });
    }

    // Detect navigation hooks
    if (node.type === "CallExpression" && node.callee?.name && navHooks.includes(node.callee.name)) {
      patterns.push({
        name: node.callee.name,
        file,
        line: node.loc?.start?.line,
        type: "rn-navigation",
        confidence: 1.0,
        description: `Navigation hook: ${node.callee.name}`,
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

/**
 * Detect Platform-specific code (Platform.OS, Platform.select)
 */
function detectPlatformSpecificPatterns(ast: ASTNode, file: string): PatternOccurrence[] {
  const patterns: PatternOccurrence[] = [];

  const checkNode = (node: any) => {
    if (!node || typeof node !== "object") return;

    // Platform.OS, Platform.select, Platform.Version
    if (node.type === "MemberExpression" && node.object?.name === "Platform") {
      const property = node.property?.name;
      if (property === "OS" || property === "select" || property === "Version") {
        patterns.push({
          name: `Platform.${property}`,
          file,
          line: node.loc?.start?.line,
          type: "rn-platform-specific",
          confidence: 1.0,
          description: `Platform-specific code: Platform.${property}`,
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
  return patterns;
}

/**
 * Detect Native Module usage (NativeModules, NativeEventEmitter, TurboModuleRegistry)
 */
function detectNativeModulePatterns(ast: ASTNode, file: string): PatternOccurrence[] {
  const patterns: PatternOccurrence[] = [];

  const checkNode = (node: any) => {
    if (!node || typeof node !== "object") return;

    // NativeModules.SomeModule
    if (node.type === "MemberExpression" && node.object?.name === "NativeModules") {
      patterns.push({
        name: `NativeModules.${node.property?.name || "unknown"}`,
        file,
        line: node.loc?.start?.line,
        type: "rn-native-modules",
        confidence: 0.95,
        description: "Native module access",
      });
    }

    // NativeEventEmitter, TurboModuleRegistry
    if (node.type === "NewExpression" && (node.callee?.name === "NativeEventEmitter" || node.callee?.name === "TurboModuleRegistry")) {
      patterns.push({
        name: node.callee.name,
        file,
        line: node.loc?.start?.line,
        type: "rn-native-modules",
        confidence: 1.0,
        description: `Native module pattern: ${node.callee.name}`,
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

/**
 * Detect Animation patterns (Animated, Reanimated, worklets)
 */
function detectAnimationPatterns(ast: ASTNode, file: string): PatternOccurrence[] {
  const patterns: PatternOccurrence[] = [];
  const animatedAPIs = ["useSharedValue", "useAnimatedStyle", "useDerivedValue", "withTiming", "withSpring", "withDecay", "runOnJS", "runOnUI"];

  const checkNode = (node: any) => {
    if (!node || typeof node !== "object") return;

    // Reanimated 2/3 hooks and functions
    if (node.type === "CallExpression" && node.callee?.name && animatedAPIs.includes(node.callee.name)) {
      patterns.push({
        name: node.callee.name,
        file,
        line: node.loc?.start?.line,
        type: "rn-animations",
        confidence: 1.0,
        description: `Reanimated: ${node.callee.name}`,
      });
    }

    // Animated API (Animated.Value, Animated.timing, etc.)
    if (node.type === "MemberExpression" && node.object?.name === "Animated") {
      patterns.push({
        name: `Animated.${node.property?.name || "API"}`,
        file,
        line: node.loc?.start?.line,
        type: "rn-animations",
        confidence: 0.9,
        description: "React Native Animated API",
      });
    }

    // 'worklet' directive for Reanimated
    if (node.type === "ExpressionStatement" && node.directive === "worklet") {
      patterns.push({
        name: "worklet",
        file,
        line: node.loc?.start?.line,
        type: "rn-animations",
        confidence: 1.0,
        description: "Reanimated worklet function",
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

/**
 * Detect Permission request patterns
 */
function detectPermissionPatterns(ast: ASTNode, file: string): PatternOccurrence[] {
  const patterns: PatternOccurrence[] = [];
  const permissionAPIs = ["request", "check", "checkMultiple", "requestMultiple", "openSettings", "checkNotifications", "requestNotifications"];

  const checkNode = (node: any) => {
    if (!node || typeof node !== "object") return;

    // Permissions.check, Permissions.request, etc.
    if (node.type === "MemberExpression" && node.object?.name === "Permissions" && node.property?.name && permissionAPIs.includes(node.property.name)) {
      patterns.push({
        name: `Permissions.${node.property.name}`,
        file,
        line: node.loc?.start?.line,
        type: "rn-permissions",
        confidence: 1.0,
        description: "Permission request",
      });
    }

    // Expo permissions
    if (node.type === "MemberExpression" && node.object?.property?.name === "Permissions") {
      patterns.push({
        name: "Expo.Permissions",
        file,
        line: node.loc?.start?.line,
        type: "rn-permissions",
        confidence: 0.9,
        description: "Expo permission request",
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

/**
 * Detect Storage patterns (AsyncStorage, MMKV, SecureStore)
 */
function detectStoragePatterns(ast: ASTNode, file: string): PatternOccurrence[] {
  const patterns: PatternOccurrence[] = [];
  const storageAPIs = ["getItem", "setItem", "removeItem", "clear", "getAllKeys", "multiGet", "multiSet"];

  const checkNode = (node: any) => {
    if (!node || typeof node !== "object") return;

    // AsyncStorage
    if (node.type === "MemberExpression" && node.object?.name === "AsyncStorage" && node.property?.name && storageAPIs.includes(node.property.name)) {
      patterns.push({
        name: `AsyncStorage.${node.property.name}`,
        file,
        line: node.loc?.start?.line,
        type: "rn-storage",
        confidence: 1.0,
        description: "AsyncStorage operation",
      });
    }

    // MMKV
    if (node.type === "MemberExpression" && (node.object?.name === "MMKV" || node.object?.name?.includes("storage")) && (node.property?.name === "set" || node.property?.name === "getString" || node.property?.name === "delete")) {
      patterns.push({
        name: "MMKV",
        file,
        line: node.loc?.start?.line,
        type: "rn-storage",
        confidence: 0.9,
        description: "MMKV storage operation",
      });
    }

    // SecureStore (Expo)
    if (node.type === "MemberExpression" && node.object?.name === "SecureStore") {
      patterns.push({
        name: "SecureStore",
        file,
        line: node.loc?.start?.line,
        type: "rn-storage",
        confidence: 1.0,
        description: "Expo SecureStore operation",
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

/**
 * Detect Gesture Handler patterns
 */
function detectGesturePatterns(ast: ASTNode, file: string): PatternOccurrence[] {
  const patterns: PatternOccurrence[] = [];
  const gestureTypes = ["PanGestureHandler", "TapGestureHandler", "LongPressGestureHandler", "RotationGestureHandler", "PinchGestureHandler", "Swipeable"];
  const gestureHooks = ["useAnimatedGestureHandler", "Gesture"];

  const checkNode = (node: any) => {
    if (!node || typeof node !== "object") return;

    // Gesture components
    if (node.type === "JSXOpeningElement" && node.name?.name && gestureTypes.includes(node.name.name)) {
      patterns.push({
        name: node.name.name,
        file,
        line: node.loc?.start?.line,
        type: "rn-gestures",
        confidence: 1.0,
        description: `Gesture handler: ${node.name.name}`,
      });
    }

    // Gesture hooks
    if (node.type === "CallExpression" && node.callee?.name && gestureHooks.includes(node.callee.name)) {
      patterns.push({
        name: node.callee.name,
        file,
        line: node.loc?.start?.line,
        type: "rn-gestures",
        confidence: 1.0,
        description: `Gesture hook: ${node.callee.name}`,
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

/**
 * Detect Media patterns (Image picker, Camera, Video)
 */
function detectMediaPatterns(ast: ASTNode, file: string): PatternOccurrence[] {
  const patterns: PatternOccurrence[] = [];
  const mediaAPIs = ["launchImageLibrary", "launchCamera", "openPicker", "openCamera", "ImagePicker", "Camera"];

  const checkNode = (node: any) => {
    if (!node || typeof node !== "object") return;

    // Image/Camera picker functions
    if (node.type === "CallExpression" && node.callee?.name && mediaAPIs.some(api => node.callee.name.includes(api))) {
      patterns.push({
        name: node.callee.name,
        file,
        line: node.loc?.start?.line,
        type: "rn-media",
        confidence: 0.95,
        description: `Media API: ${node.callee.name}`,
      });
    }

    // Video/Audio components
    if (node.type === "JSXOpeningElement" && node.name?.name && (node.name.name === "Video" || node.name.name === "Audio" || node.name.name === "Camera")) {
      patterns.push({
        name: node.name.name,
        file,
        line: node.loc?.start?.line,
        type: "rn-media",
        confidence: 1.0,
        description: `Media component: ${node.name.name}`,
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
/**
 * Detect Fastify-specific patterns
 */
function detectFastifyPatterns(
  ast: ASTNode,
  file: string,
  result: PatternAnalysisResult,
  requestedTypes?: PatternType[]
): void {
  const shouldDetect = (type: PatternType) => !requestedTypes || requestedTypes.includes(type);

  // Detect Fastify routes
  if (shouldDetect("fastify-routes")) {
    const routes = detectFastifyRoutes(ast, file);
    if (routes.length > 0) {
      result.patterns.fastifyRoutes = result.patterns.fastifyRoutes || [];
      result.patterns.fastifyRoutes.push(...routes);
    }
  }

  // Detect Fastify plugins
  if (shouldDetect("fastify-plugins")) {
    const plugins = detectFastifyPlugins(ast, file);
    if (plugins.length > 0) {
      result.patterns.fastifyPlugins = result.patterns.fastifyPlugins || [];
      result.patterns.fastifyPlugins.push(...plugins);
    }
  }

  // Detect Fastify hooks
  if (shouldDetect("fastify-hooks")) {
    const hooks = detectFastifyHooks(ast, file);
    if (hooks.length > 0) {
      result.patterns.fastifyHooks = result.patterns.fastifyHooks || [];
      result.patterns.fastifyHooks.push(...hooks);
    }
  }

  // Detect PostgreSQL queries
  if (shouldDetect("postgres-queries")) {
    const queries = detectPostgresQueries(ast, file);
    if (queries.length > 0) {
      result.patterns.postgresQueries = result.patterns.postgresQueries || [];
      result.patterns.postgresQueries.push(...queries);
    }
  }

  // Detect Kafka producers
  if (shouldDetect("kafka-producers")) {
    const producers = detectKafkaProducers(ast, file);
    if (producers.length > 0) {
      result.patterns.kafkaProducers = result.patterns.kafkaProducers || [];
      result.patterns.kafkaProducers.push(...producers);
    }
  }

  // Detect Kafka consumers
  if (shouldDetect("kafka-consumers")) {
    const consumers = detectKafkaConsumers(ast, file);
    if (consumers.length > 0) {
      result.patterns.kafkaConsumers = result.patterns.kafkaConsumers || [];
      result.patterns.kafkaConsumers.push(...consumers);
    }
  }

  // Detect Alyxstream tasks
  if (shouldDetect("alyxstream-tasks") || shouldDetect("alyxstream-operators") || shouldDetect("alyxstream-windows")) {
    const tasks = detectAlyxstreamTasks(ast, file);
    if (tasks.length > 0) {
      result.patterns.alyxstreamTasks = result.patterns.alyxstreamTasks || [];
      result.patterns.alyxstreamTasks.push(...tasks);
    }
  }
}

/**
 * Detect Fastify route definitions
 */
function detectFastifyRoutes(ast: ASTNode, file: string): FastifyRoutePattern[] {
  const routes: FastifyRoutePattern[] = [];
  const httpMethods = ["get", "post", "put", "delete", "patch", "options", "head"];

  const checkNode = (node: any) => {
    if (!node || typeof node !== "object") return;

    // Detect fastify.get('/path', handler), app.post('/path', handler), etc.
    if (
      node.type === "CallExpression" &&
      node.callee?.type === "MemberExpression" &&
      node.callee.property?.name &&
      httpMethods.includes(node.callee.property.name.toLowerCase())
    ) {
      const method = node.callee.property.name.toUpperCase() as FastifyRoutePattern["method"];
      const pathArg = node.arguments?.[0];
      const path = pathArg?.type === "StringLiteral" ? pathArg.value : pathArg?.value || "unknown";

      // Check if it has schema (second or third argument is an object with schema property)
      let hasSchema = false;
      let hasHooks = false;

      for (const arg of node.arguments || []) {
        if (arg.type === "ObjectExpression") {
          const props = arg.properties || [];
          hasSchema = props.some((p: any) => p.key?.name === "schema");
          hasHooks = props.some((p: any) => ["onRequest", "preHandler", "preParsing", "preValidation"].includes(p.key?.name));
        }
      }

      routes.push({
        name: `${method} ${path}`,
        file,
        method,
        path,
        hasSchema,
        hasHooks,
      });
    }

    // Detect fastify.route({ method, url, handler })
    if (
      node.type === "CallExpression" &&
      node.callee?.type === "MemberExpression" &&
      node.callee.property?.name === "route" &&
      node.arguments?.[0]?.type === "ObjectExpression"
    ) {
      const routeConfig = node.arguments[0];
      let method = "GET";
      let path = "unknown";
      let hasSchema = false;
      let hasHooks = false;

      for (const prop of routeConfig.properties || []) {
        if (prop.key?.name === "method" && prop.value?.value) {
          method = prop.value.value.toUpperCase();
        }
        if (prop.key?.name === "url" && prop.value?.value) {
          path = prop.value.value;
        }
        if (prop.key?.name === "schema") {
          hasSchema = true;
        }
        if (["onRequest", "preHandler", "preParsing", "preValidation"].includes(prop.key?.name)) {
          hasHooks = true;
        }
      }

      routes.push({
        name: `${method} ${path}`,
        file,
        method: method as FastifyRoutePattern["method"],
        path,
        hasSchema,
        hasHooks,
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
  return routes;
}

/**
 * Detect Fastify plugin registrations
 */
function detectFastifyPlugins(ast: ASTNode, file: string): FastifyPluginPattern[] {
  const plugins: FastifyPluginPattern[] = [];

  const checkNode = (node: any) => {
    if (!node || typeof node !== "object") return;

    // Detect fastify.register(plugin)
    if (
      node.type === "CallExpression" &&
      node.callee?.type === "MemberExpression" &&
      node.callee.property?.name === "register"
    ) {
      const pluginArg = node.arguments?.[0];
      let pluginName = "anonymous";

      if (pluginArg?.name) {
        pluginName = pluginArg.name;
      } else if (pluginArg?.type === "ArrowFunctionExpression" || pluginArg?.type === "FunctionExpression") {
        pluginName = "inline function";
      }

      plugins.push({
        name: pluginName,
        file,
        isAsync: pluginArg?.async === true,
        decorates: [], // Would need deeper AST analysis to detect decorations
      });
    }

    // Detect fastify-plugin exports
    if (
      node.type === "CallExpression" &&
      (node.callee?.name === "fp" || node.callee?.name === "fastifyPlugin")
    ) {
      plugins.push({
        name: path.basename(file, path.extname(file)),
        file,
        isAsync: node.arguments?.[0]?.async === true,
        decorates: [],
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
  return plugins;
}

/**
 * Detect Fastify hooks
 */
function detectFastifyHooks(ast: ASTNode, file: string): FastifyHookPattern[] {
  const hooks: FastifyHookPattern[] = [];
  const hookTypes = ["onRequest", "preParsing", "preValidation", "preHandler", "preSerialization", "onSend", "onResponse", "onError", "onTimeout"];

  const checkNode = (node: any) => {
    if (!node || typeof node !== "object") return;

    // Detect fastify.addHook('onRequest', handler)
    if (
      node.type === "CallExpression" &&
      node.callee?.type === "MemberExpression" &&
      node.callee.property?.name === "addHook" &&
      node.arguments?.[0]?.value &&
      hookTypes.includes(node.arguments[0].value)
    ) {
      hooks.push({
        name: node.arguments[0].value,
        file,
        hookType: node.arguments[0].value as FastifyHookPattern["hookType"],
        scope: "global",
      });
    }

    // Detect hooks in route definitions
    if (node.type === "ObjectExpression") {
      for (const prop of node.properties || []) {
        if (prop.key?.name && hookTypes.includes(prop.key.name)) {
          hooks.push({
            name: prop.key.name,
            file,
            hookType: prop.key.name as FastifyHookPattern["hookType"],
            scope: "route",
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
  return hooks;
}

/**
 * Detect PostgreSQL queries
 *
 * Note: Transaction detection requires tracking BEGIN/COMMIT/ROLLBACK context
 * which is not implemented yet.
 */
function detectPostgresQueries(ast: ASTNode, file: string): PostgresQueryPattern[] {
  const queries: PostgresQueryPattern[] = [];
  const queryKeywords = ["SELECT", "INSERT", "UPDATE", "DELETE", "CREATE", "ALTER", "DROP"];

  const checkNode = (node: any) => {
    if (!node || typeof node !== "object") return;

    // Detect .query() calls
    if (
      node.type === "CallExpression" &&
      node.callee?.type === "MemberExpression" &&
      node.callee.property?.name === "query"
    ) {
      const queryArg = node.arguments?.[0];
      let queryType: PostgresQueryPattern["queryType"] = "other";
      let usesParameterized = false;

      // Check if it's a template literal or string
      if (queryArg?.type === "StringLiteral" || queryArg?.type === "TemplateLiteral") {
        let queryText = "";

        // Handle string literals
        if (queryArg.type === "StringLiteral") {
          queryText = queryArg.value || "";
        }
        // Handle template literals - concatenate all quasis
        else if (queryArg.type === "TemplateLiteral" && queryArg.quasis) {
          queryText = queryArg.quasis
            .map((quasi: any) => quasi.value?.raw || "")
            .join(" ");
        }

        const upperQuery = queryText.toUpperCase();

        // Detect query type
        for (const keyword of queryKeywords) {
          if (upperQuery.includes(keyword)) {
            queryType = keyword as PostgresQueryPattern["queryType"];
            break;
          }
        }

        // Check for parameterized queries ($1, $2, etc.)
        usesParameterized = /\$\d+/.test(queryText) || node.arguments.length > 1;
      }

      queries.push({
        file,
        line: node.loc?.start?.line,
        queryType,
        usesParameterized,
        hasTransaction: false, // Would need deeper context analysis
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
  return queries;
}

/**
 * Helper function to check if a call expression has error handling via chaining
 * Looks for .catch() or .then(onSuccess, onError) patterns
 */
function checkForErrorHandlingChain(_node: any): boolean {
  // This is a simplified check - in a real scenario, we'd need to track
  // the expression statement that contains this call to see if it's chained
  // For now, we return false as a conservative default since we can't reliably
  // detect this without parent context or a more sophisticated traversal
  return false;
}

/**
 * Detect Kafka producers
 *
 * Note: Error handling detection is limited to .catch() chaining.
 * Try-catch blocks require parent node tracking which is not available in all AST parsers.
 */
function detectKafkaProducers(ast: ASTNode, file: string): KafkaProducerPattern[] {
  const producers: KafkaProducerPattern[] = [];

  const checkNode = (node: any) => {
    if (!node || typeof node !== "object") return;

    // Detect producer.send() calls
    if (
      node.type === "CallExpression" &&
      node.callee?.type === "MemberExpression" &&
      node.callee.property?.name === "send" &&
      node.callee.object?.name?.toLowerCase().includes("producer")
    ) {
      const topics: string[] = [];
      let hasErrorHandling = false;

      // Try to extract topic from arguments
      const sendArg = node.arguments?.[0];
      if (sendArg?.type === "ObjectExpression") {
        for (const prop of sendArg.properties || []) {
          if (prop.key?.name === "topic" && prop.value?.value) {
            topics.push(prop.value.value);
          }
        }
      }

      // Check for .catch() or .then(success, error) chaining
      // This is more reliable than checking parent nodes
      hasErrorHandling = checkForErrorHandlingChain(node);

      producers.push({
        name: node.callee.object.name,
        file,
        topics,
        hasErrorHandling,
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
  return producers;
}

/**
 * Detect Kafka consumers
 *
 * Note: Error handling detection is limited to .catch() chaining.
 * Try-catch blocks require parent node tracking which is not available in all AST parsers.
 */
function detectKafkaConsumers(ast: ASTNode, file: string): KafkaConsumerPattern[] {
  const consumers: KafkaConsumerPattern[] = [];

  const checkNode = (node: any) => {
    if (!node || typeof node !== "object") return;

    // Detect consumer.subscribe() calls
    if (
      node.type === "CallExpression" &&
      node.callee?.type === "MemberExpression" &&
      node.callee.property?.name === "subscribe" &&
      node.callee.object?.name?.toLowerCase().includes("consumer")
    ) {
      const topics: string[] = [];
      let groupId: string | undefined;
      let hasErrorHandling = false;

      // Extract topics
      const subscribeArg = node.arguments?.[0];
      if (subscribeArg?.type === "ObjectExpression") {
        for (const prop of subscribeArg.properties || []) {
          if (prop.key?.name === "topics") {
            if (prop.value?.type === "ArrayExpression") {
              for (const elem of prop.value.elements || []) {
                if (elem?.value) topics.push(elem.value);
              }
            } else if (prop.value?.value) {
              topics.push(prop.value.value);
            }
          }
        }
      }

      // Check for .catch() or .then(success, error) chaining
      // This is more reliable than checking parent nodes
      hasErrorHandling = checkForErrorHandlingChain(node);

      consumers.push({
        name: node.callee.object.name,
        file,
        topics,
        groupId,
        hasErrorHandling,
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
  return consumers;
}

/**
 * Detect Alyxstream tasks and patterns
 */
function detectAlyxstreamTasks(ast: ASTNode, file: string): AlyxstreamTaskPattern[] {
  const tasks: AlyxstreamTaskPattern[] = [];
  const operators = ["map", "filter", "fn", "fnRaw", "each", "keyBy", "withEventTime", "groupBy", "sumMap", "branch", "aggregate", "toStorage"];
  const windowOperators = ["slidingWindowTime", "tumblingWindowTime", "sessionWindow"];
  const sources = ["fromKafka", "fromArray", "fromStream"];

  const checkNode = (node: any) => {
    if (!node || typeof node !== "object") return;

    // Detect Task() calls or new Task()
    if (
      (node.type === "CallExpression" && node.callee?.name === "Task") ||
      (node.type === "NewExpression" && node.callee?.name === "Task")
    ) {
      let source: AlyxstreamTaskPattern["source"] = "custom";
      const detectedOperators: string[] = [];
      let hasWindowing = false;
      let hasStorage = false;

      // Traverse the chain to find operators
      let current = node;
      while (current) {
        if (current.type === "CallExpression" && current.callee?.type === "MemberExpression") {
          const methodName = current.callee.property?.name;

          if (methodName && sources.includes(methodName)) {
            if (methodName === "fromKafka") source = "kafka";
            else if (methodName === "fromArray") source = "array";
            else if (methodName === "fromStream") source = "stream";
          }

          if (methodName && operators.includes(methodName)) {
            detectedOperators.push(methodName);
          }

          if (methodName && windowOperators.includes(methodName)) {
            hasWindowing = true;
            detectedOperators.push(methodName);
          }

          if (methodName === "toStorage" || methodName === "aggregate") {
            hasStorage = true;
          }

          current = current.callee.object;
        } else {
          break;
        }
      }

      if (detectedOperators.length > 0) {
        tasks.push({
          name: `Task in ${path.basename(file)}`,
          file,
          source,
          operators: detectedOperators,
          hasWindowing,
          hasStorage,
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
  return tasks;
}
