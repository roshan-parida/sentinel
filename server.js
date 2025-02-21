require("dotenv").config();

const express = require("express");
const http = require("http");
const { SerialPort } = require("serialport");
const socketIo = require("socket.io");
const nodemailer = require("nodemailer");

const ARDUINO_PORT = process.env.ARDUINO_PORT || "COM5";
const BAUD_RATE = parseInt(process.env.BAUD_RATE, 10) || 115200;
const PORT = process.env.PORT || 3000;
const HIGH_TEMP_THRESHOLD = parseFloat(process.env.HIGH_TEMP_THRESHOLD) || 30.0;

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files from the 'public' directory
app.use(express.static("public"));

// Setup nodemailer transporter
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.SENDER_USER,
        pass: process.env.SENDER_PASS,
    },
});

const senderEmail = process.env.SENDER_USER;
const ownerEmails = [process.env.OWNER_EMAIL1, process.env.OWNER_EMAIL2].join(
    ", "
);

// Define email templates for both alarm and high-temperature alerts
const emailTemplates = {
    alarm: {
        subject: "Alarm Triggered!",
        text: ({ armed, active, temp }) =>
            `Alarm Triggered!\n\nStatus Details:\n- Armed: ${armed}\n- Active: ${active}\n- Temperature: ${temp.toFixed(
                1
            )}°C\n\nPlease check the system immediately.`,
        html: ({ armed, active, temp }) => `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>Alarm Triggered!</title>
      </head>
      <body style="margin:0; padding:0; background:#f0f2f5;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5; padding:20px;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 4px 6px rgba(0,0,0,0.1);">
                <tr>
                  <td style="background:#2196f3; padding:20px; text-align:center;">
                    <h1 style="margin:0; color:#fff; font-family:Arial, sans-serif;">Sentinel</h1>
                    <p style="margin:5px 0 0 0; color:#fff; font-family:Arial, sans-serif;">Smart Home Security System</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px; font-family:Arial, sans-serif; color:#333;">
                    <h2 style="color:#f44336; margin:0;">Alarm Triggered!</h2>
                    <p style="margin:10px 0;">Status Details:</p>
                    <table width="100%" cellpadding="5" cellspacing="0" style="border-collapse:collapse;">
                      <tr>
                        <td width="30%" style="font-weight:bold;">Armed:</td>
                        <td>${armed}</td>
                      </tr>
                      <tr>
                        <td style="font-weight:bold;">Active:</td>
                        <td>${active}</td>
                      </tr>
                      <tr>
                        <td style="font-weight:bold;">Temperature:</td>
                        <td>${temp.toFixed(1)}°C</td>
                      </tr>
                    </table>
                    <p style="margin-top:20px;">Please check the system immediately.</p>
                  </td>
                </tr>
                <tr>
                  <td style="background:#e0e0e0; padding:15px; text-align:center; font-family:Arial, sans-serif; font-size:12px; color:#666;">
                    &copy; 2025 Sentinel Security System
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
        subject: "High Temperature Alert!",
        text: ({ armed, active, temp }) =>
            `High Temperature Alert!\n\nStatus Details:\n- Armed: ${armed}\n- Active: ${active}\n- Temperature: ${temp.toFixed(
                1
            )}°C\n\nImmediate attention is required.`,
        html: ({ armed, active, temp }) => `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>High Temperature Alert!</title>
      </head>
      <body style="margin:0; padding:0; background:#f0f2f5;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5; padding:20px;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 4px 6px rgba(0,0,0,0.1);">
                <tr>
                  <td style="background:#f44336; padding:20px; text-align:center;">
                    <h1 style="margin:0; color:#fff; font-family:Arial, sans-serif;">Sentinel</h1>
                    <p style="margin:5px 0 0 0; color:#fff; font-family:Arial, sans-serif;">High Temperature Alert</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px; font-family:Arial, sans-serif; color:#333;">
                    <h2 style="color:#f44336; margin:0;">High Temperature Alert!</h2>
                    <p style="margin:10px 0;">Status Details:</p>
                    <table width="100%" cellpadding="5" cellspacing="0" style="border-collapse:collapse;">
                      <tr>
                        <td width="30%" style="font-weight:bold;">Armed:</td>
                        <td>${armed}</td>
                      </tr>
                      <tr>
                        <td style="font-weight:bold;">Active:</td>
                        <td>${active}</td>
                      </tr>
                      <tr>
                        <td style="font-weight:bold;">Temperature:</td>
                        <td>${temp.toFixed(1)}°C</td>
                      </tr>
                    </table>
                    <p style="margin-top:20px;">Immediate attention is required.</p>
                  </td>
                </tr>
                <tr>
                  <td style="background:#e0e0e0; padding:15px; text-align:center; font-family:Arial, sans-serif; font-size:12px; color:#666;">
                    &copy; 2025 Sentinel Security System
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

// Unified function to send emails based on the provided template key and status data.
const sendEmail = (templateKey, status) => {
    const template = emailTemplates[templateKey];
    if (!template) return;
    const mailOptions = {
        from: `Sentinel <${senderEmail}>`,
        to: ownerEmails,
        subject: template.subject,
        text: template.text(status),
        html: template.html(status),
    };
    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error(`Error sending ${templateKey} email:`, error);
        } else {
            console.log(`${templateKey} email sent:`, info.response);
        }
    });
};

// Global flags to prevent repeated emails for the same event
let alarmEmailSent = false;
let highTempEmailSent = false;

// Serial Port Setup: Buffer incoming data and process complete JSON lines
const arduinoPort = new SerialPort({ path: ARDUINO_PORT, baudRate: BAUD_RATE });
let serialBuffer = "";

arduinoPort.on("error", (err) => console.error("Serial Port Error:", err));

arduinoPort.on("data", (data) => {
    serialBuffer += data.toString();
    const lines = serialBuffer.split("\n");
    serialBuffer = lines.pop(); // retain any incomplete line

    lines.forEach((line) => {
        line = line.trim();
        if (!line) return;

        try {
            const status = JSON.parse(line);
            // Emit status to all connected clients
            io.emit("status", status);

            // Check and send alarm email only once per alarm event
            if (status.active && !alarmEmailSent) {
                sendEmail("alarm", status);
                alarmEmailSent = true;
            } else if (!status.active) {
                alarmEmailSent = false;
            }

            // Check and send high-temperature email only once per high-temp event
            if (status.temp > HIGH_TEMP_THRESHOLD && !highTempEmailSent) {
                sendEmail("highTemp", status);
                highTempEmailSent = true;
            } else if (status.temp <= HIGH_TEMP_THRESHOLD) {
                highTempEmailSent = false;
            }
        } catch (error) {
            console.error("Failed to parse status from Arduino:", line, error);
        }
    });
});

// Socket.IO Setup: Listen for client connections and commands
io.on("connection", (socket) => {
    console.log("Client connected");

    socket.on("command", (cmd) => {
        console.log("Command received:", cmd);
        if (!cmd.endsWith("\n")) cmd += "\n";
        arduinoPort.write(cmd);
    });

    socket.on("disconnect", () => {
        console.log("Client disconnected");
    });
});

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
