// ═══════════════════════════════════════════════════════════════════════════
//  Power BI Assessment — Dashboard Auth Edge Function
//  dashboard-auth/index.ts
//
//  POST { password } → validates against DASHBOARD_PASSWORD secret
//                    → stores session token in db → returns { token, expiresAt }
//
//  GET  Authorization: Bearer <token>
//       → validates token in db → returns exam_results_summary rows
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour

function generateToken(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase    = createClient(supabaseUrl, serviceKey);

  // ── POST — validate password, issue token stored in DB ────────────────────
  if (req.method === "POST") {
    let body: { password?: string; sessionName?: string };
    try { body = await req.json(); }
    catch {
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
      await new Promise(r => setTimeout(r, 400)); // brute-force delay
      return new Response(JSON.stringify({ error: "Incorrect password." }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Store token in DB
    const token     = generateToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

    await supabase.from("dashboard_sessions").insert({ token, expires_at: expiresAt });

    // Check for new-session action (re-auth before starting a new session)
    const url    = new URL(req.url);
    const action = url.searchParams.get("action");

    if (action === "new-session") {
      // sessionName is already in `body` — stream was consumed above, never re-read
      const sName  = (body.sessionName ?? "").trim();
      if (!sName) {
        return new Response(JSON.stringify({ error: "Session name is required." }), {
          status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Store new active session name
      await supabase.from("dashboard_sessions")
        .update({ active_session: sName })
        .eq("token", token);

      // Update the global active session in a settings table
      await supabase.from("app_settings")
        .upsert({ key: "active_session", value: sName }, { onConflict: "key" });

      // Also re-open assessment when starting new session
      await supabase.from("app_settings")
        .upsert({ key: "assessment_open", value: "true" }, { onConflict: "key" });

      return new Response(JSON.stringify({ success: true, sessionName: sName }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "end-assessment") {
      await supabase.from("app_settings")
        .upsert({ key: "assessment_open", value: "false" }, { onConflict: "key" });

      return new Response(JSON.stringify({ success: true, message: "Assessment closed." }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ token, expiresAt: Date.now() + SESSION_TTL_MS }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── GET — validate token from DB, return results ───────────────────────────
  if (req.method === "GET") {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();

    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized. Please log in again." }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate token in DB
    const { data: session } = await supabase
      .from("dashboard_sessions")
      .select("expires_at")
      .eq("token", token)
      .single();

    if (!session || new Date(session.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "Unauthorized. Please log in again." }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch results
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
