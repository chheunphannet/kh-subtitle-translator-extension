import { NextRequest, NextResponse } from "next/server";

interface FeedbackRequest {
  type: string;
  contact?: string;
  message: string;
  debugInfo?: Record<string, unknown>;
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("Feedback Submission Error: RESEND_API_KEY is not configured.");
      return NextResponse.json(
        { error: "Feedback service is temporarily unconfigured. Please set RESEND_API_KEY in environment variables." },
        { status: 501 }
      );
    }

    const receiverEmail = process.env.FEEDBACK_RECEIVER_EMAIL || "chheunphannet@gmail.com";
    const body = (await req.json()) as FeedbackRequest;
    const { type, contact, message, debugInfo } = body;

    if (!message || typeof message !== "string" || !message.trim()) {
      return NextResponse.json({ error: "Missing required parameter: message must be a non-empty string" }, { status: 400 });
    }

    if (!type || typeof type !== "string") {
      return NextResponse.json({ error: "Missing required parameter: type" }, { status: 400 });
    }

    // Format Feedback Type for email subject/body
    const typeEmoji: Record<string, string> = {
      suggestion: "💡 Suggestion",
      bug: "🐛 Bug Report",
      inquiry: "💬 Inquiry",
    };
    const formattedType = typeEmoji[type] || type;

    // Build Email HTML Content
    const systemInfoHTML = debugInfo
      ? `<div style="background-color: #1e1e2e; color: #cdd6f4; padding: 15px; border-radius: 6px; font-family: monospace; font-size: 13px; margin-top: 10px; border: 1px solid #313244;">
          ${Object.entries(debugInfo)
            .map(([key, val]) => `<strong>${key}:</strong> ${typeof val === "object" ? JSON.stringify(val) : val}`)
            .join("<br/>")}
         </div>`
      : `<p style="color: #a6adc8; font-style: italic;">No system logs attached.</p>`;

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>New Feedback Received</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #11111b; color: #cdd6f4; padding: 20px; margin: 0;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #181825; border: 1px solid #313244; border-radius: 12px; padding: 30px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);">
          
          <!-- Header -->
          <div style="border-bottom: 1px solid #313244; padding-bottom: 20px; margin-bottom: 20px;">
            <h2 style="color: #cba6f7; margin: 0 0 10px 0; font-size: 22px;">📬 New Feedback Received</h2>
            <span style="background-color: #313244; color: #f5c2e7; padding: 4px 10px; border-radius: 4px; font-size: 12px; font-weight: bold; text-transform: uppercase;">
              ${formattedType}
            </span>
          </div>

          <!-- Description / Message -->
          <div style="margin-bottom: 25px;">
            <h3 style="color: #89b4fa; font-size: 16px; margin: 0 0 10px 0;">Feedback Detail:</h3>
            <div style="background-color: #1e1e2e; border-left: 4px solid #cba6f7; padding: 15px; border-radius: 0 8px 8px 0; color: #cdd6f4; font-size: 15px; line-height: 1.6; white-space: pre-wrap;">${message.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
          </div>

          <!-- Contact info -->
          <div style="margin-bottom: 25px; border-top: 1px solid #313244; padding-top: 20px;">
            <h3 style="color: #89b4fa; font-size: 16px; margin: 0 0 10px 0;">User Contact Info:</h3>
            <p style="font-size: 14px; margin: 0; color: #a6adc8;">
              ${contact?.trim() ? `<strong>Contact:</strong> ${contact}` : `<span style="font-style: italic;">Not provided (Anonymous submission)</span>`}
            </p>
          </div>

          <!-- System Logs / Debug Info -->
          <div style="border-top: 1px solid #313244; padding-top: 20px; margin-bottom: 10px;">
            <h3 style="color: #89b4fa; font-size: 16px; margin: 0 0 10px 0;">Technical Context:</h3>
            ${systemInfoHTML}
          </div>

          <!-- Footer -->
          <div style="border-top: 1px solid #313244; padding-top: 20px; margin-top: 30px; text-align: center; font-size: 11px; color: #6c7086;">
            Sent from Subtitle Translator Web Application
          </div>
        </div>
      </body>
      </html>
    `;

    // Make Request to Resend API
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: "Subtitle Feedback <onboarding@resend.dev>",
        to: receiverEmail,
        subject: `[Subtitle Translator] New ${formattedType}`,
        html: emailHtml,
        // Set reply-to if the user provided an email
        replyTo: contact?.includes("@") ? contact.trim() : undefined,
      }),
    });

    const resText = await res.text();
    let resData;
    try {
      resData = JSON.parse(resText);
    } catch {
      resData = { error: resText };
    }

    if (!res.ok) {
      console.error("Resend API returned error:", resData);
      return NextResponse.json({ error: resData.message || "Failed to deliver feedback email." }, { status: res.status });
    }

    return NextResponse.json({ success: true, id: resData.id });
  } catch (error: unknown) {
    console.error("Feedback route proxy error:", error);
    let errorMessage = "An unknown error occurred while sending feedback";
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
