// ═══════════════════════════════════════════════════════════════════════════
//  Power BI Assessment — Dashboard Auth Edge Function
//  dashboard-auth/index.ts
//
//  POST { password } → validates against DASHBOARD_PASSWORD secret
//                    → returns { token, expiresAt } on success
//                    → 401 on failure
//
//  GET  with Authorization: Bearer <token>
//       → validates token is active
//       → returns exam_results_summary rows on success
//       → 401 on invalid/expired token
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// In-memory token store (survives for the lifetime of the function instance)
// For production at scale, store tokens in a Supabase table instead.
const activeSessions = new Map<string, number>(); // token → expiresAt (ms)
const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour

function generateToken(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
}

function isValidToken(token: string): boolean {
  const exp = activeSessions.get(token);
  if (!exp) return false;
  if (Date.now() > exp) {
    activeSessions.delete(token);
    return false;
  }
  return true;
}

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // ── POST /dashboard-auth — validate password, issue token ─────────────────
  if (req.method === "POST") {
    let body: { password?: string };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const expected = Deno.env.get("DASHBOARD_PASSWORD");
    if (!expected) {
      return new Response(JSON.stringify({ error: "Dashboard password not configured." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!body.password || body.password !== expected) {
      // Small delay to slow brute-force attempts
      await new Promise(r => setTimeout(r, 400));
      return new Response(JSON.stringify({ error: "Incorrect password." }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Issue token
    const token     = generateToken();
    const expiresAt = Date.now() + SESSION_TTL_MS;
    activeSessions.set(token, expiresAt);

    return new Response(JSON.stringify({ token, expiresAt }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── GET /dashboard-auth — fetch results (token required) ──────────────────
  if (req.method === "GET") {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();

    if (!token || !isValidToken(token)) {
      return new Response(JSON.stringify({ error: "Unauthorized. Please log in again." }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch results from Supabase using service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase    = createClient(supabaseUrl, serviceKey);

    const { data, error } = await supabase
      .from("exam_results_summary")
      .select("*")
      .order("taken_at", { ascending: false });

    if (error) {
      return new Response(JSON.stringify({ error: "Failed to fetch results." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(data), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ error: "Method not allowed." }), {
    status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
