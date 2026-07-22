/**
 * TanNote — slip verification (EasySlip)
 *
 * Dormant by default: with no EASYSLIP_API_KEY secret every call returns
 * { enabled: false } and the caller falls back to the manual approval queue.
 *
 * Secrets:
 *   EASYSLIP_API_KEY        — API key from https://easyslip.com (enables verification)
 *   PAYMENT_RECEIVER_NAME   — optional; substring matched against the slip's receiver
 *                             name so a slip paid to someone else is rejected
 *   SLIP_AUTO_APPROVE       — optional; "true" lets a fully matching slip upgrade the
 *                             plan without an admin tap. Verification alone does NOT
 *                             auto-approve; both switches must be on.
 *
 * API: POST https://api.easyslip.com/v2/verify/bank
 *      { url | base64 | payload, checkDuplicate: true }
 */

const EASYSLIP_URL = "https://api.easyslip.com/v2/verify/bank";

export type SlipVerdict =
  | { enabled: false }
  | {
      enabled: true;
      /** true only when the slip parsed, is not a duplicate, and the receiver matched */
      ok: boolean;
      /** "verified" | "duplicate" | "mismatch" | "failed" — stored on payment_requests */
      status: "verified" | "duplicate" | "mismatch" | "failed";
      transRef: string | null;
      amount: number | null;
      receiverName: string | null;
      senderName: string | null;
      note: string;
    };

export function isSlipVerifyEnabled(): boolean {
  return !!Deno.env.get("EASYSLIP_API_KEY")?.trim();
}

export function isSlipAutoApproveEnabled(): boolean {
  return isSlipVerifyEnabled() &&
    Deno.env.get("SLIP_AUTO_APPROVE")?.trim().toLowerCase() === "true";
}

/** Pull a name out of either API shape: data.rawSlip.receiver or data.receiver. */
// deno-lint-ignore no-explicit-any
function accountName(side: any): string | null {
  const n = side?.account?.name ?? side?.name;
  if (!n) return null;
  return (typeof n === "string" ? n : (n.th ?? n.en ?? null)) || null;
}

/**
 * Verify a slip image that is already reachable at a public URL
 * (the payment-slips bucket), and return a verdict the caller can store.
 * Never throws — a network or parse failure comes back as status "failed".
 */
export async function verifySlipByUrl(slipUrl: string): Promise<SlipVerdict> {
  const key = Deno.env.get("EASYSLIP_API_KEY")?.trim();
  if (!key) return { enabled: false };

  const fail = (note: string): SlipVerdict => ({
    enabled: true, ok: false, status: "failed",
    transRef: null, amount: null, receiverName: null, senderName: null, note,
  });

  let json: any;
  try {
    const res = await fetch(EASYSLIP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({ url: slipUrl, checkDuplicate: true }),
    });
    json = await res.json().catch(() => null);
    if (!res.ok) {
      return fail(`EasySlip ${res.status}: ${json?.error?.message ?? json?.message ?? "ตรวจสลิปไม่สำเร็จ"}`);
    }
  } catch (e) {
    return fail(`เรียก EasySlip ไม่สำเร็จ: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (json?.success === false) {
    return fail(`EasySlip: ${json?.error?.message ?? json?.error?.code ?? "อ่านสลิปไม่ออก"}`);
  }

  // v2 nests the parsed slip under data.rawSlip in the docs' example but returns the
  // fields flat in some responses — accept either.
  const d    = json?.data ?? {};
  const slip = d.rawSlip ?? d;

  const transRef = (slip?.transRef ?? null) as string | null;
  const amount   = typeof slip?.amount === "number"
    ? slip.amount
    : (typeof slip?.amount?.amount === "number" ? slip.amount.amount : null);
  const receiverName = accountName(slip?.receiver);
  const senderName   = accountName(slip?.sender);

  const base = { enabled: true as const, transRef, amount, receiverName, senderName };

  if (d.isDuplicate === true) {
    return { ...base, ok: false, status: "duplicate", note: "สลิปนี้เคยถูกใช้แล้ว" };
  }
  if (!transRef) {
    return { ...base, ok: false, status: "failed", note: "ไม่พบเลขอ้างอิงในสลิป" };
  }

  const expectReceiver = Deno.env.get("PAYMENT_RECEIVER_NAME")?.trim();
  if (expectReceiver) {
    const got = (receiverName ?? "").replace(/\s+/g, "");
    if (!got.includes(expectReceiver.replace(/\s+/g, ""))) {
      return {
        ...base, ok: false, status: "mismatch",
        note: `ผู้รับไม่ตรง (สลิประบุ "${receiverName ?? "-"}")`,
      };
    }
  }

  return { ...base, ok: true, status: "verified", note: "ตรวจสลิปผ่าน" };
}

/** Does the verified amount cover what the user was asked to pay? */
export function amountMatches(expected: number | null | undefined, paid: number | null): boolean {
  if (expected == null || paid == null) return false;
  return paid + 0.01 >= expected; // pay at least the quoted price (allow float noise)
}
