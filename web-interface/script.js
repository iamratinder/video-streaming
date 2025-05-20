// Update DOM elements at the top
const videoFileInput = document.getElementById('videoFile');
const audioFileInput = document.getElementById('audioFile');
const previewBtn = document.getElementById('previewBtn');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const fileStatus = document.getElementById('fileStatus');
const connectionStatus = document.getElementById('connectionStatus');
const localLog = document.getElementById('localLog');
const remoteLog = document.getElementById('remoteLog');

// Add at the top with other variables
const ws = new WebSocket('ws://localhost:8080');
let roomId = '';
let wsConnected = false;

// Store our streams and connection
let videoStream = null;
let audioStream = null;
let combinedStream = null;
let peerConnection = null;
let videoElement = null;
let audioElement = null;
let mediaController = null;

// Add at the top with other variables
const roleSelect = document.getElementById('roleSelect');
const fileControlsSection = document.getElementById('fileControlsSection');
let isReceiver = false;

// Add role change handler
roleSelect.addEventListener('change', () => {
    isReceiver = roleSelect.value === 'receiver';
    fileControlsSection.classList.toggle('hidden', isReceiver);
    
    if (isReceiver) {
        enableRoomControls(true);
        fileStatus.textContent = "Ready to join a room";
    } else {
        enableRoomControls(false);
        fileStatus.textContent = "Please select media files...";
    }
});

class MediaSyncController {
    constructor(videoElem, audioElem) {
        this.video = videoElem;
        this.audio = audioElem;
        this.syncThreshold = 0.1; // 100ms threshold
        this.isPlaying = false;

        // Bind methods
        this.play = this.play.bind(this);
        this.pause = this.pause.bind(this);
        this.sync = this.sync.bind(this);

        // Setup sync interval
        setInterval(this.sync, 1000);
    }

    async play() {
        try {
            await Promise.all([
                this.video.play(),
                this.audio.play()
            ]);
            this.isPlaying = true;
        } catch (error) {
            console.error('Playback error:', error);
        }
    }

    pause() {
        this.video.pause();
        this.audio.pause();
        this.isPlaying = false;
    }

    sync() {
        if (!this.isPlaying) return;
        
        const drift = Math.abs(this.video.currentTime - this.audio.currentTime);
        if (drift > this.syncThreshold) {
            this.audio.currentTime = this.video.currentTime;
        }
    }

    setMuted(muted) {
        this.audio.muted = muted;
    }
}

// Debug utility - helps identify WebRTC issues
window.debugWebRTC = () => {
    if (peerConnection) {
        console.log('PeerConnection state:', {
            signalingState: peerConnection.signalingState,
            connectionState: peerConnection.connectionState,
            iceConnectionState: peerConnection.iceConnectionState,
            iceGatheringState: peerConnection.iceGatheringState
        });
        
        console.log('Local tracks:', combinedStream ? combinedStream.getTracks() : 'No combined stream');
        console.log('Remote video srcObject:', remoteVideo.srcObject);
        
        if (remoteVideo.srcObject) {
            console.log('Remote tracks:', remoteVideo.srcObject.getTracks());
        }
    } else {
        console.log('No peer connection established yet');
    }
};

// Check if files are selected
function checkFiles() {
    if (videoFileInput.files.length > 0 && audioFileInput.files.length > 0) {
        previewBtn.disabled = false;
        fileStatus.textContent = "Files selected. Click 'Preview' to continue.";
    } else {
        previewBtn.disabled = true;
    }
}

// Create media elements and get streams
function createMediaElements() {
    return new Promise((resolve, reject) => {
        try {
            // Create video element for the video file
            videoElement = document.createElement('video');
            videoElement.autoplay = false;
            videoElement.muted = true;
            videoElement.loop = true;
            videoElement.playsInline = true;
            
            // Create audio element for the audio file
            audioElement = document.createElement('audio');
            audioElement.autoplay = false;
            audioElement.loop = true;
            
            // Set sources
            videoElement.src = URL.createObjectURL(videoFileInput.files[0]);
            audioElement.src = URL.createObjectURL(audioFileInput.files[0]);
            
            // Wait for media to be loaded
            let videoLoaded = false;
            let audioLoaded = false;
            
            videoElement.onloadedmetadata = () => {
                log(localLog, `Video loaded: ${videoFileInput.files[0].name}, duration: ${videoElement.duration.toFixed(2)}s`);
                videoLoaded = true;
                if (audioLoaded) resolve();
            };
            
            audioElement.onloadedmetadata = () => {
                log(localLog, `Audio loaded: ${audioFileInput.files[0].name}, duration: ${audioElement.duration.toFixed(2)}s`);
                audioLoaded = true;
                if (videoLoaded) resolve();
            };
            
            videoElement.onerror = (e) => reject(`Video error: ${e.target.error ? e.target.error.message : 'unknown error'}`);
            audioElement.onerror = (e) => reject(`Audio error: ${e.target.error ? e.target.error.message : 'unknown error'}`);
        } catch (error) {
            reject(`Error creating media elements: ${error.message}`);
        }
    });
}

// Enhanced stream creation
async function createCombinedStream() {
    try {
        await videoElement.play();
        await audioElement.play();
        
        videoStream = videoElement.captureStream();
        audioStream = audioElement.captureStream();
        
        // Create MediaStreamTrackProcessor for real-time processing
        const videoTrack = videoStream.getVideoTracks()[0];
        const processor = new MediaStreamTrackProcessor({ track: videoTrack });
        const generator = new MediaStreamTrackGenerator({ kind: 'video' });
        
        const transformer = new TransformStream({
            transform: async (frame, controller) => {
                // Process frame in real-time if needed
                controller.enqueue(frame);
            }
        });

        processor.readable
            .pipeThrough(transformer)
            .pipeTo(generator.writable);

        combinedStream = new MediaStream();
        combinedStream.addTrack(generator);
        combinedStream.addTrack(audioStream.getAudioTracks()[0]);

        // Initialize media controller
        mediaController = new MediaSyncController(videoElement, audioElement);
        
        return combinedStream;
    } catch (error) {
        throw new Error(`Error creating combined stream: ${error.message}`);
    }
}

// Preview combined stream
async function previewCombinedStream() {
    try {
        fileStatus.textContent = "Loading media files...";
        enableRoomControls(false);
        
        await createMediaElements();
        const stream = await createCombinedStream();
        
        localVideo.srcObject = stream;
        await localVideo.play();
        
        fileStatus.textContent = "Preview ready! You can now create or join a room.";
        enableRoomControls(true);
        
        return stream;
    } catch (error) {
        fileStatus.textContent = `Error: ${error.message}`;
        console.error(error);
        enableRoomControls(false);
    }
}

// Update initPeerConnection function
function initPeerConnection() {
    const configuration = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ]
    };
    
    if (peerConnection) {
        peerConnection.close();
    }
    
    peerConnection = new RTCPeerConnection(configuration);
    
    // Monitor peer connection state changes
    peerConnection.onconnectionstatechange = () => {
        const state = peerConnection.connectionState;
        log(localLog, `Connection state changed to: ${state}`);
        connectionStatus.textContent = `Connection state: ${state}`;
    };

    peerConnection.oniceconnectionstatechange = () => {
        log(localLog, `ICE connection state: ${peerConnection.iceConnectionState}`);
    };

    peerConnection.onicegatheringstatechange = () => {
        log(localLog, `ICE gathering state: ${peerConnection.iceGatheringState}`);
    };

    peerConnection.onsignalingstatechange = () => {
        log(localLog, `Signaling state: ${peerConnection.signalingState}`);
    };

    // Enhanced track handling
    peerConnection.ontrack = (event) => {
        log(remoteLog, `Received ${event.track.kind} track`);
        
        if (isReceiver) {
            if (!remoteVideo.srcObject) {
                const newStream = new MediaStream();
                remoteVideo.srcObject = newStream;
                log(remoteLog, "Created new MediaStream for remote video");
            }

            const stream = remoteVideo.srcObject;
            stream.addTrack(event.track);
            
            // Log track details
            const tracks = {
                video: stream.getVideoTracks(),
                audio: stream.getAudioTracks()
            };
            
            log(remoteLog, `Current tracks - Video: ${tracks.video.length}, Audio: ${tracks.audio.length}`);

            // Try to play automatically when both tracks are received
            if (tracks.video.length > 0 && tracks.audio.length > 0) {
                remoteVideo.play().catch(e => {
                    log(remoteLog, `Auto-play failed: ${e.message}`);
                });
            }
        }
    };

    // Add ICE candidate handler
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            ws.send(JSON.stringify({
                type: 'ice-candidate',
                candidate: event.candidate,
                roomId
            }));
            log(localLog, "Sent ICE candidate");
        }
    };

    return peerConnection;
}

// Create and set local description (offer)
async function createOffer() {
    try {
        if (!peerConnection) {
            peerConnection = initPeerConnection();
        }
        
        // Check if we're in a valid state to create an offer
        if (peerConnection.signalingState !== "stable") {
            log(localLog, "Resetting connection state...");
            await peerConnection.close();
            peerConnection = initPeerConnection();
        }
        
        const offer = await peerConnection.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
        });
        await peerConnection.setLocalDescription(offer);
        
        localSessionDescriptionElem.textContent = JSON.stringify(offer);
        connectionStatus.textContent = "Offer created. Share it with your peer.";
        log(localLog, "Created offer and set as local description");
        
        return offer;
    } catch (error) {
        connectionStatus.textContent = `Error creating offer: ${error.message}`;
        console.error(error);
    }
}

// Connect to peer using the provided session description
async function connectToPeer() {
    try {
        const remoteDesc = JSON.parse(remoteSessionDescriptionInput.value);
        log(localLog, `Processing ${remoteDesc.type}...`);
        
        // Initialize new connection if needed
        if (!peerConnection || peerConnection.signalingState === "closed") {
            peerConnection = initPeerConnection();
        }
        
        // Handle different signaling states
        if (remoteDesc.type === 'offer') {
            if (peerConnection.signalingState !== "stable") {
                log(localLog, "Resetting connection for new offer...");
                await peerConnection.close();
                peerConnection = initPeerConnection();
            }
            
            await peerConnection.setRemoteDescription(new RTCSessionDescription(remoteDesc));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            localSessionDescriptionElem.textContent = JSON.stringify(answer);
            log(localLog, "Created and set local answer");
            
        } else if (remoteDesc.type === 'answer') {
            if (peerConnection.signalingState === "have-local-offer") {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(remoteDesc));
                log(localLog, "Set remote answer");
            } else {
                throw new Error(`Invalid state for setting answer: ${peerConnection.signalingState}`);
            }
        } else {
            throw new Error(`Unsupported description type: ${remoteDesc.type}`);
        }
        
        // Enable transceivers
        peerConnection.getTransceivers().forEach(transceiver => {
            transceiver.direction = "sendrecv";
        });
        
        connectionStatus.textContent = "Connected! Waiting for media stream...";
        
    } catch (error) {
        connectionStatus.textContent = `Connection error: ${error.message}`;
        console.error(error);
        
        // Log detailed state for debugging
        if (peerConnection) {
            log(localLog, `Current signaling state: ${peerConnection.signalingState}`);
            log(localLog, `Current connection state: ${peerConnection.connectionState}`);
        }
    }
}

// Utility function to log messages
function log(element, message) {
    const timestamp = new Date().toLocaleTimeString();
    element.innerHTML += `<div>[${timestamp}] ${message}</div>`;
    element.scrollTop = element.scrollHeight;
}

// Event listeners
videoFileInput.addEventListener('change', checkFiles);
audioFileInput.addEventListener('change', checkFiles);
previewBtn.addEventListener('click', previewCombinedStream);

// Video control buttons
document.getElementById('localPlayBtn').addEventListener('click', () => {
    if (mediaController) {
        mediaController.play();
        log(localLog, "Local playback started");
    }
});

document.getElementById('localPauseBtn').addEventListener('click', () => {
    if (mediaController) {
        mediaController.pause();
        log(localLog, "Local playback paused");
    }
});

document.getElementById('localMuteBtn').addEventListener('click', function() {
    if (mediaController) {
        const isMuted = audioElement.muted;
        mediaController.setMuted(!isMuted);
        this.textContent = !isMuted ? 'Unmute Audio' : 'Mute Audio';
        log(localLog, `Local audio ${!isMuted ? 'muted' : 'unmuted'}`);
    }
});

document.getElementById('remotePlayBtn').addEventListener('click', () => {
    playRemoteVideo();
});

document.getElementById('remotePauseBtn').addEventListener('click', () => {
    if (remoteVideo.srcObject) {
        remoteVideo.pause();
        log(remoteLog, "Remote video paused");
    }
});

document.getElementById('remoteMuteBtn').addEventListener('click', function() {
    if (remoteVideo.srcObject) {
        const isMuted = remoteVideo.muted;
        remoteVideo.muted = !isMuted;
        this.textContent = !isMuted ? 'Unmute Audio' : 'Mute Audio';
        log(remoteLog, `Remote audio ${!isMuted ? 'muted' : 'unmuted'}`);
    }
});

document.getElementById('remoteForcePlay').addEventListener('click', () => {
    // Force play with user interaction
    if (remoteVideo.srcObject) {
        // Try with both current source and rebuilding it
        const oldStream = remoteVideo.srcObject;
        const tracks = [...oldStream.getTracks()];
        
        // Create new stream with the same tracks
        const newStream = new MediaStream();
        tracks.forEach(track => newStream.addTrack(track));
        
        // Set and play
        remoteVideo.srcObject = newStream;
        remoteVideo.play().then(() => {
            log(remoteLog, "Remote video force-played successfully");
        }).catch(e => {
            log(remoteLog, `Error force-playing: ${e.message}`);
        });
        
        // Detailed log of video state
        logVideoState();
    }
});

// Function to play remote video with better error handling
function playRemoteVideo() {
    if (!remoteVideo.srcObject) {
        log(remoteLog, "No remote stream available yet");
        logVideoState();
        return;
    }

    const stream = remoteVideo.srcObject;
    const videoTracks = stream.getVideoTracks();
    const audioTracks = stream.getAudioTracks();
    
    log(remoteLog, `Attempting playback with ${videoTracks.length} video and ${audioTracks.length} audio tracks`);
    
    if (videoTracks.length === 0 || audioTracks.length === 0) {
        log(remoteLog, "Missing tracks, waiting...");
        return;
    }

    remoteVideo.muted = false;
    const playPromise = remoteVideo.play();
    
    if (playPromise !== undefined) {
        playPromise.then(() => {
            log(remoteLog, "Remote video playing successfully");
            connectionStatus.textContent = "Remote stream playing";
            logVideoState();
        }).catch(error => {
            log(remoteLog, `Play error: ${error.message}. Try clicking play button.`);
            logVideoState();
        });
    }
}

// Function to log detailed video state
function logVideoState() {
    if (remoteVideo.srcObject) {
        const vTracks = remoteVideo.srcObject.getVideoTracks();
        const aTracks = remoteVideo.srcObject.getAudioTracks();
        
        log(remoteLog, `Video state: readyState=${remoteVideo.readyState}, paused=${remoteVideo.paused}`);
        log(remoteLog, `Video tracks: ${vTracks.length} (${vTracks.map(t => t.readyState).join(', ')})`);
        log(remoteLog, `Audio tracks: ${aTracks.length} (${aTracks.map(t => t.readyState).join(', ')})`);
        
        if (vTracks.length > 0) {
            const settings = vTracks[0].getSettings();
            log(remoteLog, `Video settings: ${settings.width}x${settings.height}`);
        }
    }
}

// Initialize
fileStatus.textContent = "Please select video and audio files...";

// Update WebSocket message handler
ws.onmessage = async (event) => {
    try {
        const data = JSON.parse(event.data);
        console.log("Received WebSocket message:", data);
        
        switch(data.type) {
            case 'joined':
                if (data.isCreator) {
                    connectionStatus.textContent = `Room created! Share this ID: ${data.roomId}`;
                    log(localLog, `Created new room ${data.roomId}`);
                    // Sender should create and send offer after joining
                    if (!isReceiver && peerConnection) {
                        const offer = await peerConnection.createOffer();
                        await peerConnection.setLocalDescription(offer);
                        ws.send(JSON.stringify({ 
                            type: 'offer', 
                            offer, 
                            roomId 
                        }));
                    }
                } else {
                    connectionStatus.textContent = `Joined room ${data.roomId}`;
                    log(localLog, `Joined existing room ${data.roomId}`);
                }
                break;
                
            case 'offer':
                if (!peerConnection) {
                    peerConnection = initPeerConnection();
                }
                
                if (isReceiver) {
                    // Ensure transceivers are added before setting remote description
                    if (peerConnection.getTransceivers().length === 0) {
                        peerConnection.addTransceiver('video', { direction: 'recvonly' });
                        peerConnection.addTransceiver('audio', { direction: 'recvonly' });
                        log(localLog, "Set up receiver transceivers");
                    }
                }
                
                log(localLog, "Received offer, creating answer...");
                await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                ws.send(JSON.stringify({ 
                    type: 'answer', 
                    answer, 
                    roomId 
                }));
                log(localLog, "Sent answer to offer");
                break;
                
            case 'answer':
                if (peerConnection) {
                    log(localLog, "Received answer from peer");
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
                }
                break;
                
            case 'ice-candidate':
                if (peerConnection) {
                    await peerConnection.addIceCandidate(data.candidate);
                    log(localLog, "Added ICE candidate");
                }
                break;
        }
    } catch (error) {
        console.error("Error processing message:", error);
        log(localLog, `Error: ${error.message}`);
    }
};

// Add WebSocket connection handlers
ws.onopen = () => {
    wsConnected = true;
    connectionStatus.textContent = "WebSocket Connected. Preview media files to continue.";
    document.querySelector('.connection-status-indicator').classList.add('connected');
};

ws.onclose = () => {
    wsConnected = false;
    connectionStatus.textContent = "WebSocket Disconnected - Please refresh the page";
    console.log("WebSocket connection closed");
};

ws.onerror = (error) => {
    console.error("WebSocket error:", error);
    connectionStatus.textContent = "WebSocket Error - Check if server is running";
};

// Update joinRoom function
async function joinRoom() {
    if (!wsConnected) {
        connectionStatus.textContent = "Cannot join room: WebSocket not connected";
        return;
    }

    // Only check for media if sender
    if (!isReceiver && !combinedStream) {
        connectionStatus.textContent = "Please preview media files before joining a room";
        return;
    }

    try {
        const roomIdInput = document.getElementById('roomId').value.trim();
        if (!roomIdInput) {
            connectionStatus.textContent = "Please enter a room ID";
            return;
        }

        roomId = roomIdInput;
        connectionStatus.textContent = "Joining room...";
        
        // Initialize peer connection first
        peerConnection = initPeerConnection();
        
        // For receivers, set up transceivers immediately
        if (isReceiver) {
            peerConnection.addTransceiver('video', { direction: 'recvonly' });
            peerConnection.addTransceiver('audio', { direction: 'recvonly' });
            log(localLog, "Set up receiver transceivers");
        }
        
        // Then join room
        ws.send(JSON.stringify({ 
            type: 'join', 
            roomId: roomId,
            isReceiver: isReceiver
        }));
        
        log(localLog, `Attempting to join room: ${roomId}`);
        
    } catch (error) {
        connectionStatus.textContent = `Error joining room: ${error.message}`;
        log(localLog, `Join room error: ${error.message}`);
    }
}

// Update createRoom function
async function createRoom() {
    if (!wsConnected) {
        connectionStatus.textContent = "Cannot create room: WebSocket not connected";
        return;
    }

    if (isReceiver) {
        connectionStatus.textContent = "Receivers cannot create rooms";
        return;
    }

    if (!combinedStream) {
        connectionStatus.textContent = "Please preview media files before creating a room";
        return;
    }

    try {
        roomId = Math.random().toString(36).substr(2, 9);
        console.log("Creating room with ID:", roomId);
        
        // Initialize new peer connection
        peerConnection = initPeerConnection();
        
        // Add all tracks from combined stream to peer connection
        combinedStream.getTracks().forEach(track => {
            const sender = peerConnection.addTrack(track, combinedStream);
            log(localLog, `Added ${track.kind} track to peer connection`);
            
            // Monitor track status
            sender.track.onended = () => {
                log(localLog, `Local ${track.kind} track ended`);
            };
            sender.track.onmute = () => {
                log(localLog, `Local ${track.kind} track muted`);
            };
            sender.track.onunmute = () => {
                log(localLog, `Local ${track.kind} track unmuted`);
            };
        });

        // Create offer after tracks are added
        const offer = await peerConnection.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
        });
        await peerConnection.setLocalDescription(offer);
        
        // Send join message first
        ws.send(JSON.stringify({ 
            type: 'join', 
            roomId: roomId,
            isCreator: true
        }));

        // Then send the offer
        ws.send(JSON.stringify({ 
            type: 'offer', 
            offer, 
            roomId 
        }));
        
        connectionStatus.textContent = `Creating room...`;
        log(localLog, `Creating room with ID: ${roomId}`);
        
        // Log track status
        const senders = peerConnection.getSenders();
        log(localLog, `Number of senders: ${senders.length}`);
        senders.forEach(sender => {
            log(localLog, `Sender track type: ${sender.track?.kind}`);
        });
        
    } catch (error) {
        connectionStatus.textContent = `Error creating room: ${error.message}`;
        console.error("Room creation error:", error);
    }
}

// Add event listeners for new buttons
document.getElementById('createRoomBtn').addEventListener('click', createRoom);
document.getElementById('joinRoomBtn').addEventListener('click', joinRoom);

// Remove old connection-related event listeners
// Remove createOfferBtn and connectBtn event listeners

function enableRoomControls(enable) {
    document.getElementById('roomId').disabled = !enable;
    document.getElementById('createRoomBtn').disabled = !enable;
    document.getElementById('joinRoomBtn').disabled = !enable;
}