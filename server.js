require("dotenv").config();
const express = require("express");
const http = require("http");
const { SerialPort } = require("serialport");
const socketIo = require("socket.io");
const nodemailer = require("nodemailer");

// Destructure env variables with defaults
const {
    ARDUINO_PORT = "COM5",
    BAUD_RATE = 115200,
    PORT = 3000,
    HIGH_TEMP_THRESHOLD = 30.0,
    SENDER_USER,
    SENDER_PASS,
    OWNER_EMAIL1,
    OWNER_EMAIL2,
} = process.env;

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
app.use(express.static("public"));

// Configure nodemailer
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: SENDER_USER, pass: SENDER_PASS },
});
const ownerEmails = [OWNER_EMAIL1, OWNER_EMAIL2].join(", ");

// Email templates
const emailTemplates = {
    alarm: {
        subject: "🚨 Security Alert - Alarm Triggered!",
        text: ({ armed, active, temp }) =>
            `SECURITY ALERT: Alarm Triggered!\n\nStatus Details:\n- Armed: ${armed}\n- Active: ${active}\n- Temperature: ${temp.toFixed(
                1
            )}°C\n\nPlease check the system immediately.`,
        html: ({ armed, active, temp }) => `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Security Alert - Alarm Triggered!</title>
      </head>
      <body style="margin:0; padding:0; background:#f0f2f5; font-family:'Segoe UI',Arial,sans-serif; line-height:1.6;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5; padding:20px;">
          <tr>
            <td align="center">
              <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#fff; border-radius:16px; overflow:hidden; box-shadow:0 4px 12px rgba(0,0,0,0.15);">
                <!-- Header -->
                <tr>
                  <td style="background:linear-gradient(135deg, #ff4b4b 0%, #cf2e2e 100%); padding:30px 20px; text-align:center;">
                    <h1 style="margin:0; color:#fff; font-size:28px; font-weight:600;">SECURITY ALERT</h1>
                    <p style="margin:8px 0 0 0; color:rgba(255,255,255,0.9); font-size:16px;">Alarm System Triggered</p>
                  </td>
                </tr>
                
                <!-- Content -->
                <tr>
                  <td style="padding:30px 25px;">
                    <div style="background:#fff4f4; border-left:4px solid #ff4b4b; padding:15px; margin-bottom:25px;">
                      <p style="margin:0; color:#cc0000; font-size:16px; font-weight:600;">
                        ⚠️ Immediate attention required! The security system has detected unusual activity.
                      </p>
                    </div>
                    
                    <h2 style="color:#333; margin:0 0 20px 0; font-size:20px;">System Status Details</h2>
                    <table role="presentation" width="100%" style="border-collapse:separate; border-spacing:0 8px;">
                      <tr>
                        <td style="padding:12px 15px; background:#f8f9fa; border-radius:8px; width:40%;">
                          <strong style="color:#666;">System Armed</strong>
                        </td>
                        <td style="padding:12px 15px; background:#f8f9fa; border-radius:8px; color:#333;">
                          ${armed ? "✅ Yes" : "❌ No"}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:12px 15px; background:#f8f9fa; border-radius:8px;">
                          <strong style="color:#666;">Alarm Active</strong>
                        </td>
                        <td style="padding:12px 15px; background:#f8f9fa; border-radius:8px; color:#333;">
                          ${active ? "🔴 Active" : "🟢 Inactive"}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:12px 15px; background:#f8f9fa; border-radius:8px;">
                          <strong style="color:#666;">Temperature</strong>
                        </td>
                        <td style="padding:12px 15px; background:#f8f9fa; border-radius:8px; color:#333;">
                          🌡️ ${temp.toFixed(1)}°C
                        </td>
                      </tr>
                    </table>
                    
                    <div style="margin-top:30px; padding:20px; background:#f8f9fa; border-radius:8px; text-align:center;">
                      <p style="margin:0; color:#666; font-size:15px;">
                        For immediate assistance or to verify this alert, please check your security system dashboard or contact support.
                      </p>
                    </div>
                  </td>
                </tr>
                
                <!-- Footer -->
                <tr>
                  <td style="background:#f8f9fa; padding:20px; text-align:center; border-top:1px solid #eee;">
                    <p style="margin:0; color:#666; font-size:13px;">
                      © ${new Date().getFullYear()} Sentinel Security System<br>
                      <span style="color:#888; font-size:12px;">This is an automated message. Please do not reply.</span>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `,
    },
    highTemp: {
        subject: "🌡️ High Temperature Alert!",
        text: ({ armed, active, temp }) =>
            `HIGH TEMPERATURE ALERT!\n\nStatus Details:\n- Armed: ${armed}\n- Active: ${active}\n- Temperature: ${temp.toFixed(
                1
            )}°C\n\nImmediate attention is required.`,
        html: ({ armed, active, temp }) => `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>High Temperature Alert!</title>
      </head>
      <body style="margin:0; padding:0; background:#f0f2f5; font-family:'Segoe UI',Arial,sans-serif; line-height:1.6;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5; padding:20px;">
          <tr>
            <td align="center">
              <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#fff; border-radius:16px; overflow:hidden; box-shadow:0 4px 12px rgba(0,0,0,0.15);">
                <!-- Header -->
                <tr>
                  <td style="background:linear-gradient(135deg, #ff9800 0%, #f57c00 100%); padding:30px 20px; text-align:center;">
                    <h1 style="margin:0; color:#fff; font-size:28px; font-weight:600;">TEMPERATURE ALERT</h1>
                    <p style="margin:8px 0 0 0; color:rgba(255,255,255,0.9); font-size:16px;">High Temperature Detected</p>
                  </td>
                </tr>
                
                <!-- Content -->
                <tr>
                  <td style="padding:30px 25px;">
                    <div style="background:#fff8f0; border-left:4px solid #ff9800; padding:15px; margin-bottom:25px;">
                      <p style="margin:0; color:#e65100; font-size:16px; font-weight:600;">
                        ⚠️ Warning: Temperature exceeds safe threshold!
                      </p>
                    </div>
                    
                    <h2 style="color:#333; margin:0 0 20px 0; font-size:20px;">System Status Details</h2>
                    <table role="presentation" width="100%" style="border-collapse:separate; border-spacing:0 8px;">
                      <tr>
                        <td style="padding:12px 15px; background:#f8f9fa; border-radius:8px; width:40%;">
                          <strong style="color:#666;">Temperature</strong>
                        </td>
                        <td style="padding:12px 15px; background:#fff8f0; border-radius:8px; color:#e65100; font-weight:600;">
                          🌡️ ${temp.toFixed(1)}°C
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:12px 15px; background:#f8f9fa; border-radius:8px;">
                          <strong style="color:#666;">System Armed</strong>
                        </td>
                        <td style="padding:12px 15px; background:#f8f9fa; border-radius:8px; color:#333;">
                          ${armed ? "✅ Yes" : "❌ No"}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:12px 15px; background:#f8f9fa; border-radius:8px;">
                          <strong style="color:#666;">Alarm Status</strong>
                        </td>
                        <td style="padding:12px 15px; background:#f8f9fa; border-radius:8px; color:#333;">
                          ${active ? "🔴 Active" : "🟢 Inactive"}
                        </td>
                      </tr>
                    </table>
                    
                    <div style="margin-top:30px; padding:20px; background:#f8f9fa; border-radius:8px; text-align:center;">
                      <p style="margin:0; color:#666; font-size:15px;">
                        Please check ventilation and cooling systems immediately. High temperatures may indicate system malfunction or environmental issues.
                      </p>
                    </div>
                  </td>
                </tr>
                
                <!-- Footer -->
                <tr>
                  <td style="background:#f8f9fa; padding:20px; text-align:center; border-top:1px solid #eee;">
                    <p style="margin:0; color:#666; font-size:13px;">
                      © ${new Date().getFullYear()} Sentinel Security System<br>
                      <span style="color:#888; font-size:12px;">This is an automated message. Please do not reply.</span>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `,
    },
};

// Unified email sender
const sendEmail = (templateKey, status) => {
    const template = emailTemplates[templateKey];
    if (!template) return;
    const mailOptions = {
        from: `Sentinel <${SENDER_USER}>`,
        to: ownerEmails,
        subject: template.subject,
        text: template.text(status),
        html: template.html(status),
    };
    transporter.sendMail(mailOptions, (error, info) =>
        error
            ? console.error(`Error sending ${templateKey} email:`, error)
            : console.log(`${templateKey} email sent:`, info.response)
    );
};

let alarmEmailSent = false,
    highTempEmailSent = false;

// Set up serial port and buffer incoming data
const arduinoPort = new SerialPort({
    path: ARDUINO_PORT,
    baudRate: +BAUD_RATE,
});
let serialBuffer = "";

arduinoPort.on("error", (err) => console.error("Serial Port Error:", err));
arduinoPort.on("data", (data) => {
    serialBuffer += data.toString();
    const lines = serialBuffer.split("\n");
    serialBuffer = lines.pop(); // keep incomplete line
    lines.forEach((line) => {
        line = line.trim();
        if (!line) return;
        try {
            const status = JSON.parse(line);
            io.emit("status", status);
            // Alarm email logic
            if (status.active && !alarmEmailSent) {
                sendEmail("alarm", status);
                alarmEmailSent = true;
            } else if (!status.active) alarmEmailSent = false;
            // High temperature email logic
            if (status.temp > HIGH_TEMP_THRESHOLD && !highTempEmailSent) {
                sendEmail("highTemp", status);
                highTempEmailSent = true;
            } else if (status.temp <= HIGH_TEMP_THRESHOLD)
                highTempEmailSent = false;
        } catch (error) {
            console.error("Status from Arduino:", line);
        }
    });
});

// Socket.IO connection handling
io.on("connection", (socket) => {
    console.log("Client connected");
    socket.on("command", (cmd) => {
        if (!cmd.endsWith("\n")) cmd += "\n";
        arduinoPort.write(cmd);
    });
    socket.on("disconnect", () => console.log("Client disconnected"));
});

server.listen(PORT, () =>
    console.log(`Server running at http://localhost:${PORT}`)
);
