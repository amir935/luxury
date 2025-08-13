export const allowRoles = (
  ...roles: Array<"RIDER" | "DRIVER" | "ADMIN" | "SUPER_ADMIN">
) => (req: any, res: any, next: any) => {
  const role =
    req.userRole ??
    req.user?.role ??
    (typeof req.user === "object" ? req.user?.role : undefined);

  if (!role) return res.status(401).json({ error: "Unauthorized: no role" });

  if (!roles.includes(role)) {
    return res
      .status(403)
      .json({ error: `Forbidden: requires ${roles.join(" or ")}, you are ${role}` });
  }
  next();
};
