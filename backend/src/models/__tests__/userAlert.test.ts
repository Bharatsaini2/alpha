import * as fc from 'fast-check'
import mongoose from 'mongoose'
import dotenv from 'dotenv'
import { UserAlert, IUserAlert } from '../userAlert.model'
import { User, IUser } from '../user.model'
import { AlertType, Priority } from '../../types/alert.types'

dotenv.config()

/**
 * Property-Based Tests for UserAlert Model
 * Feature: telegram-alert-system
 */

describe('UserAlert Model - Property-Based Tests', () => {
  let testUserId: mongoose.Types.ObjectId

  beforeAll(async () => {
    // Connect to MongoDB
    const mongoURI =
      process.env.MONGO_URI || 'mongodb://localhost:27017/whale-tracker-test'
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoURI)
    }

    // Create a test user for alert tests
    const testUser = new User({
      email: `test-${Date.now()}@example.com`,
      emailVerified: true,
      displayName: 'Test User',
    })
    const savedUser = await testUser.save()
    testUserId = new mongoose.Types.ObjectId(savedUser._id)
  })

  afterAll(async () => {
    // Clean up test user
    if (testUserId) {
      await User.findByIdAndDelete(testUserId)
    }
    // Disconnect from MongoDB
    await mongoose.disconnect()
  })

  beforeEach(async () => {
    // Clear the UserAlert collection before each test
    await UserAlert.deleteMany({})
  })

  /**
   * Property 5: Alert subscription round-trip consistency
   * Feature: telegram-alert-system, Property 5: Alert subscription round-trip consistency
   * Validates: Requirements 2.1, 2.4
   *
   * For any alert subscription created with specific type, priority, and config,
   * retrieving the user's alerts must return a subscription with identical
   * type, priority, and config values.
   */
  describe('Property 5: Alert subscription round-trip consistency', () => {
    test(
      'should preserve type, priority, and config through save and retrieve',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            // Generate random alert configurations
            fc.record({
              type: fc.constantFrom(
                AlertType.ALPHA_STREAM,
                AlertType.WHALE_CLUSTER,
                AlertType.KOL_ACTIVITY,
              ),
              priority: fc.constantFrom(
                Priority.HIGH,
                Priority.MEDIUM,
                Priority.LOW,
              ),
              config: fc.oneof(
                // ALPHA_STREAM config
                fc.record({
                  minAmount: fc.option(fc.double({ min: 0, max: 1000000 })),
                  tokens: fc.option(
                    fc.array(
                      fc.string({ minLength: 32, maxLength: 44 }),
                      {
                        maxLength: 5,
                      },
                    ),
                  ),
                  wallets: fc.option(
                    fc.array(
                      fc.string({ minLength: 32, maxLength: 44 }),
                      {
                        maxLength: 5,
                      },
                    ),
                  ),
                }),
                // WHALE_CLUSTER config
                fc.record({
                  minClusterSize: fc.option(fc.integer({ min: 2, max: 20 })),
                  tokens: fc.option(
                    fc.array(
                      fc.string({ minLength: 32, maxLength: 44 }),
                      {
                        maxLength: 5,
                      },
                    ),
                  ),
                }),
                // KOL_ACTIVITY config
                fc.record({
                  kolIds: fc.option(
                    fc.array(
                      fc.string({ minLength: 10, maxLength: 24 }),
                      {
                        maxLength: 5,
                      },
                    ),
                  ),
                  tokens: fc.option(
                    fc.array(
                      fc.string({ minLength: 32, maxLength: 44 }),
                      {
                        maxLength: 5,
                      },
                    ),
                  ),
                }),
              ),
            }),
            async (alertData) => {
              try {
                // Create and save the alert
                const alert = new UserAlert({
                  userId: testUserId,
                  type: alertData.type,
                  priority: alertData.priority,
                  config: alertData.config,
                  enabled: true,
                })
                const savedAlert = await alert.save()

                // Retrieve the alert
                const retrievedAlert = await UserAlert.findById(
                  savedAlert._id,
                ).lean()

                // Verify type, priority, and config are identical
                expect(retrievedAlert).toBeDefined()
                expect(retrievedAlert!.type).toBe(alertData.type)
                expect(retrievedAlert!.priority).toBe(alertData.priority)

                // Deep comparison of config
                expect(retrievedAlert!.config).toEqual(alertData.config)
              } finally {
                // Clean up
                await UserAlert.deleteMany({ userId: testUserId })
              }
            },
          ),
          { numRuns: 100 },
        )
      },
      60000,
    )

    test(
      'should retrieve all user alerts with correct properties',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            // Generate multiple alerts for the same user
            fc.array(
              fc.record({
                type: fc.constantFrom(
                  AlertType.ALPHA_STREAM,
                  AlertType.WHALE_CLUSTER,
                  AlertType.KOL_ACTIVITY,
                ),
                priority: fc.constantFrom(
                  Priority.HIGH,
                  Priority.MEDIUM,
                  Priority.LOW,
                ),
                config: fc.record({
                  minAmount: fc.option(fc.double({ min: 0, max: 1000000 })),
                }),
              }),
              { minLength: 1, maxLength: 5 },
            ),
            async (alertsData) => {
              try {
                // Create and save all alerts
                const alerts = alertsData.map(
                  (data) =>
                    new UserAlert({
                      userId: testUserId,
                      type: data.type,
                      priority: data.priority,
                      config: data.config,
                      enabled: true,
                    }),
                )
                const savedAlerts = await UserAlert.insertMany(alerts)

                // Retrieve all user alerts
                const retrievedAlerts = await UserAlert.find({
                  userId: testUserId,
                  enabled: true,
                }).lean()

                // Verify count matches
                expect(retrievedAlerts.length).toBe(alertsData.length)

                // Verify each alert has correct properties
                retrievedAlerts.forEach((retrieved, index) => {
                  const original = alertsData[index]
                  expect(retrieved.type).toBe(original.type)
                  expect(retrieved.priority).toBe(original.priority)
                  expect(retrieved.config).toEqual(original.config)
                })
              } finally {
                // Clean up
                await UserAlert.deleteMany({ userId: testUserId })
              }
            },
          ),
          { numRuns: 50 },
        )
      },
      60000,
    )
  })

  /**
   * Property 7: Invalid alert types are rejected
   * Feature: telegram-alert-system, Property 7: Invalid alert types are rejected
   * Validates: Requirements 2.5
   *
   * For any alert creation request with a type value not in the set
   * {ALPHA_STREAM, WHALE_CLUSTER, KOL_ACTIVITY}, the system must reject
   * the request with a validation error.
   */
  describe('Property 7: Invalid alert types are rejected', () => {
    test(
      'should reject alerts with invalid type values',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            // Generate invalid alert types (strings that are not valid AlertType values)
            fc
              .string({ minLength: 1, maxLength: 50 })
              .filter(
                (str) =>
                  !Object.values(AlertType).includes(str as AlertType),
              ),
            fc.constantFrom(Priority.HIGH, Priority.MEDIUM, Priority.LOW),
            fc.record({
              minAmount: fc.option(fc.double({ min: 0, max: 1000000 })),
            }),
            async (invalidType, priority, config) => {
              try {
                // Attempt to create an alert with invalid type
                const alert = new UserAlert({
                  userId: testUserId,
                  type: invalidType as any, // Force invalid type
                  priority: priority,
                  config: config,
                  enabled: true,
                })

                // Verify that save is rejected
                await expect(alert.save()).rejects.toThrow()

                // Verify no alert was created
                const count = await UserAlert.countDocuments({
                  userId: testUserId,
                })
                expect(count).toBe(0)
              } finally {
                // Clean up (should be nothing to clean)
                await UserAlert.deleteMany({ userId: testUserId })
              }
            },
          ),
          { numRuns: 100 },
        )
      },
      60000,
    )

    test(
      'should accept only valid alert types',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.constantFrom(
              AlertType.ALPHA_STREAM,
              AlertType.WHALE_CLUSTER,
              AlertType.KOL_ACTIVITY,
            ),
            fc.constantFrom(Priority.HIGH, Priority.MEDIUM, Priority.LOW),
            fc.record({
              minAmount: fc.option(fc.double({ min: 0, max: 1000000 })),
            }),
            async (validType, priority, config) => {
              try {
                // Create an alert with valid type
                const alert = new UserAlert({
                  userId: testUserId,
                  type: validType,
                  priority: priority,
                  config: config,
                  enabled: true,
                })

                // Verify that save succeeds
                const savedAlert = await alert.save()
                expect(savedAlert).toBeDefined()
                expect(savedAlert.type).toBe(validType)

                // Verify alert was created
                const count = await UserAlert.countDocuments({
                  userId: testUserId,
                  type: validType,
                })
                expect(count).toBeGreaterThanOrEqual(1)
              } finally {
                // Clean up
                await UserAlert.deleteMany({ userId: testUserId })
              }
            },
          ),
          { numRuns: 100 },
        )
      },
      60000,
    )
  })
})
