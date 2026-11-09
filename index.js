const express = require('express');
const { OpenAI } = require('openai');

const app = express();
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const SYSTEM_PROMPT = "You are HereForYou, a warm, patient, empathetic, and encouraging voice-enabled AI companion. Speak clearly, kindly, and concisely in English. Keep answers short and easy to understand.";

app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
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
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <meta name="theme-color" content="#3498db">
      <meta name="apple-mobile-web-app-capable" content="yes">
      <title>HereForYou Voice Companion</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: system-ui, -apple-system, sans-serif; }
        body { background: #f4f6f8; display: flex; flex-direction: column; height: 100vh; }
        header { background: #3498db; color: white; padding: 18px; text-align: center; font-size: 1.6rem; font-weight: bold; }
        #chat-box { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
        .msg { max-width: 80%; padding: 14px 18px; border-radius: 18px; font-size: 1.25rem; line-height: 1.4; }
        .user { background: #3498db; color: white; align-self: flex-end; border-bottom-right-radius: 4px; }
        .bot { background: white; color: #2c3e50; align-self: flex-start; border-bottom-left-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
        footer { padding: 16px; background: white; border-top: 1px solid #ddd; display: flex; gap: 10px; align-items: center; }
        input { flex: 1; font-size: 1.2rem; padding: 14px; border: 1px solid #ccc; border-radius: 24px; outline: none; }
        button { background: #2ecc71; color: white; border: none; padding: 14px 20px; font-size: 1.2rem; border-radius: 24px; cursor: pointer; font-weight: bold; }
        .mic-btn { background: #e74c3c; border-radius: 50%; width: 54px; height: 54px; font-size: 1.5rem; display: flex; align-items: center; justify-content: center; padding: 0; }
        .mic-btn.recording { animation: pulse 1s infinite; background: #c0392b; }
        @keyframes pulse { 0% { transform: scale(1); } 50% { transform: scale(1.1); } 100% { transform: scale(1); } }
      </style>
    </head>
    <body>
      <header>HereForYou ❤️</header>
      <div id="chat-box">
        <div class="msg bot">Hello! I am HereForYou. How are you feeling today? Tap the microphone to talk to me!</div>
      </div>
      <footer>
        <button id="micBtn" class="mic-btn" onclick="toggleVoice()">🎙️</button>
        <input type="text" id="userInput" placeholder="Type or speak..." onkeypress="if(event.key==='Enter') sendMsg()">
        <button id="sendBtn" onclick="sendMsg()">Send</button>
      </footer>

      <script>
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        let recognition = null;
        let isRecording = false;

        if (SpeechRecognition) {
          recognition = new SpeechRecognition();
          recognition.lang = 'en-US';
          recognition.continuous = false;

          recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            document.getElementById('userInput').value = transcript;
            sendMsg();
          };

          recognition.onend = () => {
            isRecording = false;
            document.getElementById('micBtn').classList.remove('recording');
          };
        }

        function toggleVoice() {
          if (!recognition) {
            alert('Speech recognition is not supported on this browser.');
            return;
          }
          if (isRecording) {
            recognition.stop();
          } else {
            recognition.start();
            isRecording = true;
            document.getElementById('micBtn').classList.add('recording');
          }
        }

        function speakText(text) {
          if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'en-US';
            utterance.rate = 0.9;
            window.speechSynthesis.speak(utterance);
          }
        }

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
              body: JSON.stringify({ message: text })
            });
            const data = await res.json();
            const reply = data.reply || data.error;
            appendMsg(reply, 'bot');
            speakText(reply);
          } catch (e) {
            appendMsg('Sorry, connection error.', 'bot');
          } finally {
            input.disabled = false;
            btn.disabled = false;
            input.focus();
          }
        }

        function appendMsg(text, sender) {
          const box = document.getElementById('chat-box');
          const div = document.createElement('div');
          div.className = \`msg \${sender}\`;
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
