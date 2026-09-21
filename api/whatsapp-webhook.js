// NOTE: This file is an old / unused draft webhook handler.
// The active implementation has moved to:
//   supabase/functions/whatsapp-webhook/index.ts
// This file is kept only for reference and should not be used in production.

const crypto = require("crypto");

module.exports = async function handler(req, res) {
  const VERIFY_TOKEN = process.env.META_WHATSAPP_VERIFY_TOKEN;

  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }

    return res.status(403).send("Forbidden");
  }

  if (req.method === "POST") {
    console.log("WhatsApp webhook:", JSON.stringify(req.body));
    return res.status(200).json({ received: true });
  }

  return res.status(405).send("Method Not Allowed");
};
