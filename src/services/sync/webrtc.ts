export const createPeerConnection = (
  config: { iceServers: RTCIceServer[] },
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
