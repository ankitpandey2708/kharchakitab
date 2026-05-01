export const SIGNALING_URL =
  process.env.NEXT_PUBLIC_SIGNALING_URL || "ws://127.0.0.1:7071";

const TURN_USERNAME = process.env.NEXT_PUBLIC_TURN_USERNAME;
const TURN_CREDENTIAL = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;

export const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  ...(TURN_USERNAME && TURN_CREDENTIAL
    ? [
      {
        urls: [
          "turn:global.relay.metered.ca:80",
          "turn:global.relay.metered.ca:80?transport=tcp",
          "turn:global.relay.metered.ca:443",
          "turns:global.relay.metered.ca:443?transport=tcp",
        ],
        username: TURN_USERNAME,
        credential: TURN_CREDENTIAL,
      },
    ]
    : []),
];
