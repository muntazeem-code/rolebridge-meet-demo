import type { Response } from "express";
import { isObjectIdOrHexString } from "mongoose";
import { z } from "zod";
import type { AuthRequest } from "../middleware/authenticate.js";
import { User } from "../models/User.js";
import { Role } from "../models/Role.js";
import { CustomerAccess } from "../models/CustomerAccess.js";

export const getCustomerAccess = async (
  _req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const [customerRole, vpRole, assignments] = await Promise.all([
      Role.findOne({ name: "customer" }),
      Role.findOne({ name: "vp" }),
      CustomerAccess.find(),
    ]);
    const [customers, vps] = await Promise.all([
      customerRole
        ? User.find({ roles: customerRole._id, status: "active" })
            .select("_id fullName email")
            .sort({ fullName: 1 })
        : [],
      vpRole
        ? User.find({ roles: vpRole._id, status: "active" })
            .select("_id fullName email")
            .sort({ fullName: 1 })
        : [],
    ]);
    res.json({
      success: true,
      data: {
        customers: customers.map((customer) => ({
          ...customer.toObject(),
          vpIds:
            assignments
              .find((entry) => entry.customer.equals(customer._id))
              ?.vpIds.map(String) ?? [],
        })),
        vps,
      },
    });
  } catch {
    res.status(500).json({
      success: false,
      message: "Unable to load customer assignments.",
    });
  }
};
export const updateCustomerAccess = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const { customerId } = req.params;
    const parsed = z
      .object({
        vpIds: z.array(z.string().refine(isObjectIdOrHexString)).max(100),
      })
      .strict()
      .safeParse(req.body);
    if (!isObjectIdOrHexString(customerId) || !parsed.success) {
      res.status(400).json({
        success: false,
        message: "Provide a valid customer ID and VP IDs.",
      });
      return;
    }
    const [customerRole, vpRole] = await Promise.all([
      Role.findOne({ name: "customer" }),
      Role.findOne({ name: "vp" }),
    ]);
    const customer = customerRole
      ? await User.findOne({
          _id: customerId,
          roles: customerRole._id,
          status: "active",
        })
      : null;
    if (!customer) {
      res
        .status(404)
        .json({ success: false, message: "Active customer not found." });
      return;
    }
    const vpIds = [...new Set(parsed.data.vpIds)];
    const vps = vpRole
      ? await User.find({
          _id: { $in: vpIds },
          roles: vpRole._id,
          status: "active",
        })
      : [];
    if (vps.length !== vpIds.length) {
      res
        .status(400)
        .json({ success: false, message: "Select existing active VP users." });
      return;
    }
    await CustomerAccess.findOneAndUpdate(
      { customer: customer._id },
      { $set: { vpIds } },
      { upsert: true, runValidators: true },
    );
    res.json({
      success: true,
      message: "Customer assignment saved.",
      data: { customerId, vpIds },
    });
  } catch {
    res
      .status(500)
      .json({ success: false, message: "Unable to save customer assignment." });
  }
};
