//dependencies
const express = require("express");
const app = express();
const fs = require("fs");
const { render, getJson, showChat } = require('./utils.js');
const bcrypt = require("bcryptjs");
const session = require("express-session");

//säkerhet
const { v7: uuidv7 } = require("uuid");
const escape = require("escape-html");


//server
const { createServer } = require("http");
const { Server } = require("socket.io");
const { getJSON } = require("./utils.js");
const { create } = require("domain");
const server = createServer(app);
const io = new Server(server);
server.listen(8080);

//middleware
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));

//session
const sessionMw = session({
    secret: 'keyboard dog',
    resave: false,
    saveUninitialized: true,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24
    }
});
app.use(sessionMw);
io.engine.use(sessionMw);

//routes
io.on("connection", handleConnection);
app.get("/chat/:roomId", handleRooms);
app.get("/session", handleSession);
app.get("/register", registerPage);
app.get("/login", loginPage);
app.get("/logout", logout);
app.post("/register", register);
app.post("/login", login);
app.get("/createRoom", roomCreator);
app.post("/createRoom", createRoom);
app.post("/joinRoom/:roomId", passwordRoomhandler);


//page handlers
app.get("/", (req, res) => {
    return showMainPage(req, res);
});

function handleSession(req, res) {
    res.send((req.session));
}

function registerPage(req, res) {
    return showRegisterPage(req, res);
}

function loginPage(req, res) {
    return showLoginPage(req, res);
}



// Handle socket connections
function handleConnection(socket) {
    console.log("New connection:", socket.id);

    socket.on("get-rooms", () => {
        let rooms = getJson("rooms");
        socket.emit("room-list", rooms);
    });


    socket.on("join-room", (roomId) => {
        console.log(`Socket ${socket.id} joined room ${roomId}`);
        socket.join(roomId);

        let chatlog = getJson("chatlog");
        let roomMessages = chatlog.filter((msg) => msg.roomId === roomId);

        socket.emit("load-messages", roomMessages);

        setTimeout(() => {
            socket.emit("system-message", `You have joined: ${roomId}`);
        }, 50);
    });

    socket.on("send-message", ({ roomId, message }) => {
        if (!socket.request.session || !socket.request.session.auth) {
            console.log("Unauthorized message attempt by:", socket.id);
            socket.emit("error-message", "You must be logged in to send messages.");
            return;
        }
        const messageId = uuidv7();
        const username = socket.request.session.username;
        const userId = socket.request.session.userId;

        message = escape(message);

        let chatlog = getJson("chatlog");
        const newMessage = { roomId, message, userId, username,messageId, timestamp: new Date()};
        chatlog.push(newMessage);
        fs.writeFileSync(__dirname + "/data/chatlog.json", JSON.stringify(chatlog, null, 3));

        io.to(roomId).emit("get-message", newMessage);
    });

    socket.on("delete-message", ({ messageId }) => {
        let chatlog = getJson("chatlog");
        let SelectedMessage = chatlog.find((msg) => msg.messageId === messageId);

        if (!SelectedMessage) return console.log("Message not found");
        if (SelectedMessage.userId !== socket.request.session.userId) return console.log("You are not the sender of this message");

        chatlog = chatlog.filter((msg) => msg.messageId !== messageId);
        fs.writeFileSync(__dirname + "/data/chatlog.json", JSON.stringify(chatlog, null, 3));
        io.emit("message-deleted", { messageId });
    });
}

// Handle page rendering
function showMainPage(req, res) {
    let content = `
        <div id="roomList" class="main-page"></div>
        <script src="/client.js" defer></script>
        `;
    res.send(render(content, req));
}

function showRegisterPage(req, res) {
    let content = `
    <div class="form-container">
        <h1>Register</h1>
        <form action="/register" method="post">
            <div class="input-group">
                <i class="icon fas fa-user"></i>
                <input type="text" name="username" placeholder="Username" required />
            </div>
            <div class="input-group">
                <i class="icon fas fa-envelope"></i>
                <input type="email" name="email" placeholder="Email" required />
            </div>
            <div class="input-group">
                <i class="icon fas fa-lock"></i>
                <input type="password" name="password" placeholder="Password" required />
            </div>
            <input type="submit" value="Register" />
        </form>
        <a href="/" class="back-button">Back to Main Page</a>
    </div>
      <script src="/client.js" defer></script>
    `;
    res.send(render(content, req));
}

function showLoginPage(req, res) {
    let content = `
    <div class="form-container">
        <h1>Login</h1>
        <form action="/login" method="post">
            <div class="input-group">
                <i class="icon fas fa-envelope"></i>
                <input type="email" name="email" placeholder="Email" required />
            </div>
            <div class="input-group">
                <i class="icon fas fa-lock"></i>
                <input type="password" name="password" placeholder="Password" required />
            </div>
            <input type="submit" value="Login" />
        </form>
        <a href="/" class="back-button">Back to Main Page</a>
    </div>
      <script src="/client.js" defer></script>
    `;
    res.send(render(content, req));
}

function roomCreator(req, res) {
    let content = `
    <div class="create-room-container">
        <h1>Create a Room</h1>
        <form action="/createRoom" method="POST">
            <input type="text" name="Roomname" placeholder="Enter room name" required />
            <input type="password" name="RoomPassword" placeholder="Enter room password (optional)" />
            <input type="submit" value="Create Room" />
        </form>
        <a href="/" class="back-button">Back to Main Page</a>
    </div>
      <script src="/client.js" defer></script>
    `;
    res.send(render(content, req));
}

function handleRooms(req, res) {
    const roomId = escape(req.params.roomId);

    let rooms = getJson("rooms");
    let room = rooms.find(r => r.Roomname === roomId);

    if (!room) {
        return res.status(404).send("Room not found");
    }

    if (room.RoomPassword) {
        let content = `
            <div class="form-container">
                <h1>Enter Room Password</h1>
                <form action="/joinRoom/${roomId}" method="POST">
                    <input type="password" name="RoomPassword" placeholder="Enter room password" required />
                    <input type="submit" value="Join Room" />
                </form>
                <a href="/" class="back-button">Back to Main Page</a>
            </div>
              <script src="/client.js" defer></script>
        `;
        return res.send(render(content, req));
    }

    let content = showChat(roomId, req.session.userId);
    res.send(render(content, req));
}

async function passwordRoomhandler(req, res) {
    const roomId = escape(req.params.roomId);
    const { RoomPassword } = req.body;

    let rooms = getJson("rooms");
    let room = rooms.find(r => r.Roomname === roomId);

    if (!room) {
        return res.status(404).send("Room not found");
    }


    if (room.RoomPassword) {
        if (!RoomPassword || !req.session.auth) {
            return res.status(401).send("You need to be logged in and provide a password to join this room");
        }

        const isPasswordCorrect = await bcrypt.compare(RoomPassword, room.RoomPassword);
        if (!isPasswordCorrect) {
            return res.status(401).send("Wrong password");
        }
    }

    let content = showChat(roomId, req.session.userId);
    res.send(render(content, req));
}

async function createRoom(req, res) {
    try {
        let data = req.body;
        let rooms = getJson("rooms");
        data.userId = req.session.userId;

        if (req.session.auth == false) return res.send("You need to be logged in to create a room");

        let userRooms = rooms.filter(r => r.userId == data.userId);
        if (userRooms.length >= 3) return res.send("You can only create 3 rooms");

        data.Roomname = escape(data.Roomname);

        if (rooms.find(r => r.Roomname == data.Roomname)) return res.send("Room already exists");

        if (data.RoomPassword) {
            data.RoomPassword = await bcrypt.hash(data.RoomPassword, 12);
        }

        rooms.push(data);
        fs.writeFileSync(__dirname + "/data/rooms.json", JSON.stringify(rooms, null, 3));

        io.emit("room-created", rooms);

        console.log("Room:" + data.Roomname + " has been created");

        res.redirect("/");
    } catch (error) {
        return res.status(500).send("Error creating room: " + error.message);
    }
}


// Handle user registration and login
async function register(req, res) {
    let data = req.body;

    data.username = escape(data.username);
    data.email = escape(data.email);

    let userId = uuidv7();
    data.userId = userId;

    let users = getJson("users");

    data.password = await bcrypt.hash(data.password, 12);
    let userExist = users.find(u => u.email == data.email);
    let usernameExist = users.find(u => u.username == data.username);

    if (userExist || usernameExist) return res.send("User exists");
    users.push(data);
    fs.writeFileSync(__dirname + "/data/users.json", JSON.stringify(users, null, 3));
    res.redirect("/");
    console.log("User:" + data.email + " with password: " + data.password + " Has successfully registered");
}

async function login(req, res) {
    let data = req.body;

    data.email = escape(data.email);

    let users = getJson("users");
    let userExist = users.find(u => u.email == data.email);

    if (!userExist) return res.send("wrong email");
    let pwCheck = await bcrypt.compare(data.password, userExist.password);
    if (!pwCheck) return res.send("Wrong password");

    req.session.auth = true;
    req.session.email = data.email;
    req.session.username = userExist.username;
    req.session.userId = userExist.userId;
    console.log("login succeeded");

    res.redirect("/");
}

function logout(req, res){
    req.session.destroy();
    res.redirect("/");
}