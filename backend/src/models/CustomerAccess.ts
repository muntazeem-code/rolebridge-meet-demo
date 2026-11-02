import mongoose, { Schema, Types } from "mongoose";

interface ICustomerAccess {
  customer: Types.ObjectId;
  vpIds: Types.ObjectId[];
}
const schema = new Schema<ICustomerAccess>(
  {
    customer: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    vpIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true },
);
schema.index({ vpIds: 1 });
export const CustomerAccess = mongoose.model<ICustomerAccess>(
  "CustomerAccess",
  schema,
);
