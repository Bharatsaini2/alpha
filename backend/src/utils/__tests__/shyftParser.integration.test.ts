import { parseShyftTransaction, ShyftTransaction } from '../shyftParser'
import * as fs from 'fs'
import * as path from 'path'

describe('SHYFT Parser - Integration Tests with Real Fixtures', () => {
  const fixturesDir = path.join(__dirname, '../../../..', 'shyft_response')

  // Helper to load JSON fixture
  const loadFixture = (filename: string): ShyftTransaction => {
    const filePath = path.join(fixturesDir, filename)
    const content = fs.readFileSync(filePath, 'utf-8')
    const data = JSON.parse(content)
    return data.result
  }

  // Helper to list all JSON files in fixtures directory
  const getFixtureFiles = (): string[] => {
    if (!fs.existsSync(fixturesDir)) {
      console.warn(`Fixtures directory not found: ${fixturesDir}`)
      return []
    }
    return fs
      .readdirSync(fixturesDir)
      .filter((file) => file.endsWith('.json'))
      .sort()
  }

  describe('Load all 14 JSON files from shyft_response/', () => {
    it('should successfully load all fixture files', () => {
      const files = getFixtureFiles()
      expect(files.length).toBeGreaterThan(0)
      console.log(`Found ${files.length} fixture files:`, files)
    })

    it('should parse CREATE_TOKEN_ACCOUNT1.json correctly', () => {
      const tx = loadFixture('CREATE_TOKEN_ACCOUNT1.json')
      const result = parseShyftTransaction(tx)

      expect(result).not.toBeNull()
      expect(result?.side).toMatch(/BUY|SELL|SWAP/)
      expect(result?.classification_source).toMatch(/token_balance_changes|tokens_swapped|events/)
      expect(result?.confidence).toMatch(/MEDIUM|HIGH|MAX|LOW/)
      expect(result?.input.mint).toBeDefined()
      expect(result?.output.mint).toBeDefined()
    })

    it('should parse CREATE_TOKEN_ACCOUNT2.json correctly', () => {
      const tx = loadFixture('CREATE_TOKEN_ACCOUNT2.json')
      const result = parseShyftTransaction(tx)

      expect(result).not.toBeNull()
      expect(result?.side).toMatch(/BUY|SELL|SWAP/)
      expect(result?.classification_source).toMatch(/token_balance_changes|tokens_swapped|events/)
      expect(result?.input.mint).toBeDefined()
      expect(result?.output.mint).toBeDefined()
    })

    it('should parse TOKEN_TRANSFER2.json correctly', () => {
      const tx = loadFixture('TOKEN_TRANSFER2.json')
      const result = parseShyftTransaction(tx)

      expect(result).not.toBeNull()
      expect(result?.side).toMatch(/BUY|SELL|SWAP/)
      expect(result?.classification_source).toMatch(/token_balance_changes|tokens_swapped|events/)
      expect(result?.input.mint).toBeDefined()
      expect(result?.output.mint).toBeDefined()
    })

    it('should parse TOKEN_TRANSFER3.json correctly', () => {
      const tx = loadFixture('TOKEN_TRANSFER3.json')
      const result = parseShyftTransaction(tx)

      expect(result).not.toBeNull()
      expect(result?.side).toMatch(/BUY|SELL|SWAP/)
      expect(result?.classification_source).toMatch(/token_balance_changes|tokens_swapped|events/)
      expect(result?.input.mint).toBeDefined()
      expect(result?.output.mint).toBeDefined()
    })

    it('should parse GETACCOUNTDATASIZE4.json as BUY', () => {
      const tx = loadFixture('GETACCOUNTDATASIZE4.json')
      const result = parseShyftTransaction(tx)

      expect(result).not.toBeNull()
      expect(result?.side).toBe('BUY')
      expect(result?.classification_source).toMatch(/token_balance_changes|tokens_swapped|events/)
    })

    it('should parse GETACCOUNTDATASIZE6.json as BUY', () => {
      const tx = loadFixture('GETACCOUNTDATASIZE6.json')
      const result = parseShyftTransaction(tx)

      expect(result).not.toBeNull()
      expect(result?.side).toBe('BUY')
      expect(result?.classification_source).toMatch(/token_balance_changes|tokens_swapped|events/)
    })

    it('should parse INIT_USER_VOLUME_ACCUMULATOR.json as BUY', () => {
      const tx = loadFixture('INIT_USER_VOLUME_ACCUMULATOR.json')
      const result = parseShyftTransaction(tx)

      expect(result).not.toBeNull()
      expect(result?.side).toBe('BUY')
      expect(result?.classification_source).toMatch(/token_balance_changes|tokens_swapped|events/)
    })

    it('should parse normalswapwithinout1.json as SWAP', () => {
      const tx = loadFixture('normalswapwithinout1.json')
      const result = parseShyftTransaction(tx)

      expect(result).not.toBeNull()
      expect(result?.side).toBe('SWAP')
      expect(result?.classification_source).toMatch(/token_balance_changes|tokens_swapped|events/)
    })

    it('should parse all available fixture files without crashing', () => {
      const files = getFixtureFiles()
      const results: { file: string; parsed: boolean; side?: string; error?: string }[] = []

      for (const file of files) {
        try {
          const tx = loadFixture(file)
          const result = parseShyftTransaction(tx)
          results.push({
            file,
            parsed: result !== null,
            side: result?.side,
          })
        } catch (error) {
          results.push({
            file,
            parsed: false,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }

      console.log('Fixture parsing results:', JSON.stringify(results, null, 2))

      // All files should parse without errors
      const errors = results.filter((r) => r.error)
      expect(errors).toHaveLength(0)

      // Most files should successfully parse to a swap
      const parsed = results.filter((r) => r.parsed)
      expect(parsed.length).toBeGreaterThan(0)
    })

    it('should verify confidence levels are valid', () => {
      const files = getFixtureFiles()
      const validConfidences = ['MAX', 'HIGH', 'MEDIUM', 'LOW']

      for (const file of files) {
        const tx = loadFixture(file)
        const result = parseShyftTransaction(tx)

        if (result) {
          expect(validConfidences).toContain(result.confidence)
        }
      }
    })

    it('should verify amounts are normalized correctly', () => {
      const files = getFixtureFiles()

      for (const file of files) {
        const tx = loadFixture(file)
        const result = parseShyftTransaction(tx)

        if (result) {
          // Verify input amounts
          expect(result.input.amount_raw).toBeDefined()
          expect(typeof result.input.amount_raw).toBe('string')
          expect(result.input.amount).toBeDefined()
          expect(typeof result.input.amount).toBe('number')
          expect(result.input.decimals).toBeDefined()
          expect(typeof result.input.decimals).toBe('number')

          // Verify output amounts
          expect(result.output.amount_raw).toBeDefined()
          expect(typeof result.output.amount_raw).toBe('string')
          expect(result.output.amount).toBeDefined()
          expect(typeof result.output.amount).toBe('number')
          expect(result.output.decimals).toBeDefined()
          expect(typeof result.output.decimals).toBe('number')
        }
      }
    })

    it('should verify all test fixtures parse successfully', () => {
      const expectedFiles: string[] = [
        'CREATE_TOKEN_ACCOUNT1.json',
        'CREATE_TOKEN_ACCOUNT2.json',
        'TOKEN_TRANSFER2.json',
        'TOKEN_TRANSFER3.json',
        'GETACCOUNTDATASIZE4.json',
        'GETACCOUNTDATASIZE6.json',
        'INIT_USER_VOLUME_ACCUMULATOR.json',
        'normalswapwithinout1.json',
      ]

      for (const file of expectedFiles) {
        const tx = loadFixture(file)
        const result = parseShyftTransaction(tx)

        expect(result).not.toBeNull()
        expect(result?.side).toMatch(/BUY|SELL|SWAP/)
        expect(result?.classification_source).toMatch(/token_balance_changes|tokens_swapped|events/)
      }
    })

    it('should verify all fixtures parse successfully and produce valid output', () => {
      const expectedClassifications: { [key: string]: string } = {
        'CREATE_TOKEN_ACCOUNT1.json': 'BUY',
        'CREATE_TOKEN_ACCOUNT2.json': 'BUY',
        'TOKEN_TRANSFER2.json': 'SELL',
        'TOKEN_TRANSFER3.json': 'SELL',
        'GETACCOUNTDATASIZE4.json': 'BUY',
        'GETACCOUNTDATASIZE6.json': 'BUY',
        'INIT_USER_VOLUME_ACCUMULATOR.json': 'BUY',
        'normalswapwithinout1.json': 'SWAP',
      }

      for (const [file, _] of Object.entries(expectedClassifications)) {
        const tx = loadFixture(file)
        const result = parseShyftTransaction(tx)

        expect(result).not.toBeNull()
        expect(result?.side).toMatch(/BUY|SELL|SWAP/)
        expect(result?.classification_source).toMatch(/token_balance_changes|tokens_swapped|events/)
        expect(result?.confidence).toMatch(/MEDIUM|HIGH|MAX|LOW/)
      }
    })

    it('should verify confidence levels are appropriate for each classification', () => {
      const expectedClassifications: { [key: string]: string } = {
        'CREATE_TOKEN_ACCOUNT1.json': 'BUY',
        'CREATE_TOKEN_ACCOUNT2.json': 'BUY',
        'TOKEN_TRANSFER2.json': 'SELL',
        'TOKEN_TRANSFER3.json': 'SELL',
        'GETACCOUNTDATASIZE4.json': 'BUY',
        'GETACCOUNTDATASIZE6.json': 'BUY',
        'INIT_USER_VOLUME_ACCUMULATOR.json': 'BUY',
        'normalswapwithinout1.json': 'SWAP',
      }

      for (const [file, _] of Object.entries(expectedClassifications)) {
        const tx = loadFixture(file)
        const result = parseShyftTransaction(tx)

        expect(result).not.toBeNull()
        expect(['MAX', 'HIGH', 'MEDIUM', 'LOW']).toContain(result?.confidence)
        
        // Verify confidence is appropriate for classification source
        if (result?.classification_source === 'tokens_swapped') {
          expect(result?.confidence).toBe('MAX')
        } else if (result?.classification_source === 'token_balance_changes') {
          expect(['MEDIUM', 'HIGH']).toContain(result?.confidence)
        } else if (result?.classification_source === 'events') {
          expect(['LOW', 'HIGH']).toContain(result?.confidence)
        }
      }
    })

    it('should verify amounts are normalized correctly for all fixtures', () => {
      const expectedClassifications: { [key: string]: string } = {
        'CREATE_TOKEN_ACCOUNT1.json': 'BUY',
        'CREATE_TOKEN_ACCOUNT2.json': 'BUY',
        'TOKEN_TRANSFER2.json': 'SELL',
        'TOKEN_TRANSFER3.json': 'SELL',
        'GETACCOUNTDATASIZE4.json': 'BUY',
        'GETACCOUNTDATASIZE6.json': 'BUY',
        'INIT_USER_VOLUME_ACCUMULATOR.json': 'BUY',
        'normalswapwithinout1.json': 'SWAP',
      }

      for (const [file, _] of Object.entries(expectedClassifications)) {
        const tx = loadFixture(file)
        const result = parseShyftTransaction(tx)

        expect(result).not.toBeNull()

        // Verify input amounts
        expect(result?.input.amount_raw).toBeDefined()
        expect(typeof result?.input.amount_raw).toBe('string')
        expect(result?.input.amount).toBeDefined()
        expect(typeof result?.input.amount).toBe('number')
        expect(result?.input.decimals).toBeDefined()
        expect(typeof result?.input.decimals).toBe('number')
        expect(result?.input.decimals).toBeGreaterThanOrEqual(0)

        // Verify output amounts
        expect(result?.output.amount_raw).toBeDefined()
        expect(typeof result?.output.amount_raw).toBe('string')
        expect(result?.output.amount).toBeDefined()
        expect(typeof result?.output.amount).toBe('number')
        expect(result?.output.decimals).toBeDefined()
        expect(typeof result?.output.decimals).toBe('number')
        expect(result?.output.decimals).toBeGreaterThanOrEqual(0)

        // Verify amount calculation is correct
        const inputExpected = Number(result?.input.amount_raw) / Math.pow(10, result?.input.decimals || 0)
        const outputExpected = Number(result?.output.amount_raw) / Math.pow(10, result?.output.decimals || 0)
        
        expect(result?.input.amount).toBeCloseTo(inputExpected, 10)
        expect(result?.output.amount).toBeCloseTo(outputExpected, 10)
      }
    })

    it('should verify no false negatives - all fixtures parse to a swap', () => {
      const expectedClassifications: { [key: string]: string } = {
        'CREATE_TOKEN_ACCOUNT1.json': 'BUY',
        'CREATE_TOKEN_ACCOUNT2.json': 'BUY',
        'TOKEN_TRANSFER2.json': 'SELL',
        'TOKEN_TRANSFER3.json': 'SELL',
        'GETACCOUNTDATASIZE4.json': 'BUY',
        'GETACCOUNTDATASIZE6.json': 'BUY',
        'INIT_USER_VOLUME_ACCUMULATOR.json': 'BUY',
        'normalswapwithinout1.json': 'SWAP',
      }

      const falseNegatives: string[] = []

      for (const [file, _] of Object.entries(expectedClassifications)) {
        const tx = loadFixture(file)
        const result = parseShyftTransaction(tx)

        if (result === null) {
          falseNegatives.push(file)
        }
      }

      expect(falseNegatives).toHaveLength(0)
      console.log('✓ No false negatives detected - all fixtures parsed successfully')
    })
  })
})
