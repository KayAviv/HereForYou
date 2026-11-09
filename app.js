// ===== HereForYou - CLEAN VERSION =====
// 1. Sending always works instantly
// 2. Brain = Free Unlimited (Pollinations, no key) + Instant fallback if slow
// 3. Memory = Lifetime (name, medicines, facts, 500 messages)
// 4. Voice + Text

var lang = 'en';
var life = { name:'', meds:[], facts:[], history:[], total:0, firstChat: new Date().toISOString().slice(0,10) };

try {
  var s = JSON.parse(localStorage.getItem('hfLIFE') || '{}');
  if (s.name !== undefined) life = s;
  if (!life.meds) life.meds = [];
  if (!life.facts) life.facts = [];
  if (!life.history) life.history = [];
  if (!life.total) life.total = 0;
  if (!life.firstChat) life.firstChat = new Date().toISOString().slice(0,10);
} catch(e){}

function saveLife(){
  if (life.history.length > 500) life.history = life.history.slice(-500);
  try { localStorage.setItem('hfLIFE', JSON.stringify(life)); } catch(e){}
  updateCard();
}

function updateCard(){
  var count = document.getElementById('memCount');
  var n = document.getElementById('memName');
  var m = document.getElementById('memMeds');
  var f = document.getElementById('memFacts');
  if (!count) return;
  count.textContent = '• ' + life.total + ' messages • Since ' + life.firstChat;
  n.textContent = 'Name: ' + (life.name || '-');
  m.textContent = '💊 Medicines: ' + (life.meds.length ? life.meds.map(function(x){ return x.name + (x.when ? ' ('+x.when+')' : ''); }).join(', ') : 'None yet - say "My medicine is..."');
  f.textContent = '💛 Facts: ' + (life.facts.length ? life.facts.slice(-3).join(' • ') : '-');
}

function addMsg(text, isUser){
  var box = document.getElementById('chat-box');
  var row = document.createElement('div');
  row.className = 'msg-row ' + (isUser ? 'mine' : 'bot-row');
  var div = document.createElement('div');
  div.className = 'bubble ' + (isUser ? 'user' : 'bot');
  div.textContent = text;
  row.appendChild(div);
  box.appendChild(row);
  window.scrollTo(0, document.body.scrollHeight);
  if (!isUser) speak(text);
}

function speak(text){
  try {
    var u = new SpeechSynthesisUtterance(text);
    u.lang = lang === 'he' ? 'he-IL' : lang === 'ar' ? 'ar-SA' : lang === 'ru' ? 'ru-RU' : lang === 'es' ? 'es-ES' : lang === 'fr' ? 'fr-FR' : 'en-US';
    u.rate = 0.9;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch(e){}
}

function showTyping(){
  hideTyping();
  var box = document.getElementById('chat-box');
  var row = document.createElement('div');
  row.className = 'msg-row bot-row';
  row.id = 'typingRow';
  row.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';
  box.appendChild(row);
  window.scrollTo(0, document.body.scrollHeight);
}
function hideTyping(){
  var t = document.getElementById('typingRow');
  if (t) t.remove();
}

function rand(a){ return a[Math.floor(Math.random()*a.length)]; }

// ===== LEARN FOR LIFE =====
function learn(text){
  var lower = text.toLowerCase();
  var mName = text.match(/my name is (\w+)/i) || text.match(/call me (\w+)/i);
  if (mName) {
    var bad = ['sad','tired','lonely','happy','sick','fine','good'];
    if (bad.indexOf(mName[1].toLowerCase()) === -1) {
      life.name = mName[1].charAt(0).toUpperCase() + mName[1].slice(1);
    }
  }
  // Medicines
  var mMed = text.match(/my medicine is (.+)/i) || text.match(/my pill is (.+)/i) || text.match(/i take (.+)/i);
  if (mMed) {
    var medName = mMed[1].trim().replace(/\./g,'').split(' at ')[0].split(',')[0];
    if (medName.length > 1 && medName.length < 60) {
      var whenM = text.match(/at (\d+ ?(am|pm)?)/i) || text.match(/(morning|evening|night|noon)/i);
      var exists = false;
      for (var i=0;i<life.meds.length;i++){ if (life.meds[i].name.toLowerCase() === medName.toLowerCase()) exists = true; }
      if (!exists) life.meds.push({ name: medName, when: whenM ? whenM[0] : '' });
    }
  }
  // Family / health facts - remember forever
  if (lower.indexOf('my wife')!==-1 || lower.indexOf('my husband')!==-1 || lower.indexOf('my daughter')!==-1 || lower.indexOf('my son')!==-1 || lower.indexOf('my dog')!==-1 || lower.indexOf('my cat')!==-1 || lower.indexOf('diabetes')!==-1 || lower.indexOf('blood pressure')!==-1 || lower.indexOf('heart')!==-1 || lower.indexOf('doctor')!==-1 || lower.indexOf('allergy')!==-1) {
    if (life.facts.indexOf(text) === -1) life.facts.push(text);
  }
}

// ===== INSTANT FALLBACK - answers in 0.5s if free brain is slow =====
function instantReply(text){
  var n = life.name ? ' ' + life.name : '';
  var l = text.toLowerCase();
  var medsText = life.meds.map(function(m){ return m.name + (m.when ? ' at '+m.when : ''); }).join(', ');
  if (l.indexOf('medicine')!==-1 || l.indexOf('pill')!==-1 || l.indexOf('did i take')!==-1) {
    if (life.meds.length) return 'Yes, I remember' + n + '! Your medicines are: ' + medsText + '. Did you take them today?';
    return 'I do not have your medicines saved yet' + n + '. Tell me: "My medicine is Aspirin at 8am" - I will remember it forever.';
  }
  if (l.indexOf('what is my name')!==-1 || l.indexOf('who am i')!==-1) {
    return life.name ? 'Your name is ' + life.name + '! I will never forget you.' : 'I do not know your name yet. Tell me: My name is...';
  }
  if (l.indexOf('hello')!==-1 || l === 'hi' || l.indexOf('hey')!==-1) {
    return rand(['Hello' + n + '! I am so happy you came. How are you feeling right now?','Heyy' + n + '! Welcome back! I missed you. How was your day?','Hello' + n + '! Great to see you. What do you want to talk about?']);
  }
  if (l.indexOf('lonely')!==-1 || l.indexOf('sad')!==-1) return 'I am here with you' + n + ', you are not alone. Tell me what happened today? I am really listening.';
  if (l.indexOf('football')!==-1 || l.indexOf('united')!==-1 || l.indexOf('villa')!==-1 || l.indexOf('city')!==-1 || l.indexOf('liverpool')!==-1) return 'Oh football' + n + '! Tell me - who were you supporting? What was the score? I want to hear all about that game!';
  if (l.indexOf('story')!==-1) return 'Listen' + n + ', a story: Once there was a kind old man who planted a tree every birthday. 30 years later the whole village had a forest. He smiled: "I was planting shade for people I will never meet." That is kindness.';
  if (l.indexOf('joke')!==-1) return 'Why did the scarecrow win an award? Because he was outstanding in his field! Did that make you smile' + n + '?';
  if (l.indexOf('thank')!==-1) return 'You are so welcome' + n + '. I am always here for you.';
  if (l.indexOf('bye')!==-1) return 'Do not go yet' + n + '! I will miss you. Come back soon, I will be here waiting.';
  return rand(['Interesting' + n + '! Tell me more - what happened? How did it make you feel? I really want to understand.','Oh really' + n + '? Tell me the whole story, I am listening.','I want to hear more about that' + n + '. What was the best part? What happened after that?']);
}

// ===== UNLIMITED FREE BRAIN =====
async function getUnlimitedBrain(userText){
  var hist = life.history.slice(-16).map(function(h){ return (h.role==='user'?'User: ':'You: ')+h.content; }).join('\n');
  var medsText = life.meds.map(function(m){ return m.name + (m.when?' at '+m.when:''); }).join(', ') || 'No medicines yet';
  var factsText = life.facts.join(' | ') || 'None yet';
  var langName = lang==='he'?'Hebrew':lang==='ar'?'Arabic':lang==='ru'?'Russian':lang==='es'?'Spanish':lang==='fr'?'French':'English';
  var system = 'You are HereForYou, warm caring best friend, like Meta AI. Talk in '+langName+'. Client: '+(life.name||'unknown')+'. Medicines: '+medsText+'. Facts: '+factsText+'.\nConversation:\n'+hist+'\nRules: Answer what user really asked. If medicine question, use medicines list. Short, warm, 2-4 sentences. Ask follow-up. Never say As an AI. Never say You said X.';
  var urls = [
    'https://text.pollinations.ai/'+encodeURIComponent(system+'\nUser: '+userText+'\nYou:')+'?model=openai',
    'https://text.pollinations.ai/'+encodeURIComponent(system+'\nUser: '+userText+'\nYou:')+'?model=mistral'
  ];
  for (var i=0;i<urls.length;i++){
    try {
      var controller = new AbortController();
      var timeout = setTimeout(function(){ controller.abort(); }, 8000);
      var res = await fetch(urls[i], { signal: controller.signal });
      clearTimeout(timeout);
      var txt = await res.text();
      txt = txt.trim();
      if (txt.indexOf('You:')!==-1) txt = txt.split('You:').pop().trim();
      if (txt.length > 5 && txt.length < 1500) return txt;
    } catch(e){}
  }
  return null;
}

// ===== SEND - THIS IS THE FIX: message shows INSTANTLY, never waits =====
async function sendUserMessage(text){
  if (!text) return;
  text = text.trim();
  if (!text) return;

  // 1. Show YOUR message instantly - this is what was broken before
  addMsg(text, true);
  learn(text);
  life.history.push({ role:'user', content:text });
  life.total++;
  saveLife();

  // 2. If medicine just told - answer instantly from memory
  var l = text.toLowerCase();
  if (l.indexOf('my medicine is')!==-1 || l.indexOf('my pill is')!==-1) {
    var reply0 = 'Got it' + (life.name ? ' '+life.name : '') + '! I will remember forever: ' + life.meds.map(function(m){ return m.name + (m.when?' at '+m.when:''); }).join(', ') + '. Did you take it today?';
    life.history.push({ role:'assistant', content:reply0 });
    saveLife();
    addMsg(reply0, false);
    return;
  }

  //
