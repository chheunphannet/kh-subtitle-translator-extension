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

    // Determine Badge colors based on feedback type
    let badgeBg = "#e8f0fe";
    let badgeColor = "#1a73e8";
    let typeName = "General Inquiry";
    if (type === "bug") {
      badgeBg = "#fce8e6";
      badgeColor = "#c5221f";
      typeName = "Bug Report";
    } else if (type === "suggestion") {
      badgeBg = "#fef7e0";
      badgeColor = "#b06000";
      typeName = "Feature Suggestion";
    }

    // Build System Info HTML Table
    const systemInfoHTML = debugInfo
      ? `<table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
          ${Object.entries(debugInfo)
            .map(([key, val]) => `
              <tr>
                <td style="padding: 8px 0; color: #5f6368; font-size: 13px; font-weight: 500; width: 140px; border-bottom: 1px solid #f1f3f4; vertical-align: top;">${key}</td>
                <td style="padding: 8px 0; color: #202124; font-size: 13px; border-bottom: 1px solid #f1f3f4; font-family: monospace; word-break: break-all; vertical-align: top;">${typeof val === "object" ? JSON.stringify(val) : val}</td>
              </tr>
            `)
            .join("")}
         </table>`
      : `<p style="color: #5f6368; font-style: italic; font-size: 13px; margin: 10px 0 0 0;">No system logs attached.</p>`;

    // Format user contact info
    const cleanContact = contact?.trim();
    const isEmail = !!(cleanContact && cleanContact.includes("@"));
    const contactFormatted = cleanContact
      ? (isEmail 
          ? `<a href="mailto:${cleanContact}" style="color: #1a73e8; text-decoration: none; font-weight: 500;">${cleanContact}</a>` 
          : `<span style="color: #202124; font-weight: 500;">${cleanContact}</span>`)
      : `<span style="color: #5f6368; font-style: italic;">Anonymous submission</span>`;

    // Action button if email exists
    const actionButtonHTML = isEmail && cleanContact
      ? `<div style="margin-top: 25px; text-align: left;">
          <a href="mailto:${cleanContact}" style="display: inline-block; background-color: #1a73e8; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 4px; font-weight: 500; font-size: 13px; font-family: Roboto, Arial, sans-serif; line-height: 1.5; text-align: center; vertical-align: middle;">
            Reply to User
          </a>
         </div>`
      : "";

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>New Feedback Received</title>
      </head>
      <body style="font-family: Roboto, Arial, sans-serif; background-color: #f4f6f8; color: #202124; padding: 40px 20px; margin: 0; -webkit-font-smoothing: antialiased;">
        <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border: 1px solid #dadce0; border-top: 4px solid #1a73e8; border-radius: 8px; box-shadow: 0 1px 2px 0 rgba(60,64,67,0.3), 0 1px 3px 1px rgba(60,64,67,0.15); border-collapse: separate; overflow: hidden;">
          <tr>
            <td style="padding: 30px 40px;">
              
              <!-- Header Brand -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 25px;">
                <tr>
                  <td>
                    <span style="font-size: 16px; font-weight: bold; color: #202124; letter-spacing: 0.5px;">Subtitle Translator</span>
                    <span style="color: #5f6368; font-size: 14px; margin-left: 10px; font-weight: normal;">Console</span>
                  </td>
                </tr>
              </table>

              <hr style="border: none; border-top: 1px solid #dadce0; margin: 0 0 25px 0;">

              <!-- Title -->
              <h1 style="color: #202124; font-size: 20px; font-weight: normal; margin: 0 0 15px 0; line-height: 1.4;">
                New feedback message received
              </h1>

              <!-- Badge -->
              <div style="margin-bottom: 25px;">
                <span style="background-color: ${badgeBg}; color: ${badgeColor}; padding: 4px 10px; border-radius: 4px; font-size: 11px; font-weight: bold; text-transform: uppercase; font-family: Roboto, Arial, sans-serif; display: inline-block;">
                  ${typeName}
                </span>
              </div>

              <!-- Message details -->
              <div style="margin-bottom: 30px;">
                <h3 style="color: #202124; font-size: 14px; font-weight: bold; margin: 0 0 10px 0;">Feedback details:</h3>
                <div style="background-color: #f8f9fa; border: 1px solid #e8eaed; padding: 20px; border-radius: 8px; color: #202124; font-size: 14px; line-height: 1.6; white-space: pre-wrap; font-family: Roboto, Arial, sans-serif;">${message.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
              </div>

              <!-- Contact & System details -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="border-top: 1px solid #dadce0; padding-top: 20px; margin-bottom: 25px;">
                <tr>
                  <td>
                    <h3 style="color: #202124; font-size: 14px; font-weight: bold; margin: 0 0 10px 0;">User contact:</h3>
                    <p style="font-size: 13px; margin: 0; color: #202124;">
                      ${contactFormatted}
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Environment details -->
              <div style="border-top: 1px solid #dadce0; padding-top: 20px;">
                <h3 style="color: #202124; font-size: 14px; font-weight: bold; margin: 0 0 10px 0;">Technical environment:</h3>
                ${systemInfoHTML}
              </div>

              <!-- Action button -->
              ${actionButtonHTML}

            </td>
          </tr>
          <tr>
            <td style="background-color: #f8f9fa; border-top: 1px solid #dadce0; padding: 20px 40px; text-align: center;">
              <p style="font-size: 11px; color: #5f6368; line-height: 1.6; margin: 0;">
                This notification has been sent because you are the administrator of the Subtitle Translator application.
                <br>
                Please do not reply directly to this notification email unless clicking the "Reply to User" action button.
              </p>
            </td>
          </tr>
        </table>
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
