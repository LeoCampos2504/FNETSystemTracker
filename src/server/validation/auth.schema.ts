import { z } from "zod";

export const loginBodySchema = z.object({
  email: z.string().min(1, "email is required").email("email must be valid"),
  password: z.string().min(1, "password is required"),
});
