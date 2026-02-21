import mongoose from 'mongoose'
import dotenv from 'dotenv'
import { MongoClient } from 'mongodb'

dotenv.config()

const mongoURI: string = process.env.MONGO_URI || ''

export const getDataBaseInfo = async (connection: typeof mongoose) => {
  return {
    dbName: connection.connection.name,
    dbClient: new MongoClient(mongoURI),
  }
}

export const connectDB = async () => {
  try {
    // const connection = await mongoose.connect(mongoURI)
    // bufferTimeoutMS is supported by the driver but not in mongoose.ConnectOptions typings
    const connection = await mongoose.connect(mongoURI, {
      maxPoolSize: 30,
      bufferCommands: true,
      bufferTimeoutMS: 60000, // 60s — avoid "buffering timed out" when Mongo is slow
    } as mongoose.ConnectOptions)
    console.log(`Database connected with ${connection.connection.host}`)
  } catch (err: any) {
    console.log('In catch block')
    console.log('Error:', err.message)
    setTimeout(connectDB, 1000)
  }
}

export const getCollectionNames = async (
  dbName: string,
  client: MongoClient,
) => {
  try {
    await client.connect()
    const database = client.db(dbName)
    const collections = await database.listCollections().toArray()
    const collectionNames = collections.map((collection) => collection.name)
    return collectionNames
  } catch (err: any) {
    console.error('Error fetching collection names:', err)
    throw err
  } finally {
    await client.close()
  }
}
