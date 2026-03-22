# WebRTC: Signaling Server vs TURN Server

This document explains the difference between `NEXT_PUBLIC_SIGNALING_URL` and `metered.ca` in the context of the WebRTC application setup.

They serve two completely different—but equally essential—roles in establishing a peer-to-peer (P2P) connection using WebRTC.

## 1. `NEXT_PUBLIC_SIGNALING_URL` (The Signaling Server)

This environment variable points to a WebSocket server that you are hosting (in production, `wss://kharchakitab-3rge.onrender.com`).

* **What it does:** It acts as the "matchmaker." Before two browsers can talk directly to each other, they need to know how to find one another. The signaling server allows peers to exchange essential connection metadata (like Session Description Protocol (SDP) and ICE candidates). 
* **When is it used:** It is only used during the initial connection setup (the handshake) or if peers need to renegotiate the connection.
* **Does it pass media/data?** No. Once the initial handshake is successfully completed, the peers communicate directly with each other (or through a TURN server), and the signaling server is no longer involved in transferring your application state/media.

## 2. `metered.ca` (The TURN/ICE Server via Third-Party Service)

`metered.ca` is a third-party service provider that gives you access to **TURN** (Traversal Using Relays around NAT) servers, which are part of your `ICE_SERVERS` configuration.

* **What it does:** It helps establish the actual connection when firewalls get in the way. Usually, WebRTC tries to connect peers directly to each other using their public IPs (discovered via the Google STUN server in your config). However, if one or both users are behind strict corporate firewalls or symmetric NATs, a direct connection is physically impossible. 
* **When is it used:** The connection falls back to using `metered.ca`'s TURN servers as a middleman.
* **Does it pass media/data?** Yes. If a direct P2P connection fails, the TURN server actively relays all of the ongoing data (video, audio, or data channels) between the two peers for the duration of the session. 

## Analogy

Imagine you want to send a secret package to a friend.

* **The Signaling Server (`NEXT_PUBLIC_SIGNALING_URL`)** is like calling your friend on the phone to agree on *where* and *how* to meet up and exchange the package. Once you agree, you hang up.
* **The TURN Server (`metered.ca`)** is like using a trusted courier service. You wanted to meet in person, but you're both stuck inside locked buildings. So, you give the package to the courier (`metered.ca`), and the courier delivers it to your friend.
