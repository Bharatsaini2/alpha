/**
 * Detailed 5-minute audit: KOL first, then Whale, each with DB comparison.
 *
 * 1. Run KOL 5-min audit (Helius subscribe → parse → CSV + report with DB comparison)
 * 2. Run Whale 5-min audit (same)
 * 3. Write docs/DETAILED_AUDIT_REPORT.md aggregating both and comparison summary
 *
 * Prerequisite: Prod or local server should be running and writing to the same DB
 * during the audit windows so we can compare audit results to DB records.
 *
 * Run: npm run audit:5min:detailed (from backend/)
 */

import path from 'path'
import fs from 'fs'
import { spawn } from 'child_process'

const DOCS_DIR = path.join(__dirname, '../../docs')
const KOL_REPORT = path.join(DOCS_DIR, 'KOL_5MIN_AUDIT_REPORT.md')
const WHALE_REPORT = path.join(DOCS_DIR, 'WHALE_5MIN_AUDIT_REPORT.md')
const DETAILED_REPORT = path.join(DOCS_DIR, 'DETAILED_AUDIT_REPORT.md')

function runScript(scriptName: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn('npx', ['ts-node', `scripts/${scriptName}`], {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit',
      shell: true,
    })
    child.on('close', (code) => resolve(code ?? 0))
    child.on('error', () => resolve(1))
  })
}

function readReport(p: string): string {
  try {
    return fs.readFileSync(p, 'utf8')
  } catch {
    return `*(Report not found: ${path.basename(p)})*`
  }
}

async function main(): Promise<void> {
  console.log('=== Detailed audit: KOL first, then Whale (each 5 min + DB comparison) ===\n')
  const start = Date.now()

  console.log('--- Step 1: KOL 5-minute audit ---')
  const kolCode = await runScript('kol-tracking-5min-audit.ts')
  if (kolCode !== 0) {
    console.error(`KOL audit exited with code ${kolCode}`)
    process.exit(kolCode)
  }

  console.log('\n--- Step 2: Whale 5-minute audit ---')
  const whaleCode = await runScript('whale-tracking-5min-audit.ts')
  if (whaleCode !== 0) {
    console.error(`Whale audit exited with code ${whaleCode}`)
    process.exit(whaleCode)
  }

  const kolReport = readReport(KOL_REPORT)
  const whaleReport = readReport(WHALE_REPORT)
  const elapsedMin = ((Date.now() - start) / 60000).toFixed(1)

  const combined = `# Detailed 5-Minute Audit Report (KOL then Whale)

**Generated:** ${new Date().toISOString()}  
**Total elapsed:** ~${elapsedMin} minutes (KOL 5 min + Whale 5 min + processing)

This report aggregates the KOL and Whale 5-minute audits. Each audit subscribes to Helius, records swap txns, parses them, then compares results to records saved in the database during the same time window. Prod/local should use the same code and be writing to the same DB so the comparison is meaningful.

---

## 1. KOL (Influencer) Audit

${kolReport}

---

## 2. Whale Audit

${whaleReport}

---

## Summary

| Stream | CSV | Report |
|--------|-----|--------|
| KOL | \`docs/kol_5min_txns.csv\` | \`docs/KOL_5MIN_AUDIT_REPORT.md\` |
| Whale | \`docs/whale_5min_txns.csv\` | \`docs/WHALE_5MIN_AUDIT_REPORT.md\` |

- **Audit-only** = we saw and parsed the txn in this run but it was not found in DB for that time window (e.g. server not writing, or different swapper/wallet attribution).
- **DB-only** = DB had a record in the window that we did not capture in this audit (e.g. from another process, or timing).
`

  if (!fs.existsSync(DOCS_DIR)) fs.mkdirSync(DOCS_DIR, { recursive: true })
  fs.writeFileSync(DETAILED_REPORT, combined, 'utf8')
  console.log(`\nWrote ${DETAILED_REPORT}`)
  console.log('Done.')
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
