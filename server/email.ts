const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_ADDRESS = "College Baseball Dynasty <noreply@collegebaseballdynasty.app>";

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!RESEND_API_KEY) {
    console.log(`[email] No RESEND_API_KEY configured — skipping email to ${to}: "${subject}"`);
    return;
  }
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM_ADDRESS, to, subject, html }),
    });
    if (!response.ok) {
      const errText = await response.text();
      console.error(`[email] Resend API error ${response.status}: ${errText}`);
    } else {
      console.log(`[email] Sent to ${to}: "${subject}"`);
    }
  } catch (e) {
    console.error(`[email] Failed to send to ${to}:`, e);
  }
}
