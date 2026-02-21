/**
 * Summarize the latest shadow comparison CSV (Helius V3 vs SHYFT V2).
 * Run after the backend has been running with HELIUS_SHADOW_MODE=true.
 *
 * Usage (from backend/): npx ts-node scripts/shadow-compare-summary.ts [path-to-csv]
 * If no path given, uses the most recent test-reports/shadow-v2-vs-v3-*.csv
 */

import * as fs from 'fs'
import * as path from 'path'

const REPORTS_DIR = path.join(__dirname, '..', 'test-reports')

function main() {
  const arg = process.argv[2]
  let csvPath: string

  if (arg && fs.existsSync(arg)) {
    csvPath = arg
  } else {
    const files = fs.readdirSync(REPORTS_DIR).filter((f) => f.startsWith('shadow-v2-vs-v3-') && f.endsWith('.csv'))
    if (files.length === 0) {
      console.error('No shadow CSV found in', REPORTS_DIR)
      console.error('Run the backend with HELIUS_SHADOW_MODE=true and process some transactions first.')
      process.exit(1)
    }
    files.sort()
    csvPath = path.join(REPORTS_DIR, files[files.length - 1])
  }

  const content = fs.readFileSync(csvPath, 'utf-8')
  const lines = content.trim().split('\n')
  if (lines.length < 2) {
    console.log('CSV has no data rows:', csvPath)
    process.exit(0)
  }

  const counts = { MATCH: 0, V3_RECOVERED: 0, V3_MISSED: 0, BOTH_ERASE: 0, DIFF: 0, SAME: 0 }
  let v2Success = 0
  let v3Success = 0

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    const quoted = line.match(/(?:[^,"]+|"(?:[^"]|"")*")+/g) || []
    const unquote = (s: string) => (s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1).replace(/""/g, '"') : s)
    const verdict = unquote(quoted[quoted.length - 1] || '')
    const v2Ok = unquote(quoted[3] || '') === 'true'  // v2_success
    const v3Ok = unquote(quoted[10] || '') === 'true' // v3_success

    if (verdict in counts) (counts as any)[verdict]++
    else if (verdict === 'SAME') counts.SAME++
    if (v2Ok) v2Success++
    if (v3Ok) v3Success++
  }

  const total = lines.length - 1
  console.log('')
  console.log('========================================')
  console.log('  Shadow comparison summary (Helius vs SHYFT)')
  console.log('========================================')
  console.log('  File:', csvPath)
  console.log('  Total rows:', total)
  console.log('----------------------------------------')
  console.log('  V2 (SHYFT) success:', v2Success, total ? `(${((v2Success / total) * 100).toFixed(1)}%)` : '')
  console.log('  V3 (Helius) success:', v3Success, total ? `(${((v3Success / total) * 100).toFixed(1)}%)` : '')
  console.log('----------------------------------------')
  console.log('  MATCH (both agree):        ', counts.MATCH)
  console.log('  V3_RECOVERED (V3 only):   ', counts.V3_RECOVERED)
  console.log('  V3_MISSED (V2 only):       ', counts.V3_MISSED)
  console.log('  BOTH_ERASE:                ', counts.BOTH_ERASE)
  console.log('  DIFF (disagree):          ', counts.DIFF)
  console.log('  SAME:                      ', counts.SAME)
  console.log('----------------------------------------')
  const net = counts.V3_RECOVERED - counts.V3_MISSED
  console.log('  V3 net vs V2 (recovered - missed):', net >= 0 ? `+${net}` : net)
  console.log('========================================')
  console.log('')
  process.exit(0)
}

main()
