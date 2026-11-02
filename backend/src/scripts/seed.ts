import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

import { connectDB } from "../config/db.js";
import { User } from "../models/User.js";
import { Role } from "../models/Role.js";

const roles = [
  {
    name: "super_admin",
    label: "Super Admin",
    dashboardPath: "/dashboard/super-admin",
  },
  {
    name: "vp",
    label: "VP",
    dashboardPath: "/dashboard/vp",
  },
  {
    name: "panelist",
    label: "Panelist",
    dashboardPath: "/dashboard/panelist",
  },
  {
    name: "reviewer",
    label: "Reviewer",
    dashboardPath: "/dashboard/reviewer",
  },
  {
    name: "customer",
    label: "Customer",
    dashboardPath: "/dashboard/customer",
  },
];

const seed = async () => {
  await connectDB();

  for (const role of roles) {
    await Role.updateOne(
      { name: role.name },
      { $set: role },
      { upsert: true }
    );
  }

  console.log("Roles seeded successfully");

  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error("Seed admin credentials missing");
  }

  const adminRole = await Role.findOne({
    name: "super_admin",
  });

  if (!adminRole) {
    throw new Error("Super Admin role missing");
  }

  const existing = await User.findOne({
    email: email.toLowerCase(),
  });

  if (!existing) {
    await User.create({
      fullName: "System Administrator",
      email: email.toLowerCase(),
      password: await bcrypt.hash(password, 12),
      roles: [adminRole._id],
      status: "active",
      mustChangePassword: false,
    });

    console.log("Initial Super Admin created");
  } else {
    console.log("Seed admin already exists");
  }

  await mongoose.disconnect();
};

seed().catch((error) => {
  console.error("Seed error:", error);
  process.exit(1);
});