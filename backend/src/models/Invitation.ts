import mongoose, { Schema, Types } from "mongoose";

interface IInvitation {
  user: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  usedAt?: Date;
}

const invitationSchema = new Schema<IInvitation>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    tokenHash: {
      type: String,
      required: true,
      unique: true,
    },

    expiresAt: {
      type: Date,
      required: true,
    },

    usedAt: Date,
  },
  { timestamps: true },
);

export const Invitation = mongoose.model<IInvitation>(
  "Invitation",
  invitationSchema,
);
