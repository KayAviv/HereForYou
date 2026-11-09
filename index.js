const express = require('express');
const { OpenAI } = require('openai');

const app = express();
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

let usersDB = {
  "demo@user.com": {
    password: "123",
    medications: [
      { name: "Blood Pressure Pill", time: "Morning (08:00)" },
      { name: "Vitamin D", time: "Evening (20:00)" }
    ],
    emergencyContacts: [
      { name: "Son (David)", phone: "+1234567890" }
    ]
  }
};

const SYSTEM_PROMPT = (userEmail) => {
  const user = usersDB[userEmail] || { medications: [], emergencyContacts: [] };
  return `You are HereForYou, a warm, patient, empathetic, and encouraging voice-enabled AI companion for elderly users. 
Here is the current user's personal medical and contact profile:
- Medications: ${JSON.stringify(user.medications)}
- Emergency Contacts: ${JSON.stringify(user.emergencyContacts)}
Use this information if the user asks about their medications or needs help reaching someone. Speak clearly, kindly, and concisely in English.`;
};

app.post('/api/register', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password required" });
  if (usersDB[email]) return res.status(400).json({ error: "User already exists" });

  usersDB[email] = {
    password,
    medications: [{ name: "Daily Vitamin", time: "Morning" }],
    emergencyContacts: [{ name: "Family", phone: "+1234567890" }]
  };
  res.json({ success: true, email });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (!usersDB[email] || usersDB[email].password !== password) {
    return res.status(401).json({ error: "Invalid email or password" });
  }
  res.json({ success: true, email });
});

app.get('/api/memory', (req, res) => {
  const email = req.headers['user-email'] || "demo@user.com";
  const user = usersDB[email] || usersDB["demo@user.com"];
  res.json({ medications: user.medications, emergencyContacts: user.emergencyContacts });
});

app.post('/api/memory', (req, res) => {
  const email = req.headers['user-email'] || "demo@user.com";
  const { medications, emergencyContacts } = req.body;
  if (usersDB[email]) {
    if (medications) usersDB[email].medications = medications;
    if (emergencyContacts) usersDB[email].emergencyContacts = emergencyContacts;
    res.json({ success: true });
  } else {
    res.status(404).json({ error: "User not found" });
  }
});

app.post('/api/chat', async (req, res) => {
  try {
    const { message, email = "demo@user.com" } = req.body;
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT(email) },
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
      <meta name="theme-color" content="#ffffff">
      <meta name="apple-mobile-web-app-capable" content="yes">
      <link rel="manifest" href='data:application/manifest+json,{"name":"HereForYou","short_name":"HereForYou","start_url":"/","display":"standalone","background_color":"%23f8fafc","theme_color":"%23ffffff","description":"A warm personal AI companion for elderly users","icons":[]}'>
      <title>HereForYou Companion</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: system-ui, -apple-system, sans-serif; }
        body { background: #f8fafc; color: #1e293b; display: flex; flex-direction: column; height: 100vh; }
        
        #auth-screen { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: #ffffff; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 24px; z-index: 100; }
        .auth-card { width: 100%; max-width: 360px; background: #ffffff; padding: 32px 24px; border-radius: 24px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); border: 1px solid #f1f5f9; display: flex; flex-direction: column; gap: 16px; text-align: center; }
        .logo-circle { width: 72px; height: 72px; background: #ffe4e6; color: #e11d48; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 2.2rem; margin: 0 auto 8px; box-shadow: 0 4px 12px rgba(225,29,72,0.15); }
        .auth-card h2 { color: #0f172a; font-size: 1.8rem; }
        .auth-card input { width: 100%; padding: 14px 18px; border: 1px solid #cbd5e1; border-radius: 14px; font-size: 1.1rem; outline: none; background: #f8fafc; }
        .auth-card button { width: 100%; padding: 14px; background: #e11d48; color: white; border: none; border-radius: 14px; font-size: 1.1rem; font-weight: bold; cursor: pointer; box-shadow: 0 4px 12px rgba(225,29,72,0.25); }
        .toggle-auth { color: #64748b; font-size: 0.95rem; cursor: pointer; margin-top: 4px; }

        #app-screen { display: none; flex-direction: column; height: 100vh; }
        header { background: #ffffff; color: #0f172a; padding: 16px 20px; text-align: center; font-size: 1.4rem; font-weight: bold; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
        .header-logo { display: flex; align-items: center; gap: 10px; }
        .small-logo { width: 36px; height: 36px; background: #ffe4e6; color: #e11d48; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; }
        .profile-btn { background: #f1f5f9; border: none; color: #475569; padding: 8px 14px; border-radius: 12px; cursor: pointer; font-size: 0.95rem; font-weight: 500; }
        
        .quick-actions { padding: 12px 16px; background: #ffffff; display: flex; gap: 10px; border-bottom: 1px solid #e2e8f0; overflow-x: auto; }
        .chip { background: #f1f5f9; color: #334155; border: 1px solid #e2e8f0; padding: 8px 16px; border-radius: 20px; font-size: 0.95rem; cursor: pointer; white-space: nowrap; font-weight: 500; }
        
        #chat-box { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 16px; background: #f8fafc; }
        .msg { max-width: 80%; padding: 16px 20px; border-radius: 20px; font-size: 1.15rem; line-height: 1.5; }
        .user { background: #e11d48; color: white; align-self: flex-end; border-bottom-right-radius: 4px; box-shadow: 0 4px 12px rgba(225,29,72,0.15); }
        .bot { background: white; color: #1e293b; align-self: flex-start; border-bottom-left-radius: 4px; border: 1px solid #e2e8f0; box-shadow: 0 2px 8px rgba(0,0,0,0.03); }
        
        footer { padding: 16px; background: white; border-top: 1px solid #e2e8f0; display: flex; gap: 10px; align-items: center; }
        input[type="text"] { flex: 1; font-size: 1.1rem; padding: 14px 20px; border: 1px solid #cbd5e1; border-radius: 28px; outline: none; background: #f8fafc; }
        .send-btn { background: #0f172a; color: white; border: none; padding: 14px 22px; font-size: 1.05rem; border-radius: 28px; cursor: pointer; font-weight: bold; }
        .mic-btn { background: #e11d48; border-radius: 50%; width: 52px; height: 52px; font-size: 1.4rem; display: flex; align-items: center; justify-content: center; border: none; cursor: pointer; color: white; box-shadow: 0 4px 12px rgba(225,29,72,0.25); flex-shrink: 0; }
        .mic-btn.recording { animation: pulse 1s infinite; background: #be123c; }
        @keyframes pulse { 0% { transform: scale(1); } 50% { transform: scale(1.08); } 100% { transform: scale(1); } }
        
        #modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.4); backdrop-filter: blur(4px); justify-content: center; align-items: center; z-index: 1000; padding: 20px; }
        .modal-content { background: white; padding: 24px; border-radius: 24px; width: 100%; max-width: 400px; display: flex; flex-direction: column; gap: 14px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); }
        .modal-content h3 { color: #0f172a; font-size: 1.4rem; }
        .modal-content label { font-size: 0.9rem; font-weight: 600; color: #64748b; }
        .modal-content textarea { width: 100%; height: 100px; font-size: 0.95rem; padding: 12px; border: 1px solid #cbd5e1; border-radius: 12px; outline: none; background: #f8fafc; font-family: monospace; }
        .modal-btn { padding: 12px; border-radius: 14px; font-weight: bold; border: none; cursor: pointer; font-size: 1rem; }
      </style>
    </head>
    <body>

      <div id="auth-screen">
        <div class="auth-card">
          <div class="logo-circle">❤️</div>
          <h2>HereForYou</h2>
          <p style="color: #64748b; font-size: 0.95rem; margin-bottom: 8px;">Your warm personal AI companion</p>
          <input type="email" id="authEmail" placeholder="Email address">
          <input type="password" id="authPassword" placeholder="Password">
          <button onclick="handleAuth()" id="authSubmitBtn">Sign In</button>
          <span class="toggle-auth" onclick="toggleAuthMode()" id="authToggleText">Don't have an account? Sign up</span>
        </div>
      </div>

      <div id="app-screen">
        <header>
          <div class="header-logo">
            <div class="small-logo">❤️</div>
            <span>HereForYou</span>
          </div>
          <button class="profile-btn" onclick="openSettings()">Profile & Meds</button>
        </header>
        
        <div class="quick-actions">
          <button class="chip" onclick="askPreset('What medications do I need to take?')">💊 My Medications</button>
          <button class="chip" onclick="callEmergency()">📞 Call Emergency</button>
        </div>

        <div id="chat-box">
          <div class="msg bot">Hello! I am HereForYou. How are you feeling today? Tap the microphone or type below!</div>
        </div>
        
        <footer>
          <button id="micBtn" class="mic-btn" onclick="toggleVoice()">🎙️</button>
          <input type="text" id="userInput" placeholder="Type or speak..." onkeypress="if(event.key==='Enter') sendMsg()">
          <button class="send-btn" onclick="sendMsg()">Send</button>
        </footer>
      </div>

      <div id="modal">
        <div class="modal-content">
          <h3>Medical & Contact Profile</h3>
          <label>Medications (JSON format):</label>
          <textarea id="medInput"></textarea>
          <label>Emergency Contacts (JSON format):</label>
          <textarea id="contactInput"></textarea>
          <button class="modal-btn" onclick="saveSettings()" style="background:#0f172a; color:white;">Save Changes</button>
          <button class="modal-btn" onclick="closeSettings()" style="background:#f1f5f9; color:#475569;">Cancel</button>
        </div>
      </div>

      <script>
        let currentUser = null;
        let isSignUp = false;

        function toggleAuthMode() {
          isSignUp = !isSignUp;
          document.getElementById('authSubmitBtn').textContent = isSignUp ? 'Create Account' : 'Sign In';
          document.getElementById('authToggleText').textContent = isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up";
        }

        async function handleAuth() {
          const email = document.getElementById('authEmail').value.trim();
          const password = document.getElementById('authPassword').value.trim();
          if(!email || !password) return alert('Please enter email and password');

          const endpoint = isSignUp ? '/api/register' : '/api/login';
          try {
            const res = await fetch(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email, password })
            });
            const data = await res.json();
            if(data.success) {
              currentUser = data.email;
              document.getElementById('auth-screen').style.display = 'none';
              document.getElementById('app-screen').style.display = 'flex';
            } else {
              alert(data.error || 'Authentication failed');
            }
          } catch(e) { alert('Connection error'); }
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        let recognition = null;
        let isRecording = false;

        if (SpeechRecognition) {
          recognition = new SpeechRecognition();
          recognition.lang = 'en-US';
          recognition.onresult = (event) => {
            document.getElementById('userInput').value = event.results[0][0].transcript;
            sendMsg();
          };
          recognition.onend = () => {
            isRecording = false;
            document.getElementById('micBtn').classList.remove('recording');
          };
        }

        function toggleVoice() {
          if (!recognition) return alert('Speech recognition not supported on this browser.');
          if (isRecording) { recognition.stop(); } 
          else { recognition.start(); isRecording = true; document.getElementById('micBtn').classList.add('recording'); }
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

        function askPreset(text) {
          document.getElementById('userInput').value = text;
          sendMsg();
        }

        async function callEmergency() {
          try {
            const res = await fetch('/api/memory', { headers: { 'user-email': currentUser } });
            const data = await res.json();
            if (data.emergencyContacts && data.emergencyContacts.length > 0) {
              const contact = data.emergencyContacts[0];
              if(confirm('Call emergency contact: ' + contact.name + ' (' + contact.phone + ')?')) {
                window.location.href = 'tel:' + contact.phone;
              }
            } else {
              alert('No emergency contact configured.');
            }
          } catch(e) { alert('Error fetching contacts.'); }
        }

        async function openSettings() {
          try {
            const res = await fetch('/api/memory', { headers: { 'user-email': currentUser } });
            const data = await res.json();
            document.getElementById('medInput').value = JSON.stringify(data.medications, null, 2);
            document.getElementById('contactInput').value = JSON.stringify(data.emergencyContacts, null, 2);
            document.getElementById('modal').style.display = 'flex';
          } catch(e) { alert('Error loading profile.'); }
        }

        function closeSettings() {
          document.getElementById('modal').style.display = 'none';
        }

        async function saveSettings() {
          try {
            const medications = JSON.parse(document.getElementById('medInput').value);
            const emergencyContacts = JSON.parse(document.getElementById('contactInput').value);
            
            await fetch('/api/memory', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'user-email': currentUser },
              body: JSON.stringify({ medications, emergencyContacts })
            });
            closeSettings();
            alert('Profile saved successfully!');
          } catch(e) {
            alert('Invalid JSON format. Please check your text.');
          }
        }

        async function sendMsg() {
          const input = document.getElementById('userInput');
          const text = input.value.trim();
          if (!text) return;

          appendMsg(text, 'user');
          input.value = '';

          try {
            const res = await fetch('/api/chat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ message: text, email: currentUser })
            });
            const data = await res.json();
            const reply = data.reply || data.error;
            appendMsg(reply, 'bot');
            speakText(reply);
          } catch (e) {
            appendMsg('Sorry, connection error.', 'bot');
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
