// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You parse construction "SUMMARY OF DAILY MANPOWER ON SITE" images into strict JSON.

Image layout:
- Header "SUMMARY OF DAILY MANPOWER ON SITE", report date top-right (e.g. 2026.05.23)
- 3 sections: "1) Construction", "2) Mechanical", "3) Electrical"
- Columns per row: No | Company | T&C | Defect | Post TOP | TOTAL | Remarks
- Each section ends with "Sub-Total"; final row "Grand Total"

Section -> team mapping:
  Construction -> "Arch"
  Mechanical   -> "Mech"
  Electrical   -> "Elec"

Subcontractor / Trade rules:
- If Company text contains "(...)" treat the inside as Trade and strip parens from Subcontractor.
  e.g. "Kurihara (ACMV)" -> subcontractor="Kurihara", trade="ACMV"
       "ASK (PSG)" -> subcontractor="ASK", trade="PSG"
       "RICO (FP)" -> subcontractor="RICO", trade="FP"
- Construction fixed trades: MERO -> "Façade". All other Construction companies -> trade=null.
- Electrical fixed: PureTech -> "Elec", "Schindler Lift" -> "Lift".

Number rules:
- "-" or blank cell -> 0 (integer)
- strip commas
- TOTAL must equal T&C + Defect + Post TOP (use to self-check)

Return ONLY JSON via the report tool. Do not include Sub-Total / Grand Total rows in "rows" — return them in the sub_total / grand_total fields for verification.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    const body = await req.json();
    const storagePath: string | undefined = body.storage_path;
    const directImageUrl: string | undefined = body.image_url;

    let imageUrl = directImageUrl;
    if (!imageUrl && storagePath) {
      const sb = createClient(SUPABASE_URL, SERVICE_KEY);
      const { data, error } = await sb.storage
        .from("dmr-uploads")
        .createSignedUrl(storagePath, 600);
      if (error) throw error;
      imageUrl = data.signedUrl;
    }
    if (!imageUrl) {
      return new Response(JSON.stringify({ error: "image_url or storage_path required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tools = [
      {
        type: "function",
        function: {
          name: "report_dmr",
          description: "Return parsed DMR data",
          parameters: {
            type: "object",
            properties: {
              report_date: { type: "string", description: "ISO date YYYY-MM-DD" },
              sections: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    team: { type: "string", enum: ["Arch", "Mech", "Elec"] },
                    rows: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          subcontractor: { type: "string" },
                          trade: { type: ["string", "null"] },
                          tnc: { type: "integer" },
                          defect: { type: "integer" },
                          post_top: { type: "integer" },
                          total: { type: "integer" },
                        },
                        required: ["subcontractor", "tnc", "defect", "post_top", "total"],
                      },
                    },
                    sub_total: {
                      type: "object",
                      properties: {
                        tnc: { type: "integer" },
                        defect: { type: "integer" },
                        post_top: { type: "integer" },
                        total: { type: "integer" },
                      },
                      required: ["tnc", "defect", "post_top", "total"],
                    },
                  },
                  required: ["team", "rows", "sub_total"],
                },
              },
              grand_total: {
                type: "object",
                properties: {
                  tnc: { type: "integer" },
                  defect: { type: "integer" },
                  post_top: { type: "integer" },
                  total: { type: "integer" },
                },
                required: ["tnc", "defect", "post_top", "total"],
              },
            },
            required: ["report_date", "sections", "grand_total"],
          },
        },
      },
    ];

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: "Parse this DMR image. Call report_dmr." },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
        tools,
        tool_choice: { type: "function", function: { name: "report_dmr" } },
      }),
    });

    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("AI error", aiResp.status, t);
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please retry shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Top up at Settings > Workspace > Usage." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI gateway error", detail: t }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const json: any = await aiResp.json();
    const call = json.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) {
      return new Response(JSON.stringify({ error: "No tool call returned", raw: json }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const parsed = JSON.parse(call.function.arguments);

    return new Response(JSON.stringify({ data: parsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("dmr-image-parse error", e);
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
