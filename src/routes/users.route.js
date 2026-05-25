const express = require("express");
const auth = require("../middleware/auth");
const authorizeRole = require("../middleware/authorizeRole");
const {
  createUser,
  getUserById,
  deleteUserById,
  updateUserById,
  listUsers
} = require("../controllers/users.controller");

const router = express.Router();

router.use(auth, authorizeRole("ADMIN"));
router.get("/get/:id", getUserById);
router.post("/create", createUser);
router.patch("/update/:id", updateUserById);
router.delete("/delete/:id", deleteUserById);
router.get("/", listUsers);

module.exports = router;
