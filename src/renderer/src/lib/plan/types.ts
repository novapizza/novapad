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

/** Per-statement plan slice. SQL Server batches and Postgres pipelines can
 *  contain multiple statements; the analyzer returns one entry per. */
export interface PlanStatement {
  statementText: string
  totalCost: number
  totalNodes: number
  planTree: PlanNode | null
  executionPath: PlanNode[]
  redFlags: RedFlag[]
  missingIndexes: string[]
  operations: { name: string; count: number }[]
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
  /** Per-statement breakdown. Empty for single-statement plans; populated by
   *  SQL Server / PostgreSQL analyzers when more than one statement exists. */
  statements: PlanStatement[]
}
