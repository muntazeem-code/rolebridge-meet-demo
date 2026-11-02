import mongoose from "mongoose";
import { Meeting } from "../models/Meeting.js";
import { CustomerAccess } from "../models/CustomerAccess.js";

export const connectDB = async () => {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    throw new Error("mongo URI is missing!!!");
  }

  await mongoose.connect(mongoUri);
  await Promise.all([Meeting.init(), CustomerAccess.init()]);

  console.log("MongoDB connected");
  console.log("Database: ", mongoose.connection.name)
};
