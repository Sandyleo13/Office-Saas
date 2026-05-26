import bcrypt from "bcryptjs";
import prisma from "../server/lib/prisma.js";

async function main() {

  const passwordHash =
    await bcrypt.hash(
      "Password123",
      12
    );

  const users = [
    {
      name: "Admin User",
      email: "admin@officeflow.com",
      role: "ADMIN"
    },

    {
      name: "Manager User",
      email: "manager@officeflow.com",
      role: "MANAGER"
    },

    {
      name: "Editor User",
      email: "editor@officeflow.com",
      role: "EDITOR"
    },

    {
      name: "Reviewer User",
      email: "reviewer@officeflow.com",
      role: "REVIEWER"
    },

    {
      name: "Viewer User",
      email: "viewer@officeflow.com",
      role: "VIEWER"
    }
  ];

  for (const userData of users) {

    const existingUser =
      await prisma.user.findUnique({
        where: {
          email: userData.email
        }
      });

    if (!existingUser) {

      const user =
        await prisma.user.create({
          data: {
            name: userData.name,

            email: userData.email,

            passwordHash,

            role: userData.role,

            status: "ACTIVE",

            storageAccess: true
          }
        });

      console.log(
        `Created ${user.role}: ${user.email}`
      );

      await prisma.auditLog.create({
        data: {
          actorId: user.id,

          action: `SEEDED_${user.role}`
        }
      });

    } else {

      console.log(
        `${userData.email} already exists`
      );
    }
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {

    console.error(error);

    await prisma.$disconnect();

    process.exit(1);
  });