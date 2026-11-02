import mongoose, { Schema } from "mongoose";

export interface IRole {
  name: string;
  label: string;
  dashboardPath: string;
}

const roleSchema = new Schema<IRole>(
  {
    name: {
      type: String,
      required: true,
      unique: true,
    },
    label: {
      type: String,
      required: true,
    },
    dashboardPath: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

export const Role = mongoose.model<IRole>(
  "Role",
  roleSchema
);