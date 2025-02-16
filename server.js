const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const SerialPort = require("serialport");

const ARDUINO_PORT = "COM3";
const BAUD_RATE = 115200;

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files from the 'public' directory
app.use(express.static("public"));

// Open the serial port connection to Arduino
const arduinoPort = new SerialPort(ARDUINO_PORT, { baudRate: BAUD_RATE });

// When data comes from Arduino, broadcast it to connected clients
arduinoPort.on("data", (data) => {
    // For example, assume Arduino sends JSON strings:
    const message = data.toString().trim();
    console.log("From Arduino:", message);
    io.emit("serialData", message);
});

// Handle incoming socket connections from web clients
io.on("connection", (socket) => {
    console.log("Client connected");

    // Listen for commands from the client to send to Arduino
    socket.on("command", (cmd) => {
        console.log("Command from client:", cmd);
        arduinoPort.write(cmd);
    });

    socket.on("disconnect", () => {
        console.log("Client disconnected");
    });
});

// Start server on port 3000
server.listen(3000, () => {
    console.log("Server listening on http://localhost:3000");
});
