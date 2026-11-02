import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { z } from "zod";

import { User } from "../models/User.js";
import { Invitation } from "../models/Invitation.js";
import { generateToken } from "../utils/jwt.js";
import type { AuthRequest } from "../middleware/authenticate.js";

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

const passwordSchema = z.string().min(8).max(128);

const publicUser = (user: any) => ({
  id: user.id,
  fullName: user.fullName,
  email: user.email,
  status: user.status,
  mustChangePassword: user.mustChangePassword,
  roles: user.roles.map((role: any) => ({
    id: role.id,
    name: role.name,
    label: role.label,
    dashboardPath: role.dashboardPath,
  })),
});

// LOGIN
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = loginSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Invalid login input",
      });
      return;
    }

    const { password } = parsed.data;
    const email = parsed.data.email.toLowerCase();

    console.log("LOGGES IN ", email);

    const user = await User.findOne({ email })
      .select("+password")
      .populate("roles");

    if (!user || !user.password) {
      res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
      return;
    }

    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
      return;
    }

    if (user.status !== "active") {
      res.status(403).json({
        success: false,
        message: "Account is not active",
      });
      return;
    }

    const token = generateToken(user.id);

    console.log("Login successful:", user.email);
    console.log("Role count:", user.roles.length);

    res.json({
      success: true,
      token,
      user: publicUser(user),
    });
  } catch (error) {
    console.error("Login error:", error);

    res.status(500).json({
      success: false,
      message: "Login failed",
    });
  }
};

// ACCEPT EMAIL INVITATION
export const acceptInvitation = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const parsed = z
      .object({
        token: z.string().min(1),
        password: passwordSchema,
      })
      .safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Invalid input",
      });
      return;
    }

    const { token, password } = parsed.data;

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const invitation = await Invitation.findOne({
      tokenHash,
      usedAt: { $exists: false },
      expiresAt: { $gt: new Date() },
    });

    if (!invitation) {
      res.status(400).json({
        success: false,
        message: "Invitation is invalid or expired",
      });
      return;
    }

    const user = await User.findById(invitation.user).populate("roles");

    if (!user || user.status !== "pending") {
      res.status(400).json({
        success: false,
        message: "Invitation cannot be accepted",
      });
      return;
    }

    user.password = await bcrypt.hash(password, 12);
    user.status = "active";
    user.mustChangePassword = false;

    await user.save();

    invitation.usedAt = new Date();
    await invitation.save();

    const jwtToken = generateToken(user.id);

    console.log("Invitation accepted:", user.email);
    console.log("User account activated:", user.id);

    res.json({
      success: true,
      message: "Account activated successfully",
      token: jwtToken,
      user: publicUser(user),
    });
  } catch (error) {
    console.error("Invitation error:", error);

    res.status(500).json({
      success: false,
      message: "Could not accept invitation",
    });
  }
};

// CURRENT AUTHENTICATED USER
export const getMe = async (req: AuthRequest, res: Response): Promise<void> => {
  const user = await User.findById(req.userId).populate("roles");

  if (!user) {
    res.status(404).json({
      success: false,
      message: "User not found",
    });
    return;
  }

  console.log("Current user requested:", user.email);

  res.json({
    success: true,
    user: publicUser(user),
  });
};

// CHANGE INITIAL PASSWORD
export const changePassword = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const parsed = z
      .object({
        currentPassword: z.string(),
        newPassword: passwordSchema,
      })
      .safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Invalid password input",
      });
      return;
    }

    const user = await User.findById(req.userId).select("+password");

    if (!user || !user.password) {
      res.status(404).json({
        success: false,
        message: "User not found",
      });
      return;
    }

    const valid = await bcrypt.compare(
      parsed.data.currentPassword,
      user.password,
    );

    if (!valid) {
      res.status(401).json({
        success: false,
        message: "Current password is incorrect",
      });
      return;
    }

    if (await bcrypt.compare(parsed.data.newPassword, user.password)) {
      res.status(400).json({
        success: false,
        message: "Choose a different password",
      });
      return;
    }

    user.password = await bcrypt.hash(parsed.data.newPassword, 12);
    user.mustChangePassword = false;

    await user.save();

    console.log("Password changed for user:", user.id);

    res.json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (error) {
    console.error("Change password error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to update password",
    });
  }
};
