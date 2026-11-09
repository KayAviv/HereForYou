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
      <link rel="manifest" href='data:application/manifest+json,%7B%22name%22%3A%22HereForYou%22%2C%22short_name%22%3A%22HereForYou%22%2C%22start_url%22%3A%22%2F%22%2C%22display%22%3A%22standalone%22%2C%22background_color%22%3A%22%23f8fafc%22%2C%22theme_color%22%3A%22%23ffffff%22%2C%22description%22%3A%22A%20warm%20personal%20AI%20companion%20for%20elderly%20users%22%2C%22icons%22%3A%5B%7B%22src%22%3A%22https%3A%2F%2Fcdn-icons-png.flaticon.com%2F512%2F2583%2F2583344.png%22%2C%22sizes%22%3A%22192x192%22%2C%22type%22%3A%22image%2Fpng%22%2C%22purpose%22%3A%22any%20maskable%22%7D%2C%7B%22src%22%3A%22https%3A%2F%2Fcdn-icons-png.flaticon.com%2F512%2F2583%2F2583344.png%22%2C%22sizes%22%3A%22512x512%22%2C%22type%22%3A%22image%2Fpng%22%2C%22purpose%22%3A%22any%20maskable%22%7D%5D%7D'>
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
        .modal-content { background: white; padding: 24px; border-radius: 24px; width: 100%; max-width: 400px; display: flex; flex-direction: column; gap: 14px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1
