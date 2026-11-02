import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { z } from "zod";
import { isObjectIdOrHexString } from "mongoose";

import { User } from "../models/User.js";
import { Role } from "../models/Role.js";
import { Invitation } from "../models/Invitation.js";
import { CustomerAccess } from "../models/CustomerAccess.js";

import { sendInvitationEmail } from "../services/mail.service.js";
import type { AuthRequest } from "../middleware/authenticate.js";

const createUserSchema = z.object({
  fullName: z.string().trim().min(2),
  email: z.email(),
  roles: z.array(z.string()).min(1),
  method: z.enum(["direct", "invite"]),
});

export const createUser = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const parsed = createUserSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        errors: parsed.error.flatten(),
      });
      return;
    }

    const { fullName, roles, method } = parsed.data;
    const email = parsed.data.email.toLowerCase();

    console.log("Create user request:", {
      fullName,
      email,
      roles,
      method,
    });

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      res.status(409).json({
        success: false,
        message: "User already exists",
      });
      return;
    }

    const uniqueRoleNames = [...new Set(roles)];

    if (uniqueRoleNames.includes("super_admin")) {
      res.status(403).json({
        success: false,
        message: "Super Admin role requires a separate workflow",
      });
      return;
    }

    const foundRoles = await Role.find({
      name: { $in: uniqueRoleNames },
    });

    if (foundRoles.length !== uniqueRoleNames.length) {
      res.status(400).json({
        success: false,
        message: "One or more roles are invalid",
      });
      return;
    }

    // Shared initial password: local development only.
    if (method === "direct" && process.env.NODE_ENV === "production") {
      res.status(403).json({
        success: false,
        message: "Use invitation onboarding in production",
      });
      return;
    }

    const passwordHash =
      method === "direct" ? await bcrypt.hash("demo1234", 12) : undefined;

    const user = await User.create({
      fullName,
      email,
      password: passwordHash,
      roles: foundRoles.map((role) => role._id),
      status: method === "direct" ? "active" : "pending",
      mustChangePassword: method === "direct",
    });

    console.log("User created:", user.id);
    console.log("Roles assigned:", uniqueRoleNames);

    if (method === "invite") {
      const rawToken = crypto.randomBytes(32).toString("hex");

      const tokenHash = crypto
        .createHash("sha256")
        .update(rawToken)
        .digest("hex");

      await Invitation.create({
        user: user._id,
        tokenHash,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });

      const invitationUrl = `${process.env.CLIENT_URL}/set-password?token=${rawToken}`;

      try {
        await sendInvitationEmail(email, invitationUrl);
      } catch (emailError) {
        console.error("Invitation delivery failed:", emailError);

        res.status(502).json({
          success: false,
          message: "User created as pending, but email delivery failed",
          userId: user.id,
        });
        return;
      }
    }

    res.status(201).json({
      success: true,
      message:
        method === "direct"
          ? "User created successfully"
          : "User created and invitation sent",
      data: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        roles: uniqueRoleNames,
        status: user.status,
        mustChangePassword: user.mustChangePassword,
      },
    });
  } catch (error) {
    console.error("Create user error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to create user",
    });
  }
};

export const getRoles = async (_req: Request, res: Response): Promise<void> => {
  const roles = await Role.find({
    name: { $ne: "super_admin" },
  });

  console.log("Available roles:", roles);

  res.json({
    success: true,
    data: roles,
  });
};

export const getUsers = async (_req: Request, res: Response): Promise<void> => {
  const users = await User.find().select("-password").populate("roles");

  console.log("Total users:", users.length);

  res.json({
    success: true,
    data: users,
  });
};

const updateRolesSchema = z
  .object({
    roles: z.array(z.string().min(1)).min(1),
  })
  .strict();

// User management covers accounts created through the regular onboarding flow.
async function findManagedUser(req: AuthRequest, res: Response) {
  const { userId } = req.params;
  if (!isObjectIdOrHexString(userId)) {
    res.status(400).json({ success: false, message: "Invalid user ID" });
    return null;
  }
  const user = await User.findById(userId);
  if (!user) {
    res.status(404).json({ success: false, message: "User not found" });
    return null;
  }
  const isSuperAdmin = await Role.exists({
    _id: { $in: user.roles },
    name: "super_admin",
  });
  if (req.userId === user.id || isSuperAdmin) {
    res.status(403).json({
      success: false,
      message: "Super Admin accounts cannot be edited or deleted here",
    });
    return null;
  }
  return user;
}

export const updateUserRoles = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const parsed = updateRolesSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Select at least one valid role",
        errors: parsed.error.flatten(),
      });
      return;
    }
    const names = [...new Set(parsed.data.roles)];
    if (names.includes("super_admin")) {
      res.status(403).json({
        success: false,
        message: "Super Admin role requires a separate workflow",
      });
      return;
    }
    const user = await findManagedUser(req, res);
    if (!user) return;
    const roles = await Role.find({ name: { $in: names } });
    if (roles.length !== names.length) {
      res
        .status(400)
        .json({ success: false, message: "One or more roles are invalid" });
      return;
    }
    const updatedUser = await User.findByIdAndUpdate(
      user._id,
      {
        $set: { roles: roles.map((role) => role._id) },
      },
      { returnDocument: "after", runValidators: true },
    )
      .select("-password")
      .populate("roles");
    if (!updatedUser) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }
    res.json({
      success: true,
      message: "User roles updated successfully",
      data: updatedUser,
    });
  } catch (error) {
    console.error("Update user roles error:", error);
    res
      .status(500)
      .json({ success: false, message: "Unable to update user roles" });
  }
};

export const deleteUser = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const user = await findManagedUser(req, res);
    if (!user) return;
    // Clear invitations before removing the account; a cleanup failure can be retried.
    await Invitation.deleteMany({ user: user._id });
    await CustomerAccess.deleteMany({ customer: user._id });
    await CustomerAccess.updateMany(
      { vpIds: user._id },
      { $pull: { vpIds: user._id } },
    );
    const result = await User.deleteOne({ _id: user._id });
    if (!result.deletedCount) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }
    res.json({
      success: true,
      message: "User and invitations deleted permanently",
    });
  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).json({ success: false, message: "Unable to delete user" });
  }
};
