import type { Response, NextFunction } from "express";

import type { AuthRequest } from "./authenticate.js";

export const authorize = (...allowedRoles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (req.mustChangePassword) {
      res.status(403).json({
        success: false,
        message: "Password change required",
        code: "PASSWORD_CHANGE_REQUIRED",
      });
      return;
    }

    const authorized = allowedRoles.some((role) =>
      req.userRoles?.includes(role),
    );

    if (!authorized) {
      res.status(403).json({
        success: false,
        message: "You cannot access this dashboard",
      });
      return;
    }

    console.log("Dashboard authorization passed");
    console.log("Route:", req.originalUrl);

    next();
  };
};
