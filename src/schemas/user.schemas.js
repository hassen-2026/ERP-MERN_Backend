const { z } = require("zod");

const createUserSchema = z
  .object({
    email: z.string().email({ message: "Invalid Email format" }),
    firstName: z.string().min(1, { message: "First Name is required" }),
    lastName: z.string().min(1, { message: "Last Name is required" }),
    password: z
      .string()
      .min(8, { message: "Password must be greater than 8 characters" })
      .max(32, { message: "Password must be less than 32 characters" }),
    confirmPassword: z
      .string()
      .min(8, { message: "Confirm Password must be greater than 8 characters" })
      .max(32, { message: "Confirm Password must be less than 32 characters" }),
    dob: z.string().optional().nullable(),
    role: z.enum(["USER", "ADMIN"]).optional().nullable()
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords doesn't match"
  });

module.exports = { createUserSchema };
