export function getCommissionRate(vehicleClass?: "SILVER"|"GOLD"|"PLATINUM") {
  // default from env, fallback 15%
  const def = Number(process.env.COMMISSION_DEFAULT ?? "0.15");

  const map: Record<string, number> = {
    SILVER: Number(process.env.COMMISSION_SILVER ?? def),
    GOLD: Number(process.env.COMMISSION_GOLD ?? def),
    PLATINUM: Number(process.env.COMMISSION_PLATINUM ?? def),
  };

  return vehicleClass ? (map[vehicleClass] ?? def) : def;
}