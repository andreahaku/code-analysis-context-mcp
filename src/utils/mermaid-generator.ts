/**
 * Mermaid Diagram Generator
 *
 * Generates Mermaid diagrams for architecture visualization
 */

import type { DependencyGraph, ArchitectureLayer } from "../types/index.js";

export class MermaidGenerator {
  /**
   * Generate architecture diagram
   */
  static generateArchitectureDiagram(layers: ArchitectureLayer[]): string {
    const lines = ["graph TD"];

    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i];
      const nodeId = `layer${i}`;

      lines.push(`  ${nodeId}["${layer.name}"]`);

      // Add dependencies
      for (const dep of layer.dependencies) {
        const depIndex = layers.findIndex((l) => l.name === dep);
        if (depIndex !== -1) {
          lines.push(`  ${nodeId} --> layer${depIndex}`);
        }
      }
    }

    return lines.join("\n");
  }

  /**
   * Generate dependency graph diagram
   */
  static generateDependencyDiagram(graph: DependencyGraph, maxNodes: number = 50): string {
    const lines = ["graph LR"];

    // Limit to most important nodes
    const importantNodes = graph.nodes
      .sort((a, b) => b.metrics.centrality - a.metrics.centrality)
      .slice(0, maxNodes);

    const nodeIds = new Map<string, string>();
    importantNodes.forEach((node, i) => {
      const nodeId = `n${i}`;
      nodeIds.set(node.id, nodeId);

      // Format node based on type
      const shape = this.getNodeShape(node.type);
      const label = node.id.split("/").pop() || node.id;

      lines.push(`  ${nodeId}${shape[0]}"${label}"${shape[1]}`);
    });

    // Add edges between important nodes
    const importantNodeIds = new Set(importantNodes.map((n) => n.id));
    for (const edge of graph.edges) {
      if (importantNodeIds.has(edge.from) && importantNodeIds.has(edge.to)) {
        const fromId = nodeIds.get(edge.from);
        const toId = nodeIds.get(edge.to);
        if (fromId && toId) {
          lines.push(`  ${fromId} --> ${toId}`);
        }
      }
    }

    return lines.join("\n");
  }

  /**
   * Generate data flow diagram
   */
  static generateDataFlowDiagram(_description: string): string {
    // Simple placeholder - can be enhanced based on actual data flow analysis
    return [
      "graph LR",
      '  A["User Input"] --> B["Components"]',
      '  B --> C["Hooks/Composables"]',
      '  C --> D["State Management"]',
      '  D --> E["API Layer"]',
      '  E --> F["Backend/Server"]',
      '  F --> E',
      '  E --> D',
      '  D --> C',
      '  C --> B',
      '  B --> G["UI Output"]',
    ].join("\n");
  }

  /**
   * Get Mermaid node shape for type
   */
  private static getNodeShape(type: string): [string, string] {
    switch (type) {
      case "component":
        return ["[", "]"]; // Rectangle
      case "hook":
      case "composable":
        return ["([", "])"]; // Stadium
      case "provider":
      case "store":
        return ["[(", ")]"]; // Cylinder
      case "utility":
        return ["{{", "}}"]; // Hexagon
      default:
        return ["[", "]"]; // Rectangle
    }
  }

  /**
   * Generate circular dependency diagram
   */
  static generateCircularDependencyDiagram(cycles: string[][]): string {
    if (cycles.length === 0) {
      return "graph LR\n  A[\"No Circular Dependencies\"]";
    }

    const lines = ["graph LR"];

    cycles.forEach((cycle, cycleIndex) => {
      cycle.forEach((node, i) => {
        const current = `c${cycleIndex}_${i}`;
        const next = `c${cycleIndex}_${(i + 1) % cycle.length}`;
        const label = node.split("/").pop() || node;

        lines.push(`  ${current}["${label}"] -->|cycle ${cycleIndex + 1}| ${next}`);
      });
    });

    return lines.join("\n");
  }

  /**
   * Generate component hierarchy diagram
   */
  static generateComponentHierarchy(components: Array<{ name: string; parent?: string }>): string {
    const lines = ["graph TD"];

    const nodeIds = new Map<string, string>();
    components.forEach((comp, i) => {
      nodeIds.set(comp.name, `c${i}`);
    });

    components.forEach((comp) => {
      const nodeId = nodeIds.get(comp.name);
      lines.push(`  ${nodeId}["${comp.name}"]`);

      if (comp.parent) {
        const parentId = nodeIds.get(comp.parent);
        if (parentId) {
          lines.push(`  ${parentId} --> ${nodeId}`);
        }
      }
    });

    return lines.join("\n");
  }
}
