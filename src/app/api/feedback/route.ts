import { NextRequest, NextResponse } from "next/server";

interface FeedbackPayload {
  type: string;
  contact?: string;
  message: string;
  systemContext?: Record<string, any>;
  debugInfo?: Record<string, any>;
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    const toEmail = process.env.FEEDBACK_RECEIVER_EMAIL;

    if (!apiKey) {
      console.error("Missing RESEND_API_KEY in environment variables.");
      return NextResponse.json(
        { error: "Feedback service is not configured (missing Resend API Key)." },
        { status: 500 }
      );
    }

    if (!toEmail) {
      console.error("Missing FEEDBACK_RECEIVER_EMAIL in environment variables.");
      return NextResponse.json(
        { error: "Feedback service is not configured (missing Receiver Email)." },
        { status: 500 }
      );
    }

    const body = (await req.json()) as FeedbackPayload;
    const { type, contact, message, systemContext, debugInfo } = body;
    const finalContext = systemContext || debugInfo;

    if (!type || !message) {
      return NextResponse.json(
        { error: "Feedback type and message are required." },
        { status: 400 }
      );
    }

    // Translate type to friendly label
    const typeLabels: Record<string, string> = {
      suggestion: "💡 Suggestion / Feature Request",
      bug: "🐛 Bug Report",
      inquiry: "💬 General Inquiry",
    };
    const friendlyType = typeLabels[type] || type;

    // Construct system context HTML table
    let systemContextHtml = "";
    if (finalContext && Object.keys(finalContext).length > 0) {
      systemContextHtml = `
        <h3 style="color: #E54D2E; border-bottom: 1px solid #ddd; padding-bottom: 8px; margin-top: 30px;">System Context</h3>
        <table style="width: 100%; border-collapse: collapse; font-family: monospace; font-size: 13px;">
          ${Object.entries(finalContext)
            .map(
              ([key, val]) => `
            <tr>
              <td style="padding: 6px; border: 1px solid #eee; font-weight: bold; width: 180px; background-color: #fafafa; color: #555;">${key}</td>
              <td style="padding: 6px; border: 1px solid #eee; white-space: pre-wrap; color: #333;">${
                typeof val === "object" ? JSON.stringify(val, null, 2) : String(val)
              }</td>
            </tr>
          `
            )
            .join("")}
        </table>
      `;
    }

    const emailHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 650px; margin: 0 auto; padding: 25px; border: 1px solid #e1e1e1; border-radius: 8px; background-color: #ffffff; color: #0E0F12;">
        <h2 style="color: #E54D2E; border-bottom: 2px solid #E54D2E; padding-bottom: 10px; margin-bottom: 20px; font-weight: 600;">📬 New Feedback Submitted</h2>
        
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px;">
          <tr>
            <td style="padding: 8px 0; font-weight: bold; width: 120px; color: #666; vertical-align: top;">Type:</td>
            <td style="padding: 8px 0; font-weight: bold; color: #E54D2E; font-size: 15px;">${friendlyType}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold; color: #666; vertical-align: top;">Contact Info:</td>
            <td style="padding: 8px 0; color: #111; font-family: inherit;">${contact ? contact : "<i>Not provided</i>"}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold; color: #666; vertical-align: top;">Message:</td>
            <td style="padding: 8px 0; color: #111; white-space: pre-wrap; line-height: 1.6;">${message}</td>
          </tr>
        </table>

        ${systemContextHtml}

        <hr style="border: none; border-top: 1px solid #eee; margin: 35px 0;" />
        <p style="font-size: 11px; color: #888; text-align: center; margin: 0;">Submitted via Subtitle Translator Feedback Form</p>
      </div>
    `;

    // Send email using Resend REST API
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: "Feedback <onboarding@resend.dev>",
        to: toEmail,
        subject: `[Subtitle Translator] New Feedback: ${friendlyType}`,
        html: emailHtml,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Resend API error payload:", data);
      return NextResponse.json(
        { error: data.message || "Resend API returned an error." },
        { status: response.status }
      );
    }

    return NextResponse.json({ success: true, id: data.id });
  } catch (error: any) {
    console.error("Feedback API error:", error);
    return NextResponse.json(
      { error: error.message || "An internal error occurred." },
      { status: 500 }
    );
  }
}
