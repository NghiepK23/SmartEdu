import { createClient } from "npm:@supabase/supabase-js@2";
import { encryptTeacherKey } from "../_shared/ai-keys.ts";

const BASE_CORS_HEADERS = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function corsHeadersFor(req: Request): Record<string, string> {
  const configured = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (!configured.length) {
    return { ...BASE_CORS_HEADERS, "Access-Control-Allow-Origin": "*" };
  }
  const requestOrigin = req.headers.get("Origin") ?? "";
  if (configured.includes(requestOrigin)) {
    return { ...BASE_CORS_HEADERS, "Access-Control-Allow-Origin": requestOrigin, "Vary": "Origin" };
  }
  return { ...BASE_CORS_HEADERS, "Vary": "Origin" };
}

function jsonResponse(req: Request, body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeadersFor(req), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeadersFor(req) });
  if (req.method !== "POST") return jsonResponse(req, { error: "Chỉ hỗ trợ POST." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publicKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = req.headers.get("Authorization");
  if (!supabaseUrl || !publicKey || !serviceRoleKey) {
    console.error("AI credentials function is missing Supabase environment variables.");
    return jsonResponse(req, { error: "Edge Function chưa được cấu hình Supabase." }, 500);
  }
  if (!authorization?.startsWith("Bearer ")) return jsonResponse(req, { error: "Cần đăng nhập để quản lý API key." }, 401);

  const userClient = createClient(supabaseUrl, publicKey, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: authError } = await userClient.auth.getUser(authorization.slice(7));
  if (authError || !userData.user) return jsonResponse(req, { error: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn." }, 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(req, { error: "Nội dung yêu cầu không phải JSON hợp lệ." }, 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return jsonResponse(req, { error: "Yêu cầu không hợp lệ." }, 400);

  const action = (body as Record<string, unknown>).action;
  if (action !== "status" && action !== "save" && action !== "delete") {
    return jsonResponse(req, { error: "Thao tác API key không hợp lệ." }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: profile, error: profileError } = await admin
    .from("profiles").select("role").eq("id", userData.user.id).maybeSingle();
  if (profileError) {
    console.error("Could not verify AI credential owner role:", profileError.message);
    return jsonResponse(req, { error: "Không xác minh được quyền tài khoản." }, 500);
  }
  if (profile?.role !== "TEACHER") return jsonResponse(req, { error: "Chỉ giáo viên mới được quản lý API key Gemini." }, 403);

  if (action === "status") {
    const { data: credential, error } = await admin
      .from("teacher_ai_credentials")
      .select("key_hint,updated_at")
      .eq("teacher_id", userData.user.id)
      .maybeSingle();
    if (error) {
      console.error("Could not read AI credential status:", error.message);
      return jsonResponse(req, { error: "Không đọc được trạng thái API key." }, 500);
    }
    return jsonResponse(req, {
      configured: !!credential,
      key_hint: credential?.key_hint ?? null,
      updated_at: credential?.updated_at ?? null,
    });
  }

  if (action === "delete") {
    const { error } = await admin.from("teacher_ai_credentials").delete().eq("teacher_id", userData.user.id);
    if (error) {
      console.error("Could not delete teacher AI credential:", error.message);
      return jsonResponse(req, { error: "Không xóa được API key Gemini." }, 500);
    }
    return jsonResponse(req, { configured: false });
  }

  const apiKey = (body as Record<string, unknown>).api_key;
  if (typeof apiKey !== "string" || apiKey.length < 20 || apiKey.length > 256 || /\s/.test(apiKey)) {
    return jsonResponse(req, { error: "API key không hợp lệ; hãy kiểm tra lại key trong Google AI Studio." }, 400);
  }
  const encryptionSecret = Deno.env.get("AI_KEY_ENCRYPTION_KEY");
  if (!encryptionSecret) {
    console.error("AI_KEY_ENCRYPTION_KEY is not configured.");
    return jsonResponse(req, { error: "Máy chủ chưa cấu hình mã hóa API key." }, 500);
  }

  let encrypted: { ciphertext: string; nonce: string };
  try {
    encrypted = await encryptTeacherKey(encryptionSecret, userData.user.id, apiKey);
  } catch (error) {
    console.error("Could not encrypt teacher AI credential:", error instanceof Error ? error.message : "unknown error");
    return jsonResponse(req, { error: "Không mã hóa được API key; hãy kiểm tra cấu hình bảo mật." }, 500);
  }

  const { error: saveError } = await admin.from("teacher_ai_credentials").upsert({
    teacher_id: userData.user.id,
    ciphertext: encrypted.ciphertext,
    nonce: encrypted.nonce,
    key_hint: apiKey.slice(-4),
    updated_at: new Date().toISOString(),
  }, { onConflict: "teacher_id" });
  if (saveError) {
    console.error("Could not save teacher AI credential:", saveError.message);
    return jsonResponse(req, { error: "Không lưu được API key Gemini." }, 500);
  }
  return jsonResponse(req, { configured: true, key_hint: apiKey.slice(-4) });
});
