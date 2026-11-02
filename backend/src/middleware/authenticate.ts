// This middleware reads the Bearer token, verifies it and loads the current user's account.
import type { Request, Response, NextFunction } from "express";

import jwt, { type JwtPayload } from "jsonwebtoken";
import { User } from "../models/User.js";

export interface AuthRequest extends Request {
  userId?: string;
  userRoles?: string[];
  mustChangePassword?: boolean;
}

//-------
export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({             
        success: false,
        message: "Authentication token missing",
      });
      return;
    }

    const token = authHeader.split(" ")[1];
    const secret = process.env.JWT_SECRET!;

    const decoded = jwt.verify(token, secret) as JwtPayload;

    if (typeof decoded.userId !== "string") {
      res.status(401).json({
        success: false,
        message: "Invalid token payload",
      });
      return;
    }

    const user = await User.findById(decoded.userId).populate("roles");

    if (!user || user.status !== "active") {
      res.status(403).json({
        success: false,
        message: "Account not active",
      });
      return;
    }
    //---exp
    const roles = user.roles as unknown as {
      name: string;
    }[];

    req.userId = user.id;
    req.userRoles = roles.map((role) => role.name);
    req.mustChangePassword = user.mustChangePassword;

    console.log("Authenticated user:", user.email);
    console.log("Authorized roles:", req.userRoles);

    next();
  } catch (error) {
    console.error("Authentication error:", error);

    res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};
