/**
 * Supabase Edge Function: parse-points-log
 *
 * Deploy:
 *   supabase functions deploy parse-points-log
 *   supabase secrets set GEMINI_API_KEY=your-key
 *
 * Expects JSON body:
 * {
 *   text: string,
 *   participants: Array<{ id: string, name: string }>,
 *   activities: Array<{ id: string, title: string, default_points: number, allow_negative: boolean }>
 * }
 *
 * Returns: { participant_id: string, activity_id: string, points: number }
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

type ParticipantMeta = { id: string; name: string };
type ActivityMeta = {
	id: string;
	title: string;
	default_points: number;
	allow_negative: boolean;
};

type AiPayload = {
	participant_id: string;
	activity_id: string;
	points: number;
};

const RESPONSE_SCHEMA = {
	type: "object",
	properties: {
		participant_id: { type: "string" },
		activity_id: { type: "string" },
		points: { type: "number" }
	},
	required: ["participant_id", "activity_id", "points"]
};

Deno.serve(async (req) => {
	if (req.method === "OPTIONS") {
		return new Response("ok", { headers: corsHeaders });
	}

	try {
		const geminiKey = Deno.env.get("GEMINI_API_KEY");
		if (!geminiKey) {
			return jsonResponse({ error: "GEMINI_API_KEY is not configured" }, 500);
		}

		const body = await req.json();
		const text = String(body?.text ?? "").trim();
		const participants = (body?.participants ?? []) as ParticipantMeta[];
		const activities = (body?.activities ?? []) as ActivityMeta[];

		if (!text) {
			return jsonResponse({ error: "text is required" }, 400);
		}
		if (!participants.length || !activities.length) {
			return jsonResponse({ error: "participants and activities metadata are required" }, 400);
		}

		const systemPrompt = `You convert free-text reward log entries into strict JSON.
Return ONLY one JSON object with this exact shape:
{"participant_id":"<uuid>","activity_id":"<uuid>","points":<number>}

Rules:
- Pick participant_id and activity_id ONLY from the provided metadata arrays.
- points may be decimal (e.g. 2.5). Prefer the activity default_points when the text does not specify an amount.
- Negative points are only valid if the chosen activity has allow_negative=true.
- If the text is ambiguous, choose the closest matching names and still return valid JSON.
- Do not include markdown, commentary, or multiple objects.`;

		const userPrompt = `Text: ${text}

Participants JSON: ${JSON.stringify(participants)}
Activities JSON: ${JSON.stringify(activities)}`;

		const geminiUrl =
			`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${geminiKey}`;

		const geminiRes = await fetch(geminiUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				contents: [{ role: "user", parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
				generationConfig: {
					temperature: 0.1,
					responseMimeType: "application/json",
					responseSchema: RESPONSE_SCHEMA,
					thinkingConfig: {
						thinkingLevel: "minimal"
					}
				}
			})
		});

		if (!geminiRes.ok) {
			const errText = await geminiRes.text();
			return jsonResponse({ error: "Gemini request failed", detail: errText }, 502);
		}

		const geminiJson = await geminiRes.json();
		const rawText = collectModelText(geminiJson);

		let parsed: AiPayload;
		try {
			parsed = extractJson(rawText) as AiPayload;
		} catch (parseErr) {
			return jsonResponse(
				{
					error: "Failed to parse model JSON",
					detail: String(parseErr),
					raw: rawText
				},
				502
			);
		}

		if (
			!parsed?.participant_id ||
			!parsed?.activity_id ||
			typeof parsed.points !== "number" ||
			Number.isNaN(parsed.points)
		) {
			return jsonResponse({ error: "AI returned invalid payload", raw: rawText, parsed }, 502);
		}

		const participantOk = participants.some((p) => p.id === parsed.participant_id);
		const activity = activities.find((a) => a.id === parsed.activity_id);
		if (!participantOk || !activity) {
			return jsonResponse({ error: "AI referenced unknown ids", payload: parsed }, 422);
		}
		if (parsed.points < 0 && !activity.allow_negative) {
			return jsonResponse(
				{ error: "Negative points not allowed for chosen activity", payload: parsed },
				422
			);
		}

		const payload: AiPayload = {
			participant_id: parsed.participant_id,
			activity_id: parsed.activity_id,
			points: Number(parsed.points)
		};

		return jsonResponse(payload, 200);
	} catch (err) {
		return jsonResponse({ error: String(err) }, 500);
	}
});

function jsonResponse(data: unknown, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { ...corsHeaders, "Content-Type": "application/json" }
	});
}

/** Concatenate non-thought text parts from the Gemini candidate. */
function collectModelText(geminiJson: unknown): string {
	const parts =
		(geminiJson as { candidates?: Array<{ content?: { parts?: Array<Record<string, unknown>> } }> })
			?.candidates?.[0]?.content?.parts ?? [];

	return parts
		.filter((part) => typeof part.text === "string" && part.thought !== true)
		.map((part) => String(part.text))
		.join("\n")
		.trim();
}

/** Parse the first complete JSON object in a string (ignores trailing junk). */
function extractJson(text: string): unknown {
	const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");

	try {
		return JSON.parse(trimmed);
	} catch {
		const slice = firstJsonObject(trimmed);
		if (!slice) throw new Error("No JSON object found in model response");
		return JSON.parse(slice);
	}
}

function firstJsonObject(text: string): string | null {
	const start = text.indexOf("{");
	if (start < 0) return null;

	let depth = 0;
	let inString = false;
	let escaped = false;

	for (let i = start; i < text.length; i++) {
		const ch = text[i];

		if (inString) {
			if (escaped) {
				escaped = false;
			} else if (ch === "\\") {
				escaped = true;
			} else if (ch === '"') {
				inString = false;
			}
			continue;
		}

		if (ch === '"') {
			inString = true;
			continue;
		}
		if (ch === "{") depth++;
		if (ch === "}") {
			depth--;
			if (depth === 0) return text.slice(start, i + 1);
		}
	}

	return null;
}
