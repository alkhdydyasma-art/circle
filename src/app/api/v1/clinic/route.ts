import { keyHash, json, rpc } from "@/lib/clinic-api";

// GET /api/v1/clinic — clinic facts for the AI agent's context: services, prices,
// doctors with weekly hours, branches and booking rules.
export async function GET(request: Request) {
  const key = await keyHash(request);
  if (key instanceof Response) return key;
  const res = await rpc("api_clinic_info", { p_key_hash: key });
  return res instanceof Response ? res : json(res.data);
}
