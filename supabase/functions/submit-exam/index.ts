// ═══════════════════════════════════════════════════════════════════════════
//  Power BI Skills Assessment — Supabase Edge Function
//  submit-exam/index.ts
//
//  Responsibilities:
//    1. Validate incoming payload (participant info + answers)
//    2. Score the exam against the answer key
//    3. Classify the participant (Beginner / Intermediate / Advanced)
//    4. Persist result to exam_results table
//    5. Generate a plain-text / HTML report and store it in Supabase Storage
//    6. Send HR notification email via Resend
//    7. Return the full result JSON to the browser
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Types ────────────────────────────────────────────────────────────────────

interface Participant {
  firstName: string;
  lastName:  string;
  email:     string;
}

interface SubmitPayload {
  participant: Participant;
  accessCode:  string;
  answers:     Record<number, number>; // { questionIndex: selectedOptionIndex }
  timeUsed:    string;                 // "MM:SS"
  startedAt:   string;                 // ISO timestamp
}

interface QuestionMeta {
  id:         number;
  difficulty: "beginner" | "intermediate" | "advanced";
  text:       string;
  options:    string[];
  correct:    number;
}

interface DifficultyBreakdown {
  correct: number;
  total:   number;
  pct:     number;
}

interface ExamResult {
  firstName:   string;
  lastName:    string;
  email:       string;
  score:       number;
  percentage:  number;
  level:       "Beginner" | "Intermediate" | "Advanced";
  correct:     number;
  wrong:       number;
  skipped:     number;
  timeUsed:    string;
  answers:     Record<number, number>;
  breakdown:   Record<string, DifficultyBreakdown>;
  recommendation: string;
  takenAt:     string;
}

// ── Answer Key ────────────────────────────────────────────────────────────────
// Single source of truth — matches the question bank in index.html exactly.

const ANSWER_KEY: QuestionMeta[] = [
  // BEGINNER
  { id:1,  difficulty:"beginner",     text:"What is Power BI primarily used for?",                                                                         options:["Database administration and server management","Business intelligence, data visualization, and reporting","Software development and code compilation","Email marketing and campaign management"], correct:1 },
  { id:2,  difficulty:"beginner",     text:"Which of the following is a component of the Power BI service?",                                               options:["Power BI Desktop","Power BI Dashboard","Power BI Report Builder","All of the above"], correct:3 },
  { id:3,  difficulty:"beginner",     text:"In Power BI, what is a 'dataset'?",                                                                            options:["A collection of charts displayed on a single screen","A connection or import of data used to build reports","A type of filter applied to visuals","A scheduled email report"], correct:1 },
  { id:4,  difficulty:"beginner",     text:"What file extension does a Power BI Desktop file use?",                                                        options:[".pbix",".xlsx",".csv",".pbit"], correct:0 },
  { id:5,  difficulty:"beginner",     text:"Which view in Power BI Desktop allows you to clean and transform data before loading it into your model?",     options:["Report View","Model View","Power Query Editor","DAX Editor"], correct:2 },
  { id:6,  difficulty:"beginner",     text:"What does a Power BI 'Dashboard' contain?",                                                                    options:["Raw data tables exported from Excel","Pinned tiles from one or more reports or datasets","Only bar and line charts","SQL query results"], correct:1 },
  { id:7,  difficulty:"beginner",     text:"Which of these is a valid data source connection in Power BI?",                                                options:["Excel workbook","SQL Server database","SharePoint Online list","All of the above"], correct:3 },
  { id:8,  difficulty:"beginner",     text:"What is the purpose of slicers in a Power BI report?",                                                         options:["To split data into multiple pages automatically","To allow users to interactively filter report visuals","To merge two tables together","To schedule data refresh intervals"], correct:1 },
  // INTERMEDIATE
  { id:9,  difficulty:"intermediate", text:"In DAX, what does the CALCULATE function do?",                                                                 options:["Performs arithmetic calculations on columns","Evaluates an expression in a modified filter context","Counts the number of rows in a table","Retrieves the current date and time"], correct:1 },
  { id:10, difficulty:"intermediate", text:"What is the difference between a 'Measure' and a 'Calculated Column' in Power BI?",                           options:["There is no difference; they are the same thing","Measures are computed at query time using filter context; calculated columns are computed row-by-row at refresh","Calculated columns are only available in Power BI Service","Measures can only use SUM and COUNT functions"], correct:1 },
  { id:11, difficulty:"intermediate", text:"Which type of relationship cardinality should typically be used between a Fact table and a Dimension table?",  options:["Many-to-Many (*:*)","One-to-One (1:1)","Many-to-One (*:1)","No relationship needed"], correct:2 },
  { id:12, difficulty:"intermediate", text:"What is the purpose of the RELATED() DAX function?",                                                           options:["Creates a relationship between two tables","Retrieves a value from a related (one-side) table column based on the current row","Filters a table based on a condition","Returns all rows from two tables joined together"], correct:1 },
  { id:13, difficulty:"intermediate", text:"In Power Query, what does 'Merge Queries' do?",                                                                options:["Appends rows from one table to another","Performs a join between two tables based on matching key columns","Exports a table to a CSV file","Splits one column into multiple columns"], correct:1 },
  { id:14, difficulty:"intermediate", text:"What does the Power BI Gateway enable?",                                                                       options:["Exporting reports to PowerPoint","Refreshing on-premises data sources in the Power BI Service","Creating new workspaces in Teams","Embedding reports in mobile apps"], correct:1 },
  { id:15, difficulty:"intermediate", text:"Which DAX function would you use to compute a running total that ignores the current report filters?",         options:["SUMX","TOTALYTD","ALL combined with CALCULATE","FILTER"], correct:2 },
  // ADVANCED
  { id:16, difficulty:"advanced",     text:"What is the difference between DirectQuery and Import mode in Power BI?",                                      options:["Import loads data into the Power BI model; DirectQuery queries the source live at report render time","DirectQuery stores data locally; Import queries the cloud","They are identical in performance and behavior","Import mode does not support relationships"], correct:0 },
  { id:17, difficulty:"advanced",     text:"What does the USERELATIONSHIP() function allow you to do?",                                                    options:["Create a new relationship between tables dynamically","Activate an inactive relationship within a CALCULATE expression","Delete an existing relationship from the model","Convert a many-to-many relationship to one-to-one"], correct:1 },
  { id:18, difficulty:"advanced",     text:"What is Row-Level Security (RLS) in Power BI?",                                                                options:["A method to format rows alternately in tables","A feature to restrict data access at the row level per user or role","A Power Query step that removes duplicate rows","An option to lock report pages from editing"], correct:1 },
  { id:19, difficulty:"advanced",     text:"Which of the following correctly describes the RANKX function in DAX?",                                        options:["It sorts a table alphabetically by a column","It returns the ranking of a value in a column across all rows in a given table expression","It creates a calculated table sorted by rank","It works only with date columns"], correct:1 },
  { id:20, difficulty:"advanced",     text:"In Power BI, what is a 'Composite Model'?",                                                                    options:["A report containing more than 10 visuals","A data model that combines Import and DirectQuery tables, or multiple DirectQuery sources","A Power BI template file (.pbit) with prebuilt visuals","A model created using only calculated tables"], correct:1 },
];

const TOTAL = ANSWER_KEY.length; // 20

// ── Scoring ───────────────────────────────────────────────────────────────────

function scoreExam(answers: Record<number, number>): {
  correct: number; wrong: number; skipped: number;
  breakdown: Record<string, DifficultyBreakdown>;
  questionDetail: Array<{ index: number; status: "correct" | "wrong" | "skipped"; selected: number | null; correctAnswer: number; text: string; difficulty: string }>;
} {
  let correct = 0, wrong = 0, skipped = 0;
  const breakdown: Record<string, DifficultyBreakdown> = {
    beginner:     { correct: 0, total: 0, pct: 0 },
    intermediate: { correct: 0, total: 0, pct: 0 },
    advanced:     { correct: 0, total: 0, pct: 0 },
  };
  const questionDetail = [];

  ANSWER_KEY.forEach((q, i) => {
    const d = q.difficulty;
    breakdown[d].total++;
    const selected = answers[i] ?? null;
    let status: "correct" | "wrong" | "skipped";

    if (selected === null || selected === undefined) {
      skipped++;
      status = "skipped";
    } else if (selected === q.correct) {
      correct++;
      breakdown[d].correct++;
      status = "correct";
    } else {
      wrong++;
      status = "wrong";
    }

    questionDetail.push({
      index: i + 1,
      status,
      selected: selected !== null ? selected : null,
      correctAnswer: q.correct,
      text: q.text,
      difficulty: d,
    });
  });

  // Compute percentages
  for (const d of Object.keys(breakdown)) {
    const b = breakdown[d];
    b.pct = b.total > 0 ? Math.round((b.correct / b.total) * 100) : 0;
  }

  return { correct, wrong, skipped, breakdown, questionDetail };
}

// ── Classification ────────────────────────────────────────────────────────────

function classify(correct: number): {
  level: "Beginner" | "Intermediate" | "Advanced";
  recommendation: string;
  track: string;
  duration: string;
} {
  if (correct <= 9) {
    return {
      level: "Beginner",
      track: "Power BI Fundamentals",
      duration: "2–3 days",
      recommendation:
        "Participant demonstrates foundational awareness of Power BI. " +
        "Recommended track: Power BI Fundamentals — covering data connectivity, " +
        "basic visualizations, Power Query essentials, and introduction to DAX. " +
        "Estimated duration: 2–3 days.",
    };
  } else if (correct <= 15) {
    return {
      level: "Intermediate",
      track: "Power BI Data Modeling & DAX",
      duration: "2 days",
      recommendation:
        "Participant has a solid understanding of core Power BI features. " +
        "Recommended track: Power BI Data Modeling & DAX — covering star schemas, " +
        "intermediate DAX, relationships, and report design best practices. " +
        "Estimated duration: 2 days.",
    };
  } else {
    return {
      level: "Advanced",
      track: "Power BI Advanced Analytics & Governance",
      duration: "2 days",
      recommendation:
        "Participant demonstrates advanced proficiency in Power BI. " +
        "Recommended track: Power BI Advanced Analytics & Governance — covering " +
        "composite models, RLS, performance optimization, Power BI Embedded, and " +
        "deployment pipelines. Estimated duration: 2 days.",
    };
  }
}

// ── Validation ────────────────────────────────────────────────────────────────

function validate(payload: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!payload || typeof payload !== "object") {
    return { valid: false, errors: ["Invalid payload."] };
  }
  const p = payload as Record<string, unknown>;

  // Participant
  const pt = p.participant as Record<string, unknown> | undefined;
  if (!pt) {
    errors.push("Missing participant object.");
  } else {
    if (!pt.firstName || typeof pt.firstName !== "string" || !pt.firstName.trim())
      errors.push("firstName is required.");
    if (!pt.lastName || typeof pt.lastName !== "string" || !pt.lastName.trim())
      errors.push("lastName is required.");
    if (!pt.email || typeof pt.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pt.email))
      errors.push("A valid email is required.");
  }

  // Access code — validated against EXAM_ACCESS_CODE secret
  const validCodes = (Deno.env.get("EXAM_ACCESS_CODES") ?? "PBI-2025,TRAIN-01,CONSUL-02")
    .split(",")
    .map((c) => c.trim().toUpperCase());
  const submittedCode = (typeof p.accessCode === "string" ? p.accessCode : "").trim().toUpperCase();
  if (!submittedCode) {
    errors.push("Access code is required.");
  } else if (!validCodes.includes(submittedCode)) {
    errors.push("Invalid access code.");
  }

  // Answers
  if (!p.answers || typeof p.answers !== "object" || Array.isArray(p.answers))
    errors.push("answers must be an object.");

  // timeUsed
  if (!p.timeUsed || typeof p.timeUsed !== "string")
    errors.push("timeUsed is required.");

  return { valid: errors.length === 0, errors };
}

// ── HTML Report ───────────────────────────────────────────────────────────────

function buildHtmlReport(result: ExamResult, questionDetail: ReturnType<typeof scoreExam>["questionDetail"]): string {
  const levelColor: Record<string, string> = {
    Beginner:     "#1d4ed8",
    Intermediate: "#92400e",
    Advanced:     "#065f46",
  };
  const levelBg: Record<string, string> = {
    Beginner:     "#dbeafe",
    Intermediate: "#fef3c7",
    Advanced:     "#d1fae5",
  };

  const qRows = questionDetail.map((q) => {
    const color = q.status === "correct" ? "#16a34a" : q.status === "wrong" ? "#dc2626" : "#6b7280";
    const icon  = q.status === "correct" ? "✓" : q.status === "wrong" ? "✗" : "—";
    const selectedText = q.selected !== null ? ANSWER_KEY[q.index - 1].options[q.selected] : "Not answered";
    const correctText  = ANSWER_KEY[q.index - 1].options[q.correctAnswer];
    return `
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#6b7280;">${q.index}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;">${q.text}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#6b7280;text-transform:capitalize;">${q.difficulty}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;font-weight:700;color:${color};">${icon}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;color:${q.status === "correct" ? "#16a34a" : "#dc2626"};">${selectedText}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#16a34a;">${correctText}</td>
      </tr>`;
  }).join("");

  const breakdownRows = Object.entries(result.breakdown).map(([d, b]) => `
    <tr>
      <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;text-transform:capitalize;">${d}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;">${b.correct} / ${b.total}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;font-weight:700;">${b.pct}%</td>
    </tr>`).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>Power BI Assessment Report — ${result.firstName} ${result.lastName}</title>
  <style>
    body { font-family: -apple-system, "Segoe UI", sans-serif; color: #1a1d2e; background: #fff; margin: 0; padding: 32px; font-size: 14px; line-height: 1.6; }
    h1 { font-size: 22px; margin-bottom: 4px; }
    h2 { font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: .7px; color: #6b7280; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; margin: 28px 0 14px; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-size: 12px; font-weight: 700; color: #6b7280; padding: 8px 10px; border-bottom: 2px solid #e5e7eb; }
  </style>
</head>
<body>
  <div style="background:#1a1d2e;color:#fff;padding:14px 20px;border-radius:8px;margin-bottom:28px;display:flex;align-items:center;gap:12px;">
    <span style="background:#f2c811;color:#1a1d2e;font-weight:800;font-size:13px;padding:4px 8px;border-radius:4px;">PBI</span>
    <span style="font-size:16px;font-weight:600;">Power BI Skills Assessment</span>
    <span style="margin-left:auto;font-size:12px;opacity:.6;">Training &amp; Consultancy</span>
  </div>

  <div style="display:inline-block;background:${levelBg[result.level]};color:${levelColor[result.level]};font-size:12px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;padding:5px 18px;border-radius:99px;margin-bottom:12px;">${result.level}</div>
  <h1>${result.firstName} ${result.lastName}</h1>
  <p style="color:#6b7280;margin:0 0 4px;">${result.email}</p>
  <p style="color:#6b7280;font-size:13px;">Completed: ${new Date(result.takenAt).toLocaleString("en-GB")} &nbsp;|&nbsp; Time used: ${result.timeUsed}</p>

  <h2>Score Summary</h2>
  <table>
    <tr>
      <th>Total Score</th><th>Percentage</th><th>Correct</th><th>Incorrect</th><th>Skipped</th><th>Level</th>
    </tr>
    <tr>
      <td style="padding:10px;font-size:20px;font-weight:800;">${result.correct} / ${TOTAL}</td>
      <td style="padding:10px;font-size:20px;font-weight:800;">${result.percentage}%</td>
      <td style="padding:10px;color:#16a34a;font-weight:700;">${result.correct}</td>
      <td style="padding:10px;color:#dc2626;font-weight:700;">${result.wrong}</td>
      <td style="padding:10px;color:#6b7280;font-weight:700;">${result.skipped}</td>
      <td style="padding:10px;font-weight:700;color:${levelColor[result.level]};">${result.level}</td>
    </tr>
  </table>

  <h2>Performance by Difficulty</h2>
  <table>
    <tr><th>Difficulty</th><th>Score</th><th>Percentage</th></tr>
    ${breakdownRows}
  </table>

  <h2>Training Recommendation</h2>
  <p style="background:#f7f8fa;border-left:4px solid #2c5de5;padding:14px 18px;border-radius:0 8px 8px 0;font-size:14px;">
    ${result.recommendation}
  </p>

  <h2>Question Review</h2>
  <table>
    <tr><th>#</th><th>Question</th><th>Difficulty</th><th>Result</th><th>Selected Answer</th><th>Correct Answer</th></tr>
    ${qRows}
  </table>

  <p style="margin-top:40px;font-size:11px;color:#9ca3af;text-align:center;border-top:1px solid #e5e7eb;padding-top:14px;">
    Generated by Power BI Skills Assessment Platform &nbsp;|&nbsp; Training &amp; Consultancy &nbsp;|&nbsp; ${new Date().getFullYear()}
  </p>
</body>
</html>`;
}

// ── Email to HR ───────────────────────────────────────────────────────────────

async function sendHrEmail(result: ExamResult, resendKey: string, hrEmail: string, ccEmail?: string): Promise<void> {
  const levelColor: Record<string, string> = {
    Beginner: "#1d4ed8", Intermediate: "#b45309", Advanced: "#065f46",
  };

  const body: Record<string, unknown> = {
    from:    "assessments@rootaccess.news",
    to:      [hrEmail],
    ...(ccEmail ? { cc: [ccEmail] } : {}),
    subject: `[PBI-Assessment] ${result.firstName} ${result.lastName} — ${result.level} (${result.percentage}%)`,
    headers: {
      "X-Category":    "PBI-Assessment",
      "X-Assessment":  "Power-BI-Skills",
    },
    html: `
      <div style="font-family:-apple-system,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;color:#1a1d2e;">
        <div style="background:#1a1d2e;padding:14px 20px;border-radius:8px 8px 0 0;">
          <span style="background:#f2c811;color:#1a1d2e;font-weight:800;font-size:12px;padding:3px 8px;border-radius:4px;">PBI</span>
          <span style="color:#fff;font-size:15px;font-weight:600;margin-left:10px;">New Assessment Submission</span>
        </div>
        <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;padding:24px;">
          <p style="margin:0 0 16px;font-size:15px;">A participant has completed the Power BI Skills Assessment.</p>
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <tr><td style="padding:8px 0;color:#6b7280;width:140px;">Full Name</td>      <td style="padding:8px 0;font-weight:600;">${result.firstName} ${result.lastName}</td></tr>
            <tr><td style="padding:8px 0;color:#6b7280;">Email</td>                      <td style="padding:8px 0;">${result.email}</td></tr>
            <tr><td style="padding:8px 0;color:#6b7280;">Score</td>                      <td style="padding:8px 0;font-weight:700;">${result.correct} / ${TOTAL} (${result.percentage}%)</td></tr>
            <tr><td style="padding:8px 0;color:#6b7280;">Level Assigned</td>             <td style="padding:8px 0;font-weight:800;color:${levelColor[result.level]};">${result.level}</td></tr>
            <tr><td style="padding:8px 0;color:#6b7280;">Recommended Track</td>          <td style="padding:8px 0;">${classify(result.correct).track} (${classify(result.correct).duration})</td></tr>
            <tr><td style="padding:8px 0;color:#6b7280;">Time Used</td>                  <td style="padding:8px 0;">${result.timeUsed}</td></tr>
            <tr><td style="padding:8px 0;color:#6b7280;">Submitted</td>                  <td style="padding:8px 0;">${new Date(result.takenAt).toLocaleString("en-GB")}</td></tr>
          </table>
          <div style="margin-top:20px;padding:12px 16px;background:#f7f8fa;border-radius:6px;font-size:13px;color:#374151;">
            ${result.recommendation}
          </div>
          <p style="margin-top:20px;font-size:12px;color:#9ca3af;">
            View all results in the <a href="https://app.supabase.com" style="color:#2c5de5;">Supabase dashboard</a>
            or connect Power BI to the exam_results table for live reporting.
          </p>
        </div>
      </div>`,
  };

  const res = await fetch("https://api.resend.com/emails", {
    method:  "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
    body:    JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Resend error:", err);
    // Non-fatal — we don't fail the whole request if email fails
  }
}

// ── Main Handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // CORS — allow the exam frontend origin
  const corsHeaders = {
    "Access-Control-Allow-Origin":  "*",   // tighten to your domain in production
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed." }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── Parse body ──────────────────────────────────────────────────────────────
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body." }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── Validate ────────────────────────────────────────────────────────────────
  const { valid, errors } = validate(payload);
  if (!valid) {
    return new Response(JSON.stringify({ error: "Validation failed.", details: errors }), {
      status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { participant, accessCode, answers, timeUsed, startedAt } = payload as SubmitPayload;

  // ── Score ───────────────────────────────────────────────────────────────────
  const { correct, wrong, skipped, breakdown, questionDetail } = scoreExam(answers);
  const percentage = Math.round((correct / TOTAL) * 100);

  // ── Classify ────────────────────────────────────────────────────────────────
  const { level, recommendation } = classify(correct);

  const takenAt = startedAt ?? new Date().toISOString();

  const result: ExamResult = {
    firstName:   participant.firstName.trim(),
    lastName:    participant.lastName.trim(),
    email:       participant.email.trim().toLowerCase(),
    score:       correct,
    percentage,
    level,
    correct,
    wrong,
    skipped,
    timeUsed,
    answers,
    breakdown,
    recommendation,
    takenAt,
  };

  // ── Supabase client (service role — bypasses RLS for inserts) ───────────────
  const supabaseUrl  = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resendKey    = Deno.env.get("RESEND_API_KEY") ?? "";
  const hrEmail      = Deno.env.get("HR_EMAIL") ?? "";
  const ccEmail      = Deno.env.get("HR_CC_EMAIL") ?? "";

  const supabase = createClient(supabaseUrl, supabaseKey);

  // ── Persist to DB ───────────────────────────────────────────────────────────
  const { data: dbRow, error: dbError } = await supabase
    .from("exam_results")
    .insert({
      first_name:     result.firstName,
      last_name:      result.lastName,
      email:          result.email,
      score:          result.correct,
      percentage:     result.percentage,
      level:          result.level,
      correct:        result.correct,
      wrong:          result.wrong,
      skipped:        result.skipped,
      time_used:      result.timeUsed,
      answers:        result.answers,
      breakdown:      result.breakdown,
      recommendation: result.recommendation,
      taken_at:       result.takenAt,
    })
    .select("id")
    .single();

  if (dbError) {
    console.error("DB insert error:", dbError);
    return new Response(JSON.stringify({ error: "Failed to save result.", details: dbError.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const resultId = dbRow?.id ?? "unknown";

  // ── Generate HTML report and store in Supabase Storage ─────────────────────
  const htmlReport = buildHtmlReport(result, questionDetail);
  const reportPath = `reports/${resultId}.html`;

  const { error: storageError } = await supabase.storage
    .from("exam-reports")
    .upload(reportPath, new TextEncoder().encode(htmlReport), {
      contentType: "text/html",
      upsert: false,
    });

  if (storageError) {
    // Non-fatal — log but continue
    console.error("Storage upload error:", storageError.message);
  }

  // Get public URL for the stored report
  const { data: publicUrlData } = supabase.storage
    .from("exam-reports")
    .getPublicUrl(reportPath);
  const reportUrl = publicUrlData?.publicUrl ?? null;

  // ── Send HR email ───────────────────────────────────────────────────────────
  if (resendKey && hrEmail) {
    await sendHrEmail(result, resendKey, hrEmail, ccEmail || undefined);
  }

  // ── Return result to browser ────────────────────────────────────────────────
  return new Response(
    JSON.stringify({
      success:    true,
      resultId,
      reportUrl,
      score:      result.correct,
      percentage: result.percentage,
      level:      result.level,
      correct:    result.correct,
      wrong:      result.wrong,
      skipped:    result.skipped,
      breakdown:  result.breakdown,
      recommendation: result.recommendation,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
