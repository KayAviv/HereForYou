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
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <meta name="theme-color" content="#3498db">
      <meta name="apple-mobile-web-app-capable" content="yes">
      <meta name="apple-mobile-web-app-status-bar-style" content="default">
      <meta name="apple-mobile-web-app-title" content="כאן בשבילך">
      <title>כאן בשבילך - HereForYou</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: system-ui, -apple-system, sans-serif; }
        body { background: #f4f6f8; display: flex; flex-direction: column; height: 100vh; }
        header { background: #3498db; color: white; padding: 16px; text-align: center; font-size: 1.5rem; font-weight: bold; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
        #chat-box { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
        .msg { max-width: 80%; padding: 14px 18px; border-radius: 18px; font-size: 1.2rem; line-height: 1.4; }
        .user { background: #3498db; color: white; align-self: flex-start; border-bottom-right-radius: 4px; }
        .bot { background: white; color: #2c3e50; align-self: flex-end; border-bottom-left-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
        footer { padding: 12px; background: white; border-top: 1px solid #ddd; display: flex; gap: 8px; }
        input { flex: 1; font-size: 1.2rem; padding: 12px 16px; border: 1px solid #ccc; border-radius: 24px; outline: none; }
        button { background: #2ecc71; color: white; border: none; padding: 12px 20px; font-size: 1.2rem; border-radius: 24px; cursor: pointer; font-weight: bold; }
        button:disabled { background: #bdc3c7; }
      </style>
    </head>
    <body>
      <header>כאן בשבילך ❤️</header>
      <div id="chat-box">
        <div class="msg bot">שלום! אני כאן בשבילך. מה שלומך היום?</div>
      </div>
      <footer>
        <input type="text" id="userInput" placeholder="אפשר לרשום פה..." onkeypress="if(event.key==='Enter') sendMsg()">
        <button id="sendBtn" onclick="sendMsg()">שלח</button>
      </footer>

      <script>
        async function sendMsg() {
          const input = document.getElementById('userInput');
          const btn = document.getElementById('sendBtn');
          const text = input.value.trim();
          if (!text) return;

          appendMsg(text, 'user');
          input.value = '';
          input.disabled = true;
          btn.disabled = true;

          try {
            const res = await fetch('/api/chat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ message: text, lang: 'he' })
            });
            const data = await res.json();
            appendMsg(data.reply || data.error, 'bot');
          } catch (e) {
            appendMsg('מצטער, הייתה שגיאה בחיבור.', 'bot');
          } finally {
            input.disabled = false;
            btn.disabled = false;
            input.focus();
          }
        }

        function appendMsg(text, sender) {
          const box = document.getElementById('chat-box');
          const div = document.createElement('div');
          div.className = `msg ${sender}`;
          div.textContent = text;
          box.appendChild(div);
          box.scrollTop = box.scrollHeight;
        }
      </script>
    </body>
    </html>
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
