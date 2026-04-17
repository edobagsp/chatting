import { createClient } from '@supabase/supabase-js'

// IMPORTANT: Replace these with your actual Supabase project details
// if you are not using a .env file.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'YOUR_SUPABASE_URL_HERE'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY_HERE'

let supabase;
try {
  supabase = createClient(supabaseUrl, supabaseAnonKey)
} catch (e) {
  console.error("Supabase client failed to initialize. Make sure URL and ANON KEY are set.");
}

// User state
let currentUser = localStorage.getItem('bbm_username');

// UI Elements
const loginScreen = document.getElementById('login-screen');
const chatScreen = document.getElementById('chat-screen');
const loginBtn = document.getElementById('login-btn');
const usernameInput = document.getElementById('username-input');
const currentUserDisplay = document.getElementById('current-user-display');
const chatContainer = document.getElementById('chat-container');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const installPwaBtn = document.getElementById('install-pwa-btn');

// PWA Install Logic
let deferredPrompt;
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
const isStandalone = window.matchMedia('(display-mode: standalone)').matches;

// Sembunyikan tombol jika sudah terinstal
if (isStandalone) {
  installPwaBtn.style.display = 'none';
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
});

installPwaBtn.addEventListener('click', async () => {
  if (isIOS) {
    alert('Cara Install di iPhone: \n1. Klik tombol "Share" (kotak dengan panah atas).\n2. Pilih "Add to Home Screen" atau "Tambahkan ke Layar Utama".');
    return;
  }
  
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      installPwaBtn.style.display = 'none';
    }
    deferredPrompt = null;
  } else {
    alert('Cara Install: \nKlik menu titik tiga (⋮) di pojok kanan atas browser Anda, lalu pilih "Instal Aplikasi" atau "Tambahkan ke Layar Utama".');
  }
});

// Initialize the app visually
if (currentUser) {
  showChat();
} else {
  loginScreen.classList.remove('hidden');
  chatScreen.classList.add('hidden');
}

// Login Handler
loginBtn.addEventListener('click', () => {
  const name = usernameInput.value.trim();
  if (name) {
    currentUser = name;
    localStorage.setItem('bbm_username', currentUser);
    showChat();
  }
});

function showChat() {
  loginScreen.classList.add('hidden');
  chatScreen.classList.remove('hidden');
  currentUserDisplay.textContent = currentUser;
  
  if(supabase) {
    fetchMessages();
    subscribeToMessages();
  } else {
    appendMessage({
      username: 'System',
      text: 'Supabase is not configured. Please add your VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to a .env file.',
      created_at: new Date().toISOString()
    });
  }
}

// Fetch existing messages
async function fetchMessages() {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(50);

  if (error) {
    console.error('Error fetching messages:', error);
    return;
  }

  chatContainer.innerHTML = ''; // Clear before loading
  if (data) {
    data.forEach(msg => appendMessage(msg));
  }
  scrollToBottom();
}

// Subscribe to new messages (Realtime)
function subscribeToMessages() {
  supabase
    .channel('public:messages')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
      // Only append if it's not our own message (we append our own instantly for better UX)
      // Actually, simplest is to append all from realtime to avoid duplicates logic, 
      // but let's append our own instantly and ignore it here, or just wait for realtime.
      // Waiting for realtime ensures it hit the DB.
      appendMessage(payload.new);
      scrollToBottom();
    })
    .subscribe();
}

// Send Message Handler
messageForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (!text || !supabase) return;

  // Clear input instantly for snappy feel
  messageInput.value = '';

  const { error } = await supabase
    .from('messages')
    .insert([
      { username: currentUser, text: text }
    ]);

  if (error) {
    console.error('Error sending message:', error);
    alert("Failed to send message.");
  }
});

// Render a message in the UI
function appendMessage(msg) {
  const isSent = msg.username === currentUser;
  const timeStr = new Date(msg.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });

  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${isSent ? 'me' : 'other'}`;
  
  const tickIcon = isSent ? `<span class="read-receipt">✓</span>` : `<span class="read-receipt received-dot">•</span>`;

  msgDiv.innerHTML = `
    <div class="bubble-header">
      <span class="sender-name">${isSent ? 'Me' : escapeHTML(msg.username)}</span>
      <span class="message-time">${timeStr}</span>
    </div>
    <div class="bubble-body">
      ${tickIcon} ${escapeHTML(msg.text)}
    </div>
    <div class="pointer"></div>
  `;
  
  chatContainer.appendChild(msgDiv);
}

function scrollToBottom() {
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Basic XSS prevention
function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
