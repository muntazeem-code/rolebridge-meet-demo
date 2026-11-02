import { Router } from "express";

import {
  createUser,
  getRoles,
  getUsers,
  updateUserRoles,
  deleteUser,
} from "../controllers/admin.controller.js";

import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";
import { getMeetings } from "../controllers/meeting.controller.js";
import { getCustomerAccess, updateCustomerAccess } from "../controllers/customer-access.controller.js";

const router = Router();

router.use(authenticate);
router.use(authorize("super_admin"));

router.post("/users", createUser);
router.patch("/users/:userId", updateUserRoles);
router.delete("/users/:userId", deleteUser);
router.get("/users", getUsers);
router.get("/roles", getRoles);
router.get("/meetings", getMeetings);
router.get("/customer-access", getCustomerAccess);
router.patch("/customer-access/:customerId", updateCustomerAccess);

export default router;
