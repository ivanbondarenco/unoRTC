//Alojamiento del servidor
const firebaseConfig = {
  apiKey: "AIzaSyBb88F6ViZawLmOiOGdy20l9JM25annP5M",
  authDomain: "webrtc---js.firebaseapp.com",
  projectId: "webrtc---js",
  storageBucket: "webrtc---js.appspot.com",
  messagingSenderId: "1065536759484",
  appId: "1:1065536759484:web:d08055c6aef1d6b7d992b9",
  measurementId: "G-3K9F5FT88T"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const firestore = firebase.firestore();

const servers = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 10,
};

// Estado Global
const pc = new RTCPeerConnection(servers);
let localStream = null;
let remoteStream = null;

// Elementos HTML
const webcamButton = document.getElementById('webcamButton');
const webcamVideo = document.getElementById('webcamVideo');
const callButton = document.getElementById('callButton');
const callInput = document.getElementById('callInput');
const answerButton = document.getElementById('answerButton');
const remoteVideo = document.getElementById('remoteVideo');
const hangupButton = document.getElementById('hangupButton');

// 1. Establece video y audio

webcamButton.onclick = async () => {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  remoteStream = new MediaStream();

    // Agregar las pistas de la transmisión local a la conexión peer-to-peer (PC)
  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream);
  });

  // Manejar  el video recibidas de la transmisión remota y agregarlas a la transmisión remota
  pc.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => {
      remoteStream.addTrack(track);
    });
  };


// Establecer la fuente del video de la webcam al stream local
  webcamVideo.srcObject = localStream;
   // Establecer la fuente del video remoto al stream remoto
  remoteVideo.srcObject = remoteStream;

 // Habilitar los botones de llamada, respuesta y cuelgue
  callButton.disabled = false;
  answerButton.disabled = false;
  webcamButton.disabled = true;
  hangupButton.disabled = false;
};

// 2.
callButton.onclick = async () => {
  //Referencias para Firestore
  const callDoc = firestore.collection('calls').doc();
  const offerCandidates = callDoc.collection('offerCandidates');
  const answerCandidates = callDoc.collection('answerCandidates');

  callInput.value = callDoc.id;

  // Obtiene datos para el que llama, se guarda en la BD
  pc.onicecandidate = (event) => {
    event.candidate && offerCandidates.add(event.candidate.toJSON());
  };

  // Crear oferta
  const offerDescription = await pc.createOffer();
  await pc.setLocalDescription(offerDescription);

  const offer = {
    sdp: offerDescription.sdp,
    type: offerDescription.type,
  };

  await callDoc.set({ offer });


// Escuchar por la respuesta remota
  callDoc.onSnapshot((snapshot) => {
    const data = snapshot.data();
    if (!pc.currentRemoteDescription && data?.answer) {
      const answerDescription = new RTCSessionDescription(data.answer);
      pc.setRemoteDescription(answerDescription);
    }
  });

  // Cuando se responda, agregar el candidato a la conexión entre pares
  answerCandidates.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const candidate = new RTCIceCandidate(change.doc.data());
        pc.addIceCandidate(candidate);
      }
    });
  });

  
};

// 3. Responder llamada con un ID unico
answerButton.onclick = async () => {
  const callId = callInput.value;
  const callDoc = firestore.collection('calls').doc(callId);
  const answerCandidates = callDoc.collection('answerCandidates');
  const offerCandidates = callDoc.collection('offerCandidates');

  pc.onicecandidate = (event) => {
    event.candidate && answerCandidates.add(event.candidate.toJSON());
  };

  const callData = (await callDoc.get()).data();

  const offerDescription = callData.offer;
  await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

  const answerDescription = await pc.createAnswer();
  await pc.setLocalDescription(answerDescription);

  const answer = {
    type: answerDescription.type,
    sdp: answerDescription.sdp,
  };

  await callDoc.update({ answer });

  offerCandidates.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      console.log(change);
      if (change.type === 'added') {
        let data = change.doc.data();
        pc.addIceCandidate(new RTCIceCandidate(data));
      }
    });
  });
};

// 4. Finalizar llamada
hangupButton.onclick = () => {
  // Cierra peer conection
  pc.close();
  
  // Resetea streams
  localStream.getTracks().forEach(track => track.stop());
  localStream = null;
  remoteStream.getTracks().forEach(track => track.stop());
  remoteStream = null;
  
  // Resetea elementos de video
  webcamVideo.srcObject = null;
  remoteVideo.srcObject = null;

  // Activa/Desactiva videos
  webcamButton.disabled = false;
  callButton.disabled = true;
  answerButton.disabled = true;
  hangupButton.disabled = true;
};