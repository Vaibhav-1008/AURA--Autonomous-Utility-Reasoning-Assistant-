// index.js - Express backend for voice-Jarvis prototype
// Run: npm install, copy .env from .env.example, then npm start

require('dotenv').config();
const express = require('express');
const path = require('path');
const axios = require('axios');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const OPENAI_KEY = process.env.OPENAI_API_KEY || null;
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID || null;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN || null;
const TWILIO_FROM = process.env.TWILIO_FROM_NUMBER || null;

let twilioClient = null;
if (TWILIO_SID && TWILIO_TOKEN) {
  try {
    const twilio = require('twilio');
    twilioClient = twilio(TWILIO_SID, TWILIO_TOKEN);
  } catch (e) {
    console.warn('Twilio lib not installed or failed to init. SMS disabled.');
  }
}

async function parseIntent(text) {
  text = (text || '').trim();
  if (!text) return { action: 'unknown', reply: "I didn't hear anything." };

  // If OpenAI key present, ask model to parse into JSON
  if (OPENAI_KEY) {
    try {
      const system = "You are an assistant that outputs ONLY valid JSON describing the user's intent with keys: action (send_sms/call/set_reminder/qa/unknown), to, message, time, reply_text. Keep reply_text short.";
      const user = `Parse this command:\n\n"${text}"`;
      const resp = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-4o-mini', // replace if unavailable
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        max_tokens: 200,
        temperature: 0
      }, { headers: { Authorization: `Bearer ${OPENAI_KEY}` }});
      const m = resp.data.choices[0].message.content;
      try {
        const parsed = JSON.parse(m);
        return parsed;
      } catch (e) {
        // fallback if model didn't return strict JSON
        return { action: 'qa', reply_text: `Got: ${text}` };
      }
    } catch (err) {
      console.error('OpenAI parse failed:', err.message);
      // fall through to simple parser
    }
  }

  // Fallback simple rule-based parser:
  const lower = text.toLowerCase();
  let m;
  if (/send (sms|text|message)/i.test(lower) || /text to/i.test(lower)) {
    // try to extract "to X: message"
    m = text.match(/to\s+([^\:]+)\:?\s*(.*)/i);
    const to = m ? m[1].trim() : null;
    const message = m && m[2] ? m[2].trim() : text;
    return { action: 'send_sms', to, message, reply_text: `I'll send that message to ${to || 'the contact'}.` };
  }
  if (/call\s+([^\.\,]+)/i.test(lower)) {
    const to = text.match(/call\s+([^\.\,]+)/i)[1].trim();
    return { action: 'call', to, reply_text: `Calling ${to}.` };
  }
  if (/remind|reminder|remind me to/i.test(lower)) {
    return { action: 'set_reminder', reply_text: `Okay, I'll set that reminder.` };
  }

  // default: QA or unknown
  return { action: 'qa', reply_text: `I heard: ${text}. What would you like me to do?` };
}

app.post('/api/command', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ ok: false, error: 'text required' });

  try {
    const intent = await parseIntent(text);
    let result = { ok: true, intent, performed: false, spoken: '' };

    // Handle send_sms if Twilio configured
    if (intent.action === 'send_sms') {
      const to = intent.to || req.body.to;
      const body = intent.message || req.body.message || text;
      if (twilioClient && TWILIO_FROM && to) {
        try {
          const msg = await twilioClient.messages.create({ from: TWILIO_FROM, to, body });
          result.performed = true;
          result.spoken = intent.reply_text || `Sent SMS to ${to}.`;
          result.twilio_sid = msg.sid;
        } catch (e) {
          console.error('Twilio send failed:', e.message);
          result.spoken = `I tried to send the message but failed: ${e.message}`;
        }
      } else {
        result.spoken = intent.reply_text ? intent.reply_text + ' (demo only — Twilio not configured)' : `Would send text to ${to}.`;
      }
      return res.json(result);
    }

    // Handle call (demo)
    if (intent.action === 'call') {
      result.spoken = intent.reply_text || `Calling ${intent.to || 'contact'} (demo, not actually calling).`;
      return res.json(result);
    }

    // set_reminder (demo)
    if (intent.action === 'set_reminder') {
      result.spoken = intent.reply_text || `Reminder set.`;
      return res.json(result);
    }

    // qa - just echo or use OpenAI to answer (optional)
    if (intent.action === 'qa') {
      if (OPENAI_KEY) {
        try {
          const oresp = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-4o-mini',
            messages: [{ role: 'system', content: 'You are a helpful assistant.' }, { role: 'user', content: text }],
            max_tokens: 200
          }, { headers: { Authorization: `Bearer ${OPENAI_KEY}` }});
          const answer = oresp.data.choices[0].message.content;
          result.spoken = answer;
          return res.json(result);
        } catch (e) {
          console.error('OpenAI QA failed:', e.message);
          result.spoken = intent.reply_text || `I couldn't fetch an answer right now.`;
          return res.json(result);
        }
      }
      result.spoken = intent.reply_text || `I heard: ${text}`;
      return res.json(result);
    }

    // unknown
    result.spoken = intent.reply_text || `I didn't understand that.`;
    return res.json(result);

  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// fallback serve index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
