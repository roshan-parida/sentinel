require("dotenv").config();
const express = require("express");
const http = require("http");
const { SerialPort } = require("serialport");
const socketIo = require("socket.io");
const nodemailer = require("nodemailer");

// Environment variables with defaults
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

// Server setup
const app = express();
const server = http.createServer(app);
const io = socketIo(server);
app.use(express.static("public"));

// Email configuration
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: SENDER_USER, pass: SENDER_PASS },
});
const ownerEmails = [OWNER_EMAIL1, OWNER_EMAIL2].filter(Boolean).join(", ");

// Alert states
let alarmEmailSent = false,
    highTempEmailSent = false;

// Email templates - simplified with a template function
const createEmailTemplate = (title, color, message, status) => {
    const { armed, active, temp } = status;
    return {
        subject: title,
        text: `${message}\n\nStatus Details:\n- Armed: ${armed}\n- Active: ${active}\n- Temperature: ${temp.toFixed(
            1
        )}°C`,
        html: `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${title}</title>
        </head>
        <body style="margin:0; padding:0; background:#f0f2f5; font-family:'Segoe UI',Arial,sans-serif; line-height:1.6;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5; padding:20px;">
                <tr>
                    <td align="center">
                        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#fff; border-radius:16px; overflow:hidden; box-shadow:0 4px 12px rgba(0,0,0,0.15);">
                            <!-- Header -->
                            <tr>
                                <td style="background:linear-gradient(135deg, ${color} 0%, ${color} 100%); padding:30px 20px; text-align:center;">
                                    <h1 style="margin:0; color:#fff; font-size:28px; font-weight:600;">${title.toUpperCase()}</h1>
                                </td>
                            </tr>
                            
                            <!-- Content -->
                            <tr>
                                <td style="padding:30px 25px;">
                                    <div style="background:#f8f8f8; border-left:4px solid ${color}; padding:15px; margin-bottom:25px;">
                                        <p style="margin:0; font-size:16px; font-weight:600;">⚠️ ${message}</p>
                                    </div>
                                    
                                    <h2 style="color:#333; margin:0 0 20px 0; font-size:20px;">System Status Details</h2>
                                    <table role="presentation" width="100%" style="border-collapse:separate; border-spacing:0 8px;">
                                        <tr>
                                            <td style="padding:12px 15px; background:#f8f9fa; border-radius:8px; width:40%;">
                                                <strong>System Armed</strong>
                                            </td>
                                            <td style="padding:12px 15px; background:#f8f9fa; border-radius:8px;">
                                                ${armed ? "✅ Yes" : "❌ No"}
                                            </td>
                                        </tr>
                                        <tr>
                                            <td style="padding:12px 15px; background:#f8f9fa; border-radius:8px;">
                                                <strong>Alarm Status</strong>
                                            </td>
                                            <td style="padding:12px 15px; background:#f8f9fa; border-radius:8px;">
                                                ${
                                                    active
                                                        ? "🔴 Active"
                                                        : "🟢 Inactive"
                                                }
                                            </td>
                                        </tr>
                                        <tr>
                                            <td style="padding:12px 15px; background:#f8f9fa; border-radius:8px;">
                                                <strong>Temperature</strong>
                                            </td>
                                            <td style="padding:12px 15px; background:#f8f9fa; border-radius:8px;">
                                                🌡️ ${temp.toFixed(1)}°C
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                            
                            <!-- Footer -->
                            <tr>
                                <td style="background:#f8f9fa; padding:20px; text-align:center; border-top:1px solid #eee;">
                                    <p style="margin:0; color:#666; font-size:13px;">
                                        © ${new Date().getFullYear()} Sentinel Security System
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
    };
};

// Unified email sender
const sendAlert = (alertType, status) => {
    if (!SENDER_USER || !SENDER_PASS || !ownerEmails) return;

    let emailData;
    if (alertType === "alarm") {
        emailData = createEmailTemplate(
            "🚨 Security Alert - Alarm Triggered!",
            "#ff4b4b",
            "Immediate attention required! The security system has detected unusual activity.",
            status
        );
    } else if (alertType === "highTemp") {
        emailData = createEmailTemplate(
            "🌡️ High Temperature Alert!",
            "#ff9800",
            "Warning: Temperature exceeds safe threshold!",
            status
        );
    }

    if (!emailData) return;

    const mailOptions = {
        from: `Sentinel <${SENDER_USER}>`,
        to: ownerEmails,
        subject: emailData.subject,
        text: emailData.text,
        html: emailData.html,
    };

    transporter.sendMail(mailOptions, (error, info) =>
        error
            ? console.error(`Error sending ${alertType} alert:`, error)
            : console.log(`${alertType} alert sent:`, info.response)
    );
};

// Set up serial port with error handling
let serialBuffer = "";
const arduinoPort = new SerialPort({
    path: ARDUINO_PORT,
    baudRate: parseInt(BAUD_RATE, 10),
});

arduinoPort.on("error", (err) => {
    console.error("Serial Port Error:", err);
    io.emit("system_error", {
        type: "serial",
        message: "Serial connection failed",
    });
});

arduinoPort.on("data", (data) => {
    serialBuffer += data.toString();
    const lines = serialBuffer.split("\n");
    serialBuffer = lines.pop();

    lines.forEach((line) => {
        line = line.trim();
        if (!line) return;

        try {
            const status = JSON.parse(line);
            io.emit("status", status);

            // Alarm email logic
            if (status.active && !alarmEmailSent) {
                sendAlert("alarm", status);
                alarmEmailSent = true;
            } else if (!status.active) {
                alarmEmailSent = false;
            }

            // High temperature email logic
            if (status.temp > HIGH_TEMP_THRESHOLD && !highTempEmailSent) {
                sendAlert("highTemp", status);
                highTempEmailSent = true;
            } else if (status.temp <= HIGH_TEMP_THRESHOLD) {
                highTempEmailSent = false;
            }
        } catch (error) {
            console.error("Unparsed Data from Arduino:", line);
        }
    });
});

// Socket.IO connection handling
io.on("connection", (socket) => {
    console.log("Client connected");

    socket.on("command", (cmd) => {
        if (!arduinoPort.isOpen) {
            socket.emit("system_error", {
                type: "serial",
                message: "Serial port not available",
            });
            return;
        }

        if (!cmd.endsWith("\n")) cmd += "\n";
        arduinoPort.write(cmd, (err) => {
            if (err) {
                socket.emit("system_error", {
                    type: "command",
                    message: "Failed to send command",
                });
            }
        });
    });

    socket.on("disconnect", () => console.log("Client disconnected"));
});

// Start server
server.listen(PORT, () =>
    console.log(`Server running at http://localhost:${PORT}`)
);
