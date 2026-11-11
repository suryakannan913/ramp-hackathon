import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import http from "http";
import twilio from "twilio";
import * as dotenv from "dotenv";

dotenv.config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/voice/stream" });

/**
 * B3.5: Validate provider signatures on webhooks.
 */
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN || "fake-token";

app.post("/voice/callback", twilio.webhook({ authToken: twilioAuthToken }), (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  
  // B3.7: Narrow script for verification
  twiml.say("Hello, this is the Bank-Change Guard verification service. Please wait while we connect your call.");
  
  const connect = twiml.connect();
  // B3.6: Bridge audio to the media stream
  connect.stream({ url: `wss://${req.headers.host}/voice/stream` });
  
  res.type("text/xml");
  res.send(twiml.toString());
});

wss.on("connection", (ws: WebSocket) => {
  console.log("Voice stream connected");

  let openAiWs: WebSocket | null = null;
  let streamSid: string | null = null;
  let transcript = "";

  const connectOpenAI = () => {
    const url = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01";
    openAiWs = new WebSocket(url, {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "OpenAI-Beta": "realtime=v1",
      },
    });

    openAiWs.on("open", () => {
      console.log("Connected to OpenAI Realtime");
      
      // Configure session for verification task
      openAiWs?.send(JSON.stringify({
        type: "session.update",
        session: {
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
          voice: "alloy",
          input_audio_format: "g711_ulaw",
          output_audio_format: "g711_ulaw",
          turn_detection: { type: "server_vad" },
        },
      }));
    });

    openAiWs.on("message", (data) => {
      const response = JSON.parse(data.toString());
      
      if (response.type === "response.audio.delta" && response.delta) {
        ws.send(JSON.stringify({
          event: "media",
          streamSid,
          media: { payload: response.delta },
        }));
      }

      // B3.10: Accumulate transcript
      if (response.type === "response.audio_transcript.done") {
        transcript += `\n[Agent]: ${response.transcript}`;
      }
      if (response.type === "conversation.item.input_audio_transcription.completed") {
        transcript += `\n[Vendor]: ${response.transcript}`;
      }
    });
  };

  ws.on("message", (data) => {
    const msg = JSON.parse(data.toString());
    switch (msg.event) {
      case "start":
        streamSid = msg.start.streamSid;
        console.log(`Stream started: ${streamSid}`);
        connectOpenAI();
        break;
      case "media":
        if (openAiWs?.readyState === WebSocket.OPEN) {
          openAiWs.send(JSON.stringify({
            type: "input_audio_buffer.append",
            audio: msg.media.payload,
          }));
        }
        break;
      case "stop":
        console.log("Stream stopped. Final Transcript:", transcript);
        openAiWs?.close();
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
