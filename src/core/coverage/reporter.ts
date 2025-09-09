import chalk from 'chalk'
import type { CoverageReport } from './nested-coverage-tracker.js'

export class CoverageReporter {
  private coverage: CoverageReport

  constructor(coverage: CoverageReport) {
    this.coverage = coverage
  }

  generateText(): string {
    const lines: string[] = []

    lines.push(chalk.bold.blue('\n📊 State Machine Coverage Report\n'))
    lines.push('═'.repeat(50))

    lines.push(chalk.bold('\n📍 States Coverage:'))
    lines.push(this.generateBar(this.coverage.states.percentage))
    lines.push(`   Total: ${this.coverage.states.total}`)
    lines.push(`   Covered: ${chalk.green(this.coverage.states.covered)}`)
    lines.push(`   Percentage: ${this.formatPercentage(this.coverage.states.percentage)}`)

    if (this.coverage.states.uncovered.length > 0) {
      lines.push(chalk.yellow(`   Uncovered: ${this.coverage.states.uncovered.join(', ')}`))
    }

    lines.push(chalk.bold('\n🌿 Branches Coverage:'))
    lines.push(this.generateBar(this.coverage.branches.percentage))
    lines.push(`   Total: ${this.coverage.branches.total}`)
    lines.push(`   Covered: ${chalk.green(this.coverage.branches.covered)}`)
    lines.push(`   Percentage: ${this.formatPercentage(this.coverage.branches.percentage)}`)

    if (this.coverage.branches.uncovered.length > 0) {
      lines.push(chalk.yellow(`   Uncovered: ${this.coverage.branches.uncovered.join(', ')}`))
    }

    lines.push(chalk.bold('\n🛤️  Execution Paths:'))
    lines.push(`   Total executions: ${this.coverage.paths.total}`)
    lines.push(`   Unique paths: ${this.coverage.paths.unique}`)

    // Add nested coverage if present
    if (this.coverage.nestedCoverage) {
      lines.push(chalk.bold('\n📦 Nested States Coverage:'))
      for (const [parentState, nested] of Object.entries(this.coverage.nestedCoverage)) {
        const nestedTyped = nested as {
          total: number
          covered: number
          percentage: number
          uncovered: string[]
        }
        lines.push(`   ${chalk.cyan(parentState)}:`)
        lines.push(
          `      Total: ${nestedTyped.total}, Covered: ${nestedTyped.covered} (${nestedTyped.percentage}%)`,
        )
        if (nestedTyped.uncovered.length > 0) {
          lines.push(chalk.yellow(`      Uncovered: ${nestedTyped.uncovered.join(', ')}`))
        }
      }
    }

    lines.push(`\n${'═'.repeat(50)}`)

    return lines.join('\n')
  }

  generateJSON(): string {
    return JSON.stringify(this.coverage, null, 2)
  }

  generateHTML(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>State Machine Coverage Report</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background: #f5f5f5;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            border-radius: 10px;
            margin-bottom: 30px;
        }
        .metric-card {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            margin-bottom: 20px;
        }
        .metric-title {
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 15px;
            color: #333;
        }
        .progress-bar {
            width: 100%;
            height: 30px;
            background: #e0e0e0;
            border-radius: 15px;
            overflow: hidden;
            margin-bottom: 10px;
        }
        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #4caf50, #8bc34a);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: 600;
            transition: width 0.3s ease;
        }
        .metric-details {
            display: flex;
            justify-content: space-between;
            margin-top: 10px;
        }
        .uncovered {
            margin-top: 15px;
            padding: 10px;
            background: #fff3cd;
            border-left: 4px solid #ffc107;
            border-radius: 4px;
        }
        .uncovered-title {
            font-weight: 600;
            color: #856404;
            margin-bottom: 5px;
        }
        .uncovered-list {
            color: #856404;
            font-family: 'Courier New', monospace;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>📊 State Machine Coverage Report</h1>
        <p>Generated on ${new Date().toLocaleString()}</p>
    </div>
    
    <div class="metric-card">
        <div class="metric-title">📍 States Coverage</div>
        <div class="progress-bar">
            <div class="progress-fill" style="width: ${this.coverage.states.percentage}%">
                ${this.coverage.states.percentage.toFixed(1)}%
            </div>
        </div>
        <div class="metric-details">
            <span>Total: ${this.coverage.states.total}</span>
            <span>Covered: ${this.coverage.states.covered}</span>
        </div>
        ${this.generateUncoveredHTML('States', this.coverage.states.uncovered)}
    </div>
    
    <div class="metric-card">
        <div class="metric-title">🌿 Branches Coverage</div>
        <div class="progress-bar">
            <div class="progress-fill" style="width: ${this.coverage.branches.percentage}%">
                ${this.coverage.branches.percentage.toFixed(1)}%
            </div>
        </div>
        <div class="metric-details">
            <span>Total: ${this.coverage.branches.total}</span>
            <span>Covered: ${this.coverage.branches.covered}</span>
        </div>
        ${this.generateUncoveredHTML('Branches', this.coverage.branches.uncovered)}
    </div>
    
    <div class="metric-card">
        <div class="metric-title">🛤️ Execution Paths</div>
        <div class="metric-details">
            <span>Total executions: ${this.coverage.paths.total}</span>
            <span>Unique paths: ${this.coverage.paths.unique}</span>
        </div>
    </div>
</body>
</html>`
  }

  private generateBar(percentage: number): string {
    const width = 40
    const filled = Math.round((percentage / 100) * width)
    const empty = width - filled

    const color = percentage >= 80 ? chalk.green : percentage >= 60 ? chalk.yellow : chalk.red

    return `   [${color('█'.repeat(filled))}${'░'.repeat(empty)}] ${this.formatPercentage(percentage)}`
  }

  private formatPercentage(percentage: number): string {
    const color = percentage >= 80 ? chalk.green : percentage >= 60 ? chalk.yellow : chalk.red
    return color(`${percentage.toFixed(1)}%`)
  }

  private generateUncoveredHTML(type: string, items: string[]): string {
    if (items.length === 0) return ''

    return `
        <div class="uncovered">
            <div class="uncovered-title">Uncovered ${type}:</div>
            <div class="uncovered-list">${items.join(', ')}</div>
        </div>
    `
  }
}
