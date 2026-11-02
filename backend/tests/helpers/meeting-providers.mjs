import http from "node:http";
import net from "node:net";
import { once } from "node:events";

// Protocol-level stand-ins: the actual fetch and Nodemailer clients run unchanged.
export async function startMeetingProviders() {
  const calls = [];
  const messages = [];
  const controls = { rejectPanelist: false, zoomFailure: false, zoomTimeout: false };
  const sockets = new Set();
  const zoom = http.createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    calls.push({ path: req.url, method: req.method, body });
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/oauth/token" && req.method === "POST") {
      res.end(JSON.stringify({ access_token: "local-test-token", expires_in: 3600 }));
      return;
    }
    if (req.url === "/v2/users/host%40example.invalid/meetings" && req.method === "POST") {
      if (controls.zoomTimeout) return;
      if (controls.zoomFailure) {
        res.writeHead(403).end(JSON.stringify({ code: 200, message: "Local simulated permission failure" }));
        return;
      }
      const id = 900000 + calls.length;
      res.writeHead(201).end(JSON.stringify({ id, join_url: `https://zoom.us/j/${id}`, start_url: "https://zoom.us/s/private-host-link" }));
      return;
    }
    res.writeHead(501).end(JSON.stringify({ message: "Unmodeled test dependency endpoint" }));
  });
  zoom.on("connection", (socket) => { sockets.add(socket); socket.on("close", () => sockets.delete(socket)); });
  const smtp = net.createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => {});
    socket.setEncoding("utf8");
    socket.write("220 local.test ESMTP ready\r\n");
    let buffer = "", data = false, content = [], recipients = [], auth = 0;
    socket.on("data", (chunk) => {
      buffer += chunk;
      while (buffer.includes("\n")) {
        const index = buffer.indexOf("\n");
        const line = buffer.slice(0, index).replace(/\r$/, "");
        buffer = buffer.slice(index + 1);
        if (data) {
          if (line === ".") {
            messages.push({ recipients: [...recipients], body: content.join("\n") });
            data = false;
            socket.write("250 Message accepted\r\n");
          } else content.push(line);
          continue;
        }
        if (auth === 1) { auth = 2; socket.write("334 UGFzc3dvcmQ6\r\n"); continue; }
        if (auth === 2) { auth = 0; socket.write("235 Authenticated\r\n"); continue; }
        if (/^(EHLO|HELO)/i.test(line)) socket.write("250-local.test\r\n250-AUTH PLAIN LOGIN\r\n250 SIZE 10485760\r\n");
        else if (/^AUTH PLAIN/i.test(line)) socket.write("235 Authenticated\r\n");
        else if (/^AUTH LOGIN/i.test(line)) { auth = 1; socket.write("334 VXNlcm5hbWU6\r\n"); }
        else if (/^MAIL FROM:/i.test(line)) { recipients = []; content = []; socket.write("250 Sender accepted\r\n"); }
        else if (/^RCPT TO:/i.test(line)) {
          const address = line.match(/<([^>]+)>/)?.[1]?.toLowerCase();
          if (!address || (controls.rejectPanelist && address.startsWith("panelist@"))) socket.write("550 Recipient rejected\r\n");
          else { recipients.push(address); socket.write("250 Recipient accepted\r\n"); }
        } else if (/^DATA$/i.test(line)) { data = true; socket.write("354 End with a dot\r\n"); }
        else if (/^QUIT$/i.test(line)) socket.end("221 Bye\r\n");
        else socket.write("250 OK\r\n");
      }
    });
  });
  zoom.listen(0, "127.0.0.1");
  smtp.listen(0, "127.0.0.1");
  await Promise.all([once(zoom, "listening"), once(smtp, "listening")]);
  return {
    zoomBase: `http://127.0.0.1:${zoom.address().port}`,
    smtpPort: smtp.address().port,
    calls, messages, controls,
    async close() {
      for (const socket of sockets) socket.destroy();
      await Promise.all([new Promise((resolve) => zoom.close(resolve)), new Promise((resolve) => smtp.close(resolve))]);
    },
  };
}
