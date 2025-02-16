const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const { SerialPort } = require("serialport");

// Adjust this port to match your Arduino’s USB port
const ARDUINO_PORT = "COM5";
const BAUD_RATE = 115200;

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files from 'public' directory
app.use(express.static("public"));

// Open the serial port connection to Arduino using options object
const arduinoPort = new SerialPort({ path: ARDUINO_PORT, baudRate: BAUD_RATE });
let serialBuffer = "";

// Add error handler for the serial port
arduinoPort.on("error", (err) => {
    console.error("Serial Port Error:", err);
});

arduinoPort.on("data", (data) => {
    // Append incoming data to our buffer
    serialBuffer += data.toString();

    // Split incoming data by newline (assuming Arduino ends messages with '\n')
    let lines = serialBuffer.split("\n");
    // The last element may be incomplete; keep it in the buffer
    serialBuffer = lines.pop();

    lines.forEach((line) => {
        line = line.trim();
        if (line) {
            try {
                const status = JSON.parse(line);
                console.log("Status from Arduino:", status);
                // Broadcast the parsed status to all connected clients
                io.emit("status", status);
            } catch (e) {
                console.error("Error parsing JSON:", line);
            }
        }
    });
});

// Handle socket connections
io.on("connection", (socket) => {
    console.log("Client connected");

    // Listen for commands from the client
    socket.on("command", (cmd) => {
        console.log("Command from client:", cmd);
        // Append a newline if missing so the Arduino reads the full command
        if (!cmd.endsWith("\n")) {
            cmd += "\n";
        }
        arduinoPort.write(cmd);
    });

    socket.on("disconnect", () => {
        console.log("Client disconnected");
    });
});

// Start the server on port 3000
server.listen(3000, () => {
    console.log("Server running at http://localhost:3000");
});
