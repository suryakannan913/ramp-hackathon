import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import http from "http";
import twilio from "twilio";
import * as dotenv from "dotenv";

dotenv.config();

const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN?.trim();
const publicOrigin = process.env.VOICE_PUBLIC_ORIGIN?.trim();
const openAiKey = process.env.OPENAI_API_KEY?.trim();
if (!twilioAuthToken || !publicOrigin || !openAiKey)
  throw new Error(
    "Configure TWILIO_AUTH_TOKEN, VOICE_PUBLIC_ORIGIN, and OPENAI_API_KEY before starting the voice worker.",
  );

const publicUrl = new URL(publicOrigin);
if (
  publicUrl.protocol !== "https:" ||
  publicUrl.href !== publicUrl.origin + "/"
)
  throw new Error(
    "VOICE_PUBLIC_ORIGIN must be an HTTPS origin without a path.",
  );

const streamUrl = new URL("/voice/stream", publicUrl);
streamUrl.protocol = "wss:";
const callbackUrl = new URL("/voice/callback", publicUrl).href;

const app = express();
app.use(express.urlencoded({ extended: false, limit: "32kb" }));
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
server.on("upgrade", (req, socket, head) => {
  const signature = req.headers["x-twilio-signature"];
  if (
    req.url !== streamUrl.pathname ||
    typeof signature !== "string" ||
    !twilio.validateRequest(twilioAuthToken, signature, streamUrl.href, {})
  ) {
    socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
});

/**
 * B3.5: Validate provider signatures on webhooks.
 */

app.post(
  "/voice/callback",
  twilio.webhook({ authToken: twilioAuthToken, url: callbackUrl }),
  (req, res) => {
    const twiml = new twilio.twiml.VoiceResponse();

    // B3.7: Narrow script for verification
    twiml.say(
      "Hello, this is the Bank-Change Guard verification service. Please wait while we connect your call.",
    );

    const connect = twiml.connect();
    // B3.6: Bridge audio to the media stream
    connect.stream({ url: streamUrl.href });

    res.type("text/xml");
    res.send(twiml.toString());
  },
);

wss.on("connection", (ws: WebSocket) => {
  console.log("Voice stream connected");

  let openAiWs: WebSocket | null = null;
  let streamSid: string | null = null;
  function readEvent(data: Buffer | ArrayBuffer | Buffer[]) {
    try {
      const parsed: unknown = JSON.parse(data.toString());
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }

  const connectOpenAI = () => {
    const model =
      process.env.OPENAI_REALTIME_MODEL?.trim() || "gpt-realtime-1.5";
    const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`;
    openAiWs = new WebSocket(url, {
      headers: {
        Authorization: `Bearer ${openAiKey}`,
      },
    });

    openAiWs.on("open", () => {
      console.log("Connected to OpenAI Realtime");

      // Configure session for verification task
      openAiWs?.send(
        JSON.stringify({
          type: "session.update",
          session: {
            type: "realtime",
            instructions: `
            You are a professional Accounts Payable verification assistant.
            Goal: Verify if the vendor contact requested a bank account change.
            Script:
            1. Identify yourself and the purpose (AP verification).
            2. Verify you are speaking to the correct contact for the vendor.
            3. Ask if they requested a change to their bank details recently.
            4. Confirm ONLY the last four digits of the new account if they say yes.
            5. Do NOT ask for full account numbers or passwords.
            6. If they deny the request, thank them and end the call.
          `,
            audio: {
              input: {
                format: { type: "audio/pcmu" },
                turn_detection: { type: "server_vad" },
              },
              output: { format: { type: "audio/pcmu" }, voice: "alloy" },
            },
          },
        }),
      );
    });

    openAiWs.on("error", () => ws.close(1011, "Voice provider unavailable"));
    openAiWs.on("close", () => ws.close());
    openAiWs.on("message", (data) => {
      const response = readEvent(data) as {
        type?: string;
        delta?: string;
      } | null;
      if (response?.type === "error") {
        ws.close(1011, "Voice provider rejected the session");
        return;
      }
      if (response?.type === "session.updated") {
        openAiWs?.send(JSON.stringify({ type: "response.create" }));
      }
      if (
        response?.type === "response.output_audio.delta" &&
        response.delta &&
        streamSid &&
        ws.readyState === WebSocket.OPEN
      ) {
        ws.send(
          JSON.stringify({
            event: "media",
            streamSid,
            media: { payload: response.delta },
          }),
        );
      }
    });
  };

  ws.on("message", (data) => {
    const msg = readEvent(data) as {
      event?: string;
      start?: { streamSid?: string };
      media?: { payload?: string };
    } | null;
    if (!msg) {
      ws.close(1007, "Invalid media stream message");
      return;
    }
    switch (msg.event) {
      case "start":
        if (streamSid || typeof msg.start?.streamSid !== "string") {
          ws.close(1008, "Invalid stream start");
          break;
        }
        streamSid = msg.start.streamSid;
        console.log(`Stream started: ${streamSid}`);
        connectOpenAI();
        break;
      case "media":
        if (
          openAiWs?.readyState === WebSocket.OPEN &&
          typeof msg.media?.payload === "string"
        ) {
          openAiWs.send(
            JSON.stringify({
              type: "input_audio_buffer.append",
              audio: msg.media.payload,
            }),
          );
        }
        break;
      case "stop":
        ws.close();
        break;
    }
  });

  ws.on("close", () => {
    openAiWs?.close();
  });
});

const PORT = process.env.VOICE_WORKER_PORT || 3001;
server.listen(PORT, () => {
  console.log(`Voice worker listening on port ${PORT}`);
});
