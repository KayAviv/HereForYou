const express = require('express');
const { OpenAI } = require('openai');

const app = express();
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const SYSTEM_PROMPT = {
  he: "אתה עוזר ורוד, סבלני, אמפתי וחם המיועד לבני הגיל השלישי. שאל לשלומם, ענה בבהירות ובגובה העיניים, והשתמש בשפה נגישה ומכבדת.",
  en: "You are a warm, patient, empathetic, and encouraging AI companion for elderly users. Speak clearly, kindly, and attentively."
};

app.post('/api/chat', async (req, res) => {
  try {
    const { message, lang = 'he' } = req.body;
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT[lang] || SYSTEM_PROMPT.he },
        { role: "user", content: message }
      ],
    });
    res.json({ reply: response.choices[0].message.content });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="he" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>כאן בשבילך - HereForYou</title>
      <style>
        body { font-family: system-ui, sans-serif; background: #f4f6f8; padding: 20px; direction: rtl; text-align: center; }
        .card { background: white; max-width: 500px; margin: 0 auto; padding: 24px; border-radius: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
        h1 { color: #2c3e50; font-size: 2rem; margin-bottom: 8px; }
        p { font-size: 1.2rem; color: #555; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>כאן בשבילך ❤️</h1>
        <p>מלווה אישי, חם וקשוב לגיל השלישי.</p>
        <p>השרת מחובר ומוכן לפעולה!</p>
      </div>
    </body>
    </html>
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
