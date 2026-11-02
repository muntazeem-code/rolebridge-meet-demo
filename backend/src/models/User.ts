import mongoose, { Schema, Types } from "mongoose";

export interface IUser {
  fullName: string;
  email: string;
  password?: string;
  roles: Types.ObjectId[];
  status: "pending" | "active" | "disabled";
  mustChangePassword: boolean;
}

const userSchema = new Schema<IUser>(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      select: false,
    },

    roles: [
      {
        type: Schema.Types.ObjectId,
        ref: "Role",
      },
    ],

    status: {
      type: String,
      enum: ["pending", "active", "disabled"],
      default: "pending",
    },

    mustChangePassword: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

export const User = mongoose.model<IUser>(
  "User",
  userSchema
);