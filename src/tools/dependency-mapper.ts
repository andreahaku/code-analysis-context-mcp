/**
 * Dependency Mapper Tool
 *
 * Visualize and analyze module dependencies, circular dependencies, and coupling.
 */

import * as path from "path";
import * as glob from "fast-glob";
import { ASTParser } from "../services/ast-parser.js";
import type {
  DependencyAnalysisParams,
  DependencyAnalysisResult,
  DependencyGraph,
  DependencyNode,
  DependencyEdge,
  CircularDependency,
  DependencyHotspot,
  DependencyMetrics,
} from "../types/index.js";

export async function analyzeDependencyGraph(
  params: DependencyAnalysisParams
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const {
    projectPath = process.cwd(),
    includeGlobs = ["src/**/*.{ts,tsx,js,jsx,vue}", "components/**/*.{ts,tsx,js,jsx,vue}"],
    excludeGlobs = ["**/node_modules/**", "**/dist/**", "**/build/**", "**/*.test.*", "**/*.spec.*"],
    depth,
    detectCircular = true,
    calculateMetrics = true,
    generateDiagram = true,
    focusModule,
    includeExternal = false,
  } = params;

  // Get all files
  const files = await glob.glob(includeGlobs, {
    cwd: projectPath,
    ignore: excludeGlobs,
    absolute: true,
  });

  // Build dependency graph
  const graph = await buildDependencyGraph(files, projectPath, includeExternal, depth);

  // Focus on specific module if requested
  let focusedGraph = graph;
  if (focusModule) {
    focusedGraph = filterGraphByModule(graph, focusModule, projectPath, depth);
  }

  // Detect circular dependencies
  let circularDependencies: CircularDependency[] = [];
  if (detectCircular) {
    circularDependencies = detectCircularDependencies(focusedGraph);
  }

  // Calculate metrics
  let metrics: DependencyMetrics = {
    totalModules: focusedGraph.nodes.length,
    avgDependencies: 0,
    maxDependencies: 0,
    coupling: 0,
    cohesion: 0,
    stability: 0,
  };

  if (calculateMetrics) {
    metrics = calculateDependencyMetrics(focusedGraph);
  }

  // Identify hotspots
  const hotspots = identifyHotspots(focusedGraph);

  // Generate diagram
  let diagram: string | undefined;
  if (generateDiagram) {
    diagram = generateMermaidDiagram(focusedGraph, circularDependencies, hotspots);
  }

  // Generate recommendations
  const recommendations = generateRecommendations(
    focusedGraph,
    circularDependencies,
    metrics,
    hotspots
  );

  // Calculate summary
  const summary = {
    totalDependencies: focusedGraph.edges.length,
    averageDepth: calculateAverageDepth(focusedGraph),
    isolatedModules: focusedGraph.nodes.filter((n) => n.metrics.inDegree === 0 && n.metrics.outDegree === 0).length,
    circularCount: circularDependencies.length,
  };

  const result: DependencyAnalysisResult = {
    project: {
      name: path.basename(projectPath),
      totalFiles: files.length,
    },
    graph: focusedGraph,
    circularDependencies,
    metrics,
    hotspots,
    diagram,
    recommendations,
    summary,
  };

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
 * Build dependency graph from files
 */
async function buildDependencyGraph(
  files: string[],
  projectPath: string,
  includeExternal: boolean,
  _maxDepth?: number
): Promise<DependencyGraph> {
  const nodes: Map<string, DependencyNode> = new Map();
  const edges: DependencyEdge[] = [];

  // First pass: create nodes
  for (const file of files) {
    const relPath = path.relative(projectPath, file);
    const id = relPath;

    try {
      const ast = await ASTParser.parseFile(file);
      const exports = ASTParser.extractExports(ast);
      const fileType = classifyFileType(relPath, exports);

      nodes.set(id, {
        id,
        path: relPath,
        type: fileType,
        exports,
        metrics: {
          inDegree: 0,
          outDegree: 0,
          centrality: 0,
        },
      });
    } catch (error) {
      // Skip files that can't be parsed
      continue;
    }
  }

  // Second pass: create edges
  for (const file of files) {
    const relPath = path.relative(projectPath, file);
    const fromId = relPath;

    if (!nodes.has(fromId)) continue;

    try {
      const ast = await ASTParser.parseFile(file);
      const imports = ASTParser.extractImports(ast);

      for (const imp of imports) {
        // Resolve import path
        const resolvedPath = resolveImportPath(file, imp.source, projectPath);

        if (!resolvedPath) continue;

        // Skip external dependencies unless requested
        if (!includeExternal && isExternalDependency(imp.source)) {
          continue;
        }

        const toId = path.relative(projectPath, resolvedPath);

        // Check if target exists in our nodes
        if (nodes.has(toId)) {
          // Determine edge type
          const edgeType = imp.source.startsWith(".")
            ? "import"
            : imp.source.includes("import(")
            ? "dynamic"
            : "require";

          edges.push({
            from: fromId,
            to: toId,
            type: edgeType,
            imports: imp.specifiers,
          });

          // Update metrics
          const fromNode = nodes.get(fromId)!;
          const toNode = nodes.get(toId)!;
          fromNode.metrics.outDegree++;
          toNode.metrics.inDegree++;
        }
      }
    } catch (error) {
      // Skip files with import errors
      continue;
    }
  }

  // Calculate centrality (PageRank-like metric)
  calculateCentrality(nodes, edges);

  return {
    nodes: Array.from(nodes.values()),
    edges,
  };
}

/**
 * Classify file type based on path and exports
 */
function classifyFileType(
  filePath: string,
  _exports: string[]
): "component" | "hook" | "utility" | "provider" | "service" | "composable" | "store" {
  const fileName = path.basename(filePath, path.extname(filePath));
  const lowerPath = filePath.toLowerCase();

  // Check by directory
  if (lowerPath.includes("/components/") || lowerPath.includes("\\components\\")) {
    return "component";
  }
  if (lowerPath.includes("/hooks/") || lowerPath.includes("\\hooks\\")) {
    return "hook";
  }
  if (lowerPath.includes("/composables/") || lowerPath.includes("\\composables\\")) {
    return "composable";
  }
  if (lowerPath.includes("/stores/") || lowerPath.includes("\\stores\\") || lowerPath.includes("/store/")) {
    return "store";
  }
  if (lowerPath.includes("/services/") || lowerPath.includes("\\services\\") || lowerPath.includes("/api/")) {
    return "service";
  }
  if (lowerPath.includes("/providers/") || lowerPath.includes("\\providers\\") || fileName.toLowerCase().includes("provider")) {
    return "provider";
  }

  // Check by file name or exports
  if (fileName.startsWith("use") && fileName.length > 3) {
    return lowerPath.includes(".vue") || lowerPath.includes("vue") ? "composable" : "hook";
  }

  // Default to utility
  return "utility";
}

/**
 * Resolve import path to actual file path
 */
function resolveImportPath(fromFile: string, importPath: string, projectPath: string): string | null {
  // Skip external dependencies
  if (!importPath.startsWith(".") && !importPath.startsWith("/")) {
    return null;
  }

  const fromDir = path.dirname(fromFile);
  let resolved = path.resolve(fromDir, importPath);

  // Try different extensions
  const extensions = [".ts", ".tsx", ".js", ".jsx", ".vue"];

  // Check if file exists with extension
  for (const ext of extensions) {
    const withExt = resolved + ext;
    try {
      // Simple heuristic: if it's in our project path range, consider it valid
      if (withExt.startsWith(projectPath)) {
        return withExt;
      }
    } catch {
      continue;
    }
  }

  // Try index files
  for (const ext of extensions) {
    const indexFile = path.join(resolved, `index${ext}`);
    try {
      if (indexFile.startsWith(projectPath)) {
        return indexFile;
      }
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * Check if import is external dependency
 */
function isExternalDependency(importPath: string): boolean {
  return !importPath.startsWith(".") && !importPath.startsWith("/");
}

/**
 * Calculate centrality metric for each node
 */
function calculateCentrality(nodes: Map<string, DependencyNode>, _edges: DependencyEdge[]): void {
  // Simple centrality: (inDegree + outDegree) / totalNodes
  const totalNodes = nodes.size;

  for (const node of nodes.values()) {
    node.metrics.centrality = (node.metrics.inDegree + node.metrics.outDegree) / totalNodes;
  }
}

/**
 * Filter graph to focus on specific module and its dependencies
 */
function filterGraphByModule(
  graph: DependencyGraph,
  focusModule: string,
  _projectPath: string,
  maxDepth?: number
): DependencyGraph {
  const relevantNodes = new Set<string>();
  const relevantEdges: DependencyEdge[] = [];

  // Find the focus module
  const focusNode = graph.nodes.find(
    (n) => n.path.includes(focusModule) || n.id.includes(focusModule)
  );

  if (!focusNode) {
    return graph; // Return full graph if focus not found
  }

  // BFS to find related nodes
  const queue: Array<{ id: string; depth: number }> = [{ id: focusNode.id, depth: 0 }];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;

    if (visited.has(id)) continue;
    if (maxDepth !== undefined && depth > maxDepth) continue;

    visited.add(id);
    relevantNodes.add(id);

    // Find dependencies (outgoing)
    const outgoing = graph.edges.filter((e) => e.from === id);
    for (const edge of outgoing) {
      relevantEdges.push(edge);
      if (!visited.has(edge.to)) {
        queue.push({ id: edge.to, depth: depth + 1 });
      }
    }

    // Find dependents (incoming)
    const incoming = graph.edges.filter((e) => e.to === id);
    for (const edge of incoming) {
      relevantEdges.push(edge);
      if (!visited.has(edge.from)) {
        queue.push({ id: edge.from, depth: depth + 1 });
      }
    }
  }

  return {
    nodes: graph.nodes.filter((n) => relevantNodes.has(n.id)),
    edges: relevantEdges,
  };
}

/**
 * Detect circular dependencies using DFS
 */
function detectCircularDependencies(graph: DependencyGraph): CircularDependency[] {
  const circles: CircularDependency[] = [];
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const parent = new Map<string, string>();

  // Build adjacency list
  const adjList = new Map<string, string[]>();
  for (const node of graph.nodes) {
    adjList.set(node.id, []);
  }
  for (const edge of graph.edges) {
    adjList.get(edge.from)?.push(edge.to);
  }

  function dfs(nodeId: string): void {
    visited.add(nodeId);
    recursionStack.add(nodeId);

    const neighbors = adjList.get(nodeId) || [];
    for (const neighbor of neighbors) {
      parent.set(neighbor, nodeId);

      if (!visited.has(neighbor)) {
        dfs(neighbor);
      } else if (recursionStack.has(neighbor)) {
        // Found a cycle
        const cycle: string[] = [];
        let current = nodeId;

        // Trace back to find the cycle
        while (current !== neighbor && parent.has(current)) {
          cycle.push(current);
          current = parent.get(current)!;
        }
        cycle.push(neighbor);
        cycle.reverse();
        cycle.push(neighbor); // Complete the cycle

        const severity = cycle.length <= 3 ? "critical" : "warning";
        circles.push({
          cycle,
          severity,
          description: `Circular dependency detected: ${cycle.join(" → ")}`,
        });
      }
    }

    recursionStack.delete(nodeId);
  }

  for (const node of graph.nodes) {
    if (!visited.has(node.id)) {
      dfs(node.id);
    }
  }

  // Deduplicate cycles
  const uniqueCycles = new Set<string>();
  return circles.filter((c) => {
    const key = c.cycle.slice().sort().join("|");
    if (uniqueCycles.has(key)) return false;
    uniqueCycles.add(key);
    return true;
  });
}

/**
 * Calculate dependency metrics
 */
function calculateDependencyMetrics(graph: DependencyGraph): DependencyMetrics {
  const nodes = graph.nodes;

  if (nodes.length === 0) {
    return {
      totalModules: 0,
      avgDependencies: 0,
      maxDependencies: 0,
      coupling: 0,
      cohesion: 0,
      stability: 0,
    };
  }

  // Average dependencies
  const totalOutDegree = nodes.reduce((sum, n) => sum + n.metrics.outDegree, 0);
  const avgDependencies = totalOutDegree / nodes.length;

  // Max dependencies
  const maxDependencies = Math.max(...nodes.map((n) => n.metrics.outDegree), 0);

  // Coupling: Average of (inDegree + outDegree)
  const coupling = nodes.reduce((sum, n) => sum + n.metrics.inDegree + n.metrics.outDegree, 0) / nodes.length;

  // Cohesion: Inverse of average fanout (simplified LCOM)
  const cohesion = avgDependencies > 0 ? 1 / avgDependencies : 1;

  // Stability: Ce / (Ca + Ce) where Ce = efferent (out), Ca = afferent (in)
  // Average stability across all nodes
  let totalStability = 0;
  let stableNodeCount = 0;
  for (const node of nodes) {
    const ce = node.metrics.outDegree;
    const ca = node.metrics.inDegree;
    if (ca + ce > 0) {
      totalStability += ce / (ca + ce);
      stableNodeCount++;
    }
  }
  const stability = stableNodeCount > 0 ? totalStability / stableNodeCount : 0;

  return {
    totalModules: nodes.length,
    avgDependencies,
    maxDependencies,
    coupling,
    cohesion,
    stability,
  };
}

/**
 * Identify dependency hotspots
 */
function identifyHotspots(graph: DependencyGraph): DependencyHotspot[] {
  const hotspots: DependencyHotspot[] = [];

  for (const node of graph.nodes) {
    const { inDegree, outDegree, centrality } = node.metrics;

    // Hub: High in-degree (many modules depend on it)
    if (inDegree >= 5) {
      hotspots.push({
        file: node.path,
        inDegree,
        outDegree,
        centrality,
        type: "hub",
        description: `Core module: ${inDegree} modules depend on this`,
      });
    }

    // Bottleneck: High out-degree (depends on many modules)
    if (outDegree >= 10) {
      hotspots.push({
        file: node.path,
        inDegree,
        outDegree,
        centrality,
        type: "bottleneck",
        description: `Potential bottleneck: depends on ${outDegree} modules`,
      });
    }

    // God object: High in both directions
    if (inDegree >= 5 && outDegree >= 10) {
      hotspots.push({
        file: node.path,
        inDegree,
        outDegree,
        centrality,
        type: "god-object",
        description: `God object pattern: ${inDegree} dependents, ${outDegree} dependencies`,
      });
    }
  }

  // Sort by centrality (most important first)
  return hotspots.sort((a, b) => b.centrality - a.centrality);
}

/**
 * Calculate average depth of dependency tree
 */
function calculateAverageDepth(graph: DependencyGraph): number {
  if (graph.nodes.length === 0) return 0;

  // Build adjacency list
  const adjList = new Map<string, string[]>();
  for (const node of graph.nodes) {
    adjList.set(node.id, []);
  }
  for (const edge of graph.edges) {
    adjList.get(edge.from)?.push(edge.to);
  }

  // Find root nodes (no incoming edges)
  const roots = graph.nodes.filter((n) => n.metrics.inDegree === 0);

  if (roots.length === 0) {
    // No clear roots, use all nodes
    return 1;
  }

  // BFS from each root to calculate max depth
  let totalDepth = 0;
  for (const root of roots) {
    const queue: Array<{ id: string; depth: number }> = [{ id: root.id, depth: 0 }];
    const visited = new Set<string>();
    let maxDepth = 0;

    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;

      if (visited.has(id)) continue;
      visited.add(id);

      maxDepth = Math.max(maxDepth, depth);

      const neighbors = adjList.get(id) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          queue.push({ id: neighbor, depth: depth + 1 });
        }
      }
    }

    totalDepth += maxDepth;
  }

  return roots.length > 0 ? totalDepth / roots.length : 0;
}

/**
 * Generate Mermaid diagram for dependency graph
 */
function generateMermaidDiagram(
  graph: DependencyGraph,
  circularDeps: CircularDependency[],
  hotspots: DependencyHotspot[]
): string {
  const lines: string[] = ["graph TD"];

  // Create node ID mapping (sanitize for Mermaid)
  const nodeIds = new Map<string, string>();
  graph.nodes.forEach((node, idx) => {
    const sanitized = `N${idx}`;
    nodeIds.set(node.id, sanitized);
  });

  // Add nodes with styling based on type
  for (const node of graph.nodes) {
    const id = nodeIds.get(node.id)!;
    const label = path.basename(node.path);
    const hotspot = hotspots.find((h) => h.file === node.path);

    if (hotspot) {
      // Highlight hotspots
      if (hotspot.type === "hub") {
        lines.push(`  ${id}["${label}"]:::hub`);
      } else if (hotspot.type === "god-object") {
        lines.push(`  ${id}["${label}"]:::god`);
      } else {
        lines.push(`  ${id}["${label}"]:::bottleneck`);
      }
    } else {
      lines.push(`  ${id}["${label}"]`);
    }
  }

  // Track circular edges
  const circularEdges = new Set<string>();
  for (const circ of circularDeps) {
    for (let i = 0; i < circ.cycle.length - 1; i++) {
      circularEdges.add(`${circ.cycle[i]}|${circ.cycle[i + 1]}`);
    }
  }

  // Add edges
  for (const edge of graph.edges) {
    const from = nodeIds.get(edge.from);
    const to = nodeIds.get(edge.to);

    if (!from || !to) continue;

    const edgeKey = `${edge.from}|${edge.to}`;
    const isCircular = circularEdges.has(edgeKey);

    if (isCircular) {
      lines.push(`  ${from} -.->|circular| ${to}`);
    } else if (edge.type === "dynamic") {
      lines.push(`  ${from} -.-> ${to}`);
    } else {
      lines.push(`  ${from} --> ${to}`);
    }
  }

  // Add styling
  lines.push("");
  lines.push("  classDef hub fill:#90EE90,stroke:#2E8B57,stroke-width:3px");
  lines.push("  classDef god fill:#FFB6C1,stroke:#DC143C,stroke-width:3px");
  lines.push("  classDef bottleneck fill:#FFD700,stroke:#FF8C00,stroke-width:2px");

  return lines.join("\n");
}

/**
 * Generate recommendations based on analysis
 */
function generateRecommendations(
  _graph: DependencyGraph,
  circularDeps: CircularDependency[],
  metrics: DependencyMetrics,
  hotspots: DependencyHotspot[]
): string[] {
  const recommendations: string[] = [];

  // Circular dependencies
  if (circularDeps.length > 0) {
    const criticalCount = circularDeps.filter((c) => c.severity === "critical").length;
    if (criticalCount > 0) {
      recommendations.push(
        `⚠️ CRITICAL: Found ${criticalCount} circular dependencies. These can cause runtime errors and make code hard to maintain.`
      );
      recommendations.push(
        `Fix circular dependencies by: (1) introducing interfaces/abstractions, (2) extracting shared code, or (3) using dependency injection.`
      );
    } else {
      recommendations.push(
        `Found ${circularDeps.length} circular dependencies. Consider refactoring to improve code maintainability.`
      );
    }
  } else {
    recommendations.push("✅ No circular dependencies detected. Good architecture!");
  }

  // Coupling
  if (metrics.coupling > 10) {
    recommendations.push(
      `High coupling detected (${metrics.coupling.toFixed(2)}). Consider applying dependency inversion and interface segregation principles.`
    );
  } else if (metrics.coupling > 5) {
    recommendations.push(
      `Moderate coupling (${metrics.coupling.toFixed(2)}). Room for improvement through better module boundaries.`
    );
  }

  // Hotspots
  const godObjects = hotspots.filter((h) => h.type === "god-object");
  if (godObjects.length > 0) {
    recommendations.push(
      `Found ${godObjects.length} god object(s). These modules have too many responsibilities - consider splitting them.`
    );
  }

  const hubs = hotspots.filter((h) => h.type === "hub");
  if (hubs.length > 3) {
    recommendations.push(
      `Found ${hubs.length} hub modules. While some centralization is good, too many hubs can indicate tight coupling.`
    );
  }

  // Stability
  if (metrics.stability < 0.3) {
    recommendations.push(
      `Low stability (${metrics.stability.toFixed(2)}). Modules have high afferent coupling - changes will ripple through the codebase.`
    );
  }

  // Max dependencies
  if (metrics.maxDependencies > 15) {
    recommendations.push(
      `Some modules depend on ${metrics.maxDependencies} other modules. Consider reducing dependencies through better abstractions.`
    );
  }

  if (recommendations.length === 0) {
    recommendations.push("Dependency structure looks healthy. Continue monitoring as the codebase grows.");
  }

  return recommendations;
}
