// ApiStock · Edge Function de administración de usuarios.
// Es el ÚNICO lugar donde se usa la clave service_role (variable de entorno del servidor).
// Acciones: create | list | set_password | delete. Solo para usuarios con profiles.is_admin = true.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Origen permitido (p. ej. https://usuario.github.io). Vacío = ninguno distinto del mismo origen.
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  if (origin && ALLOWED_ORIGIN && origin === ALLOWED_ORIGIN) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, origin);

  // 1. Identificar a quien llama a partir de SU token (nunca de parámetros)
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "unauthorized" }, 401, origin);

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: "unauthorized" }, 401, origin);
  const caller = userData.user;

  // 2. Comprobar que es administrador (con service_role, solo lectura de su propio perfil)
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: profile } = await admin
    .from("profiles").select("is_admin").eq("user_id", caller.id).maybeSingle();
  if (!profile?.is_admin) return json({ error: "forbidden" }, 403, origin);

  // 3. Validar la petición
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400, origin);
  }
  const action = body.action;

  try {
    if (action === "create") {
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      const password = typeof body.password === "string" ? body.password : "";
      if (!EMAIL_RE.test(email) || email.length > 254) return json({ error: "invalid_email" }, 400, origin);
      if (password.length < 10 || password.length > 72) return json({ error: "invalid_password" }, 400, origin);

      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error || !data.user) {
        const exists = /already|registered|exists/i.test(error?.message ?? "");
        return json({ error: exists ? "email_exists" : "create_failed" }, exists ? 409 : 400, origin);
      }
      // El trigger on_auth_user_created ha creado el perfil y el catálogo inicial.
      return json({ id: data.user.id, email: data.user.email }, 201, origin);
    }

    if (action === "list") {
      const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      if (error) return json({ error: "list_failed" }, 500, origin);
      const { data: profiles } = await admin.from("profiles").select("user_id, is_admin");
      const adminIds = new Set((profiles ?? []).filter((p) => p.is_admin).map((p) => p.user_id));
      return json({
        users: data.users.map((u) => ({
          id: u.id,
          email: u.email,
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at,
          is_admin: adminIds.has(u.id),
        })),
      }, 200, origin);
    }

    if (action === "set_password") {
      const id = typeof body.user_id === "string" ? body.user_id : "";
      const password = typeof body.password === "string" ? body.password : "";
      if (!UUID_RE.test(id)) return json({ error: "invalid_user" }, 400, origin);
      if (password.length < 10 || password.length > 72) return json({ error: "invalid_password" }, 400, origin);
      const { error } = await admin.auth.admin.updateUserById(id, { password });
      if (error) return json({ error: "update_failed" }, 400, origin);
      return json({ ok: true }, 200, origin);
    }

    if (action === "delete") {
      const id = typeof body.user_id === "string" ? body.user_id : "";
      if (!UUID_RE.test(id)) return json({ error: "invalid_user" }, 400, origin);
      if (id === caller.id) return json({ error: "cannot_delete_self" }, 400, origin);
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) return json({ error: "delete_failed" }, 400, origin);
      // Las lápidas no tienen FK (decisión D25): se limpian aquí.
      await admin.from("tombstones").delete().eq("user_id", id);
      return json({ ok: true }, 200, origin);
    }

    return json({ error: "unknown_action" }, 400, origin);
  } catch (_e) {
    return json({ error: "internal_error" }, 500, origin);
  }
});
