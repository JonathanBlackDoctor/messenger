import { firebaseConfig as fileConfig } from './config.js';

// DOM Elements
const nicknameOverlay = document.getElementById('nickname-overlay');
const nicknameInput = document.getElementById('nickname-input');
const nicknameSubmitBtn = document.getElementById('nickname-submit-btn');
const myNicknameDisplay = document.getElementById('my-nickname-display');
const changeNicknameBtn = document.getElementById('change-nickname-btn');

const roomJoinForm = document.getElementById('room-join-form');
const roomInput = document.getElementById('room-input');
const publicRoomsList = document.getElementById('public-rooms-list');

const chatRoomTitle = document.getElementById('chat-room-title');
const chatRoomStatus = document.getElementById('chat-room-status');
const mobileRoomTitle = document.getElementById('mobile-room-title');
const shareRoomBtn = document.getElementById('share-room-btn');
const mobileShareBtn = document.getElementById('mobile-share-btn');

const messagesContainer = document.getElementById('messages-container');
const chatForm = document.getElementById('chat-form');
const messageInput = document.getElementById('message-input');

const dbConfigBtn = document.getElementById('db-config-btn');
const demoBannerSetupBtn = document.getElementById('demo-banner-setup-btn');
const demoBanner = document.getElementById('demo-banner');
const configOverlay = document.getElementById('config-overlay');
const configCancelBtn = document.getElementById('config-cancel-btn');
const configClearBtn = document.getElementById('config-clear-btn');
const configSaveBtn = document.getElementById('config-save-btn');

const mobileToggleBtn = document.getElementById('mobile-toggle-btn');
const sidebarCloseBtn = document.getElementById('sidebar-close-btn');
const sidebar = document.getElementById('sidebar');

// Firebase Configuration inputs
const cfgApiKey = document.getElementById('cfg-apiKey');
const cfgAuthDomain = document.getElementById('cfg-authDomain');
const cfgProjectId = document.getElementById('cfg-projectId');
const cfgStorageBucket = document.getElementById('cfg-storageBucket');
const cfgMessagingSenderId = document.getElementById('cfg-messagingSenderId');
const cfgAppId = document.getElementById('cfg-appId');
const cfgDatabaseURL = document.getElementById('cfg-databaseURL');

// State Variables
let myNickname = localStorage.getItem('messenger_nickname') || '';
let currentRoom = '';
let isDemoMode = true;
let publicRooms = [];
let lobbyBroadcastChannel = null;

// Firebase Instances & Unsubscribe callbacks
let firebaseApp = null;
let firebaseDb = null;
let dbUnsubscribe = null;
let firebaseRoomsUnsubscribe = null;
let firebaseConfigSignature = '';
let firebaseModules = null;

// Local Mode communication
let localBroadcastChannel = null;

// Initialize Application
async function init() {
  // 1. Setup Room
  const urlParams = new URLSearchParams(window.location.search);
  currentRoom = normalizeRoomName(urlParams.get('room'));
  
  // 2. Setup Nickname
  if (!myNickname) {
    showNicknameModal();
  } else {
    myNicknameDisplay.textContent = myNickname;
  }

  // 3. Initialize Database connection (Firebase or Fallback)
  await initDatabase();

  // 5. Setup UI Event Listeners
  setupEventListeners();

  // 6. Focus input
  messageInput.focus();
}

// ----------------------------------------------------
// NICKNAME MANAGEMENT
// ----------------------------------------------------
function showNicknameModal() {
  nicknameOverlay.classList.add('active');
  nicknameInput.value = myNickname;
  nicknameInput.focus();
}

function handleNicknameSubmit() {
  const newName = nicknameInput.value.trim();
  if (newName) {
    myNickname = newName;
    localStorage.setItem('messenger_nickname', myNickname);
    myNicknameDisplay.textContent = myNickname;
    nicknameOverlay.classList.remove('active');
    
    // Broadcast join message
    sendSystemMessage(`${myNickname}님이 입장하셨습니다.`);
  }
}

// ----------------------------------------------------
// DATABASE & REALTIME CONNECTION SETUP
// ----------------------------------------------------
async function initDatabase() {
  // Clean up existing listeners/channels
  if (dbUnsubscribe) {
    dbUnsubscribe();
    dbUnsubscribe = null;
  }
  if (firebaseRoomsUnsubscribe) {
    firebaseRoomsUnsubscribe();
    firebaseRoomsUnsubscribe = null;
  }
  if (localBroadcastChannel) {
    localBroadcastChannel.close();
    localBroadcastChannel = null;
  }
  if (lobbyBroadcastChannel) {
    lobbyBroadcastChannel.close();
    lobbyBroadcastChannel = null;
  }

  // Fetch UI saved config
  let config = null;
  const savedConfigStr = localStorage.getItem('firebase_config');
  
  if (savedConfigStr) {
    try {
      config = JSON.parse(savedConfigStr);
    } catch (e) {
      console.error("Failed to parse saved config", e);
    }
  }

  // Fallback to file configuration if no UI config exists
  if (!isConfigValid(config)) {
    if (isConfigValid(fileConfig)) {
      config = fileConfig;
    }
  }

  if (isConfigValid(config)) {
    // We have a configuration! Let's load Firebase dynamically
    isDemoMode = false;
    demoBanner.style.display = 'none';
    chatRoomStatus.innerHTML = '<span style="color: #10b981;">● 온라인 (Realtime DB)</span>';
    
    try {
      const { app, database } = await loadFirebaseModules();
      const { initializeApp, deleteApp } = app;
      const { getDatabase, ref, update, onValue, query, orderByChild, limitToLast, serverTimestamp } = database;
      const nextConfigSignature = JSON.stringify(config);

      // Recreate the app when the user changes projects in the settings modal.
      if (firebaseApp && firebaseConfigSignature !== nextConfigSignature) {
        await deleteApp(firebaseApp);
        firebaseApp = null;
        firebaseDb = null;
      }
      if (!firebaseApp) {
        firebaseApp = initializeApp(config);
        firebaseConfigSignature = nextConfigSignature;
      }
      firebaseDb = getDatabase(firebaseApp, config.databaseURL);

      // Register the current room in Realtime Database.
      const roomRef = ref(firebaseDb, 'rooms/' + currentRoom);
      await update(roomRef, {
        name: currentRoom,
        lastActive: serverTimestamp()
      });

      // Subscribe to the latest 150 messages in the current room.
      const messagesRef = ref(firebaseDb, 'rooms/' + currentRoom + '/messages');
      const messagesQuery = query(messagesRef, orderByChild('timestamp'), limitToLast(150));
      
      dbUnsubscribe = onValue(messagesQuery, (snapshot) => {
        const messages = [];
        snapshot.forEach((childSnapshot) => {
          const data = childSnapshot.val() || {};
          messages.push({
            id: childSnapshot.key,
            sender: data.sender || 'Unknown',
            text: data.text || '',
            timestamp: typeof data.timestamp === 'number' ? data.timestamp : Date.now(),
            isSystem: data.isSystem || false
          });
        });
        renderMessages(messages);
      }, (error) => {
        console.error("Realtime Database listen failed:", error);
        chatRoomStatus.innerHTML = '<span style="color: #ef4444;">● 데이터베이스 오류</span>';
      });

      // Subscribe to the latest 30 public rooms.
      const roomsRef = ref(firebaseDb, 'rooms');
      const roomsQuery = query(roomsRef, orderByChild('lastActive'), limitToLast(30));
      firebaseRoomsUnsubscribe = onValue(roomsQuery, (snapshot) => {
        const rooms = [];
        snapshot.forEach((childSnapshot) => {
          rooms.push(childSnapshot.key);
        });
        rooms.reverse();
        if (currentRoom && !rooms.includes(currentRoom)) {
          rooms.unshift(currentRoom);
        }
        publicRooms = rooms;
        renderPublicRooms();
      }, (error) => {
        console.error("Realtime Database rooms list listen failed:", error);
      });

    } catch (err) {
      console.error("Error loading or connecting to Firebase:", err);
      fallbackToDemoMode("Firebase 연결 오류");
    }
  } else {
    // No valid config found -> Demo / Local Mode
    fallbackToDemoMode();
  }

  // Update room header titles
  chatRoomTitle.textContent = `# ${currentRoom}`;
  mobileRoomTitle.textContent = `# ${currentRoom}`;
}

function isConfigValid(config) {
  return config && config.apiKey && config.projectId && config.databaseURL;
}

function normalizeRoomName(roomName) {
  const normalized = String(roomName || '')
    .trim()
    .toLowerCase()
    .replace(/[.#$[\]/]/g, '-')
    .slice(0, 64);
  return normalized || 'global';
}

async function loadFirebaseModules() {
  if (!firebaseModules) {
    const [app, database] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js")
    ]);
    firebaseModules = { app, database };
  }
  return firebaseModules;
}

function fallbackToDemoMode(reason = "") {
  isDemoMode = true;
  demoBanner.style.display = 'flex';
  chatRoomStatus.innerHTML = `<span style="color: #f59e0b;">● 데모 모드 ${reason ? `(${reason})` : ''}</span>`;
  
  // Setup BroadcastChannel so tabs can communicate offline
  const channelName = `messenger_room_${currentRoom}`;
  localBroadcastChannel = new BroadcastChannel(channelName);
  
  // Listen for messages from other tabs
  localBroadcastChannel.onmessage = (event) => {
    const { action, payload } = event.data;
    if (action === 'new_message') {
      appendLocalMessage(payload);
    }
  };

  // Setup lobby channel for public rooms sync
  lobbyBroadcastChannel = new BroadcastChannel('messenger_lobby');
  lobbyBroadcastChannel.onmessage = (event) => {
    const { action, payload } = event.data;
    if (action === 'lobby_updated') {
      publicRooms = payload;
      renderPublicRooms();
    }
  };

  // Register current room locally and broadcast
  registerLocalRoom(currentRoom);

  // Load message history from localStorage
  const localHistory = getLocalHistory(currentRoom);
  renderMessages(localHistory);
}

// ----------------------------------------------------
// LOCAL STORAGE MESSAGE HISTORY (For Demo Mode)
// ----------------------------------------------------
function getLocalHistory(room) {
  const history = localStorage.getItem(`room_history_${room}`);
  return history ? JSON.parse(history) : [];
}

function saveLocalHistory(room, messages) {
  localStorage.setItem(`room_history_${room}`, JSON.stringify(messages));
}

function appendLocalMessage(msg) {
  const history = getLocalHistory(currentRoom);
  history.push(msg);
  // Keep history capped at 100 messages for storage efficiency
  if (history.length > 100) history.shift();
  saveLocalHistory(currentRoom, history);
  renderMessages(history);
}

// ----------------------------------------------------
// SENDING MESSAGES
// ----------------------------------------------------
async function sendMessage(text, isSystem = false) {
  if (!text.trim()) return;

  const msgData = {
    sender: isSystem ? 'System' : myNickname,
    text: text.trim(),
    timestamp: Date.now(),
    isSystem: isSystem
  };

  if (isDemoMode) {
    // Broadcast via BroadcastChannel to other tabs
    if (localBroadcastChannel) {
      localBroadcastChannel.postMessage({
        action: 'new_message',
        payload: msgData
      });
    }
    // Save to local storage and render
    appendLocalMessage(msgData);
  } else {
    // Write to Firebase Realtime Database.
    try {
      const { database } = await loadFirebaseModules();
      const { ref, push, set, update, serverTimestamp } = database;
      const messagesRef = ref(firebaseDb, 'rooms/' + currentRoom + '/messages');
      const messageRef = push(messagesRef);

      await set(messageRef, {
        sender: msgData.sender,
        text: msgData.text,
        isSystem: msgData.isSystem,
        timestamp: serverTimestamp()
      });
      await update(ref(firebaseDb, 'rooms/' + currentRoom), {
        lastActive: serverTimestamp()
      });
    } catch (e) {
      console.error("Error writing to Realtime Database:", e);
      // Fallback save in UI
      alert("메시지 전송 실패: 데이터베이스 연결을 확인하세요.");
    }
  }
}

function sendSystemMessage(text) {
  sendMessage(text, true);
}

// ----------------------------------------------------
// UI RENDERING
// ----------------------------------------------------
function renderMessages(messages) {
  // Save scroll position
  const isAtBottom = messagesContainer.scrollHeight - messagesContainer.clientHeight <= messagesContainer.scrollTop + 50;

  messagesContainer.innerHTML = '';
  
  if (messages.length === 0) {
    messagesContainer.innerHTML = `<div class="system-message">대화방 #${currentRoom}이 생성되었습니다. 메시지를 보내 첫 대화를 시작하세요!</div>`;
    return;
  }

  messages.forEach((msg) => {
    if (msg.isSystem) {
      const systemDiv = document.createElement('div');
      systemDiv.className = 'system-message';
      systemDiv.textContent = msg.text;
      messagesContainer.appendChild(systemDiv);
    } else {
      const isSelf = msg.sender === myNickname;
      
      const groupDiv = document.createElement('div');
      groupDiv.className = `message-group ${isSelf ? 'self' : 'other'}`;
      
      if (!isSelf) {
        const senderSpan = document.createElement('span');
        senderSpan.className = 'message-sender';
        senderSpan.textContent = msg.sender;
        groupDiv.appendChild(senderSpan);
      }
      
      const bubbleWrapper = document.createElement('div');
      bubbleWrapper.className = 'message-bubble-wrapper';
      
      const bubbleDiv = document.createElement('div');
      bubbleDiv.className = 'message-bubble';
      bubbleDiv.textContent = msg.text;
      bubbleWrapper.appendChild(bubbleDiv);
      
      const timeSpan = document.createElement('span');
      timeSpan.className = 'message-time';
      timeSpan.textContent = formatTime(msg.timestamp);
      bubbleWrapper.appendChild(timeSpan);
      
      groupDiv.appendChild(bubbleWrapper);
      messagesContainer.appendChild(groupDiv);
    }
  });

  // Auto scroll to bottom
  if (isAtBottom || messages.length <= 5) {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
}

function formatTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  let hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? '오후' : '오전';
  hours = hours % 12;
  hours = hours ? hours : 12; // 0 should be 12
  return `${ampm} ${hours}:${minutes}`;
}

// ----------------------------------------------------
// ROOM SWITCHING
// ----------------------------------------------------
function switchRoom(newRoom) {
  newRoom = normalizeRoomName(newRoom);
  if (!newRoom || newRoom === currentRoom) return;
  
  currentRoom = newRoom;
  
  // Update URL parameters without refresh
  const url = new URL(window.location);
  url.searchParams.set('room', currentRoom);
  window.history.pushState({}, '', url);
  
  // Close sidebar on mobile
  sidebar.classList.remove('show');

  // Reconnect
  initDatabase();
}

function registerLocalRoom(roomName) {
  let localRooms = JSON.parse(localStorage.getItem('messenger_global_rooms')) || ['global'];
  localRooms = localRooms.filter(r => r !== roomName);
  localRooms.unshift(roomName);
  
  localStorage.setItem('messenger_global_rooms', JSON.stringify(localRooms));
  publicRooms = localRooms;
  renderPublicRooms();
  
  // Broadcast update to other tabs
  if (lobbyBroadcastChannel) {
    lobbyBroadcastChannel.postMessage({
      action: 'lobby_updated',
      payload: publicRooms
    });
  }
}

function renderPublicRooms() {
  publicRoomsList.innerHTML = '';
  publicRooms.forEach(room => {
    const item = document.createElement('div');
    item.className = `room-item ${room === currentRoom ? 'active' : ''}`;
    item.onclick = () => switchRoom(room);
    
    const nameSpan = document.createElement('span');
    nameSpan.className = 'room-name';
    nameSpan.textContent = `# ${room}`;
    item.appendChild(nameSpan);
    
    if (room === currentRoom) {
      const tagSpan = document.createElement('span');
      tagSpan.className = 'room-tag';
      tagSpan.textContent = '현재';
      item.appendChild(tagSpan);
    }
    
    publicRoomsList.appendChild(item);
  });
}

function copyRoomLink() {
  const link = window.location.href;
  navigator.clipboard.writeText(link).then(() => {
    alert("방 참여 링크가 클립보드에 복사되었습니다! 친구에게 보내 대화하세요.");
  }).catch(err => {
    console.error("Failed to copy link:", err);
    alert(`초대 링크: ${link}`);
  });
}

// ----------------------------------------------------
// CONFIGURATION MODAL (FIREBASE SETUP)
// ----------------------------------------------------
function showConfigModal() {
  configOverlay.classList.add('active');
  
  // Populate current configuration inputs
  let config = null;
  const savedConfigStr = localStorage.getItem('firebase_config');
  if (savedConfigStr) {
    try { config = JSON.parse(savedConfigStr); } catch(e) {}
  }
  if (!config && isConfigValid(fileConfig)) {
    config = fileConfig;
  }
  
  if (config) {
    cfgApiKey.value = config.apiKey || '';
    cfgAuthDomain.value = config.authDomain || '';
    cfgProjectId.value = config.projectId || '';
    cfgStorageBucket.value = config.storageBucket || '';
    cfgMessagingSenderId.value = config.messagingSenderId || '';
    cfgAppId.value = config.appId || '';
    cfgDatabaseURL.value = config.databaseURL || '';
  } else {
    cfgApiKey.value = '';
    cfgAuthDomain.value = '';
    cfgProjectId.value = '';
    cfgStorageBucket.value = '';
    cfgMessagingSenderId.value = '';
    cfgAppId.value = '';
    cfgDatabaseURL.value = '';
  }
}

function hideConfigModal() {
  configOverlay.classList.remove('active');
}

function saveConfig() {
  const newConfig = {
    apiKey: cfgApiKey.value.trim(),
    authDomain: cfgAuthDomain.value.trim(),
    projectId: cfgProjectId.value.trim(),
    storageBucket: cfgStorageBucket.value.trim(),
    messagingSenderId: cfgMessagingSenderId.value.trim(),
    appId: cfgAppId.value.trim(),
    databaseURL: cfgDatabaseURL.value.trim()
  };

  if (!newConfig.apiKey || !newConfig.projectId || !newConfig.databaseURL) {
    alert("API Key, Project ID, Database URL은 필수 입력값입니다.");
    return;
  }

  localStorage.setItem('firebase_config', JSON.stringify(newConfig));
  hideConfigModal();
  
  // Reload database connection
  initDatabase();
}

function clearConfig() {
  if (confirm("연동된 Firebase 설정을 삭제하고 데모(로컬) 모드로 돌아가시겠습니까?")) {
    localStorage.removeItem('firebase_config');
    cfgApiKey.value = '';
    cfgAuthDomain.value = '';
    cfgProjectId.value = '';
    cfgStorageBucket.value = '';
    cfgMessagingSenderId.value = '';
    cfgAppId.value = '';
    cfgDatabaseURL.value = '';
    hideConfigModal();
    initDatabase();
  }
}

// ----------------------------------------------------
// GENERAL EVENT LISTENERS
// ----------------------------------------------------
function setupEventListeners() {
  // Nickname entry
  nicknameSubmitBtn.onclick = handleNicknameSubmit;
  nicknameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleNicknameSubmit();
  });
  changeNicknameBtn.onclick = showNicknameModal;

  // Room Join Form
  roomJoinForm.onsubmit = (e) => {
    e.preventDefault();
    const newRoomName = roomInput.value.trim();
    if (newRoomName) {
      switchRoom(newRoomName);
      roomInput.value = '';
    }
  };

  // Chat message send
  chatForm.onsubmit = (e) => {
    e.preventDefault();
    const text = messageInput.value.trim();
    if (text) {
      sendMessage(text);
      messageInput.value = '';
      messageInput.focus();
    }
  };

  // Link copy buttons
  shareRoomBtn.onclick = copyRoomLink;
  mobileShareBtn.onclick = copyRoomLink;

  // Firebase Config actions
  dbConfigBtn.onclick = showConfigModal;
  demoBannerSetupBtn.onclick = showConfigModal;
  configCancelBtn.onclick = hideConfigModal;
  configSaveBtn.onclick = saveConfig;
  configClearBtn.onclick = clearConfig;

  // Mobile sidebar toggle
  mobileToggleBtn.onclick = () => {
    sidebar.classList.add('show');
  };
  sidebarCloseBtn.onclick = () => {
    sidebar.classList.remove('show');
  };
}

// Start application
init();
