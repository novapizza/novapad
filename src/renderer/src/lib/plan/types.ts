// Types shared by the SQL execution-plan analyzers. Ported from
// exifmaster-pro/types.ts, keeping only the plan-related entries.

export interface RedFlag {
  type: string
  description: string
  nodeId?: string
  severity: 'high' | 'medium' | 'low'
}

export interface PlanNode {
  nodeId: string
  physicalOp: string
  logicalOp: string
  objectName?: string
  objectFull?: string
  estimateRows: number
  estimateExecutions: number
  subtreeCost: number
  selfCost: number
  costPercent: number
  selfCostPercent: number
  depth: number
  children: PlanNode[]
  attributes: Record<string, string>
  outputList?: string[]
  predicate?: string
  ordered?: boolean
  estimatedRowsRead?: number
}

export interface PlanSummary {
  totalNodes: number
  operations: { name: string; count: number }[]
  totalCost: number
  statementText: string
  missingIndexes: string[]
  redFlags: RedFlag[]
  executionPath: PlanNode[]
  planTree: PlanNode | null
}
