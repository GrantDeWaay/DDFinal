// Importing necessary modules
import './style.css';  // Importing the CSS for styling
import { io } from 'socket.io-client';  // Importing socket.io-client for real-time communication

// Establishing a WebSocket connection to the server running on localhost:3001
const socket = io('http://localhost:3001'); 

// Getting the current URL to determine if the user is joining an existing room or creating a new one
const currentUrl = window.location.href;

// WebRTC configuration for ICE servers (used for NAT traversal to establish peer-to-peer connections)
const servers = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],  // Google's public STUN servers
    },
  ],
  iceCandidatePoolSize: 10,  // Maximum number of ICE candidates to gather
};

// Initialize a new RTCPeerConnection with the specified configuration
const pc = new RTCPeerConnection(servers);

// Variables to store local and remote streams
let localStream = null;  // Local webcam/audio stream
let remoteStream = new MediaStream();  // Remote peer's stream

// DOM elements for video streams and controls
const webcamVideo = document.getElementById('webcamVideo');  // Element to show local webcam stream
const callInput = document.getElementById('callInput');  // Input field for room URL
const copyButton = document.getElementById('copyButton');  // Button to copy the room URL
const remoteVideo = document.getElementById('remoteVideo');  // Element to show remote peer stream
const createRoom = document.getElementById('createRoom');  // Button to create or join room

// Set the srcObject of video elements to the respective streams
webcamVideo.srcObject = localStream;
remoteVideo.srcObject = remoteStream;

// Update the button text if the URL indicates the user is joining a room
if (currentUrl.includes("/room/")) {
  createRoom.textContent = "Join Room";  // Change button text to "Join Room"
}

// Handle incoming remote tracks from the peer connection
pc.ontrack = (event) => {
  console.log("pc.ontrack triggered with streams:", event.streams);

  // Add each track from the remote stream to the MediaStream object
  event.streams[0].getTracks().forEach((track) => {
    remoteStream.addTrack(track);
  });

  // Set the `remoteVideo` element to display the remote stream
  remoteVideo.srcObject = remoteStream;
};

// Function to access webcam and microphone
const getWebcam = async () => {
  try {
    // Request video and audio access from the user's device
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });

    // Add each track of the local stream to the peer connection
    localStream.getTracks().forEach((track) => {
      pc.addTrack(track, localStream);
    });

    // Remove the audio track (optional, depending on use case)
    localStream.removeTrack(localStream.getAudioTracks()[0]);

    // Update video elements with the local and remote streams
    webcamVideo.srcObject = localStream;
    remoteVideo.srcObject = remoteStream;

    // Check if the user is joining a room or hosting one
    if (currentUrl.includes("/room/")) {
      join();  // Join an existing room
      console.log("join");
    } else {
      host();  // Create a new room and host
    }
  } catch (err) {
    console.error("Error accessing webcam:", err);
  }
};

// Monitor connection state changes for WebRTC
pc.onconnectionstatechange = () => {
  console.log("Connection state:", pc.connectionState);
};

// Handle "Create Room" button click
createRoom.onclick = () => {
  // Show additional elements for creating or joining a room
  const showElements = document.getElementsByClassName("show");
  const hideElement = document.getElementById("createRoom");

  // Make video elements visible
  for (const ele of showElements) {
    ele.hidden = false;
  }

  // Show additional elements when creating a room (only when the URL is not for a room)
  if (!currentUrl.includes("/room/")) {
    const show2Elements = document.getElementsByClassName("show2");
    for (const ele of show2Elements) {
      ele.hidden = false;
    }
  }

  // Hide the "Create Room" button after it's clicked
  hideElement.hidden = true;

  // Call the function to start webcam access
  getWebcam();
};

console.log(currentUrl);

// Function to host a room
function host() {
  console.log("host function called");

  // A queue to collect ICE candidates during the connection process
  let iceCandidatesQueue = [];  

  // Monitor the ICE gathering process for the peer connection
  pc.onicegatheringstatechange = () => {
    console.log("ICE Gathering State:", pc.iceGatheringState);

    if (pc.iceGatheringState === "complete") {
      sendIceCandidates();  // If ICE gathering is complete, send collected candidates
    }
  };

  // Event to collect ICE candidates and add them to the queue
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      console.log("New ICE Candidate:", event.candidate);
      iceCandidatesQueue.push(event.candidate.toJSON());
    }
  };

  // Function to send the ICE candidates to the server
  const sendIceCandidates = () => {
    if (iceCandidatesQueue.length > 0) {
      socket.emit("sendIceCandidates", JSON.stringify(iceCandidatesQueue));  // Send the candidates to the server
      iceCandidatesQueue = [];  // Clear the queue after sending
    }
  };

  // Handle server response with a room code
  socket.on('roomCode', (message) => {
    console.log("socket.on('roomCode') triggered");
    callInput.value = `http://localhost:3000/room/${message}`;  // Set the room URL in the input field
    copyButton.onclick = () => {
      callInput.select();
      navigator.clipboard.writeText(callInput.value);  // Copy the URL to the clipboard
      copyButton.textContent = "Copied!";  // Update button text
      setTimeout(() => copyButton.textContent = "Copy", 2000);  // Reset button text after 2 seconds
    };
  });

  socket.emit('createRoom');  // Emit the "createRoom" event to the server

  socket.on('createOffer', async (message) => {
    const offerDescription = await pc.createOffer();  // Create an offer for the peer connection
    await pc.setLocalDescription(offerDescription);  // Set the local description for the offer
    socket.emit('sendOffer', JSON.stringify(offerDescription), message);  // Send the offer to the server
  });

  // Handle incoming ICE candidates from the remote peer
  socket.on('receiveIceCandidates', (message) => {
    const candidates = JSON.parse(message);
    candidates.forEach(async (candidateData) => {
      const candidate = new RTCIceCandidate(candidateData);
      await pc.addIceCandidate(candidate);
      console.log("Added ICE Candidate:", candidate);
    });
  });

  // Handle the remote peer's answer description
  socket.on('receiveAnswerDescription', async (message) => {
    console.log("socket.on('receiveAnswerDescription') triggered");
    const answerDescription = new RTCSessionDescription(message);
    await pc.setRemoteDescription(answerDescription);
    console.log(pc);  // Log the peer connection for debugging
  });

  // Handle additional ICE candidates during the connection process
  socket.on('receiveAnswerCandidate', (message) => {
    console.log("socket.on('receiveAnswerCandidate') triggered");
    const parsedOffer = JSON.parse(message);
    const iceCandidate = new RTCIceCandidate(parsedOffer);
    pc.addIceCandidate(iceCandidate);
    console.log(pc);
  });
}

// Function to join an existing room
function join() {
  console.log("join function called");

  const matches = currentUrl.match(/room\/(.+)$/);  // Extract room ID from the URL
  const callId = matches[1];
  console.log("Joining room with ID:", callId);

  socket.emit('joinRoom', callId);  // Emit the "joinRoom" event to the server with the room ID

  // Handle incoming offer from the host (peer)
  socket.on('receivedOffer', async (callData, author) => {
    console.log("socket.on('receivedOffer') triggered");

    const parsedOffer = JSON.parse(callData);  // Parse the offer data
    await pc.setRemoteDescription(new RTCSessionDescription(parsedOffer));  // Set the remote description

    // Create an answer and send it back to the host
    const answerDescription = await pc.createAnswer();
    pc.onicecandidate = (event) => {
      event.candidate && socket.emit("sendAnswerCandidate", JSON.stringify(event.candidate.toJSON()), author);  // Send ICE candidate
    };
    await pc.setLocalDescription(answerDescription);  // Set local description for the answer
    socket.emit('sendAnswerDescription', answerDescription, author);  // Send the answer to the server
  });

  // Handle incoming ICE candidates from the host
  socket.on('receiveOfferCandidate', (offer, user) => {
    console.log("socket.on('receiveOfferCandidate') triggered");
    const parsedOffer = JSON.parse(offer);
    const iceCandidate = new RTCIceCandidate(parsedOffer);
    pc.addIceCandidate(iceCandidate);
  });
}
