let username = "";
while (!username) {
    username = prompt("Lütfen kullanıcı adınızı girin:");
    if (username === null || username.trim() === "") {
        alert("Kullanıcı adı boş bırakılamaz! Lütfen tekrar deneyin.");
    }
}
username = username.trim();

const peer = new Peer(username);
const startCallButton = document.getElementById("startCall");
const muteButton = document.getElementById("muteButton");
const friendIdInput = document.getElementById("friendIdInput");
const myIdDisplay = document.getElementById("myId");
const participantList = document.getElementById("participantList");
const localAudio = document.getElementById("localAudio");

let localStream;
let isMuted = false;
let participants = {};
let connections = {};

function addAudioElement(participantId, stream) {
    const audioElement = document.createElement("audio");
    audioElement.autoplay = true;
    audioElement.id = `audio-${participantId}`;
    document.body.appendChild(audioElement);
    audioElement.srcObject = stream;
}

function removeAudioElement(participantId) {
    const audioElement = document.getElementById(`audio-${participantId}`);
    if (audioElement) {
        document.body.removeChild(audioElement);
    }
}

navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
        localStream = stream;
        localAudio.srcObject = stream;
    })
    .catch(err => console.error("Mikrofon hatası:", err));

peer.on("open", id => {
    myIdDisplay.textContent = id;
    updateParticipants(id, "Bağlı");
});

peer.on("call", call => {
    call.answer(localStream);

    call.on("stream", remoteStream => {
        addAudioElement(call.peer, remoteStream);
    });

    call.on("close", () => {
        removeAudioElement(call.peer);
    });
});

peer.on("connection", conn => {
    connections[conn.peer] = conn;

    conn.on("open", () => {
        conn.send({
            type: "updateParticipants",
            participants,
        });
    });

    conn.on("data", data => {
        if (data.type === "updateParticipants") {
            participants = data.participants;
            renderParticipants();
        } else if (data.type === "join") {
            updateParticipants(data.id, "Bağlı");
        } else if (data.type === "leave") {
            removeParticipant(data.id);
        }
    });

    conn.on("close", () => {
        removeParticipant(conn.peer);
        removeAudioElement(conn.peer);
        delete connections[conn.peer];
    });
});

function updateParticipants(id, status) {
    participants[id] = status;
    renderParticipants();
    broadcastParticipantList();
}

function removeParticipant(id) {
    if (participants[id]) {
        delete participants[id];
        renderParticipants();
        broadcastParticipantList();
    }
}

function renderParticipants() {
    participantList.innerHTML = "";
    for (let id in participants) {
        const li = document.createElement("li");
        li.textContent = `${id} - ${participants[id]}`;
        participantList.appendChild(li);
    }
}

function broadcastParticipantList() {
    const participantData = {
        type: "updateParticipants",
        participants,
    };
    for (let connId in connections) {
        connections[connId].send(participantData);
    }
}

startCallButton.addEventListener("click", () => {
    const friendId = friendIdInput.value.trim();
    if (!friendId) {
        alert("Lütfen bir kullanıcı adı girin!");
        return;
    }

    const call = peer.call(friendId, localStream);
    call.on("stream", remoteStream => {
        addAudioElement(friendId, remoteStream);
    });

    call.on("close", () => {
        removeAudioElement(friendId);
    });

    const conn = peer.connect(friendId);
    conn.on("open", () => {
        conn.send({ type: "join", id: peer.id });
        connections[friendId] = conn;
        updateParticipants(friendId, "Bağlı");
    });

    conn.on("close", () => {
        removeParticipant(friendId);
        removeAudioElement(friendId);
    });
});

muteButton.addEventListener("click", () => {
    if (localStream) {
        localStream.getAudioTracks().forEach(track => track.enabled = isMuted);
        isMuted = !isMuted;
        muteButton.textContent = isMuted ? "Mikrofonu Aç" : "Mikrofonu Kapat";
    }
});

window.addEventListener("unload", () => {
    for (let id in connections) {
        connections[id].send({ type: "leave", id: peer.id });
        connections[id].close();
    }
    peer.disconnect();
});
