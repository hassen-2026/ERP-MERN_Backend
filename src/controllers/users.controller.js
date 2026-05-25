const userModel = require("../models/user.model");
const sendEmail = require("../utils/mailer");
const { createUserSchema } = require("../schemas/user.schemas");

async function createUser(req, res) {
  try {
    const validation = createUserSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: validation.error.flatten()
      });
    }

    const { email } = req.body;
    const existingUser = await userModel.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({
        message: "user with this email already exists."
      });
    }

    const payload = { ...req.body, email: email.toLowerCase() };
    const user = new userModel(payload);
    await user.save();

    const options = {
      mail: email,
      subject: "Welcome to our platform",
      content: `Welcome to our platform, ${user.firstName}!`
    };

    try {
      await sendEmail(options);
    } catch (mailError) {
      
      console.error("Welcome email failed:", mailError.message);
    }

    const safeUser = await userModel.findById(user._id);

    return res.status(201).json({
      message: `user ${safeUser.firstName} created successfully.`,
      user: safeUser
    });
  } catch (error) {
    console.log(error.message);
    return res.status(500).json({
      message: "Internal server error."
    });
  }
}

async function listUsers(_req, res) {
  try {
    const users = await userModel.find();
    return res.status(200).json({ users });
  } catch (error) {
    console.log(error.message);
    return res.status(500).json({
      message: "Internal server error."
    });
  }
}

async function getUserById(req, res) {
  try {
    const { id } = req.params;
    const user = await userModel.findById(id);
    if (!user) {
      return res.status(404).json({
        message: "user not found."
      });
    }
    return res.status(200).json({ user });
  } catch (error) {
    console.log(error.message);
    return res.status(500).json({
      message: "Internal server error."
    });
  }
}

async function deleteUserById(req, res) {
  try {
    const { id } = req.params;
    const existingUser = await userModel.findById(id);
    if (!existingUser) {
      return res.status(404).json({
        message: "user not found."
      });
    }
    await userModel.findByIdAndDelete(id);
    return res.status(200).json({
      message: "user deleted successfully."
    });
  } catch (error) {
    console.log(error.message);
    return res.status(500).json({
      message: "Internal server error."
    });
  }
}

async function updateUserById(req, res) {
  try {
    const { id } = req.params;
    const existingUser = await userModel.findById(id);
    if (!existingUser) {
      return res.status(404).json({
        message: "user not found."
      });
    }

    if (req.body.password || req.body.confirmPassword) {
      return res.status(400).json({
        message: "Use a dedicated password update flow."
      });
    }

    const updatedUser = await userModel.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true
    });

    return res.status(200).json({
      message: "user updated successfully.",
      user: updatedUser
    });
  } catch (error) {
    console.log(error.message);
    return res.status(500).json({
      message: "Internal server error."
    });
  }
}

module.exports = { createUser, getUserById, deleteUserById, updateUserById, listUsers };
