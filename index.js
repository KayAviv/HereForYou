const express = require('express');
const { OpenAI } = require('openai');

const app = express();
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// בסיס נתונים פשוט בזיכרון למשתמשים
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

// Authentication Endpoints
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
    if (emergencyContacts) users
