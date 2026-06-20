const LINE_TOKEN  = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN")!;
const WEBHOOK_URL = "https://czczwtjgmjnboeeibxcd.supabase.co/functions/v1/line-webhook";

Deno.serve(async () => {
  const setRes = await fetch("https://api.line.me/v2/bot/channel/webhook/endpoint", {
    method:  "PUT",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${LINE_TOKEN}` },
    body:    JSON.stringify({ webhookEndpointUrl: WEBHOOK_URL }),
  });
  const setData = await setRes.json();

  const testRes = await fetch("https://api.line.me/v2/bot/channel/webhook/endpoint/test", {
    method:  "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${LINE_TOKEN}` },
    body:    JSON.stringify({ webhookEndpointUrl: WEBHOOK_URL }),
  });
  const testData = await testRes.json();

  return new Response(JSON.stringify({ set: setData, test: testData }, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});
