# WebRTC File Streaming Application

A real-time media streaming application that allows synchronized playback of separate video and audio files using WebRTC technology.

## Features

- 🎥 Synchronized video and audio streaming
- 🌐 WebRTC peer-to-peer communication
- 🔄 Real-time media synchronization
- 👥 Sender/Receiver role selection
- 🔊 Independent audio control
- 🏢 Room-based connections
- 📝 Real-time logging
- 🎮 Playback controls

## Technologies Used

- [WebRTC](https://webrtc.org/) - Real-time communication
- [WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket) - Signaling server
- [MediaStream API](https://developer.mozilla.org/en-US/docs/Web/API/MediaStream) - Media handling
- [MediaStreamTrackProcessor](https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrackProcessor) - Stream processing

## Prerequisites

- Node.js (v14 or higher)
- Modern web browser with WebRTC support (Chrome, Firefox, Edge recommended)

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd Text-to-video/web-interface
```

2. Install dependencies:
```bash
npm install
```

3. Start the WebSocket server:
```bash
npm start
```

4. Open `index.html` in your web browser

## Usage

### As a Sender

1. Select "Sender" from the role selector
2. Choose your video and audio files
3. Click "Preview" to test the combined stream
4. Create a new room or join an existing one
5. Share the room ID with receivers
6. Use playback controls to manage the stream

### As a Receiver

1. Select "Receiver" from the role selector
2. Enter the room ID shared by the sender
3. Click "Join Room"
4. Use playback controls to manage your viewing experience

## Architecture

- **Frontend**: Pure JavaScript, HTML5, and CSS3
- **Backend**: Node.js WebSocket server
- **Communication**: WebRTC with WebSocket signaling
- **Media Handling**: MediaStream API, MediaStreamTrackProcessor

## Technical Features

- Real-time media synchronization using `MediaSyncController`
- Automatic track synchronization with configurable threshold
- WebRTC peer connection management
- ICE candidate handling
- Connection state monitoring
- Detailed logging system

## File Structure

```
video-streaming/
    ├── README.md
    ├── Text-to-video/
    │   └── Video_generation.ipynb
    └── web-interface/
        ├── index.html
        ├── package-lock.json
        ├── package.json
        ├── script.js
        ├── server.js
        ├── styles.css
        └── .gitignore

```

## Browser Support

- Chrome 89+
- Firefox 86+
- Edge 89+
- Safari 14.1+

## Known Limitations

- Media files must be WebRTC compatible formats
- Large files may require additional buffering
- Network conditions can affect streaming quality
- Some browsers may require manual playback initiation

## Troubleshooting

1. **Connection Issues**
   - Ensure WebSocket server is running
   - Check browser console for detailed errors
   - Verify WebRTC compatibility

2. **Playback Problems**
   - Use "Force Play" for autoplay issues
   - Check media format compatibility
   - Monitor network conditions

3. **Synchronization Issues**
   - Adjust sync threshold if needed
   - Ensure stable network connection
   - Monitor browser console logs
