export type IceCandidatePayload = {
  candidate: RTCIceCandidateInit;
};

export type WebRTCConfig = {
  iceServers: RTCIceServer[];
};

export const createPeerConnection = (
  config: WebRTCConfig,
  onIceCandidate: (candidate: RTCIceCandidateInit) => void,
  onDataChannel?: (channel: RTCDataChannel) => void,
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void
) => {
  const pc = new RTCPeerConnection({ iceServers: config.iceServers });
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      onIceCandidate(event.candidate.toJSON());
    }
  };

  pc.onconnectionstatechange = () => {
    onConnectionStateChange?.(pc.connectionState);
  };

  if (onDataChannel) {
    pc.ondatachannel = (event) => {
      onDataChannel(event.channel);
    };
  }
  return pc;
};

export const waitForDataChannelOpen = (channel: RTCDataChannel) =>
  new Promise<void>((resolve, reject) => {
    if (channel.readyState === "open") {
      resolve();
      return;
    }
    const handleOpen = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error("DataChannel failed to open"));
    };
    const cleanup = () => {
      channel.removeEventListener("open", handleOpen);
      channel.removeEventListener("error", handleError);
    };
    channel.addEventListener("open", handleOpen);
    channel.addEventListener("error", handleError);
  });
