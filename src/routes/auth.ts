import { FastifyPluginAsync } from "fastify";
import bcrypt from "bcrypt";
import { z } from "zod";
import { httpError } from "../utils/errors";
import { formatUserResponse } from "../utils/helpers";

const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

const authRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /auth/register
  fastify.post("/register", async (request, reply) => {
    // console.log("REGISTER_>>>>>>>>>>>>>>>>>>>>>>>>>>>>")
    const parsed = registerSchema.safeParse(request.body);

    if (!parsed.success) {
      httpError(parsed.error.errors[0].message, 400);
    }

    const { email, password } = parsed.data;

    // Check if user already exists
    const existingUser = await fastify.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      httpError("Email already registered", 400);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await fastify.prisma.user.create({
      data: {
        email,
        password: hashedPassword,
      },
    });

    // Generate JWT
    const token = fastify.jwt.sign({
      userId: user.id,
      email: user.email,
    });

    return reply.status(201).send({
      token,
      user: formatUserResponse(user, []),
    });
  });

  // POST /auth/login
  fastify.post("/login", async (request, reply) => {
    console.log("LOGIN_<<<<<<<<<<<<<<<<<<<<<<<<<<<<<");
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      console.log("<-1->",parsed);

      httpError(parsed.error.errors[0].message, 400);
    }

    const { email, password } = parsed.data;

    // Find user
    const user = await fastify.prisma.user.findUnique({
      where: { email },
      include: {
        weeklyStreaks: {
          orderBy: { date: "desc" },
          take: 7,
        },
      },
    });

    if (!user) {
      console.log("<-2->");

      httpError("Invalid email", 401);
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      console.log("<-1->", parsed);

      httpError("Invalid password", 401);
    }

    // Generate JWT
    const token = fastify.jwt.sign({
      userId: user.id,
      email: user.email,
    });

    return reply.send({
      token,
      user: formatUserResponse(user, user.weeklyStreaks),
    });
  });

  // POST /auth/logout
  fastify.post('/logout', async (_request, reply) => {
    console.log("ON_LOG_OUT")

    // JWT is stateless - client should delete token
    // This endpoint confirms logout and can be extended for token blacklisting
    return reply.send({
      success: true,
      message: 'Logged out successfully',
    });
  });
};

export default authRoutes;
