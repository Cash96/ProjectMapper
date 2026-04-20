import { MongoClient } from "mongodb";

declare global {
  var __projectMapperMongoClient: Promise<MongoClient> | undefined;
}

export function getMongoClient() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error("MONGODB_URI is not configured.");
  }

  if (!global.__projectMapperMongoClient) {
    global.__projectMapperMongoClient = new MongoClient(uri).connect();
  }

  return global.__projectMapperMongoClient;
}